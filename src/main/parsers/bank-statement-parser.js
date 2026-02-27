'use strict';
const crypto = require('crypto');
const { calculateTransactionHash } = require('../../utils/transaction-hash');

/**
 * محلل كشف حساب بنك فلسطين
 * البنية: كل معاملة = 3 أسطر
 * السطر 1: الوصف (اسم الدافع)
 * السطر 2: المبالغ والتاريخ
 * السطر 3: المرجع والـ Wallet Alias
 */
class BankStatementParser {

    static parsePalestineBankStatement(csvContent) {
        const lines = csvContent
            .split('\n')
            .map(l => l.normalize('NFKC').replace(/\r/g, '').trim());

        const metadata   = this._extractMetadata(lines);
        const startIndex = this._findTransactionStart(lines);
        const { transactions, errors } = this._parseAllTransactions(lines, startIndex);

        console.log(`[Parser] metadata:`, JSON.stringify(metadata));
        console.log(`[Parser] startIndex: ${startIndex} | transactions: ${transactions.length} | errors: ${errors.length}`);

        return {
            transactions: transactions.map(tx => this._standardize(tx)),
            metadata,
            errors
        };
    }

    // 
    // الرأس والمعلومات العامة
    // 
    static _extractMetadata(lines) {
        const meta = { bankName: 'بنك فلسطين' };
        for (const line of lines.slice(0, 20)) {
            const m_holder  = line.match(/صاحب الحساب,,(.+?),/);
            const m_account = line.match(/رقم الحساب,,(\d+)/);
            const m_iban    = line.match(/الحساب الدولي,,(PS\w+)/);
            const m_from    = line.match(/من تار[يی]خ\s*:?\s*(\d{4}-\d{2}-\d{2})/);
            const m_to      = line.match(/ال[يى] تار[يی]خ\s*:?\s*(\d{4}-\d{2}-\d{2})/);
            const m_credits = line.match(/مجموع الحركات المستلمة,"?([\d,]+\.?\d*)"?/);
            const m_debits  = line.match(/مجموع الحركات المدفوعة,"?([\d,.\-]+)"?/);
            if (m_holder)  meta.accountHolder  = m_holder[1].trim();
            if (m_account) meta.accountNumber  = m_account[1];
            if (m_iban)    meta.iban            = m_iban[1];
            if (m_from)    meta.dateFrom        = m_from[1];
            if (m_to)      meta.dateTo          = m_to[1];
            if (m_credits) meta.totalCredits    = parseFloat(m_credits[1].replace(/,/g,''));
            if (m_debits)  meta.totalDebits     = parseFloat(m_debits[1].replace(/[,\-]/g,''));
        }
        return meta;
    }

    static _findTransactionStart(lines) {
        for (let i = 0; i < lines.length; i++) {
            if (i > 10 && this._isDescriptionLine(lines[i])) {
                return i;
            }
        }
        return 16;
    }

    static _isDescriptionLine(line) {
        if (!line) return false;
        // دعم الياء العربية (ي) والفارسية (ی) والـ presentation forms
        const hasTransfer = line.includes('تحويل') || line.includes('تحویل') || 
                           line.includes('Transfer') || line.includes('transfer');
        const isHeader = line.includes('التار') || line.includes('التاری') ||
                        line.includes('تفاصیل') || line.includes('تفاصيل') ||
                        line.includes('المبالغ');
        return hasTransfer && !isHeader;
    }

    // 
    // تحليل المعاملات (3 أسطر لكل معاملة)
    // 
    static _parseAllTransactions(lines, startIndex) {
        const transactions = [];
        const errors = [];
        let i = startIndex;

        while (i < lines.length - 1) {
            const L1 = lines[i] || '';

            // تخطي الأسطر الفارغة والعناوين المتكررة
            if (!L1 || L1.includes('التار') || L1.includes('التاری') || L1.includes('تفاصیل') || L1.includes('تفاصيل') || L1.includes('الرصيد') || L1.includes('الرصید') || L1.includes('المبالغ')) {
                i++; continue;
            }

            // هل هذا سطر وصف معاملة؟
            if (!this._isDescriptionLine(L1)) { i++; continue; }

            const L2 = lines[i + 1] || '';
            const L3 = (i + 2 < lines.length) ? lines[i + 2] || '' : '';

            try {
                const tx = this._parseBlock(L1, L2, L3);
                if (tx) transactions.push(tx);
            } catch (err) {
                errors.push({ line: i + 1, content: L1.substring(0, 60), error: err.message });
            }
            i += 3; // دائماً نقفز 3 أسطر
        }
        return { transactions, errors };
    }

    static _parseBlock(L1, L2, L3) {
        //  تجاهل العمولات 
        if (L1.includes('عمولة 0#') || L1.includes('عمولة تجار') || L1.includes('مشتريات/ عمولة')) {
            return null;
        }

        //  استخراج اسم الدافع 
        const { payerName, txType } = this._extractPayer(L1, L2, L3);
        if (!payerName) return null;

        //  استخراج المبلغ والتاريخ 
        const { amount, bankDate, isDebit } = this._parseAmountLine(L2);
        if (!amount || amount < 0.01) return null;
        if (isDebit) return null; // مدفوعات من الحساب  لا نطابقها

        //  Wallet Alias 
        const walletAlias = this._extractWalletAlias(L3);

        //  مرشحات الاسم 
        const nameCandidates = this._buildNameCandidates(payerName, walletAlias);

        return {
            payer_name_raw:        payerName,
            payer_name_normalized: this.normalizeText(payerName),
            name_candidates:       nameCandidates,
            wallet_alias:          walletAlias,
            amount,
            bank_date:             bankDate,
            transaction_type:      txType,
            reference:             this._extractReference(L3),
            raw_description:       L1.substring(0, 100)
        };
    }

    //  استخراج الاسم من السطر 1 + معالجة العمود 4 من السطر 2 
    static _extractPayer(L1, L2, L3) {
        let payerName = null;
        let txType = 'P2P';

        // استخرج ما بعد "من" أو "from"
        const arMatch = L1.match(/(?:من|مـن)\s+([^,\n]+)/);
        const enMatch = L1.match(/[Ff]rom\s+([^,\n]+)/);
        const raw = (arMatch || enMatch);
        if (!raw) return { payerName: null, txType: 'UNKNOWN' };

        payerName = raw[1].replace(/,+$/g, '').trim();

        // نوع المعاملة
        if      (L1.includes('لتاجر'))                              txType = 'MERCHANT';
        else if (L1.includes('للاخرين') || /[Oo]thers/.test(L1))   txType = 'TRANSFER';
        else if (L1.includes('لصديق')  || /[Ff]riend/.test(L1))    txType = 'FRIEND';

        //  حالة AMJAD: العمود 4 في L2 يكمل الاسم 
        const L2parts = this._splitCSV(L2);
        const col4 = (L2parts[3] || '').trim();
        if (col4 && col4.includes(' to ')) {
            const senderSuffix = col4.split(' to ')[0].trim();
            if (senderSuffix && senderSuffix.length > 2) {
                payerName = `${payerName} ${senderSuffix}`.trim();
            }
        }

        //  إعادة بناء الاسم المقطوع 
        payerName = this._reconstructName(payerName, L3);

        return { payerName, txType };
    }

    // "Taher Ahmed Hamdi Al" + "shawwa - WALLET"  "Taher Ahmed Hamdi Alshawwa"
    static _reconstructName(descName, refLine) {
        if (!descName || !refLine) return descName;

        // هل ينتهي الاسم بكلمة تشير للانقطاع؟
        const truncated = /\b(al|el|abu?|abou?|bin|bint|abd?|abo?)\s*$/i.test(descName);
        if (!truncated) return descName;

        // استخرج أول كلمة حقيقية من سطر المرجع
        const parts = refLine.split(/[\s\-\/,]+/);
        for (const word of parts) {
            if (word.length > 2 &&
                /^[a-zA-Z\u0600-\u06FF]+$/.test(word) &&
                !['WALLET','wallet','to','TO','from','FROM'].includes(word)) {
                return `${descName}${word}`.trim();
            }
        }
        return descName;
    }

    //  بناء قائمة مرشحي الاسم 
    static _buildNameCandidates(payerName, walletAlias) {
        const candidates = [payerName];
        if (walletAlias && walletAlias.length > 2 && !/^\d+$/.test(walletAlias)) {
            candidates.push(`${payerName} ${walletAlias}`);
            candidates.push(walletAlias);
        }
        return [...new Set(candidates.map(c => c.trim()).filter(Boolean))];
    }

    //  تحليل سطر المبالغ (السطر 2) 
    static _parseAmountLine(line) {
    let amount = null, date = null, balance = null;
    
    // Handle quoted fields (e.g., "61,409.39")
    // Split respecting quotes
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    fields.push(current.trim());
    
    console.log('[BOP Parser] Amount line fields:', fields);
    
    // Field 0 = balance (large number with commas), skip it
    // Field 1 = transaction amount
    // Field 2 = date (DD/MM/YYYY)
    // Field 4 = secondary dates
    
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i].replace(/,/g, '');
      
      // Try date first (DD/MM/YYYY)
      const dateMatch = f.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (dateMatch && !date) {
        date = dateMatch[3] + '-' + dateMatch[2] + '-' + dateMatch[1];
        continue;
      }
      
      // Try amount (number)
      const num = parseFloat(f);
      if (!isNaN(num) && num > 0) {
        if (i === 0 && num > 10000) {
          // First field with very large number = balance, skip
          balance = num;
          continue;
        }
        if (!amount) {
          amount = num;
        }
      }
    }
    
    return { amount, date, balance };
  }

    //  تطبيع النص للمطابقة 
    static normalizeText(text) {
        if (!text) return '';
        return text
            .normalize('NFKC')
            .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
            .replace(/[أإآٱ]/g, 'ا')
            .replace(/[ىئ]/g, 'ي')
            .replace(/ة/g, 'ه')
            .replace(/ؤ/g, 'و')
            .replace(/[-_]/g, ' ')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    //  حساب الـ hash لمنع التكرار 

    static _extractWalletAlias(refLine) {
        if (!refLine) return null;
        const m = refLine.match(/^[,\s]*([^,\-\/\n]+?)\s*-\s*WALLET/i);
        const alias = m ? m[1].trim().replace(/^[.,\s]+/, '') : null;
        return (alias && alias.length > 1 && !/^\d+$/.test(alias)) ? alias : null;
    }

    static _extractReference(refLine) {
        if (!refLine) return null;
        const m = refLine.match(/WALLET\s*\/(\d+)/i);
        if (m) return `W-${m[1]}`;
        const n = refLine.match(/\/(\d{6,})/);
        return n ? n[1] : refLine.substring(0, 40).replace(/^[,\s]+/, '').trim() || null;
    }

    static _splitCSV(line) {
        const result = [];
        let current = '', inQuote = false;
        for (const ch of line) {
            if (ch === '"') { inQuote = !inQuote; }
            else if (ch === ',' && !inQuote) { result.push(current); current = ''; }
            else { current += ch; }
        }
        result.push(current);
        return result;
    }

    static _standardize(tx) {
        return {
            date:                  tx.bank_date,
            amount:                tx.amount,
            payer_name:            tx.payer_name_raw,
            payer_name_normalized: tx.payer_name_normalized,
            name_candidates:       tx.name_candidates,
            wallet_alias:          tx.wallet_alias,
            reference:             tx.reference,
            transaction_type:      tx.transaction_type,
            raw_description:       tx.raw_description,
            transaction_hash:      calculateTransactionHash({
                date: tx.bank_date,
                amount: tx.amount,
                raw_description: tx.raw_description,
                reference: tx.reference
            })
        };
    }
}

module.exports = BankStatementParser;