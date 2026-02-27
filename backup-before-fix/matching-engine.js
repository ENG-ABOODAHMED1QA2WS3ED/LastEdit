// matching-engine.js - v7.0 Production Grade
// Based on Bank Reconciliation Matching Engine spec
const NameNormalizer = require('./name-normalizer');
const crypto = require('crypto');
const { calculateTransactionHash } = require('../utils/transaction-hash');
const InputSanitizer = require('./utils/input-sanitizer');
const BankStatementParser = require('./parsers/bank-statement-parser');
const MatchingFeedbackService = require('./matching-feedback');
const ScoringEngine = require('./scoring-engine');

class MatchingEngine {
  constructor(db) {
    this.db = db;
    this.config = this.loadConfig();
    this.scorer = new ScoringEngine(this.config);
    this.feedback = new MatchingFeedbackService(this.db);
    // Migration: add transaction_hash column
    try {
      this.db.exec("ALTER TABLE bank_transactions ADD COLUMN transaction_hash TEXT");
      console.log('[Migration] Added transaction_hash column');
    } catch(e) { /* column already exists */ }
    try {
      this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_hash ON bank_transactions(transaction_hash)");
    } catch(e) { /* index exists */ }
    console.log('MatchingEngine v7.0 initialized');
  }

  loadConfig() {
    try {
      const rows = this.db.prepare('SELECT key, value FROM matching_config').all();
      const cfg = {};
      for (const r of rows) cfg[r.key] = r.value;
      return cfg;
    } catch(e) {
      return {};
    }
  }

  // === UTILITY: Extract sender name from description ===
  extractSenderName(desc) {
    if (!desc) return '';
    const patterns = [
      /لصديق من\s+(.+?)(?:\s*\/|$)/,
      /تحويل من\s+(.+?)(?:\s*\/|$)/,
      /الدفع لصديق من\s+(.+?)(?:\s*\/|$)/,
      /from\s+(.+?)(?:\s*\/|$)/i,
      /transfer from\s+(.+?)(?:\s*\/|$)/i
    ];
    for (const p of patterns) {
      const m = desc.match(p);
      if (m && m[1]) {
        let name = m[1].trim();
        name = name.replace(/\s*-\s*WALLET.*/i, '');
        name = name.replace(/\s*\/\s*\d+/g, '');
        name = name.replace(/\s+/g, ' ').trim();
        if (name.length >= 2) return name;
      }
    }
    // Fallback: desc itself may be the name (pre-parsed BOP CSV)
    let fallback = desc.trim();
    fallback = fallback.replace(/^(تحويل الكتروني موبايل:|الدفع لصديق|الدفع للاخرين|e-payment|payment)/i, '').trim();
    fallback = fallback.replace(/\s*-\s*WALLET.*/i, '');
    fallback = fallback.replace(/\s*\/\s*\d+/g, '');
    fallback = fallback.replace(/\s+/g, ' ').trim();
    if (fallback.length >= 2 && !/^[\d.]+$/.test(fallback)) return fallback;
    return '';
  }

  extractReferenceFromDescription(desc) {
    if (!desc) return null;
    const patterns = [
      /\/(\d{8,10})\s*\/0/,
      /\/(\d{8,10})\s*ILS/i,
      /REF[#:\s]*(\d{8,10})/i,
      /(\d{9})(?!\d)/,
    ];
    for (const pattern of patterns) {
      const match = desc.match(pattern);
      if (match) return match[1];
    }
    return null;
  }


  detectTransferType(desc) {
    if (!desc) return 'unknown';
    const d = desc.toLowerCase();
    if (d.includes('wallet') || d.includes('jawwal')) return 'e_wallet';
    if (d.includes('تحويل') || d.includes('حوالة')) return 'bank_transfer';
    return 'other';
  }

  extractReference(desc) {
    if (!desc) return null;
    const m = desc.match(/\b(\d{6,})\b/);
    return m ? m[1] : null;
  }

  parseDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    dateStr = dateStr.trim();
    
    // Try DD/MM/YYYY (most common for bank statements)
    let m = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (m) {
      const day = parseInt(m[1]), month = parseInt(m[2]), year = parseInt(m[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      }
      // Maybe MM/DD/YYYY? Only if day > 12
      if (day >= 1 && day <= 12 && month >= 1 && month <= 31) {
        return `${year}-${String(day).padStart(2,'0')}-${String(month).padStart(2,'0')}`;
      }
    }
    
    // Try YYYY-MM-DD or YYYY-DD-MM
    m = dateStr.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (m) {
      const year = parseInt(m[1]), part1 = parseInt(m[2]), part2 = parseInt(m[3]);
      // If part1 > 12, it must be day (swapped)
      if (part1 > 12 && part2 >= 1 && part2 <= 12) {
        return `${year}-${String(part2).padStart(2,'0')}-${String(part1).padStart(2,'0')}`;
      }
      // Normal YYYY-MM-DD
      if (part1 >= 1 && part1 <= 12 && part2 >= 1 && part2 <= 31) {
        return `${year}-${String(part1).padStart(2,'0')}-${String(part2).padStart(2,'0')}`;
      }
    }
    
    console.warn('Could not parse date:', dateStr);
    return null;
  }

  generateBatchId() {
    return 'batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // === IMPORT BANK STATEMENT ===
    importBankStatement(rowsOrCsv, headers, fileName) {
    const batchId = this.generateBatchId();
    let imported = 0, duplicates = 0, skipped = 0, errors = 0;

    // === تحديد نوع المدخل ===
    let sanitized = [];
    let parseErrors = [];

    if (typeof rowsOrCsv === 'string') {
      // === Raw CSV string  اكتشاف نوع الكشف ===
      // NFKC normalize for presentation-form Arabic
      const csvNorm = rowsOrCsv.normalize('NFKC');
      const isPalestineBank = 
        csvNorm.includes('بنك فلسطين') || csvNorm.includes('بنك فلسطین') ||
        csvNorm.includes('الموبايل البنكي') || csvNorm.includes('الموبایل البنكي') ||
        csvNorm.includes('كشف حساب تفصيلي') || csvNorm.includes('كشف حساب تفصیلي') ||
        csvNorm.includes('صاحب الحساب') ||
        csvNorm.includes('تحويل الكتروني') || csvNorm.includes('تحویل الكتروني');
      console.log('[Import] isPalestineBank:', isPalestineBank);

      if (isPalestineBank) {
        console.log('[Import] كشف بنك فلسطين مكتشف  استخدام Parser المخصص');
        const result = BankStatementParser.parsePalestineBankStatement(csvNorm);
        sanitized = result.transactions;
        parseErrors = result.errors;
        console.log('[Import] Parser:', sanitized.length, 'معاملة |', parseErrors.length, 'خطأ');
      } else {
        // كشف عادي  تحويل لأسطر ومعالجة بالطريقة القديمة
        console.log('[Import] كشف عادي  معالجة بالطريقة التقليدية');
        const rows = rowsOrCsv.split('\\n').map(l => l.split(','));
        const r = InputSanitizer.sanitizeBatch(rows);
        sanitized = r.sanitized.map(s => ({
          date: s.date, amount: s.amount,
          payer_name: s.description, payer_name_normalized: (s.description||'').toLowerCase(),
          name_candidates: [s.description],
          wallet_alias: null, reference: null, transaction_type: 'P2P',
          raw_description: s.description,
          transaction_hash: calculateTransactionHash({ date: s.date, amount: s.amount, raw_description: s.description })
        }));
        parseErrors = r.errors;
      }
    } else if (Array.isArray(rowsOrCsv) && rowsOrCsv.length > 0 && typeof rowsOrCsv[0] === 'object' && rowsOrCsv[0].amount !== undefined) {
      // === parsedEntries من الـ renderer (Excel CSV) ===
      console.log('[Import] parsedEntries objects  معالجة مباشرة');
      sanitized = rowsOrCsv.map(entry => {
        const desc = entry.description || '';
        const payerName = entry.payer_name || this.extractSenderName(desc) || desc;
        const normalized = (payerName || '').toLowerCase().trim();
        return {
          date: entry.date || null,
          amount: parseFloat(entry.amount) || 0,
          payer_name: payerName,
          payer_name_normalized: normalized,
          name_candidates: [payerName, desc].filter(Boolean),
          wallet_alias: null,
          reference: null,
          transaction_type: 'P2P',
          raw_description: desc,
          transaction_hash: calculateTransactionHash({ date: entry.date, amount: entry.amount, raw_description: desc })
        };
      }).filter(tx => tx.amount > 0);
      parseErrors = [];
    } else {
      // === مصفوفة rows (التوافق مع v7.0 القديم) ===
      console.log('[Import] مصفوفة rows  معالجة بالطريقة القديمة');
      const rows = Array.isArray(rowsOrCsv) ? rowsOrCsv : [];
      const r = InputSanitizer.sanitizeBatch(rows);
      sanitized = r.sanitized.map(s => ({
        date: s.date, amount: s.amount,
        payer_name: s.description, payer_name_normalized: (s.description||'').toLowerCase(),
        name_candidates: [s.description],
        wallet_alias: null, reference: null, transaction_type: 'P2P',
        raw_description: s.description,
        transaction_hash: calculateTransactionHash({ date: s.date, amount: s.amount, raw_description: s.description })
      }));
      parseErrors = r.errors;
    }

    errors = parseErrors.length;

    // === Deduplication بالـ hash ===
    const existingHashes = new Set(
      this.db.prepare('SELECT transaction_hash FROM bank_transactions WHERE transaction_hash IS NOT NULL').all()
        .map(r => r.transaction_hash)
    );

    const insertStmt = this.db.prepare(`
      INSERT INTO bank_transactions
        (raw_date, raw_description, raw_amount, parsed_date, parsed_name, normalized_name,
         amount, direction, transfer_type, source_bank, reference_number,
         import_batch_id, import_date, file_name, row_number, match_status, transaction_hash, tx_reference,
         payer_name, payer_name_normalized, wallet_alias, name_candidates_json, transaction_type, hash_v2)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'),?,?,'pending',?,?,?,?,?,?,?,?)
    `);

    const txn = this.db.transaction(() => {
      for (let i = 0; i < sanitized.length; i++) {
        const tx = sanitized[i];
        console.log('[TRACE] row=' + i + ' name=' + (tx.payer_name||'').substring(0,25) + ' amt=' + tx.amount + ' hash=' + tx.transaction_hash + ' inSet=' + existingHashes.has(tx.transaction_hash));
        if (!tx.transaction_hash) { skipped++; continue; }
        if (existingHashes.has(tx.transaction_hash)) { duplicates++; continue; }

        try {
          tx.hash_v2 = calculateTransactionHash({
            date: tx.date, amount: tx.amount,
            raw_description: tx.raw_description || tx.payer_name || '',
            reference: tx.reference
          });
          const parsedName = tx.payer_name || '';
          const normalized = (tx.payer_name_normalized || parsedName.toLowerCase()).trim();
          const amount = Math.abs(tx.amount || 0);

          insertStmt.run(
            tx.date || null,                          // raw_date
            tx.raw_description || parsedName,          // raw_description
            tx.amount || 0,                            // raw_amount
            tx.date || null,                           // parsed_date
            parsedName,                                // parsed_name
            normalized,                                // normalized_name
            amount,                                    // amount
            'incoming',                                // direction
            tx.transaction_type || 'P2P',              // transfer_type
            null,                                      // source_bank
            tx.reference || null,                      // reference_number
            batchId,                                   // import_batch_id
            fileName || null,                          // file_name
            i + 1,                                     // row_number
            tx.transaction_hash,                       // transaction_hash
            this.extractReferenceFromDescription(tx.raw_description || parsedName), // tx_reference
            parsedName,                                // payer_name
            normalized,                                // payer_name_normalized
            tx.wallet_alias || null,                   // wallet_alias
            JSON.stringify(tx.name_candidates || [parsedName]), // name_candidates_json
            tx.transaction_type || 'P2P',              // transaction_type
            tx.hash_v2 || null                         // hash_v2
          );

          existingHashes.add(tx.transaction_hash);
          imported++;
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE')) { duplicates++; }
          else { console.warn('[Import] Insert error row', i, ':', e.message); errors++; }
        }
      }
    });
    txn();

    console.log('[Import] batch=' + batchId + ' total=' + sanitized.length + ' imported=' + imported + ' duplicates=' + duplicates + ' skipped=' + skipped + ' errors=' + errors);
    return { success: true, batchId, total: sanitized.length, imported, duplicates, skipped, errors };
  }

  // === MAIN MATCHING ENGINE v7.0 ===
  runMatching(batchId) {
    console.log('=== محرك المطابقة v7.0 ===');

    // 1. Get bank transactions
    let bankQuery = "SELECT * FROM bank_transactions WHERE direction='incoming' AND match_status='pending'";
    if (batchId) bankQuery += " AND import_batch_id='" + batchId + "'";
    const bankTxns = this.db.prepare(bankQuery).all();

    // Ensure parsed_name populated
    for (const bt of bankTxns) {
      if (!bt.parsed_name && bt.raw_description) {
        bt.parsed_name = this.extractSenderName(bt.raw_description);
        if (!bt.parsed_name) bt.parsed_name = bt.raw_description;
      }
    }

    // 2. Get pending payments
    const pendingPayments = this.db.prepare(
      "SELECT p.id as payment_id, p.amount, p.method, p.status, p.invoice_id, p.created_at, p.alt_account_name, p.bank_reference, i.customer_id, i.customer_name, c.name FROM payments p JOIN invoices i ON i.id = p.invoice_id LEFT JOIN customers c ON c.id = i.customer_id WHERE p.status IN ('awaiting_transfer','pending','pending_match','partial') AND p.method IN ('transfer','debt') ORDER BY c.name"
    ).all();

    console.log('عمليات بنكية:', bankTxns.length);
    console.log('دفعات معلقة:', pendingPayments.length);

    if (bankTxns.length === 0 || pendingPayments.length === 0) {
      return { success: true, auto_confirmed: [], suggested: [], unmatched_bank: bankTxns, unmatched_payments: pendingPayments };
    }

    // 3. Load aliases
    const aliasRows = this.db.prepare('SELECT customer_id, alias_name FROM customer_aliases').all();
    const aliases = {};
    for (const a of aliasRows) {
      if (!aliases[a.customer_id]) aliases[a.customer_id] = [];
      aliases[a.customer_id].push(a.alias_name);
    }
    console.log('aliases loaded:', aliasRows.length);

    // 4. Score every bank tx against every payment
    const autoConfirmed = [];
    const suggested = [];
    const usedBank = new Set();
    const usedPayments = new Set();

    for (const bt of bankTxns) {
      if (usedBank.has(bt.id)) continue;
      const bankName = bt.parsed_name || bt.payer_name || bt.raw_description || '';
      
      // جلب مرشحي الاسم من الحقل الجديد
      let nameCandidates = [];
      try { nameCandidates = JSON.parse(bt.name_candidates_json || '[]'); } catch(e) {}
      if (!nameCandidates.length) nameCandidates = [bankName];
      if (bt.wallet_alias && !nameCandidates.includes(bt.wallet_alias)) {
        nameCandidates.push(bt.wallet_alias);
      }
      if (!bankName) continue;


      // === طبقة 0: مطابقة بالرقم المرجعي ===
      if (bt.tx_reference) {
        const refPayment = pendingPayments.find(p =>
          !usedPayments.has(p.payment_id) && p.bank_reference === bt.tx_reference
        );
        if (refPayment) {
          const bankAmount = bt.amount;
          const invoiceAmount = refPayment.amount;
          const diff = bankAmount - invoiceAmount;

          if (Math.abs(diff) <= invoiceAmount * 0.01) {
            // === تطابق تام ===
            console.log("[Ref Match] EXACT:", bt.id, "ref:", bt.tx_reference, "", refPayment.customer_name, bankAmount);
            autoConfirmed.push({
              bank_transaction_id: bt.id, bankTxn: bt, payments: [refPayment],
              confidence: 100, score: 100, method: "reference_exact",
              match_type: "full", breakdown: { confidence: 100, is_partial: false, remaining_after: 0 }
            });
            usedBank.add(bt.id);
            usedPayments.add(refPayment.payment_id);
            if (refPayment.customer_id) this.saveLearningEntry(bt.parsed_name || bt.payer_name, refPayment.customer_id, NameNormalizer.deepNormalize(refPayment.customer_name || ""), 100, "reference");
            continue;

          } else if (diff < 0) {
            // === دفع جزئي: المبلغ المحول أقل من الفاتورة ===
            console.log("[Ref Match] PARTIAL:", bt.id, bankAmount, "من أصل", invoiceAmount, "متبقي:", Math.abs(diff));
            autoConfirmed.push({
              bank_transaction_id: bt.id, bankTxn: bt, payments: [refPayment],
              confidence: 100, score: 100, method: "reference_partial",
              match_type: "partial", breakdown: { confidence: 100, is_partial: true, remaining_after: Math.abs(diff), paid: bankAmount, original: invoiceAmount }
            });
            usedBank.add(bt.id);
            // لا نضيف للـ usedPayments لأن الفاتورة لسة مفتوحة
            if (refPayment.customer_id) this.saveLearningEntry(bt.parsed_name || bt.payer_name, refPayment.customer_id, NameNormalizer.deepNormalize(refPayment.customer_name || ""), 100, "reference");
            continue;

          } else {
            // === المبلغ أكبر من الفاتورة: مراجعة يدوية ===
            console.log("[Ref Match] OVERPAY:", bt.id, bankAmount, ">", invoiceAmount, "زيادة:", diff);
            suggested.push({
              bank_transaction_id: bt.id, bankTxn: bt, payments: [refPayment],
              confidence: 90, score: 90, method: "reference_overpay",
              match_type: "overpay", breakdown: { confidence: 90, is_partial: false, overpay: diff, bank_amount: bankAmount, invoice_amount: invoiceAmount,
                message: "المبلغ المحول " + bankAmount + " أكبر من الفاتورة " + invoiceAmount + "  زيادة " + diff + "" }
            });
            usedBank.add(bt.id);
            if (refPayment.customer_id) this.saveLearningEntry(bt.parsed_name || bt.payer_name, refPayment.customer_id, NameNormalizer.deepNormalize(refPayment.customer_name || ""), 100, "reference");
            continue;
          }
        }
        // الرقم المرجعي موجود بالكشف بس ما في فاتورة مقابله  ننتقل للمطابقة العميقة
      }


      // === طبقة 1: بحث في ذاكرة التعلم ===
      let learningHit = null;
      for (const candidate of nameCandidates) {
        const bankNorm = NameNormalizer.deepNormalize(candidate);
        if (!bankNorm) continue;
        const cached = this.lookupLearningCache(bankNorm);
        if (cached.length > 0) {
        
          for (const hit of cached) {
            
            const matchingPayment = pendingPayments.find(p =>
              !usedPayments.has(p.payment_id) && p.customer_id === hit.customer_id
            );
            if (matchingPayment) {
              learningHit = { payment: matchingPayment, cached: hit, bankNorm };
              break;
            }
          }
          if (learningHit) break;
        }
      }

      if (learningHit) {
        const lp = learningHit.payment;
        const amountScore = this.scorer.scoreAmount(bt.amount, lp.amount);
        const nameScore = learningHit.cached.confidence;
        const totalScore = (nameScore * 0.40) + (amountScore * 0.35) + (80 * 0.15) + (80 * 0.10);
        console.log("  [Cache Hit]", bankName, "->", learningHit.cached.customer_name,
          "| conf:", nameScore, "| amt:", amountScore, "| total:", totalScore.toFixed(1));
        if (totalScore >= 90 && amountScore >= 80) {
          autoConfirmed.push({ bankTxn: bt, payments: [lp], score: totalScore, method: "learning_cache" });
          usedBank.add(bt.id);
          usedPayments.add(lp.payment_id);
          continue;
        } else if (totalScore >= 50) {
          suggested.push({ bankTxn: bt, payments: [lp], score: totalScore, method: "learning_cache" });
          usedBank.add(bt.id);
          usedPayments.add(lp.payment_id);
          continue;
        }
      }

      let bestMatch = null;
      let bestScore = 0;
      

      for (const payment of pendingPayments) {
        if (usedPayments.has(payment.payment_id)) continue;

        const customer = {
          id: payment.customer_id,
          name: payment.name || payment.customer_name
        };
        const custAliases = aliases[payment.customer_id] || [];
        if (payment.alt_account_name) custAliases.push(payment.alt_account_name);

        // Run scoring (includes hard gates)
        // Run scoring with protection
        bt.nameCandidates = nameCandidates;
        let result;
        try {
          if (!payment.amount || !bt.amount) continue;
          result = this.scorer.calculate(bt, payment, customer, custAliases);
        } catch(e) {
          console.warn("  [Score Error]", bankName, "vs", customer.name, ":", e.message);
          continue;
        }

        
        if (!result || result.level === "blocked") continue;

        console.log("  MATCH:", bankName, "vs", customer.name,
          "| confidence:", result.confidence?.toFixed(2),
          "| name:", result.breakdown?.name,
          "| amount:", result.breakdown?.amount);

        if (result.totalScore > bestScore) {
          bestScore = result.totalScore;
          bestMatch = {
            bankTxn: bt,
            payments: [payment],
            score: result.totalScore,
            confidence: result.confidence,
            nameScore: (result.breakdown?.name || 0) / 100,
            level: result.level,
            type: "individual",
            totalAmount: payment.amount,
            breakdown: result.breakdown
          };
        }

      }
      if (!bestMatch) continue;

      // === شذوذ 11: حماية اسم من كلمة واحدة ===
      const nameWords = (bankName || "").trim().split(/\s+/).filter(w => w.length > 1);
      const isSingleWord = nameWords.length <= 1;

      // === شذوذ 5: فحص الغموض  هل في فاتورة ثانية قريبة بالنقاط ===
      let isAmbiguous = false;
      const bestPaymentId = bestMatch.payments[0]?.payment_id;
      for (const payment of pendingPayments) {
        if (usedPayments.has(payment.payment_id)) continue;
        if (payment.payment_id === bestPaymentId) continue;
        bt.nameCandidates = nameCandidates;
        try {
          const altResult = this.scorer.calculate(bt, payment, { id: payment.customer_id, name: payment.name || payment.customer_name }, aliases[payment.customer_id] || []);
          if (altResult && altResult.totalScore >= bestScore * 0.9 && altResult.totalScore >= 50) {
            isAmbiguous = true;
            console.log("  [AMBIGUOUS]", bankName, "matches both", bestMatch.payments[0]?.customer_name, "and", payment.customer_name);
            break;
          }
        } catch(e) { /* skip */ }
      }
      // === القرار النهائي ===
      if (isSingleWord) {
        // اسم من كلمة واحدة  اقتراح فقط لا تأكيد تلقائي
        console.log("  [SINGLE WORD] لا تأكيد تلقائي لاسم:", bankName);
        bestMatch.method = "single_word_suggestion";
        suggested.push(bestMatch);
        usedBank.add(bt.id);
      } else if (isAmbiguous) {
        // غموض  اقتراح للمراجعة اليدوية
        console.log("  [AMBIGUOUS] مراجعة يدوية مطلوبة لـ:", bankName);
        bestMatch.method = "ambiguous_suggestion";
        suggested.push(bestMatch);
        usedBank.add(bt.id);
      } else if (bestMatch.level === "auto_confirmed") {
        autoConfirmed.push(bestMatch);
        usedBank.add(bt.id);
        for (const p of bestMatch.payments) usedPayments.add(p.payment_id);
        console.log("  >> تأكيد تلقائي! نقاط:", bestMatch.score);
      } else if (bestMatch.level === "suggested") {
        suggested.push(bestMatch);
        usedBank.add(bt.id);
        console.log("  >> اقتراح! نقاط:", bestMatch.score);
      }
    }

    // 5. Deduplicate suggestions (best per payment)
    const bestByPayment = new Map();
    for (const s of suggested) {
      for (const p of s.payments) {
        const key = p.payment_id;
        if (!bestByPayment.has(key) || s.score > bestByPayment.get(key).score) {
          bestByPayment.set(key, s);
        }
      }
    }
    const bestByBank = new Map();
    for (const s of bestByPayment.values()) {
      const key = (s.bankTxn || {}).id;
      if (!bestByBank.has(key) || s.score > bestByBank.get(key).score) {
        bestByBank.set(key, s);
      }
    }
    const finalSuggested = [...bestByBank.values()];

    // 6. Save results
    this.saveAttempts(autoConfirmed, 'auto_confirmed');
    this.saveAttempts(finalSuggested, 'suggested');
    this.autoConfirm(autoConfirmed);

    const unmatchedBank = bankTxns.filter(bt => !usedBank.has(bt.id));
    const unmatchedPayments = pendingPayments.filter(p => !usedPayments.has(p.payment_id));

    const result = {
      success: true,
      auto_confirmed: autoConfirmed.map(m => this.formatMatch(m)),
      suggested: finalSuggested.map(m => this.formatMatch(m)),
      unmatched_bank: unmatchedBank,
      unmatched_payments: unmatchedPayments
    };

    console.log('=== نتائج v7.0 ===', JSON.stringify({
      total_bank: bankTxns.length,
      total_payments: pendingPayments.length,
      auto_confirmed: autoConfirmed.length,
      suggested: finalSuggested.length,
      unmatched_bank: unmatchedBank.length,
      unmatched_payments: unmatchedPayments.length
    }));

    return result;
  }

  // === HELPER METHODS (unchanged API) ===

  formatMatch(m) {
    // Validation: required fields
    const bt = m?.bankTxn ?? {};
    const payments = Array.isArray(m?.payments) ? m.payments : [];

    if (!bt.id && !m?.bank_transaction_id) {
      console.warn('[formatMatch] Missing bank transaction data:', JSON.stringify(m).substring(0, 200));
      return { bank_transaction_id: null, method: m?.method || 'unknown', bankTxn: {}, payments: [], confidence: 0, score: 0, match_type: 'error', breakdown: {}, _error: 'missing_bank_data' };
    }

    const isPartial = m.match_type === "partial" || (m.breakdown && bt.amount && m.totalAmount && (bt.amount < m.totalAmount * 0.9));
    // remaining_after: source from breakdown first, then compute, default 0
    const remainingAfter = m.breakdown?.remaining_after ?? (isPartial ? ((m.totalAmount || bt.amount || 0) - (bt.amount || 0)) : 0);

    return {
      bank_transaction_id: bt.id ?? m.bank_transaction_id ?? null,
      method: m.method || 'unknown',
      bankTxn: {
        id: bt.id ?? null,
        payer_name: bt.payer_name || bt.parsed_name || null,
        amount: bt.amount ?? null,
        transaction_date: bt.parsed_date ?? null,
        wallet_alias: bt.wallet_alias ?? null,
        raw_description: bt.raw_description ?? null,
        tx_reference: bt.tx_reference ?? null
      },
      payments: payments.map(p => ({
        payment_id: p?.payment_id ?? p?.id ?? null,
        id: p?.payment_id ?? p?.id ?? null,
        amount: p?.amount ?? null,
        customer_name: p?.name || p?.customer_name || null,
        customer_id: p?.customer_id ?? null,
        invoice_id: p?.invoice_id ?? null
      })),
      confidence: Math.round((m.confidence || 0) * 100),
      score: m.score ?? 0,
      match_type: isPartial ? 'partial' : 'full',
      breakdown: {
        name_score: m.breakdown?.name ?? 0,
        amount_score: m.breakdown?.amount ?? 0,
        date_score: m.breakdown?.date ?? 0,
        confidence: Math.round((m.confidence || 0) * 100),
        match_method: m.breakdown?.nameDetails ?? '',
        is_partial: isPartial,
        remaining_after: remainingAfter
      }
    };
  }
  saveAttempts(matches, level) {
    const insert = this.db.prepare("INSERT OR IGNORE INTO matching_attempts (bank_transaction_id, payment_id, score, match_level, decision, created_at) VALUES (?,?,?,?,?,datetime('now','localtime'))");
    for (const m of matches) {
      for (const p of m.payments) {
        try { insert.run(m.bankTxn.id, p.payment_id || p.id, m.score, level, level === 'auto_confirmed' ? 'accepted' : 'pending'); } catch(e) {}
      }
    }
  }

  autoConfirm(matches) {
    const updateBankFull = this.db.prepare("UPDATE bank_transactions SET match_status='matched_auto' WHERE id=?");
    const updateBankPartial = this.db.prepare("UPDATE bank_transactions SET match_status='matched_partial' WHERE id=?");
    const updatePaymentConfirmed = this.db.prepare("UPDATE payments SET status='confirmed', paid_amount=? WHERE id=?");
    const updatePaymentPartial = this.db.prepare("UPDATE payments SET status='partial', paid_amount=? WHERE id=?");
    const insertInstallment = this.db.prepare(`
      INSERT INTO payment_installments (payment_id, bank_transaction_id, amount, match_type, matched_by)
      VALUES (?, ?, ?, ?, 'auto')
    `);

    for (const m of matches) {
      const bt = m.bankTxn || {};
      if (!bt.id || !bt.amount) {
        console.warn("[autoConfirm] skip: missing bank data");
        continue;
      }

      const matchType = m.match_type || 'full';

      // === OVER: do not auto-confirm, should be in suggested ===
      if (matchType === 'over') {
        console.warn("[autoConfirm] skip over-payment, should be suggested:", bt.id);
        continue;
      }

      // === FULL MATCH ===
      if (matchType === 'full') {
        updateBankFull.run(bt.id);
        for (const p of m.payments) {
          const pid = p.payment_id || p.id;
          if (p.method === "transfer") {
            updatePaymentConfirmed.run(bt.amount, pid);
          }
          insertInstallment.run(pid, bt.id, bt.amount, 'full');
        }
      }

      // === PARTIAL MATCH ===
      if (matchType === 'partial') {
        updateBankPartial.run(bt.id);
        for (const p of m.payments) {
          const pid = p.payment_id || p.id;
          const prevPaid = p.paid_amount || 0;
          const newPaid = prevPaid + bt.amount;
          const invoiceAmount = p.amount || 0;
          const remaining = Math.max(0, invoiceAmount - newPaid);

          if (remaining <= 0.01) {
            // partial completed the payment
            updatePaymentConfirmed.run(newPaid, pid);
            insertInstallment.run(pid, bt.id, bt.amount, 'partial_complete');
          } else {
            // still partial
            updatePaymentPartial.run(newPaid, pid);
            insertInstallment.run(pid, bt.id, bt.amount, 'partial');
          }
        }
      }

      // === Learn alias ===
      if (m.payments[0]?.customer_id) {
        const custId = m.payments[0].customer_id;
        const bankName = bt.parsed_name || bt.payer_name;
        if (bankName) {
          this.learnAlias(custId, bankName);
          try {
            const custName = this.db.prepare("SELECT name FROM customers WHERE id=?").get(custId)?.name || "";
            this.saveLearningEntry(bankName, custId, NameNormalizer.deepNormalize(custName), 95, "auto");
          } catch(e) { /* skip */ }
        }
      }
    }
  }

  acceptSuggestion(bankTxnId, paymentIds, isPartial) {
    console.log("[Accept] START:", bankTxnId, paymentIds, "partial:", isPartial);
    const bt_check = this.db.prepare('SELECT * FROM bank_transactions WHERE id=?').get(bankTxnId);
    if (!bt_check) return { success: false, error: "bank tx not found" };

    const payments = [];
    for (const pid of paymentIds) {
      const p = this.db.prepare("SELECT * FROM payments WHERE id=? AND status IN ('awaiting_transfer','pending','pending_match','partial')").get(pid);
      if (p) payments.push(p);
    }
    if (payments.length === 0) return { success: false, error: "no valid payments" };

    let resultInfo = {};
    const txn = this.db.transaction(() => {
      this.db.prepare("UPDATE bank_transactions SET match_status='matched_manual' WHERE id=?").run(bankTxnId);

      let remaining = bt_check.amount;
      for (const payment of payments) {
        if (remaining <= 0.01) break;
        const applyAmount = Math.min(remaining, payment.amount);
        const totalPaid = (payment.paid_amount || 0) + applyAmount;
        const paymentRemaining = Math.max(0, payment.amount - totalPaid);

        if (paymentRemaining <= 0.01) {
          // الدفعة مكتملة
          this.db.prepare("UPDATE payments SET status='confirmed', paid_amount=? WHERE id=?").run(totalPaid, payment.id);
          resultInfo.new_status = 'confirmed';
        } else {
          // دفعة جزئية  تحديث paid_amount والإبقاء على status='partial'
          this.db.prepare("UPDATE payments SET status='partial', paid_amount=? WHERE id=?").run(totalPaid, payment.id);
          resultInfo.new_status = 'partial';
          resultInfo.remaining = paymentRemaining;
        }
        remaining -= applyAmount;

        this.db.prepare(`INSERT OR REPLACE INTO matching_attempts 
          (bank_transaction_id, payment_id, score, match_level, decision, decided_by, decision_date, is_partial, paid_amount, remaining_amount) 
          VALUES (?,?,?,?,?,?,datetime('now','localtime'),?,?,?)
        `).run(bankTxnId, payment.id, 100, 'manual', 'accepted', 'user', paymentRemaining > 0.01 ? 1 : 0, applyAmount, paymentRemaining);

        resultInfo.paid_amount = totalPaid;
      }

      // تعلم الـ alias
      const first = payments[0];
      const bt = bt_check;
      if (first && bt) {
        const custId = first.customer_id || this.db.prepare('SELECT customer_id FROM invoices WHERE id=?').get(first.invoice_id)?.customer_id;
        if (custId && bt.parsed_name) {
          this.learnAlias(custId, bt.parsed_name);
          const custName = this.db.prepare('SELECT name FROM customers WHERE id=?').get(custId)?.name || '';
          this.saveLearningEntry(bt.parsed_name, custId, NameNormalizer.deepNormalize(custName), 100, 'manual');
          // حفظ wallet alias كمان
          if (bt.wallet_alias) {
            this.saveLearningEntry(bt.wallet_alias, custId, NameNormalizer.deepNormalize(custName), 85, 'manual');
          }
        }
      }
    });
    txn();

    // Record feedback
    try {
      const bankName = bt_check.parsed_name || bt_check.payer_name || bt_check.raw_description || '';
      for (const payment of payments) {
        const custRow = this.db.prepare('SELECT c.name, c.id as cid FROM customers c JOIN invoices i ON c.id = i.customer_id JOIN payments p ON p.invoice_id = i.id WHERE p.id = ?').get(payment.id);
        this.feedback.recordManualConfirmation(bankTxnId, payment.id, bankName, custRow ? custRow.name : '', bt_check.amount, payment.amount, 'user', null, true, custRow ? custRow.cid : null);
      }
    } catch(fe) { console.warn('Feedback record error:', fe.message); }

    return { success: true, ...resultInfo };
  }

  rejectSuggestion(bankTxnId, paymentIds) {
    // Record rejection feedback
    try {
      const bankTx = this.db.prepare('SELECT * FROM bank_transactions WHERE id = ?').get(bankTxnId);
      const bankName = bankTx ? (bankTx.parsed_name || bankTx.raw_description || '') : '';
      for (const pid of paymentIds) {
        const custName = this.db.prepare('SELECT c.name FROM customers c JOIN invoices i ON c.id = i.customer_id JOIN payments p ON p.invoice_id = i.id WHERE p.id = ?').get(pid);
        this.feedback.recordRejection(bankTxnId, pid, bankName, custName ? custName.name : '', 'user', null);
      }
    } catch(feedbackErr) { console.warn('Rejection feedback error:', feedbackErr.message); }
    for (const pid of paymentIds) {
      this.db.prepare("UPDATE matching_attempts SET decision='rejected', decided_by='user' WHERE bank_transaction_id=? AND payment_id=?").run(bankTxnId, pid);
    }
    this.db.prepare("UPDATE bank_transactions SET match_status='ignored' WHERE id=?").run(bankTxnId);
    return { success: true };
  }


  // === نظام التعلم الذاتي ===
  lookupLearningCache(bankNameNormalized) {
    try {
      const rows = this.db.prepare(`
        SELECT nl.*, c.name as customer_name, c.id as customer_id
        FROM name_learning nl
        JOIN customers c ON c.id = nl.system_customer_id
        WHERE nl.bank_name_normalized = ?
        AND nl.confidence >= 90
        ORDER BY nl.use_count DESC, nl.confidence DESC
        LIMIT 3
      `).all(bankNameNormalized);
      return rows || [];
    } catch(e) {
      console.warn("[Learning] lookup error:", e.message);
      return [];
    }
  }

  saveLearningEntry(bankNameRaw, customerId, systemNameNorm, confidence, confirmedBy) {
    if (!bankNameRaw || !customerId) return;
    const bankNorm = NameNormalizer.deepNormalize(bankNameRaw);
    if (!bankNorm || bankNorm.length < 2) return;
    try {
      this.db.prepare(`
        INSERT INTO name_learning
          (bank_name_raw, bank_name_normalized, system_customer_id, system_name_normalized, confidence, confirmed_by)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(bank_name_normalized, system_customer_id) DO UPDATE SET
          use_count = use_count + 1,
          confidence = MAX(confidence, excluded.confidence),
          confirmed_by = excluded.confirmed_by,
          confirmed_at = datetime('now','localtime')
      `).run(bankNameRaw, bankNorm, customerId, systemNameNorm, confidence, confirmedBy);
      console.log(`[Learning] saved: "${bankNameRaw}" -> customer ${customerId} (conf: ${confidence})`);
    } catch(e) {
      console.warn("[Learning] save error:", e.message);
    }
  }

  learnAlias(customerId, bankName) {
    if (!bankName || !customerId) return;
    const normalized = NameNormalizer.deepNormalize(bankName);
    if (!normalized || normalized.length < 2) return;
    try {
      const existing = this.db.prepare('SELECT id, usage_count FROM customer_aliases WHERE customer_id=? AND normalized_name=?').get(customerId, normalized);
      if (existing) this.db.prepare('UPDATE customer_aliases SET usage_count=usage_count+1 WHERE id=?').run(existing.id);
      else this.db.prepare("INSERT INTO customer_aliases (customer_id, alias_name, normalized_name, source, confidence, usage_count) VALUES (?,?,?,'auto_learn',0.8,1)").run(customerId, bankName, normalized);
    } catch(e) {}
  }

  addAliasManual(customerId, aliasName) {
    if (!aliasName || !customerId) return;
    const normalized = NameNormalizer.deepNormalize(aliasName);
    this.db.prepare("INSERT OR IGNORE INTO customer_aliases (customer_id, alias_name, normalized_name, source, confidence, usage_count) VALUES (?,?,?,'manual',1.0,0)").run(customerId, aliasName, normalized);
    return { success: true };
  }

  getAliases(customerId) {
    try { return this.db.prepare('SELECT * FROM customer_aliases WHERE customer_id=?').all(customerId); } catch(e) { return []; }
  }

  getStats() {
    return {
      total_imported: this.db.prepare('SELECT COUNT(*) as c FROM bank_transactions').get().c,
      matched_auto: this.db.prepare("SELECT COUNT(*) as c FROM bank_transactions WHERE match_status='matched_auto'").get().c,
      matched_manual: this.db.prepare("SELECT COUNT(*) as c FROM bank_transactions WHERE match_status='matched_manual'").get().c,
      pending: this.db.prepare("SELECT COUNT(*) as c FROM bank_transactions WHERE match_status='pending'").get().c,
    };
  }

  undoMatch(bankTxnId) {
    const bt = this.db.prepare('SELECT * FROM bank_transactions WHERE id=?').get(bankTxnId);
    if (!bt) throw new Error('معاملة بنكية غير موجودة');
    if (bt.match_status === 'pending') throw new Error('هذه المعاملة غير مطابقة أصلاً');

    const attempts = this.db.prepare('SELECT * FROM matching_attempts WHERE bank_transaction_id=? AND decision IN (?,?)').all(bankTxnId, 'accepted', 'auto_confirmed');
    if (attempts.length === 0) throw new Error('لا توجد مطابقة مقبولة لهذه المعاملة');

    const paymentIds = attempts.map(a => a.payment_id);

    const txn = this.db.transaction(() => {
      this.db.prepare("UPDATE bank_transactions SET match_status='pending' WHERE id=?").run(bankTxnId);
      for (const pid of paymentIds) {
        const payment = this.db.prepare('SELECT * FROM payments WHERE id=?').get(pid);
        if (payment && payment.method === 'transfer') {
          this.db.prepare("UPDATE payments SET status='pending' WHERE id=?").run(pid);
        }
        this.db.prepare("UPDATE matching_attempts SET decision='reversed', decided_by='user' WHERE bank_transaction_id=? AND payment_id=?").run(bankTxnId, pid);
      }
    });
    txn();
    return { success: true, reversed_payments: paymentIds.length };
  }
}

module.exports = MatchingEngine;





