'use strict';

/**
 * name-normalizer.js v8.0
 * نظام مطابقة الأسماء الذكي - أبو كامل سوبرماركت
 * 
 * ثلاث طبقات:
 * 1. قاموس التعريب (Transliteration Map)
 * 2. مطابقة صوتية (Phonetic Matching)
 * 3. تعلم تراكمي (Alias Learning)
 */

class NameNormalizer {

  // ========================
  // الطبقة 0: التطبيع العميق
  // ========================
  
  static deepNormalize(text) {
    if (!text) return '';
    return text
      .normalize('NFKC')
      .replace(/\u06CC/g, '\u064A')
      .replace(/\u06A9/g, '\u0643')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/[-_\.]/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ========================
  // الطبقة 1: قاموس التعريب
  // ========================

  static _nameMap = {
    // أسماء ذكور شائعة
    'omar': 'عمر', 'umar': 'عمر', 'omer': 'عمر',
    'ali': 'علي',
    'mohammed': 'محمد', 'mohammad': 'محمد', 'muhammad': 'محمد',
    'mohamad': 'محمد', 'muhammed': 'محمد', 'mohmad': 'محمد', 'mohamed': 'محمد',
    'ahmad': 'احمد', 'ahmed': 'احمد',
    'taher': 'طاهر', 'tahir': 'طاهر', 'taaher': 'طاهر',
    'hamdi': 'حمدي', 'hamdy': 'حمدي',
    'nabeel': 'نبيل', 'nabil': 'نبيل',
    'khalil': 'خليل', 'khalel': 'خليل',
    'khaled': 'خالد', 'khalid': 'خالد',
    'ibrahim': 'ابراهيم', 'ibraheem': 'ابراهيم', 'ebrahim': 'ابراهيم', 'ebraheem': 'ابراهيم',
    'kamal': 'كمال', 'kamaal': 'كمال',
    'saeed': 'سعيد', 'said': 'سعيد', 'sayid': 'سعيد',
    'hasan': 'حسن', 'hassan': 'حسن', 'hssen': 'حسن', 'hsan': 'حسن',
    'hussein': 'حسين', 'husain': 'حسين', 'hosein': 'حسين',
    'samer': 'سامر',
    'sameer': 'سامير', 'samir': 'سامير',
    'waleed': 'وليد', 'walid': 'وليد', 'waled': 'وليد',
    'amjad': 'امجد', 'amjed': 'امجد',
    'nasser': 'ناصر', 'nasir': 'ناصر',
    'nader': 'نادر', 'nadir': 'نادر',
    'yasser': 'ياسر', 'yasir': 'ياسر',
    'majed': 'ماجد', 'majid': 'ماجد',
    'maher': 'ماهر', 'mahir': 'ماهر',
    'sami': 'سامي', 'rami': 'رامي', 'hani': 'هاني',
    'ziad': 'زياد', 'ziyad': 'زياد',
    'eyad': 'اياد', 'iyad': 'اياد',
    'ayman': 'ايمن', 'aiman': 'ايمن',
    'tawfeeq': 'توفيق', 'tawfiq': 'توفيق', 'taufiq': 'توفيق',
    'fadi': 'فادي', 'firas': 'فراس',
    'bashar': 'بشار', 'bishar': 'بشار',
    'saleh': 'صالح', 'salih': 'صالح', 'salah': 'صلاح',
    'ramadan': 'رمضان', 'ramdan': 'رمضان',
    'anwar': 'انور', 'anwr': 'انور',
    'shokry': 'شكري', 'shukri': 'شكري',
    'yousef': 'يوسف', 'youssef': 'يوسف', 'yusuf': 'يوسف',
    'marzouq': 'مرزوق', 'marzouk': 'مرزوق',
    'rafiq': 'رفيق', 'rafik': 'رفيق',
    'zaher': 'زاهر', 'zahir': 'زاهر',
    'mohareb': 'محارب', 'muharib': 'محارب',
    'naeem': 'نعيم', 'naim': 'نعيم',
    'kalil': 'خليل',
    'ryad': 'رياض', 'riyad': 'رياض', 'riad': 'رياض',
    'daher': 'ظاهر', 'dhahir': 'ظاهر',
    'fouad': 'فواد', 'fuad': 'فواد',
    'imad': 'عماد', 'emad': 'عماد',
    'akram': 'اكرم',
    'shaban': 'شعبان', 'shaaban': 'شعبان',
    'wafik': 'وفيق', 'wafiq': 'وفيق',
    'ihab': 'ايهاب', 'ehab': 'ايهاب',
    'alaa': 'علاء', 'ala': 'علاء',
    'mahmoud': 'محمود', 'mahmud': 'محمود',
    'abdel': 'عبد', 'abdul': 'عبد', 'abd': 'عبد', 'abed': 'عبد',
    'abu': 'ابو', 'abo': 'ابو', 'abou': 'ابو',
    'al': 'ال', 'el': 'ال',
    'bin': 'بن', 'ben': 'بن',
    'nassar': 'نصار', 'nasar': 'نصار',
    'thriya': 'ثريا', 'thuraya': 'ثريا', 'thoraya': 'ثريا',
    'mashharawi': 'مشهراوي', 'masharawi': 'مشهراوي', 'mashharwi': 'مشهراوي',
    'husain': 'حسين', 'husein': 'حسين',
    'munir': 'منير', 'muneer': 'منير',
    'zard': 'زرد', 'alzard': 'الزرد',

    // تركيبات مركبة
    'ezzaldean': 'عزالدين', 'ezzeldeen': 'عزالدين', 'ezzaldeen': 'عزالدين',
    'izzeldine': 'عزالدين', 'ezzeddin': 'عزالدين',
    'saadalla': 'سعدالله', 'saadallah': 'سعدالله',
    'abdallah': 'عبدالله', 'abdullah': 'عبدالله', 'abdalla': 'عبدالله',
    'abdelrahman': 'عبدالرحمن', 'abdulrahman': 'عبدالرحمن', 'abdalrhman': 'عبدالرحمن',
    'abdulkarim': 'عبدالكريم', 'abdelkarim': 'عبدالكريم', 'abdelkareem': 'عبدالكريم',
    'jebreel': 'جبريل', 'jibril': 'جبريل',

    // أسماء إناث
    'snaa': 'سناء', 'sanaa': 'سناء', 'sana': 'سناء',
    'raghda': 'رغده', 'raghad': 'رغد',
    'amany': 'اماني', 'amani': 'اماني',
    'hanaa': 'هناء', 'hana': 'هنا',
    'reem': 'ريم', 'dalia': 'داليا', 'dalya': 'داليا',
    'nour': 'نور', 'lina': 'لينا', 'leena': 'لينا',
    'aseel': 'اسيل', 'asil': 'اسيل',
    'eman': 'ايمان', 'iman': 'ايمان',
    'mai': 'مي', 'may': 'مي', 'maya': 'مايا',
    'rehab': 'رحاب', 'rihab': 'رحاب',
    'hadeel': 'هديل', 'hadil': 'هديل',
    'layan': 'ليان', 'liyan': 'ليان',
    'amneh': 'امنه', 'amnah': 'امنه', 'amna': 'امنه',
    'samah': 'سماح', 'sawsan': 'سوسن',

    // عائلات فلسطينية
    'zamil': 'زميل', 'zameil': 'زميل',
    'shawwa': 'الشوا', 'alshawwa': 'الشوا',
    'alaklouk': 'العقلوق', 'akluk': 'العقلوق',
    'jarada': 'جراده', 'jarrada': 'جراده',
    'dloul': 'دلول', 'daloul': 'دلول',
    'alashram': 'الاشرم', 'ashram': 'الاشرم',
    'daya': 'الدايه', 'aldaya': 'الدايه',
    'mashhrawi': 'المشهراوي', 'almashhrawi': 'المشهراوي',
    'masharawi': 'المشهراوي', 'almasharawi': 'المشهراوي',
    'mashharawi': 'المشهراوي',
    'khudari': 'الخضري', 'alkhudari': 'الخضري', 'khudri': 'الخضري',
    'threia': 'ثريا', 'thuraya': 'ثريا', 'thraya': 'ثريا',
    'abuthreia': 'ابوثريا', 'abuthuraya': 'ابوثريا',
    'hamoudeh': 'حموده', 'hamouda': 'حموده', 'hamuda': 'حموده',
    'amri': 'العمري', 'alamri': 'العمري', 'alomari': 'العمري',
    'khaldi': 'الخالدي', 'alkhalidi': 'الخالدي',
    'zard': 'الزرد', 'alzard': 'الزرد',
    'habboub': 'حبوب', 'haboub': 'حبوب',
    'salem': 'سالم', 'salim': 'سالم',
    'mansour': 'منصور', 'mansur': 'منصور',
    'qaneta': 'قنيطا', 'qanita': 'قنيطا',
    'sweirki': 'الصويركي', 'alsweirki': 'الصويركي',
    'bahri': 'البحري', 'albahri': 'البحري',
    'shahin': 'شاهين', 'shaheen': 'شاهين',
    'abu': 'ابو', 'abo': 'ابو',
    'al': 'ال', 'el': 'ال',
    'ibn': 'ابن', 'bin': 'بن', 'ben': 'بن',
  };

  // ========================
  // الطبقة 2: المطابقة الصوتية
  // ========================

  static _arabicPhoneticMap = {
    'ا': 'A', 'أ': 'A', 'إ': 'A', 'آ': 'A', 'ع': 'A',
    'ب': 'B', 'ت': 'T', 'ث': 'TH', 'ج': 'J', 'ح': 'H',
    'خ': 'KH', 'د': 'D', 'ذ': 'TH', 'ر': 'R', 'ز': 'Z',
    'س': 'S', 'ش': 'SH', 'ص': 'S', 'ض': 'D', 'ط': 'T',
    'ظ': 'TH', 'غ': 'GH', 'ف': 'F', 'ق': 'Q', 'ك': 'K',
    'ل': 'L', 'م': 'M', 'ن': 'N', 'ه': 'H', 'و': 'W',
    'ي': 'Y', 'ى': 'Y', 'ة': 'H',
  };

  static _englishPhoneticMap = {
    'a': 'A', 'b': 'B', 'c': 'K', 'd': 'D', 'e': 'A',
    'f': 'F', 'g': 'GH', 'h': 'H', 'i': 'A', 'j': 'J',
    'k': 'K', 'l': 'L', 'm': 'M', 'n': 'N', 'o': 'A',
    'p': 'B', 'q': 'Q', 'r': 'R', 's': 'S', 't': 'T',
    'u': 'A', 'v': 'F', 'w': 'W', 'x': 'KS', 'y': 'Y',
    'z': 'Z',
  };

  static _englishDigraphs = {
    'sh': 'SH', 'ch': 'SH', 'th': 'TH', 'kh': 'KH',
    'gh': 'GH', 'ph': 'F', 'ee': 'Y', 'oo': 'W',
    'ou': 'W', 'ei': 'Y', 'ai': 'Y',
  };

  static getPhoneticCode(text) {
    if (!text) return '';
    const norm = this.deepNormalize(text);
    let code = '';

    // detect if Arabic or English
    const isArabic = /[\u0600-\u06FF]/.test(norm);

    if (isArabic) {
      for (const ch of norm) {
        if (this._arabicPhoneticMap[ch]) {
          code += this._arabicPhoneticMap[ch];
        }
      }
    } else {
      let i = 0;
      while (i < norm.length) {
        if (i + 1 < norm.length) {
          const digraph = norm[i] + norm[i + 1];
          if (this._englishDigraphs[digraph]) {
            code += this._englishDigraphs[digraph];
            i += 2;
            continue;
          }
        }
        if (this._englishPhoneticMap[norm[i]]) {
          code += this._englishPhoneticMap[norm[i]];
        }
        i++;
      }
    }

    // remove consecutive duplicates
    let result = '';
    for (let i = 0; i < code.length; i++) {
      if (i === 0 || code[i] !== code[i - 1]) {
        result += code[i];
      }
    }
    return result;
  }

  static phoneticMatch(text1, text2) {
    const code1 = this.getPhoneticCode(text1);
    const code2 = this.getPhoneticCode(text2);
    if (!code1 || !code2) return { match: false, score: 0 };
    if (code1 === code2) return { match: true, score: 95 };

    const longer = Math.max(code1.length, code2.length);
    const dist = this._levenshtein(code1, code2);
    const similarity = ((longer - dist) / longer) * 100;

    if (similarity >= 80) return { match: true, score: Math.round(similarity) };
    return { match: false, score: Math.round(similarity) };
  }

  // ========================
  // الطبقة 1.5: ترجمة الرموز
  // ========================

  static transliterateToken(token) {
    const normalized = this.deepNormalize(token);
    return this._nameMap[normalized] || normalized;
  }

  static transliterateFullName(name) {
    if (!name) return '';
    const tokens = this.deepNormalize(name).split(/\s+/);
    
    // try compound matches first (e.g., "abd el rahman" -> "عبدالرحمن")
    const result = [];
    let i = 0;
    while (i < tokens.length) {
      // try 3-word compound
      if (i + 2 < tokens.length) {
        const tri = tokens[i] + tokens[i+1] + tokens[i+2];
        if (this._nameMap[tri]) {
          result.push(this._nameMap[tri]);
          i += 3;
          continue;
        }
      }
      // try 2-word compound
      if (i + 1 < tokens.length) {
        const bi = tokens[i] + tokens[i+1];
        if (this._nameMap[bi]) {
          result.push(this._nameMap[bi]);
          i += 2;
          continue;
        }
        // try "abd al/el X" pattern
        if ((tokens[i] === 'abd' || tokens[i] === 'abdel' || tokens[i] === 'abdul') &&
            (tokens[i+1] === 'al' || tokens[i+1] === 'el')) {
          if (i + 2 < tokens.length) {
            const compound = tokens[i] + tokens[i+1] + tokens[i+2];
            if (this._nameMap[compound]) {
              result.push(this._nameMap[compound]);
              i += 3;
              continue;
            }
            // fallback: عبد + ال + الكلمة
            const lastPart = this._nameMap[tokens[i+2]] || tokens[i+2];
            result.push('عبد' + 'ال' + lastPart);
            i += 3;
            continue;
          }
        }
      }
      // single token
      result.push(this._nameMap[tokens[i]] || tokens[i]);
      i++;
    }
    return result.join(' ');
  }

  // ========================
  // حساب درجة تطابق الأسماء
  // ========================

  static calculateNameScore(bankInput, systemName, aliases) {
    const candidates = Array.isArray(bankInput) ? bankInput : [bankInput];
    
    // add aliases as additional system names to check
    const systemNames = [systemName];
    if (aliases && Array.isArray(aliases)) {
      for (const alias of aliases) {
        if (alias && typeof alias === 'string') systemNames.push(alias);
        if (alias && alias.alias_name) systemNames.push(alias.alias_name);
      }
    }

    let bestResult = { score: 0, method: 'no_match', matched_candidate: '', matchedVia: '' };

    for (const candidate of candidates) {
      for (const sysName of systemNames) {
        const result = this._scoreOnePair(candidate, sysName);
        if (result.score > bestResult.score) {
          bestResult = { ...result, matchedVia: sysName === systemName ? 'direct' : 'alias:' + sysName };
        }
      }
    }

    return bestResult;
  }

  static _scoreOnePair(bankName, systemName) {
    if (!bankName || !systemName) return { score: 0, method: 'empty', matched_candidate: '' };

    const bankNorm = this.deepNormalize(bankName);
    const systemNorm = this.deepNormalize(systemName);

    // exact match after normalization
    if (bankNorm === systemNorm) {
      return { score: 100, method: 'exact_normalized', matched_candidate: bankName };
    }

    // tokenize
    const bankTokensRaw = bankNorm.split(/\s+/).filter(Boolean);
    const systemTokensRaw = systemNorm.split(/\s+/).filter(Boolean);

    // transliterate both to Arabic
    const bankAr = this.transliterateFullName(bankName);
    const systemAr = this.transliterateFullName(systemName);

    // exact after transliteration
    const bankArNorm = this.deepNormalize(bankAr);
    const systemArNorm = this.deepNormalize(systemAr);
    if (bankArNorm === systemArNorm) {
      return { score: 98, method: 'exact_transliterated', matched_candidate: bankName };
    }

    // token-level subset matching
    const bankTokensAr = bankArNorm.split(/\s+/).filter(Boolean);
    const systemTokensAr = systemArNorm.split(/\s+/).filter(Boolean);

    const matchedTokens = systemTokensAr.filter(sToken =>
      bankTokensAr.some(bToken => this._tokensMatch(bToken, sToken))
    );
    const matchedCount = matchedTokens.length;
    const totalSystem = systemTokensAr.length;

    if (totalSystem > 0 && matchedCount === totalSystem) {
      return { score: 97, method: 'full_subset', matched_candidate: bankName };
    }

    if (totalSystem >= 2 && matchedCount >= totalSystem - 1) {
      return { score: 85, method: 'near_subset', matched_candidate: bankName };
    }

    if (totalSystem >= 3 && matchedCount >= 2) {
      return { score: 75, method: 'partial_subset', matched_candidate: bankName };
    }

    // phonetic matching as fallback
    const phoneticMatches = systemTokensAr.filter(sToken =>
      bankTokensAr.some(bToken => {
        const pm = this.phoneticMatch(bToken, sToken);
        return pm.match;
      })
    ).length;

    if (totalSystem > 0 && phoneticMatches === totalSystem) {
      return { score: 90, method: 'full_phonetic', matched_candidate: bankName };
    }

    if (totalSystem >= 2 && phoneticMatches >= totalSystem - 1) {
      return { score: 78, method: 'near_phonetic', matched_candidate: bankName };
    }

    // first token match only
    if (bankTokensAr.length > 0 && systemTokensAr.length > 0) {
      if (this._tokensMatch(bankTokensAr[0], systemTokensAr[0]) ||
          this.phoneticMatch(bankTokensAr[0], systemTokensAr[0]).match) {
        return { score: 45, method: 'first_token_only', matched_candidate: bankName };
      }
    }

    // fuzzy last resort
    const fuzzyScore = this._fuzzyTokenSetScore(bankTokensAr, systemTokensAr);
    if (fuzzyScore >= 70) {
      return { score: Math.round(fuzzyScore * 0.85), method: 'fuzzy', matched_candidate: bankName };
    }

    return { score: 0, method: 'no_match', matched_candidate: '' };
  }

  // ========================
  // دوال مساعدة
  // ========================

  static _tokensMatch(token1, token2) {
    if (!token1 || !token2) return false;
    if (token1 === token2) return true;
    if (Math.abs(token1.length - token2.length) <= 1) {
      const dist = this._levenshtein(token1, token2);
      const longer = Math.max(token1.length, token2.length);
      return dist <= 1 && longer >= 3;
    }
    return false;
  }

  static _fuzzyTokenSetScore(tokens1, tokens2) {
    let matched = 0;
    const used = new Set();
    for (const t1 of tokens1) {
      for (let i = 0; i < tokens2.length; i++) {
        if (!used.has(i)) {
          const dist = this._levenshtein(t1, tokens2[i]);
          const longer = Math.max(t1.length, tokens2[i].length);
          if (dist <= 1 || (longer >= 5 && dist <= 2)) {
            matched++;
            used.add(i);
            break;
          }
        }
      }
    }
    const total = Math.max(tokens1.length, tokens2.length);
    return total > 0 ? (matched / total) * 100 : 0;
  }

  static _levenshtein(a, b) {
    if (!a || !b) return Math.max((a || '').length, (b || '').length);
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i-1] === b[j-1]
          ? dp[i-1][j-1]
          : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[m][n];
  }

  static levenshteinSimilarity(a, b) {
    const longer = Math.max((a || '').length, (b || '').length);
    if (longer === 0) return 1.0;
    return (longer - this._levenshtein(a, b)) / longer;
  }

  // ========================
  // دوال التوافق مع الكود القديم
  // ========================

  static normalizeArabic(text) {
    return this.deepNormalize(text);
  }

  static extractNameComponents(name) {
    if (!name || !name.trim()) return { type: 'empty' };
    const normalized = this.deepNormalize(name);
    const companyKeywords = ['شركه', 'مؤسسه', 'مصنع', 'محل', 'معرض', 'company', 'corp', 'llc', 'ltd'];
    if (companyKeywords.some(k => normalized.includes(k))) {
      return { type: 'company', fullName: normalized };
    }
    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length === 0) return { type: 'empty' };
    if (words.length === 1) return { type: 'single_name', firstName: words[0], fullName: normalized };
    return {
      type: 'person',
      firstName: words[0],
      lastName: words[words.length - 1],
      fullName: normalized,
      words: words
    };
  }

  static familyNameMatch(bankName, customerName) {
    const result = this._scoreOnePair(bankName, customerName);
    if (result.score >= 75) {
      return { match: true, reason: result.method, score: result.score / 100 };
    }
    return { match: false, reason: result.method, score: result.score / 100 };
  }

  static wordSimilarity(word1, word2) {
    return this.levenshteinSimilarity(
      this.deepNormalize(word1),
      this.deepNormalize(word2)
    );
  }

  static crossLanguageMatch(text1, text2) {
    const result = this._scoreOnePair(text1, text2);
    return { match: result.score >= 70, score: result.score / 100, method: result.method };
  }

  static buildNameCandidates(transaction) {
    const candidates = new Set();
    if (transaction.payer_name) {
      candidates.add(transaction.payer_name.trim());
    }
    if (transaction.wallet_alias) {
      candidates.add(transaction.wallet_alias.trim());
      if (transaction.payer_name) {
        candidates.add(`${transaction.payer_name.trim()} ${transaction.wallet_alias.trim()}`);
      }
    }
    if (transaction.reconstructed_name) {
      candidates.add(transaction.reconstructed_name.trim());
    }
    if (transaction.name_candidates_json) {
      try {
        const parsed = JSON.parse(transaction.name_candidates_json);
        if (Array.isArray(parsed)) parsed.forEach(n => candidates.add(n));
      } catch(e) {}
    }
    return Array.from(candidates).filter(c => c.length >= 2);
  }
}

module.exports = NameNormalizer;