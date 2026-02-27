// ============================================================
// src/main/matching-engine.js  — v8.0
// محرك استيراد ومطابقة كشوف البنك
// ============================================================
'use strict';

const { calculateTransactionHash } = require('../utils/transaction-hash');
const { BankStatementParser }      = require('./parsers/bank-statement-parser');

// ──────────────────────────────────────────────────────────
// SCORING CONFIG
// ──────────────────────────────────────────────────────────
const CONFIG = {
  AUTO_CONFIRM_THRESHOLD:  95,   // score >= هذا → auto confirm
  SUGGEST_THRESHOLD:       60,   // score >= هذا → suggest
  WEIGHTS: {
    name:    0.40,
    amount:  0.35,
    date:    0.15,
    context: 0.10,
  },
  HOME_TRANSFER_BONUS: 5,
  DATE_HARD_LIMIT_DAYS: 365,     // configurable
};

// ──────────────────────────────────────────────────────────
// TRANSLITERATION MAP (Arabic → Latin)
// ──────────────────────────────────────────────────────────
const TRANSLIT = {
  'ا':'a','أ':'a','إ':'a','آ':'a','ب':'b','ت':'t','ث':'th','ج':'j',
  'ح':'h','خ':'kh','د':'d','ذ':'dh','ر':'r','ز':'z','س':'s','ش':'sh',
  'ص':'s','ض':'d','ط':'t','ظ':'z','ع':'a','غ':'gh','ف':'f','ق':'q',
  'ك':'k','ل':'l','م':'m','ن':'n','ه':'h','ة':'h','و':'w','ي':'y',
  'ى':'y','لا':'la','ء':'',' ':' '
};

function transliterate(text) {
  if (!text) return '';
  let result = '';
  for (const ch of text.toLowerCase()) {
    result += TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch;
  }
  return result.trim();
}

// ──────────────────────────────────────────────────────────
// تطبيع الاسم
// ──────────────────────────────────────────────────────────
function normalizeName(name) {
  if (!name) return '';
  return name.trim()
    .replace(/\s+/g, ' ')
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase();
}

// ──────────────────────────────────────────────────────────
// SCORING FUNCTIONS (Soft Gates — لا حظر)
// ──────────────────────────────────────────────────────────

/** تسجيل نقاط التاريخ — عقوبة مرة واحدة فقط هنا */
function scoreDate(txDate, invoiceDate) {
  if (!txDate || !invoiceDate) return 50;
  const d1 = new Date(txDate);
  const d2 = new Date(invoiceDate);
  if (isNaN(d1) || isNaN(d2)) return 50;

  const days = Math.abs((d1 - d2) / 86400000);

  if (days <= 1)   return 100;
  if (days <= 3)   return 95;
  if (days <= 7)   return 88;
  if (days <= 14)  return 78;
  if (days <= 30)  return 65;
  if (days <= 60)  return 50;
  if (days <= 90)  return 38;
  if (days <= 180) return 25;
  if (days <= 365) return 15;
  return 8; // لا يُحظر — فقط score منخفض جداً
}

/** تسجيل نقاط المبلغ */
function scoreAmount(txAmount, invoiceAmount) {
  if (!txAmount || !invoiceAmount || invoiceAmount === 0) return 30;
  const ratio = txAmount / invoiceAmount;

  if (ratio >= 0.95 && ratio <= 1.05) return 100; // مطابقة تامة
  if (ratio >= 0.85 && ratio <= 1.15) return 82;
  if (ratio >= 0.70 && ratio <= 1.30) return 60;
  if (ratio >= 0.50 && ratio <= 1.50) return 40;
  if (ratio >= 0.20 && ratio <= 2.00) return 20;
  return 8; // فرق ضخم — soft penalty
}

/** نوع الدفع بناءً على نسبة المبلغ */
function getMatchType(txAmount, invoiceAmount) {
  if (!invoiceAmount || invoiceAmount === 0) return 'full';
  const ratio = txAmount / invoiceAmount;
  if (ratio >= 0.95 && ratio <= 1.05) return 'full';
  if (ratio < 0.95)  return 'partial';
  return 'over';
}

/** تسجيل نقاط الاسم */
function scoreName(payerName, customerName, nameCandidatesJson) {
  if (!payerName || !customerName) return 0;

  const pNorm = normalizeName(payerName);
  const cNorm = normalizeName(customerName);

  // مطابقة تامة
  if (pNorm === cNorm) return 100;

  // مطابقة جزئية قوية (يحتوي على)
  if (pNorm.includes(cNorm) || cNorm.includes(pNorm)) return 90;

  // مطابقة transliteration
  const pLatin = transliterate(pNorm);
  const cLatin = transliterate(cNorm);
  if (pLatin === cLatin) return 92;
  if (pLatin.includes(cLatin) || cLatin.includes(pLatin)) return 82;

  // مطابقة التوكنات
  const pTokens = pNorm.split(/\s+/).filter(t => t.length > 1);
  const cTokens = cNorm.split(/\s+/).filter(t => t.length > 1);
  const pLatinTokens = pLatin.split(/\s+/).filter(t => t.length > 1);
  const cLatinTokens = cLatin.split(/\s+/).filter(t => t.length > 1);

  const matchedAr = pTokens.filter(pt => cTokens.some(ct => ct.includes(pt) || pt.includes(ct)));
  const matchedLatin = pLatinTokens.filter(pt => cLatinTokens.some(ct => ct.includes(pt) || pt.includes(ct)));

  const arScore    = cTokens.length ? (matchedAr.length / Math.max(pTokens.length, cTokens.length)) * 100 : 0;
  const latinScore = cLatinTokens.length ? (matchedLatin.length / Math.max(pLatinTokens.length, cLatinTokens.length)) * 100 : 0;
  const tokenScore = Math.max(arScore, latinScore);

  // فحص name_candidates
  let candidateScore = 0;
  if (nameCandidatesJson) {
    try {
      const candidates = JSON.parse(nameCandidatesJson);
      for (const c of candidates) {
        const cn = normalizeName(c);
        if (cn === cNorm || cn.includes(cNorm) || cNorm.includes(cn)) {
          candidateScore = 85;
          break;
        }
        const cl = transliterate(cn);
        if (cl === cLatin || cl.includes(cLatin) || cLatin.includes(cl)) {
          candidateScore = Math.max(candidateScore, 78);
        }
      }
    } catch (_) {}
  }

  // اسم واحد (كلمة واحدة فقط) — لا يؤكد تلقائياً
  const isSingleToken = cTokens.length === 1 || pTokens.length === 1;
  const rawScore = Math.max(tokenScore, candidateScore);

  // تقليص للاسم الواحد
  return isSingleToken ? Math.min(rawScore, 65) : rawScore;
}

// ──────────────────────────────────────────────────────────
// FORMAT MATCH — بدون try/catch
// ──────────────────────────────────────────────────────────
function formatMatch(m) {
  if (!m) {
    console.warn('[formatMatch] null match');
    return { match_type: 'error', _error: 'null_match' };
  }
  if (!m.bankTxn || !m.bankTxn.id) {
    console.warn('[formatMatch] missing bankTxn.id:', JSON.stringify(m).substring(0, 150));
    return { match_type: 'error', _error: 'missing_bank_tx_id', raw: m };
  }
  if (!m.payment || !m.payment.id) {
    console.warn('[formatMatch] missing payment.id');
    return { match_type: 'error', _error: 'missing_payment_id', raw: m };
  }

  const bankTxn  = m.bankTxn;
  const payment  = m.payment;
  const breakdown = m.breakdown || {};

  // remaining_after: من breakdown أولاً
  const remainingAfter = breakdown.remaining_after !== undefined
    ? breakdown.remaining_after
    : Math.max(0, (payment.remaining_amount ?? payment.total_amount ?? 0) - (bankTxn.amount ?? 0));

  return {
    bank_transaction_id: bankTxn.id,
    payment_id:          payment.id,
    customer_name:       payment.customer_name || m.customer_name || '',
    payer_name:          bankTxn.payer_name || '',
    amount_paid:         bankTxn.amount,
    invoice_amount:      payment.total_amount || payment.amount || 0,
    remaining_after:     remainingAfter,
    match_type:          m.match_type || 'full',
    confidence:          m.confidence || 0,
    method:              m.method || 'unknown',
    bankTxn: {
      id:              bankTxn.id,
      payer_name:      bankTxn.payer_name,
      amount:          bankTxn.amount,
      parsed_date:     bankTxn.parsed_date,
      tx_reference:    bankTxn.tx_reference,
      raw_description: bankTxn.raw_description,
    }
  };
}

// ──────────────────────────────────────────────────────────
// MATCHING ENGINE CLASS
// ──────────────────────────────────────────────────────────
class MatchingEngine {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmtInsertBankTx = this.db.prepare(`
      INSERT INTO bank_transactions (
        raw_date, raw_description, raw_amount,
        parsed_date, parsed_name, normalized_name,
        amount, direction, transfer_type, source_bank,
        reference_number, import_batch_id, import_date,
        file_name, row_number, match_status,
        transaction_hash, tx_reference,
        payer_name, payer_name_normalized,
        wallet_alias, name_candidates_json, transaction_type
      ) VALUES (
        @raw_date, @raw_description, @raw_amount,
        @parsed_date, @parsed_name, @normalized_name,
        @amount, @direction, @transfer_type, @source_bank,
        @reference_number, @import_batch_id, @import_date,
        @file_name, @row_number, @match_status,
        @transaction_hash, @tx_reference,
        @payer_name, @payer_name_normalized,
        @wallet_alias, @name_candidates_json, @transaction_type
      )
    `);

    this.stmtGetHashes = this.db.prepare(
      'SELECT transaction_hash FROM bank_transactions WHERE transaction_hash IS NOT NULL'
    );

    this.stmtPendingBankTx = this.db.prepare(`
      SELECT * FROM bank_transactions
      WHERE match_status = 'pending'
      ORDER BY parsed_date DESC
    `);

    this.stmtPendingPayments = this.db.prepare(`
      SELECT p.*, 
             p.amount as total_amount,
             i.customer_name, i.customer_id, i.total as invoice_total,
             c.is_home_transfer, c.alt_account_name as customer_alt_name
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE p.method IN ('transfer','wallet')
      AND p.status IN ('pending','pending_match','awaiting_transfer','partial')
      ORDER BY p.created_at DESC
    `);

    this.stmtUpdateBankTxMatch = this.db.prepare(`
      UPDATE bank_transactions
      SET match_status = @match_status, matched_payment_id = @payment_id
      WHERE id = @id
    `);

    this.stmtUpdatePaymentFull = this.db.prepare(`
      UPDATE payments
      SET status           = 'confirmed',
          paid_amount      = @paid_amount,
          remaining_amount = 0,
          updated_at       = datetime('now')
      WHERE id = @id
    `);

    this.stmtUpdatePaymentPartial = this.db.prepare(`
      UPDATE payments
      SET status           = 'partial',
          paid_amount      = COALESCE(paid_amount, 0) + @paid_amount,
          remaining_amount = @remaining_amount,
          updated_at       = datetime('now')
      WHERE id = @id
    `);

    this.stmtInsertInstallment = this.db.prepare(`
      INSERT INTO payment_installments
        (payment_id, bank_transaction_id, amount, installment_date, notes)
      VALUES
        (@payment_id, @bank_transaction_id, @amount, date('now'), @notes)
    `);

    this.stmtLearningLookup = this.db.prepare(`
      SELECT * FROM name_learning
      WHERE payer_name_pattern = ? AND confidence >= 90
      ORDER BY use_count DESC, confidence DESC
      LIMIT 1
    `);

    this.stmtLearningInsert = this.db.prepare(`
      INSERT INTO name_learning
        (payer_name_pattern, customer_id, customer_name, bank_name_raw, bank_name_normalized, confidence, use_count, confirmed_by)
      VALUES
        (@pattern, @customer_id, @customer_name, @bank_name_raw, @bank_name_normalized, @confidence, 1, @confirmed_by)
      ON CONFLICT(payer_name_pattern, customer_id) DO UPDATE
      SET use_count    = use_count + 1,
          confidence   = MAX(confidence, @confidence),
          confirmed_by = @confirmed_by,
          last_used_at = datetime('now')
    `);
  }

  // ──────────────────────────────────────────────
  // IMPORT
  // ──────────────────────────────────────────────
  importBankStatement(data, headers, fileName) {
    const batchId  = `batch_${Date.now()}`;
    const importDt = new Date().toISOString().replace('T',' ').substring(0,19);

    let parsedTransactions = [];

    // ── المسار 1: نص خام BOP ────────────────
    if (typeof data === 'string') {
      const parser = new BankStatementParser();
      const result = parser.parse(data);
      parsedTransactions = result.transactions;
      console.log(`[Import] BOP format. Parsed: ${parsedTransactions.length}`);

    // ── المسار 2: مصفوفة parsedEntries ──────
    } else if (Array.isArray(data)) {
      parsedTransactions = data.map((entry, idx) => {
        const rawDesc = entry.raw_description || entry.description || entry.payer_name || '';
        const txHash  = entry.transaction_hash || calculateTransactionHash({
          date:            entry.date || entry.parsed_date,
          amount:          entry.amount,
          raw_description: rawDesc,
          tx_reference:    entry.tx_reference || entry.reference || null
        });

        return {
          raw_date:              entry.raw_date || entry.date || '',
          raw_description:       rawDesc,
          raw_amount:            String(entry.amount || ''),
          parsed_date:           entry.date || entry.parsed_date || '',
          parsed_name:           entry.payer_name || entry.name || '',
          normalized_name:       normalizeName(entry.payer_name || entry.name || ''),
          amount:                parseFloat(entry.amount) || 0,
          direction:             'credit',
          transfer_type:         entry.transfer_type || 'TRANSFER',
          source_bank:           entry.source_bank || 'بنك فلسطين',
          reference_number:      entry.reference || entry.tx_reference || null,
          tx_reference:          entry.tx_reference || entry.reference || null,
          payer_name:            entry.payer_name || entry.name || '',
          payer_name_normalized: normalizeName(entry.payer_name || entry.name || ''),
          wallet_alias:          entry.wallet_alias || null,
          name_candidates_json:  JSON.stringify(entry.name_candidates || []),
          transaction_type:      entry.transaction_type || 'UNKNOWN',
          transaction_hash:      txHash,
          row_number:            idx,
        };
      });
      console.log(`[Import] Standard format. Entries: ${parsedTransactions.length}`);

    } else {
      return { success: false, error: 'Invalid data format', imported: 0, duplicates: 0 };
    }

    // ── بناء Set من الـ hashes الموجودة ─────
    const existingHashes = new Set(
      this.stmtGetHashes.all().map(r => r.transaction_hash)
    );

    let imported   = 0;
    let duplicates = 0;
    let skipped    = 0;

    const doInsert = this.db.transaction(() => {
      for (const tx of parsedTransactions) {
        if (!tx.amount || tx.amount <= 0) { skipped++; continue; }

        if (!tx.transaction_hash) {
          console.warn('[Import] No hash for:', tx.payer_name, tx.amount);
          skipped++;
          continue;
        }

        if (existingHashes.has(tx.transaction_hash)) {
          duplicates++;
          continue;
        }

        this.stmtInsertBankTx.run({
          raw_date:              tx.raw_date || '',
          raw_description:       tx.raw_description || '',
          raw_amount:            tx.raw_amount || String(tx.amount),
          parsed_date:           tx.parsed_date || '',
          parsed_name:           tx.parsed_name || tx.payer_name || '',
          normalized_name:       tx.normalized_name || normalizeName(tx.payer_name || ''),
          amount:                tx.amount,
          direction:             tx.direction || 'credit',
          transfer_type:         tx.transfer_type || 'UNKNOWN',
          source_bank:           tx.source_bank || 'بنك فلسطين',
          reference_number:      tx.reference_number || tx.tx_reference || null,
          import_batch_id:       batchId,
          import_date:           importDt,
          file_name:             fileName || '',
          row_number:            tx.row_number || 0,
          match_status:          'pending',
          transaction_hash:      tx.transaction_hash,
          tx_reference:          tx.tx_reference || tx.reference_number || null,
          payer_name:            tx.payer_name || tx.parsed_name || '',
          payer_name_normalized: tx.payer_name_normalized || normalizeName(tx.payer_name || ''),
          wallet_alias:          tx.wallet_alias || null,
          name_candidates_json:  tx.name_candidates_json || '[]',
          transaction_type:      tx.transaction_type || 'UNKNOWN',
        });

        existingHashes.add(tx.transaction_hash);
        imported++;
      }
    });

    doInsert();
    console.log(`[Import] Done: imported=${imported}, duplicates=${duplicates}, skipped=${skipped}`);
    return { success: true, imported, duplicates, skipped };
  }

  // ──────────────────────────────────────────────
  // RUN MATCHING
  // ──────────────────────────────────────────────
  runMatching() {
    const pendingBankTxns = this.stmtPendingBankTx.all();
    const pendingPayments  = this.stmtPendingPayments.all();

    const autoConfirmed = [];
    const suggested     = [];
    const usedPaymentIds = new Set();
    for (const bankTxn of pendingBankTxns) {
      // ── طبقة 0: الرقم المرجعي ───────────────
      const availablePayments = pendingPayments.filter(p => !usedPaymentIds.has(p.id));
      const layer0 = this._matchLayer0(bankTxn, availablePayments);
      if (layer0) {
        if (layer0.confidence >= CONFIG.AUTO_CONFIRM_THRESHOLD) {
          this._doAutoConfirm(layer0);
          autoConfirmed.push(this.formatMatch(layer0));
          usedPaymentIds.add(layer0.payment.id);
        } else {
          suggested.push(this.formatMatch(layer0));
          usedPaymentIds.add(layer0.payment.id);
        }
        continue;
      }

      // ── طبقة 1: ذاكرة التعلم ────────────────
      const layer1 = this._matchLayer1(bankTxn, availablePayments);
      if (layer1) {
        if (layer1.confidence >= CONFIG.AUTO_CONFIRM_THRESHOLD) {
          this._doAutoConfirm(layer1);
          autoConfirmed.push(this.formatMatch(layer1));
          usedPaymentIds.add(layer1.payment.id);
        } else {
          suggested.push(this.formatMatch(layer1));
          usedPaymentIds.add(layer1.payment.id);
        }
        continue;
      }

      // ── طبقة 2: مطابقة ذكية ─────────────────
      const layer2Results = this._matchLayer2(bankTxn, availablePayments);
      if (layer2Results.length > 0) {
        const best = layer2Results[0];
        if (best.confidence >= CONFIG.AUTO_CONFIRM_THRESHOLD) {
          this._doAutoConfirm(best);
          autoConfirmed.push(this.formatMatch(best));
          usedPaymentIds.add(best.payment.id);
        } else {
          // أرسل أفضل 3 مقترحات
          suggested.push({
            ...this.formatMatch(best),
            alternatives: layer2Results.slice(1, 3).map(r => this.formatMatch(r))
          });
          usedPaymentIds.add(best.payment.id);
        }
      }
      // إذا لم يوجد match → يبقى في unmatched_bank
    }

    // ── النتائج ──────────────────────────────
    const matchedBankTxIds = new Set([
      ...autoConfirmed.map(m => m.bank_transaction_id),
      ...suggested.map(m => m.bank_transaction_id),
    ]);
    const matchedPaymentIds = new Set([
      ...autoConfirmed.map(m => m.payment_id),
    ]);

    // unmatched_bank: spread كامل — يشمل transaction_hash, match_status, direction, إلخ
    const unmatchedBank = pendingBankTxns
      .filter(tx => !matchedBankTxIds.has(tx.id))
      .map(tx => ({ ...tx }));

    const unmatchedPayments = pendingPayments
      .filter(p => !matchedPaymentIds.has(p.id))
      .map(p => ({
        id:            p.id,
        customer_name: p.customer_name,
        total_amount:  p.total_amount,
        remaining_amount: p.remaining_amount,
        bank_reference:p.bank_reference,
        status:        p.status,
        created_at:    p.created_at,
      }));

    return {
      success:           true,
      auto_confirmed:    autoConfirmed.filter(m => m.match_type !== 'error'),
      suggested:         suggested.filter(m => m.match_type !== 'error'),
      unmatched_bank:    unmatchedBank,
      unmatched_payments: unmatchedPayments,
    };
  }

  // public alias
  formatMatch(m) { return formatMatch(m); }

  // ──────────────────────────────────────────────
  // LAYER 0: الرقم المرجعي
  // ──────────────────────────────────────────────
  _matchLayer0(bankTxn, pendingPayments) {
    // أولا: مطابقة tx_reference المستخرج مباشرة
    if (bankTxn.tx_reference) {
      const payment = pendingPayments.find(p =>
        p.bank_reference &&
        p.bank_reference.trim() === bankTxn.tx_reference.trim()
      );
      if (payment) return this._buildLayer0Result(bankTxn, payment);
    }

    // ثانيا: بحث عن bank_reference داخل raw_description
    const desc = bankTxn.raw_description || "";
    for (const p of pendingPayments) {
      if (p.bank_reference && p.bank_reference.trim().length >= 6) {
        if (desc.includes(p.bank_reference.trim())) {
          console.log("[Layer0] Found ref " + p.bank_reference + " inside raw_description");
          return this._buildLayer0Result(bankTxn, p);
        }
      }
    }

    return null;

  }

  _buildLayer0Result(bankTxn, payment) {
    const matchType = getMatchType(bankTxn.amount, payment.total_amount);
    const remaining = Math.max(0, (payment.remaining_amount ?? payment.total_amount ?? 0) - bankTxn.amount);

    return {
      bankTxn,
      payment,
      customer_name: payment.customer_name,
      confidence:    100,
      method:        'reference_exact',
      match_type:    matchType,
      breakdown: {
        name_score:   100,
        amount_score: 100,
        date_score:   100,
        remaining_after: remaining,
      }
    };
  }

  // ──────────────────────────────────────────────
  // LAYER 1: ذاكرة التعلم
  // ──────────────────────────────────────────────
  _matchLayer1(bankTxn, pendingPayments) {
    const learned = this.stmtLearningLookup.get(bankTxn.payer_name_normalized || bankTxn.payer_name);
    if (!learned) return null;

    const payment = pendingPayments.find(p => p.customer_id === learned.customer_id);
    if (!payment) return null;

    const amtScore  = scoreAmount(bankTxn.amount, payment.total_amount);
    const matchType = getMatchType(bankTxn.amount, payment.total_amount);
    const remaining = Math.max(0, (payment.remaining_amount ?? payment.total_amount ?? 0) - bankTxn.amount);

    // score = learned.confidence weighted with amount
    const confidence = Math.round(learned.confidence * 0.65 + amtScore * 0.35);

    return {
      bankTxn,
      payment,
      customer_name: payment.customer_name,
      confidence,
      method:        'learning_cache',
      match_type:    matchType,
      breakdown: {
        name_score:   learned.confidence,
        amount_score: amtScore,
        date_score:   100,
        remaining_after: remaining,
      }
    };
  }

  // ──────────────────────────────────────────────
  // LAYER 2: المطابقة الذكية
  // ──────────────────────────────────────────────
  _matchLayer2(bankTxn, pendingPayments) {
    const results = [];

    for (const payment of pendingPayments) {
      const nameScore   = scoreName(bankTxn.payer_name, payment.customer_name, bankTxn.name_candidates_json);
      const amountScore = scoreAmount(bankTxn.amount, payment.total_amount);
      const dateScore   = scoreDate(bankTxn.parsed_date, payment.created_at);
      const contextScore = payment.is_home_transfer ? 60 : 40;

      let total =
        nameScore   * CONFIG.WEIGHTS.name +
        amountScore * CONFIG.WEIGHTS.amount +
        dateScore   * CONFIG.WEIGHTS.date +
        contextScore * CONFIG.WEIGHTS.context;

      if (payment.is_home_transfer) total += CONFIG.HOME_TRANSFER_BONUS;
      total = Math.min(100, Math.round(total));

      if (total < CONFIG.SUGGEST_THRESHOLD) continue;
      if (nameScore < 20) continue; // reject if names are completely different

      const matchType = getMatchType(bankTxn.amount, payment.total_amount);
      const remaining = Math.max(0, (payment.remaining_amount ?? payment.total_amount ?? 0) - bankTxn.amount);

      results.push({
        bankTxn,
        payment,
        customer_name: payment.customer_name,
        confidence:    total,
        method:        'smart_name',
        match_type:    matchType,
        breakdown: {
          name_score:      nameScore,
          amount_score:    amountScore,
          date_score:      dateScore,
          context_score:   contextScore,
          remaining_after: remaining,
        }
      });
    }

    // ترتيب تنازلي حسب الـ confidence
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  // ──────────────────────────────────────────────
  // AUTO CONFIRM
  // ──────────────────────────────────────────────
  _doAutoConfirm(matchResult) {
    const { bankTxn, payment, match_type, breakdown } = matchResult;
    const remainingAfter = breakdown.remaining_after ?? 0;

    const confirm = this.db.transaction(() => {
      if (match_type === 'full') {
        // إغلاق الفاتورة كاملاً
        this.stmtUpdatePaymentFull.run({
          paid_amount: bankTxn.amount,
          id:          payment.id,
        });
        this.stmtUpdateBankTxMatch.run({
          match_status: 'matched_auto',
          payment_id:   payment.id,
          id:           bankTxn.id,
        });

      } else if (match_type === 'partial') {
        // دفع جزئي — ابقِ الفاتورة مفتوحة
        this.stmtUpdatePaymentPartial.run({
          paid_amount:      bankTxn.amount,
          remaining_amount: remainingAfter,
          id:               payment.id,
        });
        this.stmtInsertInstallment.run({
          payment_id:          payment.id,
          bank_transaction_id: bankTxn.id,
          amount:              bankTxn.amount,
          notes:               `دفعة جزئية تلقائية - ${matchResult.method}`,
        });
        this.stmtUpdateBankTxMatch.run({
          match_status: 'matched_auto',
          payment_id:   payment.id,
          id:           bankTxn.id,
        });

      } else if (match_type === 'over') {
        // مبلغ زائد — للمراجعة اليدوية فقط
        this.stmtUpdateBankTxMatch.run({
          match_status: 'review_needed',
          payment_id:   payment.id,
          id:           bankTxn.id,
        });
      }
    });

    confirm();

    // تحديث ذاكرة التعلم
    if (match_type !== 'over') {
      this._learnMatch(bankTxn, payment, matchResult.method);
    }
  }

  // ──────────────────────────────────────────────
  // MANUAL CONFIRM (يُستدعى من main.js)
  // ──────────────────────────────────────────────
  acceptSuggestion(bankTxId, paymentIds) {
    const pids = Array.isArray(paymentIds) ? paymentIds : [paymentIds];
    const invoiceIds = [];
    for (const pid of pids) {
      const result = this.manualConfirm(bankTxId, pid);
      if (!result.success) return result;
      const pay = this.db.prepare('SELECT invoice_id FROM payments WHERE id=?').get(pid);
      if (pay) invoiceIds.push(pay.invoice_id);
    }
    return { success: true, invoiceIds };
  }

  rejectSuggestion(bankTxId) {
    return { success: true };
  }

  manualConfirm(bankTxId, paymentId) {
    const bankTxn = this.db.prepare('SELECT * FROM bank_transactions WHERE id = ?').get(bankTxId);
    const payment = this.db.prepare(`
      SELECT p.*, c.name AS customer_name, c.is_home_transfer
      FROM payments p LEFT JOIN customers c ON c.id = p.customer_id
      WHERE p.id = ?
    `).get(paymentId);

    if (!bankTxn || !payment) return { success: false, error: 'Not found' };

    const matchType = getMatchType(bankTxn.amount, payment.total_amount);
    const remaining = Math.max(0, (payment.remaining_amount ?? payment.total_amount ?? 0) - bankTxn.amount);

    const fakeMatch = {
      bankTxn,
      payment,
      match_type:  matchType,
      method:      'manual',
      confidence:  100,
      breakdown:   { remaining_after: remaining }
    };

    this._doAutoConfirm(fakeMatch);
    this._learnMatch(bankTxn, payment, 'manual');

    return { success: true };
  }

  // ──────────────────────────────────────────────
  // LEARN MATCH
  // ──────────────────────────────────────────────
  _learnMatch(bankTxn, payment, method) {
    const pattern = (bankTxn.payer_name_normalized || bankTxn.payer_name || '').trim();
    if (!pattern || pattern.length < 3) return;

    try {
      // Get actual columns to build safe INSERT
      const cols = this.db.prepare("PRAGMA table_info(name_learning)").all();
      const colNames = cols.map(c => c.name);
      
      const values = {
        payer_name_pattern: pattern,
        customer_id: payment.customer_id || null,
        customer_name: payment.customer_name || '',
        bank_name_raw: bankTxn.payer_name || bankTxn.parsed_name || '',
        bank_name_normalized: (bankTxn.payer_name_normalized || bankTxn.payer_name || '').toLowerCase().trim(),
        system_customer_id: payment.customer_id || null,
        confidence: method === 'manual' ? 100 : 95,
        use_count: 1,
        confirmed_by: method,
        last_used_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      // Fill any NOT NULL column with safe default
      for (const col of cols) {
        if (col.notnull && !col.dflt_value && col.name !== 'id' && !(col.name in values)) {
          values[col.name] = '';
        }
      }

      const insertCols = Object.keys(values).filter(k => colNames.includes(k));
      const placeholders = insertCols.map(c => '@' + c).join(', ');
      const sql = `INSERT OR REPLACE INTO name_learning (${insertCols.join(', ')}) VALUES (${placeholders})`;
      
      this.db.prepare(sql).run(values);
    } catch(e) {
      console.log('[LearnMatch] Error:', e.message);
    }
  }

  // ──────────────────────────────────────────────
  // IGNORE BANK TX
  // ──────────────────────────────────────────────
  ignoreBankTx(bankTxId) {
    this.db.prepare(
      'UPDATE bank_transactions SET match_status = ? WHERE id = ?'
    ).run('ignored', bankTxId);
    return { success: true };
  }
}

module.exports = { MatchingEngine, formatMatch };