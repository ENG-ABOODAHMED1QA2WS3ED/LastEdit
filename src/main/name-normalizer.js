// ============================================================
// name-normalizer.js v9.0
// Abu Kamil POS — Intelligent Name Matching System
//
// Three layers:
//   1. Transliteration Dictionary (Arabic <-> Latin)
//   2. Phonetic Matching (cross-language sound similarity)
//   3. Cumulative Learning (alias learning via caller)
//
// API:
//   NameNormalizer.calculateNameScore(bankInput, systemName, aliases)
//     => { score: 0-100, method: string, matched_candidate: string, matchedVia: string }
// ============================================================
'use strict';

class NameNormalizer {

  // ════════════════════════════════════════════════
  // LAYER 0: Deep Normalization
  // ════════════════════════════════════════════════

  /**
   * Canonical text normalization for all comparisons.
   * - NFKC unicode
   * - Collapse Arabic variants (أإآٱ → ا, ة → ه, ى → ي, ؤ → و)
   * - Remove diacritics & tatweel
   * - Replace Farsi chars
   * - Lowercase + trim + collapse whitespace
   */
  static deepNormalize(text) {
    if (!text) return '';
    return text
      .normalize('NFKC')
      // Farsi yeh → Arabic yeh, Farsi kaf → Arabic kaf
      .replace(/\u06CC/g, '\u064A')
      .replace(/\u06A9/g, '\u0643')
      // Remove diacritics (tashkeel), superscript alef, tatweel
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      // Collapse hamza variants
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/\u0621/g, '')
      // Taa marbuta → haa
      .replace(/ة/g, 'ه')
      // Alef maqsura → yaa
      .replace(/ى/g, 'ي')
      // Waw hamza → waw
      .replace(/ؤ/g, 'و')
      // Punctuation → space
      .replace(/\.{2,}/g, '').replace(/[-_\.]/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ════════════════════════════════════════════════
  // LAYER 1: Transliteration Dictionary
  // ════════════════════════════════════════════════

  /**
   * Bidirectional English→Arabic name map.
   * Covers common Palestinian male/female first names + family names.
   */
  static _nameMap = {
    // ── Male first names ──
    'omar': 'عمر', 'umar': 'عمر', 'omer': 'عمر',
    'ali': 'علي',
    'mohammed': 'محمد', 'mohammad': 'محمد', 'muhammad': 'محمد',
    'mohamad': 'محمد', 'muhammed': 'محمد', 'mohmad': 'محمد',
    'mohamed': 'محمد', 'mohammd': 'محمد',
    'ahmad': 'احمد', 'ahmed': 'احمد', 'ahamed': 'احمد',
    'taher': 'طاهر', 'tahir': 'طاهر', 'taaher': 'طاهر',
    'hamdi': 'حمدي', 'hamdy': 'حمدي',
    'nabeel': 'نبيل', 'nabil': 'نبيل',
    'khalil': 'خليل', 'khalel': 'خليل', 'kalil': 'خليل',
    'khaled': 'خالد', 'khalid': 'خالد',
    'ibrahim': 'ابراهيم', 'ibraheem': 'ابراهيم',
    'ebrahim': 'ابراهيم', 'ebraheem': 'ابراهيم', 'ibraheim': 'ابراهيم',
    'kamal': 'كمال', 'kamaal': 'كمال', 'kames': 'كامل',
    'saeed': 'سعيد', 'said': 'سعيد', 'sayid': 'سعيد', 'saed': 'سعيد',
    'hasan': 'حسن', 'hassan': 'حسن', 'hssen': 'حسن', 'hsan': 'حسن',
    'hussein': 'حسين', 'husain': 'حسين', 'hosein': 'حسين',
    'husein': 'حسين', 'huseen': 'حسين',
    'samer': 'سامر',
    'sameer': 'سمير', 'samir': 'سمير',
    'waleed': 'وليد', 'walid': 'وليد', 'waled': 'وليد',
    'amjad': 'امجد', 'amjed': 'امجد',
    'nasser': 'ناصر', 'nasir': 'ناصر',
    'nader': 'نادر', 'nadir': 'نادر',
    'yasser': 'ياسر', 'yasir': 'ياسر',
    'majed': 'ماجد', 'majid': 'ماجد',
    'maher': 'ماهر', 'mahir': 'ماهر',
    'sami': 'سامي', 'rami': 'رامي', 'hani': 'هاني',
    'ziad': 'زياد', 'ziyad': 'زياد', 'zead': 'زياد',
    'eyad': 'اياد', 'iyad': 'اياد',
    'ayman': 'ايمن', 'aiman': 'ايمن',
    'tawfeeq': 'توفيق', 'tawfiq': 'توفيق', 'taufiq': 'توفيق',
    'fadi': 'فادي', 'firas': 'فراس', 'feras': 'فراس',
    'bashar': 'بشار', 'bishar': 'بشار',
    'saleh': 'صالح', 'salih': 'صالح', 'salah': 'صلاح',
    'ramadan': 'رمضان', 'ramdan': 'رمضان',
    'anwar': 'انور', 'anwr': 'انور',
    'shokry': 'شكري', 'shukri': 'شكري',
    'yousef': 'يوسف', 'youssef': 'يوسف', 'yusuf': 'يوسف', 'yusef': 'يوسف',
    'marzouq': 'مرزوق', 'marzouk': 'مرزوق',
    'rafiq': 'رفيق', 'rafik': 'رفيق',
    'zaher': 'زاهر', 'zahir': 'زاهر',
    'mohareb': 'محارب', 'muharib': 'محارب',
    'naeem': 'نعيم', 'naim': 'نعيم',
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
    'loay': 'لؤي', 'louay': 'لؤي',
    'nidal': 'نضال', 'nedal': 'نضال',
    'basma': 'بسمه', 'bassma': 'بسمه',
    'ghassan': 'غسان',
    'mostafa': 'مصطفى', 'mustafa': 'مصطفى', 'mostapha': 'مصطفى',
    'marwan': 'مروان',
    'hamza': 'حمزه', 'hamzeh': 'حمزه',
    'sadeq': 'صادق', 'sadiq': 'صادق',
    'sameh': 'سامح',
    'moaz': 'معاذ', 'muaz': 'معاذ',
    'ishaq': 'اسحاق', 'ishaaq': 'اسحاق',
    'faraj': 'فرج',
    'fahmy': 'فهمي', 'fahmi': 'فهمي',
    'adel': 'عادل', 'aadel': 'عادل',
    'jalal': 'جلال',
    'haroun': 'هارون', 'harun': 'هارون',
    'hossam': 'حسام', 'hosam': 'حسام', 'hussam': 'حسام',
    'othman': 'عثمان', 'usman': 'عثمان',
    'yaaqob': 'يعقوب', 'yaqoub': 'يعقوب', 'yaqoob': 'يعقوب',
    'edrees': 'ادريس', 'idrees': 'ادريس', 'idris': 'ادريس',
    'sobhy': 'صبحي', 'subhi': 'صبحي',
    'jehad': 'جهاد', 'jihad': 'جهاد',
    'saqer': 'صقر', 'saker': 'صقر',
    'dawod': 'داود', 'dawood': 'داود', 'daoud': 'داود',
    'matter': 'مطر', 'matar': 'مطر',
    'aied': 'عايد', 'ayed': 'عايد',
    'monier': 'منير', 'munir': 'منير', 'muneer': 'منير',
    'jabr': 'جبر',
    'raid': 'رائد', 'raed': 'رائد',
    'fayez': 'فايز', 'faiz': 'فايز',
    'faiz': 'فايز',
    'taleb': 'طالب', 'talab': 'طلب',
    'ghazi': 'غازي',
    'seliman': 'سليمان', 'soliman': 'سليمان', 'sulaiman': 'سليمان', 'suliman': 'سليمان',
    'darwish': 'درويش',
    'shadi': 'شادي',
    'read': 'رياض', // contextual transliteration from the CSV
    'osama': 'اسامه', 'usama': 'اسامه',
    'abed': 'عبد', 'abeed': 'عبيد',
    'zayd': 'زيد', 'zaid': 'زيد',

    // ── Compound names ──
    'ezzaldean': 'عزالدين', 'ezzeldeen': 'عزالدين', 'ezzaldeen': 'عزالدين',
    'izzeldine': 'عزالدين', 'ezzeddin': 'عزالدين', 'exedden': 'عزالدين',
    'saadalla': 'سعدالله', 'saadallah': 'سعدالله',
    'abdallah': 'عبدالله', 'abdullah': 'عبدالله', 'abdalla': 'عبدالله',
    'abedualla': 'عبدالله', 'abedalla': 'عبدالله',
    'abdelrahman': 'عبدالرحمن', 'abdulrahman': 'عبدالرحمن',
    'abdalrhman': 'عبدالرحمن', 'abdrahman': 'عبدالرحمن',
    'apdalrahman': 'عبدالرحمن',
    'abdulkarim': 'عبدالكريم', 'abdelkarim': 'عبدالكريم',
    'abdelkareem': 'عبدالكريم', 'abdalkareem': 'عبدالكريم',
    'abdulkareem': 'عبدالكريم', 'abdalateef': 'عبدالطيف',
    'abdellatif': 'عبدالطيف', 'abdalateef': 'عبدالطيف',
    'abdelsalam': 'عبدالسلام', 'abdulsalam': 'عبدالسلام',
    'abdelfatah': 'عبدالفتاح', 'abdalfatah': 'عبدالفتاح',
    'abedalkareem': 'عبدالكريم',
    'abedelkareem': 'عبدالكريم',
    'jebreel': 'جبريل', 'jibril': 'جبريل',

    // ── Prefixes ──
    'abdel': 'عبد', 'abdul': 'عبد', 'abd': 'عبد',
    'abu': 'ابو', 'abo': 'ابو', 'abou': 'ابو',
    'al': 'ال', 'el': 'ال',
    'bin': 'بن', 'ben': 'بن', 'ibn': 'ابن',

    // ── Female first names ──
    'snaa': 'سناء', 'sanaa': 'سناء', 'sana': 'سناء',
    'raghda': 'رغده', 'raghad': 'رغد',
    'amany': 'اماني', 'amani': 'اماني',
    'hanaa': 'هناء', 'hana': 'هنا',
    'reem': 'ريم', 'dalia': 'داليا', 'dalya': 'داليا',
    'dalal': 'دلال',
    'nour': 'نور', 'lina': 'لينا', 'leena': 'لينا',
    'aseel': 'اسيل', 'asil': 'اسيل',
    'eman': 'ايمان', 'iman': 'ايمان', 'eeman': 'ايمان',
    'mai': 'مي', 'may': 'مي', 'maya': 'مايا',
    'rehab': 'رحاب', 'rihab': 'رحاب',
    'hadeel': 'هديل', 'hadil': 'هديل',
    'layan': 'ليان', 'liyan': 'ليان',
    'amneh': 'امنه', 'amnah': 'امنه', 'amna': 'امنه', 'amani': 'اماني',
    'samah': 'سماح', 'sawsan': 'سوسن',
    'mona': 'منى',
    'heba': 'هبه', 'hiba': 'هبه',
    'doaa': 'دعاء', 'duaa': 'دعاء',
    'sahar': 'سحر',
    'olaa': 'علا', 'ola': 'علا', 'ulaa': 'علا',
    'malak': 'ملك',
    'raeda': 'رائده', 'raida': 'رائده',
    'sabreen': 'صابرين', 'sabrin': 'صابرين',
    'maysaa': 'ميساء', 'maisa': 'ميساء',
    'shereen': 'شيرين', 'shirin': 'شيرين',
    'shams': 'شمس',
    'rasha': 'رشا',
    'soheir': 'سهير', 'suheir': 'سهير',
    'souzan': 'سوزان', 'suzan': 'سوزان',
    'yasmin': 'ياسمين', 'yasmeen': 'ياسمين',
    'momena': 'مؤمنه', 'mumena': 'مؤمنه',
    'donia': 'دنيا', 'dunya': 'دنيا',
    'isra': 'اسراء', 'israa': 'اسراء',
    'ghalia': 'غاليه', 'ghalya': 'غاليه',
    'karmel': 'كرمل', 'karmal': 'كرمل',
    'jomana': 'جمانه', 'jumana': 'جمانه',
    'merfat': 'ميرفت', 'mirvat': 'ميرفت',
    'aya': 'ايه', 'ayaa': 'ايه',
    'amal': 'امل', 'amaal': 'امل',
    'abeer': 'عبير', 'abir': 'عبير',
    'rowan': 'روان', 'rawan': 'روان',
    'safaa': 'صفاء', 'safa': 'صفاء',
    'maryam': 'مريم', 'mariam': 'مريم',
    'tamam': 'تمام',
    'sameer': 'سمير',
    'aydaa': 'عيده', 'ayda': 'عيده',
    'eala': 'عيله',
    'khldeiaa': 'خديجه',

    // ── Palestinian family names ──
    'hirez': 'حرز', 'harez': 'حرز', 'herez': 'حرز', 'hiriz': 'حرز',
    'nassar': 'نصار', 'nasar': 'نصار',
    'thriya': 'ثريا', 'thuraya': 'ثريا', 'thoraya': 'ثريا',
    'threia': 'ثريا', 'thraya': 'ثريا',
    'mashharawi': 'مشهراوي', 'masharawi': 'مشهراوي',
    'mashharwi': 'مشهراوي', 'almashhrawy': 'المشهراوي',
    'almasharawi': 'المشهراوي', 'almashhrawi': 'المشهراوي',
    'mashhrawi': 'المشهراوي',
    'zamil': 'زميل', 'zameil': 'زميل',
    'shawwa': 'الشوا', 'alshawwa': 'الشوا',
    'alaklouk': 'العقلوق', 'akluk': 'العقلوق',
    'jarada': 'جراده', 'jarrada': 'جراده',
    'dloul': 'دلول', 'daloul': 'دلول',
    'alashram': 'الاشرم', 'ashram': 'الاشرم',
    'daya': 'الدايه', 'aldaya': 'الدايه',
    'khudari': 'الخضري', 'alkhudari': 'الخضري', 'khudri': 'الخضري',
    'abuthreia': 'ابوثريا', 'abuthuraya': 'ابوثريا',
    'hamoudeh': 'حموده', 'hamouda': 'حموده', 'hamuda': 'حموده',
    'amri': 'العمري', 'alamri': 'العمري', 'alomari': 'العمري',
    'khaldi': 'الخالدي', 'alkhalidi': 'الخالدي',
    'zard': 'الزرد', 'alzard': 'الزرد',
    'habboub': 'حبوب', 'haboub': 'حبوب', 'haboush': 'حبوش',
    'salem': 'سالم', 'salim': 'سالم',
    'mansour': 'منصور', 'mansur': 'منصور',
    'qaneta': 'قنيطا', 'qanita': 'قنيطا', 'kanita': 'قنيطا',
    'sweirki': 'الصويركي', 'alsweirki': 'الصويركي',
    'bahri': 'البحري', 'albahri': 'البحري',
    'shahin': 'شاهين', 'shaheen': 'شاهين',
    'alsawda': 'السوده', 'alsawada': 'السوده', 'alsawda': 'السوده',
    'sawada': 'السوده', 'sawda': 'السوده',
    'alzaharna': 'الزهارنه', 'zaharna': 'الزهارنه',
    'abusayma': 'ابوسيمه', 'abosayma': 'ابوسيمه', 'abusaima': 'ابوسيمه',
    'alagha': 'الاغا', 'alagha': 'الاغا',
    'asalia': 'اساليه',
    'alaraj': 'العرج', 'alaaraj': 'العرج',
    'alazbat': 'العزبات',
    'abukmail': 'ابوكميل', 'abukaml': 'ابوكميل',
    'skaik': 'سكيك',
    'helles': 'حلس', 'hilas': 'حلس',
    'hilweh': 'حلوه', 'hulwa': 'حلوه',
    'shuhaiber': 'شهيبر',
    'shmlakh': 'شملخ',
    'alhurtani': 'الحرتني',
    'almopayed': 'المبيض',
    'abokalloub': 'ابوقلوب',
    'almalahy': 'الملاحي',
    'altramsi': 'الطرمسي',
    'lubbad': 'لبد', 'lubad': 'لبد',
    'rashed': 'راشد',
    'aburashed': 'ابوراشد',
    'alsosi': 'السوسي', 'alsousi': 'السوسي',
    'aldardsawy': 'الدردساوي',
    'alghifari': 'الغفاري',
    'elfram': 'الفرام',
    'moshtaha': 'مشتهى',
    'esleem': 'اسليم', 'asleem': 'اسليم', 'sleem': 'اسليم',
    'aldalo': 'الدلو', 'aldalu': 'الدلو',
    'abushmmal': 'ابوشمله', 'aposhmmal': 'ابوشمله',
    'abu shamala': 'ابوشماله', 'abushamala': 'ابوشماله',
    'shammala': 'شماله',
    'khdier': 'خضر', 'khudeir': 'خضير',
    'jaber': 'جابر',
    'rostom': 'رستم', 'rustom': 'رستم',
    'hajjaj': 'حجاج',
    'arqeiq': 'عرقيق',
    'atallh': 'عطالله',
    'kishko': 'كشكو',
    'ziadah': 'زياده', 'ziyada': 'زياده',
    'adwan': 'عدوان',
    'elyan': 'عليان', 'alyan': 'عليان',
    'owbed': 'عوبد',
    'asker': 'عسكر',
    'harzallah': 'حرزالله', 'harzalla': 'حرزالله',
    'abujarad': 'ابوجراد', 'abujarada': 'ابوجراد',
    'ziara': 'زياره',
    'thabet': 'ثابت',
    'ghazal': 'غزال',
    'ouda': 'عوده', 'awda': 'عوده',
    'hamad': 'حمد',
    'hamada': 'حماده', 'hamade': 'حماده',
    'hillel': 'هلال', 'hilal': 'هلال',
    'eraif': 'عريف',
    'ekhzaiek': 'اخزيك',
    'alnkhala': 'النخاله',
    'barakat': 'بركات', 'barzaq': 'برزق',
    'sawwan': 'صوان', 'sawan': 'صوان',
    'abdo': 'عبده',
    'ayaad': 'عياد', 'ayyad': 'عياد',
    'asedodi': 'الاسدودي', 'asdudi': 'الاسدودي',
    'alkholi': 'الخولي',
    'alreefy': 'الريفي',
    'albatsh': 'البطش',
    'henieh': 'هنيه', 'haniyeh': 'هنيه',
    'ayesh': 'عياش', 'ayyash': 'عياش',
    'zaueed': 'زعيد', 'zayed': 'زعيد',
    'elshikhdeeb': 'الشيخديب',
    'alnazly': 'النازلي',
    'bakr': 'بكر',
    'alwakeel': 'الوكيل',
    'salhya': 'صالحيه',
    'alghadeer': 'الغدير',
    'alfairi': 'الفيري',
    'ashtiwi': 'اشتيوي',
    'sated': 'ساتد', 'saleem': 'سليم',
    'abusada': 'ابوسعده',
    'alabed': 'العبد',
    'albayaa': 'البياع',
    'alhasni': 'الحسني',
    'alhindi': 'الهندي',
    'alkayal': 'الكيال',
    'akila': 'عقيله', 'akilah': 'عقيله',
    'hasooneh': 'حسونه', 'hasuna': 'حسونه',
    'harrara': 'حراره', 'harara': 'حراره',
    'drimlii': 'الدريملي', 'aldrimlii': 'الدريملي', 'aldreemly': 'الدريملي',
    'aburda': 'ابورده', 'aburudda': 'ابورده',
    'afifeh': 'عفيفه', 'afifa': 'عفيفه',
    'alnadi': 'النادي',
    'blata': 'بلاطه', 'balatah': 'بلاطه',
    'sharif': 'شرف', 'sharaf': 'شرف',
    'asamra': 'ابوسمره', 'abusamra': 'ابوسمره',
    'qwuider': 'قويدر', 'quaider': 'قويدر',
    'rahma': 'رحمه', 'rahmah': 'رحمه',
    'sated': 'ساتد',
    'alharsh': 'الحرش',

    // ── Auto-added missing variants ──
    'malek': 'ملك', 'melek': 'ملك',
    'bayd': 'بيض', 'baid': 'بيض', 'byad': 'بيض', 'byed': 'بيض',
    'abubayd': 'ابوبيض', 'abubaid': 'ابوبيض', 'abobayd': 'ابوبيض', 'abobaid': 'ابوبيض',
    'sadodi': 'سدودي', 'sdodi': 'سدودي', 'sudodi': 'سدودي', 'sadudi': 'سدودي', 'alsadodi': 'السدودي',
    'suda': 'السوده', 'alsuda': 'السوده',
    'jarad': 'جراد', 'jarrad': 'جراد',
    'samra': 'سمره', 'shamala': 'شماله',
    'shereehan': 'شريهان', 'sherehan': 'شريهان', 'sherihan': 'شريهان', 'shirehan': 'شريهان',
    'sharaf': 'شرف',
    'albayd': 'البيض',


    // ── أسماء مضافة للمطابقة عربي↔إنجليزي ──
    'kalid': 'خالد',
    'nafez': 'نافذ',
    'nafiz': 'نافذ',
    'nafeth': 'نافذ',
    'husam': 'حسام',
    'eslam': 'اسلام',
    'islam': 'اسلام',
    'saqr': 'صقر',
    'sakr': 'صقر',
    'hamzah': 'حمزه',
    'hamze': 'حمزه',
    'luay': 'لؤي',
    'moataz': 'معتز',
    'mutaz': 'معتز',
    'motaz': 'معتز',
    'anas': 'انس',
    'anes': 'انس',
    'ayoub': 'ايوب',
    'ayob': 'ايوب',
    'ayyoub': 'ايوب',
    'baheij': 'بهيج',
    'bahij': 'بهيج',
    'ashraf': 'اشرف',
    'zohair': 'زهير',
    'zuhair': 'زهير',
    'zuheir': 'زهير',
    'mohanad': 'مهند',
    'muhannad': 'مهند',
    'munwar': 'منور',
    'mnwar': 'منور',
    'saher': 'ساهر',
    'jamela': 'جميله',
    'jameela': 'جميله',
    'tasneem': 'تسنيم',
    'tasnim': 'تسنيم',
    'maram': 'مرام',
    'maisaa': 'ميساء',
    'maysa': 'ميساء',
    'sujood': 'سجود',
    'sojood': 'سجود',
    'sojod': 'سجود',
    'bushra': 'بشرى',
    'sara': 'ساره',
    'sarah': 'ساره',
    'wesal': 'وصال',
    'wisal': 'وصال',
    'fatima': 'فاطمه',
    'fatma': 'فاطمه',
    'rana': 'رنا',
    'alabeed': 'العبيد', 'abud': 'العبيد',
    'alobaid': 'العبيد',
    'alobeid': 'العبيد',
    'obaid': 'العبيد',
    'baraka': 'بركه',
    'barakah': 'بركه',
    'barake': 'بركه',
    'alknfad': 'القنفد',
    'alqonfod': 'القنفد',
    'qonfod': 'القنفد',
    'knfad': 'القنفد',
    'mqat': 'مقاط',
    'moqat': 'مقاط',
    'muqat': 'مقاط',
    'alswairki': 'الصويركي',
    'alswayrki': 'الصويركي',
    'swairki': 'الصويركي',
    'darwesh': 'درويش',
    'darweesh': 'درويش',
    'mosa': 'موسى',
    'mousa': 'موسى',
    'musa': 'موسى',
    'moussa': 'موسى',
    'alrifi': 'الريفي',
    'alrefi': 'الريفي',
    'rifi': 'الريفي',
    'ashour': 'عاشور',
    'ashur': 'عاشور',
    'masoud': 'مسعود',
    'masood': 'مسعود',
    'msoud': 'مسعود',
    'saqallah': 'سقالله',
    'saqalla': 'سقالله',
    'alghafri': 'الغفري',
    'ghafri': 'الغفري',
    'gola': 'جوله',
    'goula': 'جوله',
    'alhelou': 'الحلو',
    'helou': 'الحلو',
    'alhelo': 'الحلو',
    'alsoda': 'الصودا',
    'aldallo': 'الدلو',
    'alhkateeb': 'الخطيب',
    'alkhatib': 'الخطيب',
    'khateeb': 'الخطيب',
    'alsaqqa': 'السقا',
    'saqqa': 'السقا',
    'shorfa': 'الشرفا',
    'alshorfa': 'الشرفا',
    'aldalow': 'الدلو',
    'dalou': 'الدلو',
    'alswsy': 'السوسي',
    'sousi': 'السوسي',
    'shdat': 'شدات',
    'alshobaki': 'الشوبكي',
    'shobaki': 'الشوبكي',
    'abukamail': 'ابوكميل',
    'hassouna': 'حسونه',
    'hassuna': 'حسونه',
    'alskaik': 'سكيك',
    'albalawi': 'البلعاوي',
    'blawy': 'البلعاوي',
    'alhatab': 'الحطاب',
    'hatab': 'الحطاب',
    'atallah': 'عطالله',
    'ataallah': 'عطالله',
    'aburizq': 'ابورزق',
    'herz': 'حرز',
    'suleiman': 'سليمان',
    'yusif': 'يوسف',
    'sady': 'سعدي',
    'saadi': 'سعدي',
    'saady': 'سعدي',
    'ayad': 'اياد',
    'wajeh': 'وجيه',
    'wajih': 'وجيه',
    'dib': 'ديب',
    'deeb': 'ديب',
    'halmi': 'حلمي',
    'helmi': 'حلمي',
    'mahdi': 'مهدي',
    'abdella': 'عبدالله',
    'sadek': 'صادق',
    'mustfa': 'مصطفى',
    'sabri': 'صبري',
    'thurayana': 'ثريانه',
    'hisham': 'هشام',
    'hesham': 'هشام',
    'amil': 'امل',
    'khamis': 'خميس',
  };

  // ════════════════════════════════════════════════
  // LAYER 2: Phonetic Matching
  // ════════════════════════════════════════════════

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

  /**
   * Convert text to phonetic code for cross-language comparison.
   * Arabic and English produce comparable codes.
   */
  static getPhoneticCode(text) {
    if (!text) return '';
    const norm = this.deepNormalize(text);
    let code = '';

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

    // Remove consecutive duplicate characters
    let result = '';
    for (let i = 0; i < code.length; i++) {
      if (i === 0 || code[i] !== code[i - 1]) {
        result += code[i];
      }
    }
    return result;
  }

  /**
   * Check if two tokens sound similar using phonetic codes.
   * Returns { match: boolean, score: number }
   */
  static phoneticMatch(text1, text2) {
    const code1 = this.getPhoneticCode(text1);
    const code2 = this.getPhoneticCode(text2);
    if (!code1 || !code2) return { match: false, score: 0 };
    if (code1 === code2) return { match: true, score: 95 };

    // GUARD: If original texts have different first characters,
    // they are likely different names (روان vs مروان)
    const t1Norm = this.deepNormalize(text1);
    const t2Norm = this.deepNormalize(text2);
    if (t1Norm && t2Norm && t1Norm[0] !== t2Norm[0]) {
      return { match: false, score: 0 };
    }

    const longer = Math.max(code1.length, code2.length);
    const dist = this._levenshtein(code1, code2);
    const similarity = ((longer - dist) / longer) * 100;

    if (similarity >= 80) return { match: true, score: Math.round(similarity) };
    return { match: false, score: Math.round(similarity) };
  }

  // ════════════════════════════════════════════════
  // TRANSLITERATION HELPERS
  // ════════════════════════════════════════════════

  /** Transliterate a single token via dictionary lookup */
  static transliterateToken(token) {
    const normalized = this.deepNormalize(token);
    return this._nameMap[normalized] || normalized;
  }

  /**
   * Transliterate a full name — handles compound names like
   * "abd el rahman" → "عبدالرحمن" by trying 3-word, 2-word, then 1-word lookups.
   */
  static transliterateFullName(name) {
    if (!name) return '';
    const tokens = this.deepNormalize(name).split(/\s+/);

    const result = [];
    let i = 0;
    while (i < tokens.length) {
      // Try 3-word compound
      if (i + 2 < tokens.length) {
        const tri = tokens[i] + tokens[i + 1] + tokens[i + 2];
        if (this._nameMap[tri]) {
          result.push(this._nameMap[tri]);
          i += 3;
          continue;
        }
      }
      // Try 2-word compound
      if (i + 1 < tokens.length) {
        const bi = tokens[i] + tokens[i + 1];
        if (this._nameMap[bi]) {
          result.push(this._nameMap[bi]);
          i += 2;
          continue;
        }

        // ── NEW: Smart prefix compound builder ──
        // "abu/abo/abou" + unknown word → try building compound
        if (['abu', 'abo', 'abou'].includes(tokens[i])) {
          const nextToken = tokens[i + 1];
          const prefixAr = this._nameMap[tokens[i]]; // ابو
          // Try: abu + alX → lookup compound
          const withAl = 'abu' + 'al' + nextToken;
          if (this._nameMap[withAl]) {
            result.push(this._nameMap[withAl]);
            i += 2;
            continue;
          }
          // Try: next token with "al" prefix in map → build ابو + strip ال
          const alLookup = this._nameMap['al' + nextToken];
          if (alLookup) {
            // Remove ال prefix from Arabic result and combine
            const stripped = alLookup.replace(/^\u0627\u0644/, '');
            result.push(prefixAr + stripped);
            i += 2;
            continue;
          }
          // Try: next token direct lookup → build ابو + arabic
          if (this._nameMap[nextToken]) {
            result.push(prefixAr + this._nameMap[nextToken]);
            i += 2;
            continue;
          }
          // Fallback: transliterate next token and combine
          const nextPhonetic = this._phoneticallyTransliterate(nextToken);
          if (nextPhonetic !== nextToken) {
            result.push(prefixAr + nextPhonetic);
            i += 2;
            continue;
          }
        }

        // "abd al/el X" pattern
        if (['abd', 'abdel', 'abdul', 'abed'].includes(tokens[i]) &&
            ['al', 'el'].includes(tokens[i + 1])) {
          if (i + 2 < tokens.length) {
            const compound = tokens[i] + tokens[i + 1] + tokens[i + 2];
            if (this._nameMap[compound]) {
              result.push(this._nameMap[compound]);
              i += 3;
              continue;
            }
            const lastPart = this._nameMap[tokens[i + 2]] || tokens[i + 2];
            result.push('\u0639\u0628\u062F' + '\u0627\u0644' + lastPart);
            i += 3;
            continue;
          }
        }

        // ── NEW: "al/el" + unknown word → try bare lookup ──
        if (['al', 'el'].includes(tokens[i])) {
          const nextToken = tokens[i + 1];
          const compound = tokens[i] + nextToken;
          if (this._nameMap[compound]) {
            result.push(this._nameMap[compound]);
            i += 2;
            continue;
          }
          // Try bare next token
          if (this._nameMap[nextToken]) {
            result.push('\u0627\u0644' + this._nameMap[nextToken]);
            i += 2;
            continue;
          }
        }
      }

      // Single token with fallback chain
      const token = tokens[i];
      let translated = this._nameMap[token];
      if (!translated) {
        // Fallback 1: Try with "al" prefix
        translated = this._nameMap['al' + token];
        if (translated) {
          // Remove the ال from the result since input didn't have it
          translated = translated.replace(/^\u0627\u0644/, '');
        }
      }
      if (!translated) {
        // Fallback 2: Phonetic transliteration
        const phonetic = this._phoneticallyTransliterate(token);
        if (phonetic !== token) translated = phonetic;
      }
      result.push(translated || token);
      i++;
    }
    return result.join(' ');
  }


  // ════════════════════════════════════════════════
  // HELPER: Phonetic English→Arabic transliteration
  // For words NOT in the dictionary — converts letter by letter
  // ════════════════════════════════════════════════

  static _engToArabicMap = {
    'a': '\u0627', 'b': '\u0628', 't': '\u062A', 'th': '\u062B',
    'j': '\u062C', 'h': '\u062D', 'kh': '\u062E', 'd': '\u062F',
    'dh': '\u0630', 'r': '\u0631', 'z': '\u0632', 's': '\u0633',
    'sh': '\u0634', 'ss': '\u0635', 'dd': '\u0636', 'tt': '\u0637',
    'dth': '\u0638', 'aa': '\u0639', 'gh': '\u063A', 'f': '\u0641',
    'q': '\u0642', 'k': '\u0643', 'l': '\u0644', 'm': '\u0645',
    'n': '\u0646', 'w': '\u0648', 'y': '\u064A', 'i': '\u064A',
    'u': '\u0648', 'o': '\u0648', 'e': '\u064A',
    'p': '\u0628', 'v': '\u0641', 'g': '\u063A', 'x': '\u0643\u0633',
    'c': '\u0643', 'ch': '\u062A\u0634',
  };

  /**
   * Phonetically transliterate an English token to Arabic letter by letter.
   * Used as last resort when dictionary lookup fails.
   * Returns the original token if it contains non-Latin characters.
   */
  static _phoneticallyTransliterate(token) {
    if (!token || /[\u0600-\u06FF]/.test(token)) return token;
    const lower = token.toLowerCase();
    let result = '';
    let idx = 0;
    while (idx < lower.length) {
      // Try 3-char digraph
      if (idx + 2 < lower.length) {
        const tri = lower.substring(idx, idx + 3);
        if (this._engToArabicMap[tri]) {
          result += this._engToArabicMap[tri];
          idx += 3;
          continue;
        }
      }
      // Try 2-char digraph
      if (idx + 1 < lower.length) {
        const di = lower.substring(idx, idx + 2);
        if (this._engToArabicMap[di]) {
          result += this._engToArabicMap[di];
          idx += 2;
          continue;
        }
      }
      // Single char
      if (this._engToArabicMap[lower[idx]]) {
        result += this._engToArabicMap[lower[idx]];
      }
      idx++;
    }
    return result || token;
  }

    // ════════════════════════════════════════════════
  // MAIN API: calculateNameScore
  // ════════════════════════════════════════════════

  /**
   * Compare a bank name (or array of candidate names) against a system name.
   * Optionally check aliases too.
   *
   * @param {string|string[]} bankInput - Name(s) extracted from bank description
   * @param {string} systemName - Customer name in the POS system
   * @param {Array} aliases - Optional alternative names (strings or {alias_name})
   * @returns {{ score: number, method: string, matched_candidate: string, matchedVia: string }}
   */
  static calculateNameScore(bankInput, systemName, aliases) {
    const candidates = Array.isArray(bankInput) ? bankInput : [bankInput];

    // Build list of system names to compare against
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
          bestResult = {
            ...result,
            matchedVia: sysName === systemName ? 'direct' : 'alias:' + sysName
          };
        }
      }
    }

    return bestResult;
  }

  // ════════════════════════════════════════════════
  // INTERNAL: Score one (bankName, systemName) pair
  // ════════════════════════════════════════════════

  static _scoreOnePair(bankName, systemName) {
    if (!bankName || !systemName) return { score: 0, method: 'empty', matched_candidate: '' };

    const bankNorm = this.deepNormalize(bankName);
    const systemNorm = this.deepNormalize(systemName);

    // ── Stage 1: Exact normalized match ──
    if (bankNorm === systemNorm) {
      return { score: 100, method: 'exact_normalized', matched_candidate: bankName };
    }

    // ── Stage 2: Exact after transliteration ──
    const bankAr = this.transliterateFullName(bankName);
    const systemAr = this.transliterateFullName(systemName);
    const bankArNorm = this.deepNormalize(bankAr);
    const systemArNorm = this.deepNormalize(systemAr);

    if (bankArNorm === systemArNorm) {
      return { score: 98, method: 'exact_transliterated', matched_candidate: bankName };
    }

    // ── Stage 3: Token-level subset matching ──
    const bankTokensAr = bankArNorm.split(/\s+/).filter(Boolean);
    const systemTokensAr = systemArNorm.split(/\s+/).filter(Boolean);

    const matchedTokens = systemTokensAr.filter(sToken =>
      bankTokensAr.some(bToken => this._tokensMatch(bToken, sToken))
    );
    const matchedCount = matchedTokens.length;
    const totalSystem = systemTokensAr.length;

    // Count distinctive (non-common) matched tokens
    const distinctiveMatched = matchedTokens.filter(t => !this._commonNames.has(t)).length;

    // Full subset: all system tokens found in bank tokens
    if (totalSystem > 0 && matchedCount === totalSystem) {
      return { score: 97, method: 'full_subset', matched_candidate: bankName };
    }

    // Near subset: all but one system token matched
    if (totalSystem >= 3 && matchedCount >= totalSystem - 1 && matchedCount >= 2 && distinctiveMatched >= 1) {
      return {
        score: distinctiveMatched >= 2 ? 85 : 70,
        method: 'near_subset',
        matched_candidate: bankName
      };
    }

    // Partial subset: at least 2 tokens matched including 1 distinctive
    if (totalSystem >= 3 && matchedCount >= 2 && distinctiveMatched >= 1) {
      return { score: 75, method: 'partial_subset', matched_candidate: bankName };
    }

    // ── Stage 3.5: Compound token matching ──
    // Try combining adjacent bank tokens to match compound system tokens
    // e.g., bank ["ابو", "بيض"] vs system ["ابوبيض"]
    {
      let compoundMatched = 0;
      const sysUsed = new Set();
      for (const sToken of systemTokensAr) {
        // Direct match already counted above, check compound
        let found = bankTokensAr.some(bt => this._tokensMatch(bt, sToken));
        if (!found) {
          // Try combining adjacent bank tokens
          for (let ci = 0; ci < bankTokensAr.length - 1; ci++) {
            const combined = bankTokensAr[ci] + bankTokensAr[ci + 1];
            if (this._tokensMatch(combined, sToken) || this.phoneticMatch(combined, sToken).match) {
              found = true;
              break;
            }
            // Also try with adjacent 3 tokens
            if (ci + 2 < bankTokensAr.length) {
              const combined3 = bankTokensAr[ci] + bankTokensAr[ci + 1] + bankTokensAr[ci + 2];
              if (this._tokensMatch(combined3, sToken)) {
                found = true;
                break;
              }
            }
          }
        }
        if (!found) {
          // Try: system token contains bank token as substring (e.g., "ابوبيض" contains "ابو")
          const bankContained = bankTokensAr.filter(bt => bt.length >= 2 && sToken.includes(bt));
          if (bankContained.length >= 1) {
            // Check if remaining part also matches another bank token
            let remainingMatched = false;
            for (const bc of bankContained) {
              const remaining = sToken.replace(bc, '');
              if (remaining.length >= 2) {
                for (const bt2 of bankTokensAr) {
                  if (bt2 !== bc && (this._tokensMatch(bt2, remaining) || this.phoneticMatch(bt2, remaining).match)) {
                    remainingMatched = true;
                    break;
                  }
                }
              }
            }
            if (remainingMatched) found = true;
          }
        }
        if (found) compoundMatched++;
      }
      if (totalSystem > 0 && compoundMatched === totalSystem) {
        return { score: 92, method: 'compound_match', matched_candidate: bankName };
      }
      // partial_compound: STRICT v2
      // For 2-token names: BOTH tokens must match via compound.
      // Single token match is NEVER enough for 2-token names because
      // common names like "محمد" appear in almost every bank transfer.
      // For 3+ token names: require first name match + at least 2 total.
      if (totalSystem >= 2 && compoundMatched >= totalSystem - 1 && compoundMatched >= 1) {
        if (totalSystem === 2) {
          // 2-token name: BOTH must match — no partial allowed
          if (compoundMatched === 2) {
            return { score: 75, method: 'partial_compound', matched_candidate: bankName };
          }
          // Only 1 of 2 matched — never enough
          return { score: 20, method: 'single_token_compound', matched_candidate: bankName };
        } else {
          // 3+ token name: need first name + at least half matched
          const firstSystemMatched = bankTokensAr.some(bt => this._tokensMatch(bt, systemTokensAr[0])) ||
            bankTokensAr.some(bt => this.phoneticMatch(bt, systemTokensAr[0]).match);
          if (firstSystemMatched && compoundMatched >= 2) {
            return { score: 75, method: 'partial_compound', matched_candidate: bankName };
          }
          if (compoundMatched >= Math.ceil(totalSystem * 0.6)) {
            return { score: 65, method: 'majority_compound', matched_candidate: bankName };
          }
          return { score: 25, method: 'weak_partial_compound', matched_candidate: bankName };
        }
      }
      }

    // ── Stage 4: Phonetic matching fallback ──
    const phoneticMatches = systemTokensAr.filter(sToken =>
      bankTokensAr.some(bToken => this.phoneticMatch(bToken, sToken).match)
    ).length;

    if (totalSystem > 0 && phoneticMatches === totalSystem) {
      return { score: 90, method: 'full_phonetic', matched_candidate: bankName };
    }

    if (totalSystem >= 2 && phoneticMatches >= totalSystem - 1 && phoneticMatches >= 2) {
      const nearPhoneticScore = totalSystem === 2 ? (phoneticMatches === totalSystem ? 55 : 35) : 45;
      return { score: nearPhoneticScore, method: 'near_phonetic', matched_candidate: bankName };
    }

    // ── Stage 5: First-token-only match ──
    if (bankTokensAr.length > 0 && systemTokensAr.length > 0) {
      if (this._tokensMatch(bankTokensAr[0], systemTokensAr[0]) ||
          this.phoneticMatch(bankTokensAr[0], systemTokensAr[0]).match) {
        return { score: 35, method: 'first_token_only', matched_candidate: bankName };
      }
    }

    // ── Stage 6: Fuzzy last resort ──
    const fuzzyScore = this._fuzzyTokenSetScore(bankTokensAr, systemTokensAr);
    if (fuzzyScore >= 70) {
      return { score: Math.round(fuzzyScore * 0.85), method: 'fuzzy', matched_candidate: bankName };
    }

    return { score: 0, method: 'no_match', matched_candidate: '' };
  }

  // ════════════════════════════════════════════════
  // COMMON NAME FILTER
  // ════════════════════════════════════════════════

  /** Names that are too common to be distinctive alone */
  static _commonNames = new Set([
    'محمد', 'احمد', 'محمود', 'علي', 'ابراهيم', 'عبدالله', 'خالد', 'عمر',
    'يوسف', 'حسن', 'حسين', 'سعيد', 'صالح', 'مصطفى', 'عبد', 'ماجد',
    'نادر', 'فايز', 'سامي', 'رامي', 'هاني', 'وليد', 'خليل', 'جمال',
    'ايمان', 'مريم', 'اسماء', 'نور',
    // English common equivalents
    'mohammed', 'mohammad', 'ahmed', 'mahmoud', 'ali', 'ibrahim',
    'khalid', 'omar', 'yousef', 'hassan', 'hussein', 'said',
    'mustafa', 'sami', 'rami', 'hani', 'walid', 'mohamed',
  ]);

  // ════════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ════════════════════════════════════════════════

  /**
   * Strict token comparison:
   * - Tokens <= 4 chars: require EXACT match (prevents جمال ↔ جميل)
   * - Tokens 5-7 chars: allow Levenshtein distance = 1
   * - Tokens >= 8 chars: allow Levenshtein distance = 2
   * - Length difference > 1: reject
   */
  static _tokensMatch(token1, token2) {
    if (!token1 || !token2) return false;
    if (token1 === token2) return true;

    const longer = Math.max(token1.length, token2.length);
    if (Math.abs(token1.length - token2.length) > 1) return false;

    const dist = this._levenshtein(token1, token2);

    // GUARD: If first characters differ and dist<=1, it means a letter was
    // prepended/removed at the start → likely different names
    // e.g., روان vs مروان (dist=1 but completely different people)
    if (dist > 0 && token1[0] !== token2[0]) return false;

    // Short tokens: exact only
    if (longer <= 4) return false;
    // Medium tokens: dist <= 1
    if (longer >= 5 && dist <= 1) return true;
    // Long tokens: dist <= 2
    if (longer >= 8 && dist <= 2) return true;

    return false;
  }

  /**
   * Fuzzy token-set comparison using Levenshtein.
   * Returns percentage of tokens matched (0-100).
   */
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

  /** Standard Levenshtein distance */
  static _levenshtein(a, b) {
    if (!a || !b) return Math.max((a || '').length, (b || '').length);
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[m][n];
  }

  /** Levenshtein similarity ratio (0.0 - 1.0) */
  static levenshteinSimilarity(a, b) {
    const longer = Math.max((a || '').length, (b || '').length);
    if (longer === 0) return 1.0;
    return (longer - this._levenshtein(a, b)) / longer;
  }

  // ════════════════════════════════════════════════
  // BACKWARD COMPATIBILITY HELPERS
  // ════════════════════════════════════════════════

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
      } catch (e) { /* ignore parse errors */ }
    }
    return Array.from(candidates).filter(c => c.length >= 2);
  }
}

module.exports = NameNormalizer;
