// ============================================
// matching-feedback.js v1.0
// Feedback + Audit + Alias Learning System
// ============================================

class MatchingFeedbackService {
  constructor(db) {
    this.db = db;
    this.initTables();
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS matching_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_transaction_id INTEGER NOT NULL,
        payment_id INTEGER NOT NULL,
        bank_payer_name TEXT NOT NULL,
        payment_customer_name TEXT NOT NULL,
        bank_payer_name_normalized TEXT NOT NULL,
        payment_customer_name_normalized TEXT NOT NULL,
        bank_amount REAL,
        payment_amount REAL,
        decision_type TEXT NOT NULL CHECK(decision_type IN ('auto_confirmed','manually_confirmed','manually_rejected')),
        confidence_score REAL,
        score_breakdown TEXT,
        decided_by TEXT DEFAULT 'system',
        decided_at TEXT DEFAULT (datetime('now','localtime')),
        notes TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_feedback_names 
        ON matching_feedback(bank_payer_name_normalized, payment_customer_name_normalized);
      CREATE INDEX IF NOT EXISTS idx_feedback_decision 
        ON matching_feedback(decision_type);
      CREATE INDEX IF NOT EXISTS idx_feedback_bank_tx 
        ON matching_feedback(bank_transaction_id);

      CREATE TABLE IF NOT EXISTS matching_audit_trail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_transaction_id INTEGER NOT NULL,
        payment_id INTEGER,
        decision_type TEXT NOT NULL,
        confidence_score REAL,
        match_type TEXT,
        audit_data TEXT NOT NULL,
        can_reverse INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        reversed_at TEXT,
        reversed_by TEXT,
        reverse_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_bank_tx 
        ON matching_audit_trail(bank_transaction_id);
      CREATE INDEX IF NOT EXISTS idx_audit_decision 
        ON matching_audit_trail(decision_type);
      CREATE INDEX IF NOT EXISTS idx_audit_created 
        ON matching_audit_trail(created_at);
    `);
    console.log('[FeedbackService] Tables initialized');
  }

  // ===== RECORD DECISIONS =====

  recordAutoConfirmation(bankTx, payment, score, breakdown) {
    const NameNormalizer = require('./name-normalizer');
    const bankName = bankTx.parsed_name || bankTx.raw_description || '';
    const payName = payment.customer_name || payment.name || '';

    this.db.prepare(`
      INSERT INTO matching_feedback 
        (bank_transaction_id, payment_id, bank_payer_name, payment_customer_name,
         bank_payer_name_normalized, payment_customer_name_normalized,
         bank_amount, payment_amount, decision_type, confidence_score, score_breakdown, decided_by)
      VALUES (?,?,?,?,?,?,?,?,'auto_confirmed',?,?,?)
    `).run(
      bankTx.id, payment.id || payment.payment_id,
      bankName, payName,
      NameNormalizer.deepNormalize(bankName), NameNormalizer.deepNormalize(payName),
      bankTx.amount, payment.amount,
      score, JSON.stringify(breakdown || {}), 'system'
    );

    this._createAuditEntry(bankTx, payment, 'auto_confirmed', score, breakdown);
  }

  recordManualConfirmation(bankTxId, paymentId, bankName, paymentName, bankAmount, paymentAmount, userId, notes, createAlias, customerId) {
    const NameNormalizer = require('./name-normalizer');
    const normBank = NameNormalizer.deepNormalize(bankName);
    const normPay = NameNormalizer.deepNormalize(paymentName);

    this.db.prepare(`
      INSERT INTO matching_feedback
        (bank_transaction_id, payment_id, bank_payer_name, payment_customer_name,
         bank_payer_name_normalized, payment_customer_name_normalized,
         bank_amount, payment_amount, decision_type, confidence_score, decided_by, notes)
      VALUES (?,?,?,?,?,?,?,?,'manually_confirmed',100,?,?)
    `).run(
      bankTxId, paymentId,
      bankName, paymentName,
      normBank, normPay,
      bankAmount || 0, paymentAmount || 0,
      userId || 'user', notes || null
    );

    if (createAlias && normBank !== normPay && customerId) {
      this.createOrUpdateAlias(customerId, bankName, 'manual_match', userId);
    }

    this._createAuditEntry(
      { id: bankTxId, parsed_name: bankName, amount: bankAmount },
      { id: paymentId, customer_name: paymentName, amount: paymentAmount },
      'manually_confirmed', 100, null
    );
  }

  recordRejection(bankTxId, paymentId, bankName, paymentName, userId, notes) {
    const NameNormalizer = require('./name-normalizer');
    const normBank = NameNormalizer.deepNormalize(bankName);
    const normPay = NameNormalizer.deepNormalize(paymentName);

    this.db.prepare(`
      INSERT INTO matching_feedback
        (bank_transaction_id, payment_id, bank_payer_name, payment_customer_name,
         bank_payer_name_normalized, payment_customer_name_normalized,
         decision_type, decided_by, notes)
      VALUES (?,?,?,?,?,?,'manually_rejected',?,?)
    `).run(
      bankTxId, paymentId,
      bankName, paymentName,
      normBank, normPay,
      userId || 'user', notes || null
    );

    this._createAuditEntry(
      { id: bankTxId, parsed_name: bankName },
      { id: paymentId, customer_name: paymentName },
      'manually_rejected', 0, null
    );
  }

  // ===== HISTORICAL FEEDBACK =====

  getHistoricalFeedback(bankName, paymentName) {
    const NameNormalizer = require('./name-normalizer');
    const normBank = NameNormalizer.deepNormalize(bankName);
    const normPay = NameNormalizer.deepNormalize(paymentName);

    const result = this.db.prepare(`
      SELECT 
        decision_type,
        confidence_score,
        decided_at,
        COUNT(*) as decision_count
      FROM matching_feedback
      WHERE bank_payer_name_normalized = ?
        AND payment_customer_name_normalized = ?
      GROUP BY decision_type
      ORDER BY decided_at DESC
      LIMIT 5
    `).all(normBank, normPay);

    if (!result || result.length === 0) return null;

    const rejections = result.find(r => r.decision_type === 'manually_rejected');
    const confirmations = result.find(r => 
      r.decision_type === 'manually_confirmed' || r.decision_type === 'auto_confirmed'
    );

    return {
      has_rejection: !!rejections,
      rejection_count: rejections ? rejections.decision_count : 0,
      has_confirmation: !!confirmations,
      confirmation_count: confirmations ? confirmations.decision_count : 0,
      last_decision: result[0].decision_type,
      last_confidence: result[0].confidence_score
    };
  }

  isRejectedPair(bankName, paymentName) {
    const feedback = this.getHistoricalFeedback(bankName, paymentName);
    return feedback && feedback.has_rejection && !feedback.has_confirmation;
  }

  getConfidenceBoost(bankName, paymentName) {
    const feedback = this.getHistoricalFeedback(bankName, paymentName);
    if (!feedback) return 0;
    if (feedback.has_rejection) return -1;
    if (feedback.has_confirmation) {
      return Math.min(15, 5 * feedback.confirmation_count);
    }
    return 0;
  }

  // ===== ALIAS MANAGEMENT =====

  createOrUpdateAlias(customerId, aliasName, aliasType, createdBy) {
    const NameNormalizer = require('./name-normalizer');
    const normalized = NameNormalizer.deepNormalize(aliasName);

    const existing = this.db.prepare(`
      SELECT id, usage_count FROM customer_aliases
      WHERE customer_id = ? AND normalized_name = ?
    `).get(customerId, normalized);

    if (existing) {
      this.db.prepare(`
        UPDATE customer_aliases 
        SET usage_count = usage_count + 1
        WHERE id = ?
      `).run(existing.id);
      return { updated: true, id: existing.id };
    } else {
      const result = this.db.prepare(`
        INSERT INTO customer_aliases (customer_id, alias_name, normalized_name, source, confidence, usage_count)
        VALUES (?, ?, ?, ?, 'confirmed', 1)
      `).run(customerId, aliasName, normalized, aliasType || 'manual');
      return { created: true, id: result.lastInsertRowid };
    }
  }

  findCustomerByAlias(bankName) {
    const NameNormalizer = require('./name-normalizer');
    const normalized = NameNormalizer.deepNormalize(bankName);

    const result = this.db.prepare(`
      SELECT 
        ca.customer_id,
        c.name as customer_name,
        ca.alias_name,
        ca.source as alias_type,
        ca.confidence,
        ca.usage_count
      FROM customer_aliases ca
      JOIN customers c ON ca.customer_id = c.id
      WHERE ca.normalized_name = ?
        AND ca.confidence = 'confirmed'
      ORDER BY ca.usage_count DESC
      LIMIT 1
    `).get(normalized);

    return result || null;
  }

  getAliasesForCustomer(customerId) {
    return this.db.prepare(`
      SELECT id, alias_name, normalized_name, source, confidence, usage_count
      FROM customer_aliases
      WHERE customer_id = ?
      ORDER BY usage_count DESC
    `).all(customerId);
  }

  deleteAlias(aliasId) {
    this.db.prepare('DELETE FROM customer_aliases WHERE id = ?').run(aliasId);
    return { success: true };
  }

  // ===== AUDIT TRAIL =====

  _createAuditEntry(bankTx, payment, decisionType, score, breakdown) {
    const auditData = {
      decision: decisionType,
      confidence: score,
      breakdown: breakdown,
      bank_transaction: {
        id: bankTx.id,
        name: bankTx.parsed_name || bankTx.raw_description || '',
        amount: bankTx.amount
      },
      payment: {
        id: payment.id || payment.payment_id,
        name: payment.customer_name || payment.name || '',
        amount: payment.amount
      },
      timestamp: new Date().toISOString()
    };

    this.db.prepare(`
      INSERT INTO matching_audit_trail
        (bank_transaction_id, payment_id, decision_type, confidence_score, 
         match_type, audit_data, can_reverse)
      VALUES (?,?,?,?,?,?,?)
    `).run(
      bankTx.id,
      payment.id || payment.payment_id || null,
      decisionType,
      score || 0,
      'single',
      JSON.stringify(auditData),
      decisionType === 'auto_confirmed' ? 1 : 0
    );
  }

  getAuditTrail(bankTxId) {
    const rows = this.db.prepare(`
      SELECT * FROM matching_audit_trail
      WHERE bank_transaction_id = ?
      ORDER BY created_at DESC
    `).all(bankTxId);

    return rows.map(r => {
      try { r.audit_data = JSON.parse(r.audit_data); } catch(e) {}
      return r;
    });
  }

  reverseMatch(auditId, userId, reason) {
    const audit = this.db.prepare('SELECT * FROM matching_audit_trail WHERE id = ?').get(auditId);
    if (!audit) return { success: false, error: 'Audit entry not found' };
    if (!audit.can_reverse) return { success: false, error: 'Match cannot be reversed' };
    if (audit.reversed_at) return { success: false, error: 'Already reversed' };

    const txn = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE matching_audit_trail 
        SET reversed_at = datetime('now','localtime'), reversed_by = ?, reverse_reason = ?
        WHERE id = ?
      `).run(userId || 'user', reason || '', auditId);

      if (audit.bank_transaction_id) {
        this.db.prepare("UPDATE bank_transactions SET match_status = 'pending' WHERE id = ?")
          .run(audit.bank_transaction_id);
      }
      if (audit.payment_id) {
        this.db.prepare("UPDATE payments SET status = 'pending' WHERE id = ?")
          .run(audit.payment_id);
      }
    });
    txn();

    return { success: true };
  }

  // ===== STATISTICS =====

  getStats() {
    const feedback = this.db.prepare(`
      SELECT 
        decision_type,
        COUNT(*) as count
      FROM matching_feedback
      GROUP BY decision_type
    `).all();

    const aliases = this.db.prepare(`
      SELECT COUNT(*) as count FROM customer_aliases WHERE confidence = 'confirmed'
    `).get();

    const audits = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN reversed_at IS NOT NULL THEN 1 ELSE 0 END) as reversed
      FROM matching_audit_trail
    `).get();

    return {
      feedback: feedback.reduce((acc, r) => { acc[r.decision_type] = r.count; return acc; }, {}),
      active_aliases: aliases.count,
      audit_total: audits.total,
      audit_reversed: audits.reversed
    };
  }
}

module.exports = MatchingFeedbackService;