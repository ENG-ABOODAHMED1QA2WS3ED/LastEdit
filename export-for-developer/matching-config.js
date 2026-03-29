// matching-config.js - إعدادات محرك المطابقة الموحّدة
module.exports = {
  // === عتبات القبول ===
  AUTO_CONFIRM_THRESHOLD: 95,
  SUGGEST_THRESHOLD: 60,

  // === أوزان الحساب النهائي ===
  WEIGHTS: {
    name:    0.50,
    amount:  0.30,
    date:    0.15,
    context: 0.05,
  },

  // === بونص ===
  HOME_TRANSFER_BONUS: 5,

  // === حدود المبالغ ===
  AMOUNT_MIN_RATIO: 0.20,
  AMOUNT_MAX_RATIO: 1.20,
  AMOUNT_EXACT_TOLERANCE: 2,

  // === حدود التواريخ ===
  DATE_HARD_LIMIT_DAYS: 365,
  DATE_NORMAL_DAYS: 30,
  DATE_DELAYED_DAYS: 60,
  DATE_VERY_DELAYED_DAYS: 90,
  DATE_PENALTY_DELAYED: 10,
  DATE_PENALTY_VERY_DELAYED: 20,

  // === حدود الأسماء ===
  NAME_MIN_SCORE: 40,
  NAME_MIN_SCORE_PARTIAL: 65,
  NAME_PHONE_SCORE: 85,

  // === نقاط السياق ===
  CONTEXT_HOME_TRANSFER: 65,
  CONTEXT_NORMAL: 40,

  // === أوزان Layer2 (لما الاسم من التعلم) ===
  LEARNED_NAME_WEIGHT: 0.65,
  LEARNED_AMOUNT_WEIGHT: 0.35,

  // === حدود الدفعات الجزئية ===
  PARTIAL_SAFE_PCT: 20,
  PARTIAL_WARNING_PCT: 50,
  PARTIAL_MIN_THRESHOLD: 75,
  FULL_MIN_THRESHOLD: 70,
};
