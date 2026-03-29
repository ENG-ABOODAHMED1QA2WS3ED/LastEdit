// ============================================================
// src/main/matching-engine.js  — v8.0
// محرك استيراد ومطابقة كشوف البنك
// ============================================================
'use strict';

const { calculateTransactionHash } = require('../utils/transaction-hash');
const { BankStatementParser }      = require('./parsers/bank-statement-parser');
const MCONFIG = require('../config/matching-config');
const NameNormalizer = require('./name-normalizer');
const MatchingFeedbackService = require('./matching-feedback');


// ──────────────────────────────────────────────────────────
// SCORING CONFIG
// ──────────────────────────────────────────────────────────
const CONFIG = Object.assign({
  AUTO_CONFIRM_THRESHOLD: 95,
  SUGGEST_THRESHOLD: 60,
  WEIGHTS: { name: 0.40, amount: 0.35, date: 0.15, context: 0.10 },
  HOME_TRANSFER_BONUS: 5,
  DATE_HARD_LIMIT_DAYS: 365,
}, MCONFIG);  // MCONFIG يتغلب على القيم الافتراضية

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

// 
// REVERSE TRANSLITERATION MAP (Latin  Arabic)
// 
const REVERSE_TRANSLIT = {
  'sh':'ش', 'th':'ث', 'kh':'خ', 'dh':'ذ', 'gh':'غ', 'la':'لا',
  'aa':'ا', 'ee':'ي', 'oo':'و', 'ou':'و', 'ai':'ع', 'ei':'ع',
  'a':'ا', 'b':'ب', 'c':'ك', 'd':'د', 'e':'ا', 'f':'ف',
  'g':'ج', 'h':'ه', 'i':'ي', 'j':'ج', 'k':'ك', 'l':'ل',
  'm':'م', 'n':'ن', 'o':'و', 'p':'ب', 'q':'ق', 'r':'ر',
  's':'س', 't':'ت', 'u':'و', 'v':'ف', 'w':'و', 'x':'كس',
  'y':'ي', 'z':'ز'
};

function reverseTransliterate(text) {
  if (!text) return '';
  let result = '';
  const lower = text.toLowerCase().replace(/[^a-z\s]/g, '');
  let i = 0;
  while (i < lower.length) {
    if (i + 1 < lower.length) {
      const pair = lower[i] + lower[i+1];
      if (REVERSE_TRANSLIT[pair]) {
        result += REVERSE_TRANSLIT[pair];
        i += 2;
        continue;
      }
    }
    const ch = lower[i];
    if (ch === ' ') { result += ' '; }
    else { result += REVERSE_TRANSLIT[ch] || ch; }
    i++;
  }
  return result.trim();
}

// مطابقة ذكية: إنجليزي مع عربي
// مطابقة ذكية: إنجليزي مع عربي
// مطابقة ذكية: إنجليزي مع عربي
function crossLanguageScore(name1, name2) {
  if (!name1 || !name2) return 0;
  const isArabic1 = /[\u0600-\u06FF]/.test(name1);
  const isArabic2 = /[\u0600-\u06FF]/.test(name2);
  if (isArabic1 === isArabic2) return 0;

  const [arabic, english] = isArabic1 ? [name1, name2] : [name2, name1];

  function compact(s) {
    return s.toLowerCase().replace(/[aeiou]/g, "").replace(/(.)\1+/g, "$1").replace(/[^a-z]/g, "");
  }

  // حول العربي للاتيني مع فصل ال التعريف
  const arLatin = transliterate(normalizeName(arabic))
    .replace(/\bal/g, "al ").replace(/\s+/g, " ").trim();
  const enNorm = english.toLowerCase().replace(/[^a-z\s]/g, "").trim();

  const arTokens = arLatin.split(/\s+/).filter(t => t.length > 1);
  const enTokens = enNorm.split(/\s+/).filter(t => t.length > 1);

  // مطابقة التوكنات
  let matched = 0;
  const usedEn = new Set();
  for (const at of arTokens) {
    const atC = compact(at);
    if (atC.length < 2) continue;
    let bestMatch = -1;
    let bestType = 0;
    for (let j = 0; j < enTokens.length; j++) {
      if (usedEn.has(j)) continue;
      const etC = compact(enTokens[j]);
      if (etC.length < 2) continue;
      if (atC === etC) { bestMatch = j; bestType = 1; break; }
      if (atC.includes(etC) || etC.includes(atC)) {
        if (bestType < 0.9) { bestMatch = j; bestType = 0.9; }
      }
      if (bestType < 0.7 && atC.length >= 3 && etC.length >= 3 && atC.substring(0,3) === etC.substring(0,3)) {
        bestMatch = j; bestType = 0.7;
      }
    }
    if (bestMatch >= 0) { matched += bestType; usedEn.add(bestMatch); }
  }

  // اسم العائلة bonus (آخر توكن)
  let familyBonus = 0;
  if (arTokens.length > 0 && enTokens.length > 0) {
    const lastAr = compact(arTokens[arTokens.length - 1]);
    const lastEn = compact(enTokens[enTokens.length - 1]);
    if (lastAr.length >= 3 && lastEn.length >= 3) {
      if (lastAr === lastEn || lastAr.includes(lastEn) || lastEn.includes(lastAr)) familyBonus = 30;
      else if (lastAr.substring(0,3) === lastEn.substring(0,3)) familyBonus = 20;
    }
  }

  // الاسم الأول bonus
  let firstBonus = 0;
  if (arTokens.length > 0 && enTokens.length > 0) {
    const firstAr = compact(arTokens[0]);
    const firstEn = compact(enTokens[0]);
    if (firstAr.length >= 2 && firstEn.length >= 2) {
      if (firstAr === firstEn) firstBonus = 20;
      else if (firstAr.substring(0,2) === firstEn.substring(0,2)) firstBonus = 15;
    }
  }

  const maxT = Math.max(arTokens.length, enTokens.length, 1);
  const tokenScore = (matched / maxT) * 100;
  const total = Math.min(95, tokenScore + familyBonus + firstBonus);

  return total;
}

// ──────────────────────────────────────────────────────────
// تطبيع الاسم
// ──────────────────────────────────────────────────────────
function normalizeName(name) {
  if (!name) return '';
  let n = name.trim()
    .replace(/\s+/g, ' ')
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase();
  // دمج البادئات العربية: ابو  ابو، ام  ام، عبد  عبد
  n = n.replace(/\b(ابو|أبو|ابا|عبد|ام)\s+/g, '$1');
  return n;
}

// ──────────────────────────────────────────────────────────
// SCORING FUNCTIONS (Soft Gates — لا حظر)
// ──────────────────────────────────────────────────────────

/** تسجيل نقاط التاريخ — عقوبة مرة واحدة فقط هنا */
// تحليل تاريخ مرن (يدعم DD/MM/YYYY و YYYY-MM-DD)
function parseFlexDate(dateStr) {
  if (!dateStr) return null;
  const s = dateStr.toString().trim().substring(0, 10);
  // DD/MM/YYYY
  const slashParts = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashParts) {
    const [, d, m, y] = slashParts;
    if (parseInt(d) > 12) return new Date(parseInt(y), parseInt(m)-1, parseInt(d));
    if (parseInt(m) > 12) return new Date(parseInt(y), parseInt(d)-1, parseInt(m));
    return new Date(parseInt(y), parseInt(m)-1, parseInt(d));
  }
  // YYYY-MM-DD
  const isoParts = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoParts) {
    const [, y, m, d] = isoParts;
    return new Date(parseInt(y), parseInt(m)-1, parseInt(d));
  }
  const fallback = new Date(dateStr);
  return isNaN(fallback) ? null : fallback;
}

function scoreDate(txDate, invoiceDate) {
  if (!txDate || !invoiceDate) return 50;
  const d1 = parseFlexDate(txDate);
  const d2 = parseFlexDate(invoiceDate);
  if (!d1 || !d2 || isNaN(d1) || isNaN(d2)) return 50;

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
  const diff = Math.abs(txAmount - invoiceAmount);
  // فرق بسيط (عمولة) = مطابقة تامة
  if (diff <= 2) return 100;
  const ratio = txAmount / invoiceAmount;
  if (ratio >= 0.90 && ratio <= 1.10) return 85;
  if (ratio >= 0.80 && ratio <= 1.20) return 70;
  if (ratio >= 0.50 && ratio <= 1.50) return 45;
  if (ratio >= 0.20 && ratio <= 2.00) return 25;
  return 0;
}

// 
// دالة تنظيف اسم الدافع  تستخدم في Layer 2 و Layer 3
// 
function cleanPayerName(rawName, accountOwner, accountOwnerNormalized) {
  if (!rawName) return "";
  let name = rawName.trim();

  // === POS Detection ===
  const posPatterns = ["مشتريات", "عمولة تجار", "رسوم نقاط بيع", "POS CHARGES", "نقاط بيع"];
  if (posPatterns.some(p => name.includes(p))) {
    return "__POS_PAYMENT__";
  }

  // === PIBC / pacs Detection ===
  // Matches: /OWNER/NAME/CT  or  pacs.../OWNER/NAME/CT  or  تحويل اي-براق ...
  const hasPIBC = name.includes("/") && (
    name.toLowerCase().includes("abdallah") ||
    name.includes("تحويل اي-براق") ||
    name.includes("اي-براق") ||
    /\/[A-Z]{2,}/.test(name)
  );
  if (hasPIBC) {
    const slashParts = name.split("/");
    const ownerEn = ["abdallah abukmail", "abu kmail mill", "abukmail"];
    let payerFound = "";
    for (let i = 0; i < slashParts.length; i++) {
      const part = slashParts[i].trim();
      const partLower = part.toLowerCase();
      const isOwner = ownerEn.some(oe => partLower.includes(oe));
      const isCT = /^ct\.?\.*$/i.test(partLower);
      const isRef = /^(pibc|pacs)?\d{4,}/.test(partLower) || partLower.startsWith("pibc") || partLower.startsWith("pacs");
      const isEmpty = part.length < 2;
      if (!isOwner && !isCT && !isRef && !isEmpty && /[a-zA-Z\u0600-\u06FF]/.test(part)) {
        payerFound = part;
      }
    }
    if (payerFound.length >= 3) return payerFound.replace(/\/CT$/gi, "").trim();
    return "__OWNER_PAYMENT__";
  }

  // === Step 1: Remove WALLET suffix ===
  name = name.replace(/\s*-\s*WALLET/gi, "");

  // === Step 2: Remove USSD prefix + phone + amount ===
  // Pattern: تحويل الكتروني خدمة USSD: 059XXXXXXX اسم الشخص مبلغ XX.XX
  name = name.replace(/^تحويل الكتروني خدمة USSD:\s*/g, "");
  name = name.replace(/\b0\d{9}\b\s*/g, "");           // phone numbers
  name = name.replace(/\s*مبلغ\s*[\d.,]+\s*$/g, "");   // trailing مبلغ XX.XX

  // === Step 3: Remove standard Arabic prefixes ===
  const arabicPrefixes = [
    "تحويل الكتروني موبايل:",
    "تحويل الكتروني Mobile:",
    "تحويل الكتروني:",
    "الدفع لتاجر الى", "الدفع لتاجر إلى", "الدفع لتاجر من",
    "الدفع لصديق الى", "الدفع لصديق إلى", "الدفع لصديق من",
    "تحويل للاخرين من",
    "دفع لتاجر", "دفع لصديق",
    "اثراء",
  ];
  for (const prefix of arabicPrefixes) {
    if (name.includes(prefix)) {
      name = name.replace(prefix, "").trim();
    }
  }

  // === Step 4: Remove English prefixes ===
  const englishPrefixes = [
    "Pay to merchant to", "Pay to merchant from",
    "Pay To Friend to", "Pay To Friend from",
    "Transfer to Others from",
    "Pay Friend", "Pay Merchant", "Mobile",
  ];
  const nameLowerCheck = name.toLowerCase();
  for (const prefix of englishPrefixes) {
    const idx = nameLowerCheck.indexOf(prefix.toLowerCase());
    if (idx === 0) {
      name = name.substring(prefix.length).trim();
      break;
    }
  }

  // === Step 5: Remove reference numbers ===
  name = name.replace(new RegExp("\\s*\\/\\d[\\d\\w]*\\s*\\/.*$", "g"), "");
  name = name.replace(new RegExp("\\s*\\/\\d[\\d\\w]*$", "g"), "");
  name = name.replace(/\s+(دفع لصديق|دفع لتاجر|تحويل للاخرين|Pay to merchant|Transfer to Othe)[\s\S]*$/gi, "");
  name = name.replace(/\s+\d{5,}ILS[\s\S]*$/g, "");

  // === Step 6: Cleanup spaces ===
  name = name.replace(/\s+/g, " ").trim();

  // === Step 7: Remove Arabic owner name ===
  if (accountOwner) {
    const ownerPatterns = [
      "الى " + accountOwner,
      "إلى " + accountOwner,
      "الي " + accountOwner,
      "to " + accountOwner,
      accountOwner
    ];
    for (const op of ownerPatterns) {
      if (name.includes(op)) {
        const remaining = name.replace(op, "").trim();
        if (remaining.length >= 3) {
          name = remaining;
          break;
        } else {
          return "__OWNER_PAYMENT__";
        }
      }
    }
  }

  // Double check owner still present
  if (accountOwner && name.includes(accountOwner)) {
    const remaining = name.replace(accountOwner, "").trim();
    if (remaining.length >= 3) name = remaining;
    else return "__OWNER_PAYMENT__";
  }

  // === Step 8: Normalized owner check ===
  if (accountOwnerNormalized && name.length > 2) {
    const normalized = name.replace(/[^\u0600-\u06FFa-zA-Z\s]/g, "").trim().toLowerCase();
    if (normalized === accountOwnerNormalized || normalized.length < 3) {
      return "__OWNER_PAYMENT__";
    }
  }

  // === Step 9: English owner removal ===
  const ownerEnglish = ["abdallah abukmail", "abu kmail mill", "abukmail"];
  for (const oen of ownerEnglish) {
    const currentLower = name.toLowerCase().trim();
    const oenIdx = currentLower.indexOf(oen);
    if (oenIdx !== -1) {
      const before = name.substring(0, oenIdx).trim();
      const after = name.substring(oenIdx + oen.length).trim();
      const remaining = (before + " " + after).trim();
      if (remaining.length >= 3) {
        name = remaining;
        break;
      } else {
        return "__OWNER_PAYMENT__";
      }
    }
  }

  // === Step 10: Final cleanup ===
  name = name.replace(/\/CT$/gi, "").trim();
  name = name.replace(/\/\d+$/g, "").trim();
  name = name.replace(/\s+/g, " ").trim();

  return name;
}


/** نوع الدفع بناءً على نسبة المبلغ */
function getMatchType(txAmount, invoiceAmount) {
  if (!invoiceAmount || invoiceAmount === 0) return 'full';
  const diff = Math.abs(txAmount - invoiceAmount);
  // full فقط لما الفرق <= 2 شيكل (عمولة بنكية)
  if (diff <= 2) return 'full';
  if (txAmount < invoiceAmount) return 'partial';
  return 'over';
}

/** تسجيل نقاط الاسم */
function scoreName(payerName, customerName, nameCandidatesJson, altAccountName) {
  if (!payerName || !customerName) return 0;
  if (payerName === "__OWNER_PAYMENT__") return 0;
  // اذا الاسم هو صاحب الحساب لا تطابق
  if (payerName === "__OWNER_PAYMENT__") return 0;

  // DEBUG: show exactly what scoreName receives
  const payerHex = [...payerName].slice(0,10).map(c=>c.charCodeAt(0).toString(16)).join(' ');
  const custHex = [...customerName].slice(0,10).map(c=>c.charCodeAt(0).toString(16)).join(' ');
  console.log("[scoreName-DEBUG] payer='" + payerName.substring(0,40) + "' hex=" + payerHex);
  console.log("[scoreName-DEBUG] customer='" + customerName.substring(0,40) + "' hex=" + custHex);
  console.log("[scoreName-DEBUG] candidates=" + (nameCandidatesJson ? "yes" : "no") + " altAccount=" + (altAccountName || "none"));

  // === المسار المتقدم: NameNormalizer ===
  try {
    // تجهيز قائمة الأسماء البديلة
    const aliases = [];
    if (altAccountName && altAccountName.trim().length >= 3) {
      aliases.push(altAccountName.trim());
    }

    // تجهيز المرشحين من name_candidates_json
    let candidates = [payerName];
    if (nameCandidatesJson) {
      try {
        const parsed = typeof nameCandidatesJson === "string"
          ? JSON.parse(nameCandidatesJson) : nameCandidatesJson;
        if (Array.isArray(parsed)) {
          for (const c of parsed) {
            const name = typeof c === "string" ? c : c?.name;
            if (name && name.trim().length >= 2) candidates.push(name.trim());
          }
        }
      } catch (_) {}
    }

    // استدعاء النظام المتقدم
    const result = NameNormalizer.calculateNameScore(candidates, customerName, aliases);
    console.log("[scoreName-DEBUG] NameNormalizer result: score=" + result.score + " method=" + (result.method||"?") + " matched=" + (result.matchedCandidate||"?").substring(0,30));

    if (result.score > 0) {
      return Math.min(Math.round(result.score), 100);
    }
  } catch (err) {
    console.log("[scoreName] NameNormalizer error: " + err.message + " - using _calc fallback");
  }

  // === المسار الاحتياطي: _calc البسيطة ===
  function _calc(payer, customer) {
    const pNorm = normalizeName(payer);
    const cNorm = normalizeName(customer);
    if (!pNorm || !cNorm) return 0;

    const commonWords = new Set([
      "ابو", "أبو", "بن", "ابن", "بنت", "ام", "أم",
      "عبد", "عبدالله", "الله", "محمد", "احمد", "علي",
      "من", "الى", "الي", "تحويل", "دفع", "لتاجر"
    ]);

    const pTokens = pNorm.split(/\s+/).filter(t => t.length >= 2);
    const cTokens = cNorm.split(/\s+/).filter(t => t.length >= 2);
    if (pTokens.length === 0 || cTokens.length === 0) return 0;

    const firstP = pTokens[0];
    const firstC = cTokens[0];
    const lastP = [...pTokens].reverse().find(t => !commonWords.has(t)) || pTokens[pTokens.length - 1];
    const lastC = [...cTokens].reverse().find(t => !commonWords.has(t)) || cTokens[cTokens.length - 1];

    const firstMatch = firstP === firstC ||
      (firstP.length >= 3 && firstC.length >= 3 &&
       (firstP.includes(firstC) || firstC.includes(firstP)));

    const lastMatch = lastP === lastC ||
      (lastP.length >= 3 && lastC.length >= 3 &&
       (lastP.includes(lastC) || lastC.includes(lastP)));

    if (!firstMatch && !lastMatch) return 10;

    let totalW = 0, matchedW = 0;
    for (const ct of cTokens) {
      let w = commonWords.has(ct) ? 0.15 : (ct === firstC || ct === lastC) ? 2.0 : 1.0;
      totalW += w;
      for (const pt of pTokens) {
        if (ct === pt) { matchedW += w; break; }
        if (ct.length >= 4 && pt.length >= 4 && (ct.includes(pt) || pt.includes(ct))) {
          matchedW += w * 0.7; break;
        }
      }
    }

    let score = totalW > 0 ? (matchedW / totalW) * 100 : 0;
    if (!firstMatch && lastMatch) score *= 0.6;
    if (firstMatch && !lastMatch) score *= 0.7;
    return Math.round(Math.min(score, 90));
  }

  let bestScore = _calc(payerName, customerName);
  if (altAccountName && altAccountName.trim().length >= 3) {
    const altScore = _calc(payerName, altAccountName);
    if (altScore > bestScore) bestScore = altScore;
  }
  if (nameCandidatesJson) {
    try {
      const cands = typeof nameCandidatesJson === "string"
        ? JSON.parse(nameCandidatesJson) : nameCandidatesJson;
      if (Array.isArray(cands)) {
        for (const c of cands) {
          const candName = typeof c === "string" ? c : c?.name;
          if (!candName) continue;
          let cs = _calc(candName, customerName);
          if (altAccountName) cs = Math.max(cs, _calc(candName, altAccountName));
          if (cs > bestScore) bestScore = cs;
        }
      }
    } catch (_) {}
  }
  console.log("[scoreName-DEBUG] _calc fallback bestScore=" + bestScore);
  return Math.min(Math.round(bestScore), 100);
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

  const remainingAfter = breakdown.remaining_after !== undefined
    ? breakdown.remaining_after
    : Math.max(0, (payment.effective_remaining ?? payment.total_amount ?? 0) - (bankTxn.amount ?? 0));

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

    // === حقول جديدة ===
    security_level:      m.security_level || 'normal',
    shortage_amount:     m.shortage_amount || 0,
    date_category:       m.date_category || 'normal',
    days_diff:           m.days_diff || 0,
    phone_matched:       m.phone_matched || false,

    breakdown: {
      name_score:    breakdown.name_score || 0,
      amount_score:  breakdown.amount_score || 0,
      date_score:    breakdown.date_score || 0,
      context_score: breakdown.context_score || 0,
      date_penalty:  breakdown.date_penalty || 0,
      phone_score:   breakdown.phone_score || 0,
      remaining_after: remainingAfter,
    },

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

// 
// توليد التوليفات المحسن
// 
function generateCombinationsOptimized(items, maxSize, targetAmount, tolerance) {
  const results = [];
  const MAX_RESULTS = 10;
  // ترتيب حسب القرب من المبلغ المطلوب
  const limited = items
    .filter(p => (p.total_amount || p.amount || 0) > 0)
    .sort((a, b) => (a.total_amount || a.amount || 0) - (b.total_amount || b.amount || 0))
    .slice(0, 10);

  function _gen(start, current, sum) {
    if (results.length >= MAX_RESULTS) return;
    if (current.length > 0 && current.length <= maxSize) {
      if (Math.abs(sum - targetAmount) <= tolerance) {
        results.push({ payments: [...current], total: sum, diff: sum - targetAmount });
      }
    }
    if (current.length >= maxSize || sum > targetAmount + tolerance) return;
    for (let i = start; i < limited.length; i++) {
      const amt = limited[i].total_amount || limited[i].amount || 0;
      current.push(limited[i]);
      _gen(i + 1, current, sum + amt);
      current.pop();
    }
  }
  _gen(0, [], 0);
  return results.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
}

function findOptimalCombinations(payments, bankAmount, tolerance) {
  if (!payments || payments.length === 0) return [];
  tolerance = tolerance || 3;
  const combos = [];
  // جرب تركيبات من 1 إلى 4 فواتير
  for (let size = 1; size <= Math.min(4, payments.length); size++) {
    combos.push(...generateCombinationsOptimized(payments, size, bankAmount, tolerance));
  }
  // رتب حسب أقل فرق ثم أقل عدد فواتير
  return combos
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff) || a.payments.length - b.payments.length)
    .slice(0, 5);
}

class MatchingEngine {
  constructor(db) {
    this.db = db;

    // نظام التعلم والتغذية الراجعة
    try {
      this.feedbackService = new MatchingFeedbackService(db);
    } catch (err) {
      console.warn('[MatchingEngine] Feedback service init failed:', err.message);
      this.feedbackService = null;
    }
    this._prepareStatements();
    // جلب اسم صاحب الحساب ديناميكياً
    try {
      const ownerRow = db.prepare("SELECT bank_account_owner FROM store_settings WHERE id = 1").get();
      this.accountOwner = ownerRow ? (ownerRow.bank_account_owner || '') : '';
      this.accountOwnerNormalized = normalizeName(this.accountOwner);
      console.log('[MatchingEngine] Account owner:', this.accountOwner || '(not set)');
    } catch (e) {
      this.accountOwner = '';
      this.accountOwnerNormalized = '';
      console.warn('[MatchingEngine] Could not load account owner:', e.message);
    }
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
             CASE WHEN p.remaining_amount > 0 THEN p.remaining_amount ELSE p.amount END as effective_remaining,
             c.name AS customer_name, i.customer_id, i.total as invoice_total,
             c.is_home_transfer, c.name as customer_alt_name, c.phone as customer_phone
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE p.method IN ('transfer','wallet','debt')
      AND (p.status IN ('pending','pending_match','awaiting_transfer') OR (p.status = 'partial' AND p.paid_amount = 0))
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
      const result = BankStatementParser.parsePalestineBankStatement(data);
      parsedTransactions = result.transactions;
      console.log(`[Import] BOP format. Parsed: ${parsedTransactions.length}`);

      // فلترة التحويلات الداخلية (من صاحب الحساب لنفسه)
      if (this.accountOwnerNormalized) {
        const before = parsedTransactions.length;
        parsedTransactions = parsedTransactions.filter(tx => {
          const payerNorm = normalizeName(tx.payer_name || '');
          if (!payerNorm) return true;
          const ownerTokens = this.accountOwnerNormalized.split(' ').filter(t => t.length > 1);
          const payerTokens = payerNorm.split(' ').filter(t => t.length > 1);
          if (ownerTokens.length === 0) return true;
          let matches = 0;
          for (const ot of ownerTokens) {
            for (const pt of payerTokens) {
              if (ot === pt || ot.includes(pt) || pt.includes(ot)) { matches++; break; }
            }
          }
          const ratio = matches / Math.max(ownerTokens.length, payerTokens.length);
          if (ratio >= 0.75) {
            console.log('[Import] Skipping internal transfer from:', tx.payer_name);
            return false;
          }
          return true;
        });
        const filtered = before - parsedTransactions.length;
        if (filtered > 0) console.log('[Import] Filtered', filtered, 'internal transfers');
      }

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

      // فلترة التحويلات الداخلية للمسار 2
      if (this.accountOwnerNormalized) {
        parsedTransactions = parsedTransactions.filter(tx => {
          const desc = (tx.raw_description || '').toLowerCase();
          if (desc.includes('التحويل بين الحسابات') || desc.includes('تحويل بين الحسابات')) {
            console.log('[Import] Skipping inter-account transfer');
            return false;
          }
          const payerNorm = normalizeName(tx.payer_name || '');
          if (!payerNorm || !this.accountOwnerNormalized) return true;
          const ownerTokens = this.accountOwnerNormalized.split(' ').filter(t => t.length > 1);
          const payerTokens = payerNorm.split(' ').filter(t => t.length > 1);
          let matches = 0;
          for (const ot of ownerTokens) {
            for (const pt of payerTokens) {
              if (ot === pt || ot.includes(pt) || pt.includes(ot)) { matches++; break; }
            }
          }
          const ratio = matches / Math.max(ownerTokens.length, payerTokens.length);
          if (ratio >= 0.75) {
            console.log('[Import] Skipping internal transfer from:', tx.payer_name);
            return false;
          }
          return true;
        });
      }

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
    const _matchStartTime = Date.now();
    const pendingBankTxns = this.stmtPendingBankTx.all();
    const pendingPayments  = this.stmtPendingPayments.all();
    console.log("[INIT] pendingPayments count=" + pendingPayments.length + " ids=" + pendingPayments.map(p=>p.id).join(",") + " amts=" + pendingPayments.map(p=>p.total_amount||p.amount).join(","));

    const autoConfirmed = [];
    const suggested     = [];
    const usedPaymentIds = new Set();
    const usedBankIds = new Set();
    const groupedMatches = [];
    console.log("[RunMatch] Processing " + pendingBankTxns.length + " bank txns, IDs: " + pendingBankTxns[0]?.id + " to " + pendingBankTxns[pendingBankTxns.length-1]?.id);
    for (const bankTxn of pendingBankTxns) {
      if (usedBankIds.has(bankTxn.id)) continue;
      if (bankTxn.id <= pendingBankTxns[0].id + 9) console.log("[FIRST10] bank#" + bankTxn.id + " amt=" + bankTxn.amount + " payer=" + (bankTxn.payer_name||"").substring(0,40) + " avail=" + pendingPayments.filter(p=>!usedPaymentIds.has(p.id)).length + " used=[" + [...usedPaymentIds].join(",") + "]");
      // ── طبقة 0: الرقم المرجعي ───────────────
      const availablePayments = pendingPayments.filter(p => !usedPaymentIds.has(p.id));
      if (bankTxn.amount === 12) console.log("[DEBUG-12] bank#" + bankTxn.id + " availPayments=" + availablePayments.length + " used=" + [...usedPaymentIds].join(",") + " payIds=" + availablePayments.map(p=>p.id).join(","));
      const layer0 = this._matchLayer0(bankTxn, availablePayments);
      if (bankTxn.id <= pendingBankTxns[0].id + 9) console.log("[FIRST10] bank#" + bankTxn.id + " layer0=" + (layer0 ? "MATCH pay#"+layer0.payment.id+" conf="+layer0.confidence : "null"));
      if (layer0) {
        if (layer0.confidence >= CONFIG.AUTO_CONFIRM_THRESHOLD) {
          this._doAutoConfirm(layer0);
          autoConfirmed.push(this.formatMatch(layer0));
          usedPaymentIds.add(layer0.payment.id);
          usedBankIds.add(bankTxn.id);
        } else {
          suggested.push(this.formatMatch(layer0));
          usedPaymentIds.add(layer0.payment.id);
          usedBankIds.add(bankTxn.id);
        }
        continue;
      }

      // ── طبقة 1: ذاكرة التعلم ────────────────
      const layer1 = this._matchLayer1(bankTxn, availablePayments);
      if (bankTxn.id <= pendingBankTxns[0].id + 9) console.log("[FIRST10] bank#" + bankTxn.id + " layer1=" + (layer1 ? "MATCH pay#"+layer1.payment.id+" conf="+layer1.confidence+" amt="+layer1.payment.total_amount : "null"));
      if (layer1) {
        if (layer1.confidence >= CONFIG.AUTO_CONFIRM_THRESHOLD) {
          this._doAutoConfirm(layer1);
          autoConfirmed.push(this.formatMatch(layer1));
          usedPaymentIds.add(layer1.payment.id);
          usedBankIds.add(bankTxn.id);
        } else {
          suggested.push(this.formatMatch(layer1));
          usedPaymentIds.add(layer1.payment.id);
          usedBankIds.add(bankTxn.id);
        }
        continue;
      }

      // 
      // طبقة 2: مطابقة ذكية فردية
      // 
      const l2CleanPayer = cleanPayerName(bankTxn.payer_name, this.accountOwner, this.accountOwnerNormalized);
      console.log("[CleanPayer] bank#" + bankTxn.id + ": \"" + (bankTxn.payer_name || "").substring(0,50) + "\"  \"" + l2CleanPayer.substring(0,50) + "\"");
      
      const layer2Results = this._matchLayer2(bankTxn, availablePayments, l2CleanPayer);
      console.log("[RunMatch] Bank #" + bankTxn.id + " amt=" + bankTxn.amount + " payer=" + l2CleanPayer.substring(0,30) + " L2results=" + layer2Results.length);
      
      let layer2Accepted = false;
      if (layer2Results.length > 0) {
        const best = layer2Results[0];
        const bestAmtScore = best.breakdown ? best.breakdown.amount_score : 0;
        console.log("[Layer2] Best: " + (best.customer_name||"") + " conf=" + best.confidence + " amt_score=" + bestAmtScore);
        
        // قبول Layer 2 فقط إذا المبلغ والثقة عاليين
        if (best.confidence >= 80 && bestAmtScore >= 70) {
          if (best.confidence >= CONFIG.AUTO_CONFIRM_THRESHOLD) {
            this._doAutoConfirm(best);
            autoConfirmed.push(this.formatMatch(best));
          } else {
            suggested.push({
              ...this.formatMatch(best),
              alternatives: layer2Results.slice(1, 3).map(r => this.formatMatch(r))
            });
          }
          console.log("[Layer2 ACCEPTED] bank=#" + bankTxn.id + " conf=" + best.confidence + "% amt=" + bestAmtScore + "%");
          usedPaymentIds.add(best.payment.id);
          usedBankIds.add(bankTxn.id);
          layer2Accepted = true;
        } else {
          console.log("[Layer23] Weak match (conf=" + best.confidence + " amt=" + bestAmtScore + ") - trying Layer 3");
        }
      }
      
      // 
      // طبقة 3: مطابقة مجمعة  تحويل واحد = عدة فواتير
      // 
      if (!layer2Accepted && !usedBankIds.has(bankTxn.id)) {
        console.log("[Layer3] Searching for bank #" + bankTxn.id + " amount=" + bankTxn.amount);
        const availableForGrouping = pendingPayments.filter(p => !usedPaymentIds.has(p.id));
        console.log("[Layer3] Available payments: " + availableForGrouping.length + " => " + availableForGrouping.map(p => "#" + p.id + "(" + (p.total_amount||p.amount||0) + ")").join(","));
        
        // تجميع الفواتير حسب العميل
        const customerGroups = {};
        for (const pay of availableForGrouping) {
          const custId = pay.customer_id || pay.id;
          const custName = pay.customer_name || "";
          if (!customerGroups[custId]) customerGroups[custId] = { name: custName, payments: [] };
          customerGroups[custId].payments.push(pay);
        }
        
        // تنظيف اسم الدافع
        const l3CleanPayer = cleanPayerName(bankTxn.payer_name, this.accountOwner, this.accountOwnerNormalized);
        console.log("[Layer3] Clean payer: " + l3CleanPayer);
        
        let bestGroupMatch = null;
        let bestGroupConf = 0;
        
        for (const custId of Object.keys(customerGroups)) {
          const group = customerGroups[custId];
          const custName = group.name;
          
          // حساب تشابه الاسم
          const nameScore = scoreName(l3CleanPayer, custName, bankTxn.name_candidates_json);
          console.log("[Layer3] scoreName(\"" + l3CleanPayer.substring(0,30) + "\" vs \"" + custName + "\") = " + nameScore);
          
          if (nameScore < 30) continue;
          
          // إيجاد تركيبات الفواتير
          if (group.payments.length >= 1) {
            const combos = findOptimalCombinations(group.payments, bankTxn.amount, 3);
            console.log("[Layer3] Customer " + custName + ": " + group.payments.length + " payments, combos: " + combos.length);
            
            if (combos.length > 0) {
              const bestCombo = combos[0];
              const amountScore = bestCombo.diff === 0 ? 100 : Math.max(0, 100 - Math.abs(bestCombo.diff) * 15);
              const confidence = Math.round(nameScore * 0.35 + amountScore * 0.55 + 85 * 0.10);
              console.log("[Layer3] Combo: " + bestCombo.payments.length + " payments, total=" + bestCombo.total + " diff=" + bestCombo.diff + " nameScore=" + nameScore + " amtScore=" + amountScore + " conf=" + confidence);
              
              if (confidence >= 55 && confidence > bestGroupConf) {
                bestGroupConf = confidence;
                bestGroupMatch = {
                  bankTxn: bankTxn,
                  customer_name: custName,
                  customer_id: custId,
                  payments: bestCombo.payments,
                  payment_ids: bestCombo.payments.map(p => p.id),
                  payments_count: bestCombo.payments.length,
                  total_amount: bestCombo.payments.reduce((s, p) => s + (p.total_amount || p.amount || 0), 0),
                  difference: bestCombo.diff,
                  confidence: confidence,
                  match_type: "grouped",
                  breakdown: { name_score: nameScore, amount_score: amountScore, combo_size: bestCombo.payments.length }
                };
              }
            }
          }
        }
        
        if (bestGroupMatch) {
          console.log("[Layer3 SUCCESS] " + bestGroupMatch.payments_count + " invoices = " + bestGroupMatch.total_amount + " conf=" + bestGroupMatch.confidence);
          groupedMatches.push(bestGroupMatch);
          bestGroupMatch.payment_ids.forEach(id => usedPaymentIds.add(id));
          usedBankIds.add(bankTxn.id);
        } else {
          console.log("[Layer3] No match for bank #" + bankTxn.id);
        }
      }

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


    //  تحذيرات ذكية للسوبر ماركت 
    const warnings = [];

    // تحذير المبالغ المتشابهة
    const amountGroups = {};
    suggested.forEach(m => {
      const amt = m.bank_amount || 0;
      const key = String(amt);
      if (!amountGroups[key]) amountGroups[key] = [];
      amountGroups[key].push(m);
    });
    Object.entries(amountGroups).forEach(([amt, matches]) => {
      if (matches.length > 1) {
        warnings.push({
          type: 'duplicate_amounts',
          message: matches.length + ' مطابقات محتملة للمبلغ ' + amt + ' شيكل - يرجى التحقق يدويا',
          count: matches.length,
          amount: parseFloat(amt)
        });
      }
    });

    // تحذير الأسماء الضعيفة
    suggested.forEach(m => {
      if (m.confidence < 75 && m.breakdown && m.breakdown.name_score < 60) {
        warnings.push({
          type: 'weak_name',
          message: 'مطابقة ضعيفة: ' + (m.bank_payer_name || '') + ' مع ' + (m.customer_name || ''),
          bank_id: m.bank_transaction_id,
          confidence: m.confidence
        });
      }
    });

    return {
      success:           true,
      auto_confirmed:    autoConfirmed.filter(m => m.match_type !== 'error'),
      suggested:         suggested.filter(m => m.match_type !== 'error'),
      unmatched_bank:    unmatchedBank,
      grouped_matches:   groupedMatches,
      unmatched_payments: unmatchedPayments,
      warnings:          warnings,
      performance: {
        bank_transactions: pendingBankTxns.length,
        pending_payments: pendingPayments.length,
        processing_time_ms: Date.now() - _matchStartTime
      }
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
    const matchType = getMatchType(bankTxn.amount, payment.total_amount || payment.amount || 0);
    const remaining = Math.max(0, (payment.effective_remaining ?? payment.total_amount ?? 0) - bankTxn.amount);

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
    // Layer 1: skip if amount is way off (ratio > 200% or < 50%)
    if (amtScore < 25) {
      console.log("[Layer1] SKIP - amt score too low: " + amtScore + " bank=" + bankTxn.amount + " pay=" + payment.total_amount);
      return null;
    }
    const matchType = getMatchType(bankTxn.amount, payment.total_amount || payment.amount || 0);
    const remaining = Math.max(0, (payment.effective_remaining ?? payment.total_amount ?? 0) - bankTxn.amount);

    // score = learned.confidence weighted with amount
    const confidence = Math.round(learned.confidence * CONFIG.LEARNED_NAME_WEIGHT + amtScore * CONFIG.LEARNED_AMOUNT_WEIGHT);

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
  _matchLayer2(bankTxn, pendingPayments, cleanedPayer) {
    const results = [];
    const startTime = Date.now();
    // Use the already-cleaned payer name from runMatching
    let cleanPayerName = cleanedPayer || cleanPayerName(bankTxn.payer_name, this.accountOwner, this.accountOwnerNormalized) || bankTxn.payer_name || "";
    console.log("[Layer2] Clean payer: \"" + cleanPayerName + "\" (was: \"" + (bankTxn.payer_name || "").substring(0,50) + "\")");
    if (cleanPayerName === "__OWNER_PAYMENT__") { console.log("[Layer2] SKIP - owner payment"); return []; }

    for (const payment of pendingPayments) {
      const paymentAmount = payment.total_amount || payment.amount || 0;
      const bankAmount = bankTxn.amount;
      if (paymentAmount <= 0) continue;

      //  فلتر المبلغ المرن (دعم الدفعات الجزئية) 
      const amountDiff = Math.abs(bankAmount - paymentAmount);
      const amountRatio = amountDiff / paymentAmount;

      // رفض إذا التحويل أقل من 20% من الفاتورة
      // === فلتر المبلغ الصارم ===
      const amtRatio = paymentAmount > 0 ? bankAmount / paymentAmount : 0;
      if (amtRatio < 0.70 || amtRatio > 1.30) { console.log("[Layer2] SKIP " + (payment.customer_name||"") + " " + paymentAmount + " ratio=" + (amtRatio*100).toFixed(0) + "%"); continue; }

      //  فلتر التاريخ المرن (دعم التأخير) 
      let daysDiff = 999;
      if (bankTxn.parsed_date && payment.created_at) {
        const bankDate = parseFlexDate(bankTxn.parsed_date);
        const payDate = parseFlexDate(payment.created_at);
        daysDiff = Math.abs((bankDate - payDate) / 86400000);
      }

      let dateCategory = 'normal';
      let datePenalty = 0;
      if (daysDiff <= CONFIG.DATE_NORMAL_DAYS) {
        dateCategory = 'normal';
      } else if (daysDiff <= CONFIG.DATE_DELAYED_DAYS) {
        dateCategory = 'delayed';
        datePenalty = CONFIG.DATE_PENALTY_DELAYED;
      } else if (daysDiff <= CONFIG.DATE_VERY_DELAYED_DAYS) {
        dateCategory = 'very_delayed';
        datePenalty = CONFIG.DATE_PENALTY_VERY_DELAYED;
      } else {
        continue; // أكثر من 3 شهور - تجاهل
      }

      //  حساب نقاط الاسم مع البديل (السيناريو 5) 
      const nameScore = scoreName(
        cleanPayerName,
        payment.customer_name,
        bankTxn.name_candidates_json,
        payment.customer_alt_name
      );

      //  السيناريو 7: مطابقة رقم الجوال 
      let phoneScore = 0;
      if (payment.customer_phone && payment.customer_phone.length > 6) {
        const cleanPhone = payment.customer_phone.replace(/\D/g, '').slice(-7);
        if (bankTxn.raw_description && bankTxn.raw_description.replace(/\D/g, '').includes(cleanPhone)) {
          phoneScore = CONFIG.NAME_PHONE_SCORE;
        }
      }

      const effectiveNameScore = Math.max(nameScore, phoneScore);

      // حد أدنى صارم للهوية
      if (effectiveNameScore < CONFIG.NAME_MIN_SCORE) continue;

      //  باقي النقاط 
      const amountScore = scoreAmount(bankTxn.amount, paymentAmount);
      const dateScore = scoreDate(bankTxn.parsed_date, payment.created_at);
      const contextScore = payment.is_home_transfer ? CONFIG.CONTEXT_HOME_TRANSFER : CONFIG.CONTEXT_NORMAL;

      //  نوع المطابقة ومستوى الأمان 
      let matchType = 'full';
      let securityLevel = 'normal';
      let shortageAmount = 0;

      if (amountDiff <= 2) {
        matchType = 'full';
      } else if (bankAmount < paymentAmount) {
        matchType = 'partial';
        shortageAmount = paymentAmount - bankAmount;
        const shortagePct = (shortageAmount / paymentAmount) * 100;

        if (effectiveNameScore < CONFIG.NAME_MIN_SCORE_PARTIAL) continue; // اسم ضعيف جداً + نقص = رفض

        if (shortagePct <= CONFIG.PARTIAL_SAFE_PCT) {
          securityLevel = 'safe';
        } else if (shortagePct <= CONFIG.PARTIAL_WARNING_PCT) {
          securityLevel = 'warning';
        } else {
          securityLevel = 'danger';
        }
      } else if (bankAmount > paymentAmount) {
        matchType = 'over';
      }

      //  الحساب النهائي 
      let total =
        effectiveNameScore * CONFIG.WEIGHTS.name +
        amountScore * CONFIG.WEIGHTS.amount +
        dateScore * CONFIG.WEIGHTS.date +
        contextScore * CONFIG.WEIGHTS.context;

      if (payment.is_home_transfer) total += CONFIG.HOME_TRANSFER_BONUS;

      // بونص من نظام التعلم
      if (this.feedbackService) {
        try {
          const boost = this.feedbackService.getConfidenceBoost(
            bankTxn.payer_name || '',
            payment.customer_name || ''
          );
          if (boost > 0) total += boost * 3;
          if (boost < 0) total -= 10;
        } catch (_) {}
      }
      total -= datePenalty;
      total = Math.min(100, Math.round(total));

      // عتبة أعلى للدفعات الجزئية
      const minThreshold = matchType === 'partial' ? CONFIG.PARTIAL_MIN_THRESHOLD : CONFIG.FULL_MIN_THRESHOLD;
      if (total < minThreshold) continue;

      const remaining = Math.max(0, (payment.effective_remaining ?? paymentAmount) - bankAmount);

      results.push({
        bankTxn,
        payment,
        customer_name: payment.customer_name,
        confidence: total,
        method: phoneScore > 0 ? 'wallet_phone' : 'smart_supermarket',
        match_type: matchType,
        security_level: securityLevel,
        shortage_amount: shortageAmount,
        date_category: dateCategory,
        days_diff: Math.round(daysDiff),
        phone_matched: phoneScore > 0,
        breakdown: {
          name_score: effectiveNameScore,
          amount_score: amountScore,
          date_score: dateScore,
          context_score: contextScore,
          date_penalty: datePenalty,
          phone_score: phoneScore,
          remaining_after: remaining,
        }
      });
    }

    const elapsed = Date.now() - startTime;
    if (elapsed > 1000) console.warn('[Layer2] Slow matching: ' + elapsed + 'ms');
    if (results.length > 0) { results.forEach((r,idx) => console.log("[Layer2 Detail] #" + idx + " bank=" + bankTxn.id + "(" + bankTxn.amount + ")  payment=" + r.payment.id + " customer=" + r.customer_name + " conf=" + r.confidence + " amt=" + r.breakdown.amount_score)); }
    console.log('[Layer2] Results: ' + results.length + ' matches from ' + pendingPayments.length + ' payments');

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


        // تسجيل النقص كدين على الزبون
        if (remainingAfter > 0) {
          const customerInfo = this.db.prepare(
            "SELECT p.invoice_id, i.customer_id, c.name FROM payments p JOIN invoices i ON i.id = p.invoice_id LEFT JOIN customers c ON c.id = i.customer_id WHERE p.id = ?"
          ).get(payment.id);

          if (customerInfo && customerInfo.customer_id) {
            // إنشاء دين كـ payment بـ method=debt (النظام الأصلي)
            this.db.prepare(`
              INSERT INTO payments (invoice_id, customer_id, method, amount, status, notes, created_at)
              VALUES (?, ?, 'debt', ?, 'pending', ?, datetime('now'))
            `).run(
              customerInfo.invoice_id || payment.invoice_id,
              customerInfo.customer_id,
              remainingAfter,
              "نقص تحويل: حوّل " + bankTxn.amount + " من أصل " + (payment.total_amount || payment.amount) + " - فرق " + remainingAfter
            );
            console.log("[AutoConfirm] Shortage debt created:", remainingAfter, "for customer:", customerInfo.name);
          }
        }
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

    const bankTxn = this.db.prepare('SELECT * FROM bank_transactions WHERE id = ?').get(bankTxId);
    if (!bankTxn) return { success: false, error: 'Bank transaction not found' };

    if (pids.length === 1) {
      // Single payment - use existing manualConfirm logic
      const result = this.manualConfirm(bankTxId, pids[0]);
      if (!result.success) return result;
      const pay = this.db.prepare('SELECT invoice_id FROM payments WHERE id=?').get(pids[0]);
      if (pay) invoiceIds.push(pay.invoice_id);
    } else {
      // Grouped match (Layer 3): multiple payments matched to one bank transaction
      // Each payment should be confirmed with its own amount, not the bank total
      const confirmGrouped = this.db.transaction(() => {
        let totalPayments = 0;
        for (const pid of pids) {
          const payment = this.db.prepare('SELECT p.*, c.name AS customer_name FROM payments p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.id = ?').get(pid);
          if (!payment) throw new Error('Payment ' + pid + ' not found');

          const payAmount = payment.total_amount || payment.amount || 0;
          totalPayments += payAmount;

          // Confirm each payment with its OWN amount (not bankTxn.amount)
          this.stmtUpdatePaymentFull.run({
            paid_amount: payAmount,
            id: payment.id,
          });

          const pay = this.db.prepare('SELECT invoice_id FROM payments WHERE id=?').get(pid);
          if (pay) invoiceIds.push(pay.invoice_id);

          console.log('[AcceptGroup] Payment #' + pid + ' amt=' + payAmount + ' -> confirmed');
        }

        // Update bank transaction
        this.stmtUpdateBankTxMatch.run({
          match_status: 'matched_auto',
          payment_id: pids[0],
          id: bankTxn.id,
        });

        // Handle difference between bank amount and total payments
        const diff = bankTxn.amount - totalPayments;
        if (diff > 2) {
          console.log('[AcceptGroup] Overpayment: bank=' + bankTxn.amount + ' payments=' + totalPayments + ' diff=' + diff);
        } else if (diff < -2) {
          console.log('[AcceptGroup] Underpayment: bank=' + bankTxn.amount + ' payments=' + totalPayments + ' diff=' + diff);
        }

        console.log('[AcceptGroup] Bank #' + bankTxId + ' matched to ' + pids.length + ' payments, total=' + totalPayments);
      });

      confirmGrouped();

      // Learn from the match using the first payment
      const firstPayment = this.db.prepare('SELECT p.*, c.name AS customer_name FROM payments p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.id = ?').get(pids[0]);
      if (firstPayment) {
        this._learnMatch(bankTxn, firstPayment, 'manual_grouped');
      }
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

    const payAmount = payment.total_amount || payment.amount || 0;
    const matchType = getMatchType(bankTxn.amount, payAmount);
    const remaining = Math.max(0, payAmount - bankTxn.amount);

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

  // 
  // UNDO MATCH  التراجع عن مطابقة (فردية أو مجمعة)
  // 
  undoMatch(bankTransactionId, reason) {
    reason = reason || 'manual_undo';

    const doUndo = this.db.transaction(() => {
      const bankTxn = this.db.prepare(
        'SELECT * FROM bank_transactions WHERE id = ?'
      ).get(bankTransactionId);

      if (!bankTxn) throw new Error('العملية البنكية غير موجودة');
      if (bankTxn.match_status === 'pending') throw new Error('العملية غير مطابقة أصلا');

      // فحص: مطابقة مجمعة
      const grouped = this.db.prepare(
        'SELECT * FROM grouped_matches WHERE bank_transaction_id = ? AND reversed_at IS NULL'
      ).get(bankTransactionId);

      let affectedPayments = [];

      if (grouped) {
        //  تراجع مجمع 
        const paymentIds = grouped.payment_ids.split(',').map(id => parseInt(id));
        affectedPayments = paymentIds;

        for (const pid of paymentIds) {
          this.db.prepare(
            "UPDATE payments SET status = 'awaiting_transfer' WHERE id = ?"
          ).run(pid);
        }

        this.db.prepare(
          "UPDATE grouped_matches SET reversed_at = datetime('now','localtime') WHERE id = ?"
        ).run(grouped.id);

      } else {
        //  تراجع فردي 
        const paymentId = bankTxn.matched_payment_id;
        if (paymentId) {
          affectedPayments = [paymentId];
          this.db.prepare(
            "UPDATE payments SET status = 'awaiting_transfer' WHERE id = ?"
          ).run(paymentId);
        }
      }

      // حذف الآثار الجانبية
      this.db.prepare('DELETE FROM installments WHERE bank_transaction_id = ?').run(bankTransactionId);
      this.db.prepare('DELETE FROM debts WHERE related_bank_transaction_id = ? AND is_shortage = 1').run(bankTransactionId);
      this.db.prepare('DELETE FROM customer_credits WHERE related_bank_transaction_id = ?').run(bankTransactionId);

      // إرجاع البنكية لحالة معلقة
      this.db.prepare(
        "UPDATE bank_transactions SET match_status = 'pending', matched_payment_id = NULL WHERE id = ?"
      ).run(bankTransactionId);

      return { affected: affectedPayments.length, type: grouped ? 'grouped' : 'single' };
    });

    try {
      const result = doUndo();
      console.log('[undoMatch] OK:', bankTransactionId, result);
      return { success: true, ...result };
    } catch (e) {
      console.error('[undoMatch] Error:', e.message);
      return { success: false, error: e.message };
    }
  }

  _learnMatch(bankTxn, payment, method) {
    const pattern = (bankTxn.payer_name_normalized || bankTxn.payer_name || "").trim();
    if (!pattern || pattern.length < 3) return;

    try {
      // 1. التعلم الأساسي (name_learning)
      const cols = this.db.prepare("PRAGMA table_info(name_learning)").all();
      const colNames = cols.map(c => c.name);

      const values = {
        payer_name_pattern: pattern,
        customer_id: payment.customer_id || null,
        customer_name: payment.customer_name || "",
        bank_name_raw: bankTxn.payer_name || bankTxn.parsed_name || "",
        bank_name_normalized: (bankTxn.payer_name_normalized || bankTxn.payer_name || "").toLowerCase().trim(),
        system_customer_id: payment.customer_id || null,
        confidence: method === "manual" ? 100 : 95,
        use_count: 1,
        confirmed_by: method,
        last_used_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      for (const col of cols) {
        if (col.notnull && !col.dflt_value && col.name !== "id" && !(col.name in values)) {
          values[col.name] = "";
        }
      }

      const usedCols = colNames.filter(c => c !== "id" && c in values);
      const placeholders = usedCols.map(() => "?").join(", ");
      const sql = "INSERT OR REPLACE INTO name_learning (" + usedCols.join(", ") + ") VALUES (" + placeholders + ")";
      this.db.prepare(sql).run(...usedCols.map(c => values[c]));

      // 2. نظام التغذية الراجعة المتقدم
      if (this.feedbackService) {
        try {
          if (method === "manual") {
            this.feedbackService.recordManualConfirmation(
              bankTxn.id, payment.id,
              bankTxn.payer_name || "", payment.customer_name || "",
              bankTxn.amount || 0, payment.amount || 0,
              "system", "auto-learn",
              true, payment.customer_id
            );
          } else {
            this.feedbackService.recordAutoConfirmation(
              bankTxn, payment,
              method === "auto" ? 95 : 90,
              { method: method }
            );
          }
        } catch (fbErr) {
          console.warn("[LearnMatch] Feedback recording failed:", fbErr.message);
        }
      }

    } catch (err) {
      console.error("[LearnMatch] Error (non-critical):", err.message);
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
