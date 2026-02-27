// matching-config.js - إعدادات محرك المطابقة
module.exports = {
  // === Amount Gates ===
  amount_block_multiplier: 5,      // رفض مطلق: أكثر من 5 أضعاف
  amount_min_ratio: 0.05,          // رفض مطلق: أقل من 5% من المبلغ

  // === Date Gates ===
  date_soft_limit_days: 90,        // الحد الطبيعي
  date_hard_limit_days: 365,       // الحد الأقصى المطلق

  // === Amount Penalty Tiers ===
  // bankAmount vs paymentAmount ratio penalties
  amount_penalties: {
    exact:     { max_ratio: 1.01, penalty: 0   },  // تطابق تام (1%)
    partial:   { min_ratio: 0.05, penalty: 10  },  // دفع جزئي
    over_low:  { max_ratio: 1.20, penalty: 15  },  // زيادة حتى 20%
    over_mid:  { max_ratio: 2.00, penalty: 30  },  // زيادة 20-100%
    over_high: { max_ratio: 3.00, penalty: 50  },  // زيادة 100-200%
    over_max:  { max_ratio: 5.00, penalty: 70  }   // زيادة 200-400%
  },

  // === Date Penalty Tiers ===
  date_penalties: {
    week:      { max_days: 7,   penalty: 0  },
    month:     { max_days: 30,  penalty: 10 },
    quarter:   { max_days: 90,  penalty: 25 },
    half_year: { max_days: 180, penalty: 50 },
    beyond:    { max_days: 365, penalty: 70 }
  }
};