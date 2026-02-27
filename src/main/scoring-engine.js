// scoring-engine.js - v9.0 Soft Gates + Penalty System
const NameNormalizer = require('./name-normalizer');
const matchingConfig = require('../config/matching-config');

class ScoringEngine {

  constructor(config) {
    this.config = config || matchingConfig;
  }

  // === AMOUNT TOLERANCE (Dynamic) ===
  static calculateTolerance(amount) {
    if (!amount || amount <= 0) return 0.5;
    if (amount <= 50) return 0.50;
    if (amount <= 500) return 1.00;
    if (amount <= 5000) return amount * 0.002;
    return Math.min(amount * 0.001, 10.0);
  }

  // === SOFT GATES (Penalty-based, never fully block except extreme cases) ===
  checkSoftGates(bankTx, payment, customer, aliases) {
    const cfg = this.config || matchingConfig;
    let totalPenalty = 0;
    const penalties = [];

    // --- GATE 1: Amount Penalty ---
    const bankAmt = bankTx.amount || 0;
    const payAmt = payment.amount || 0;

    if (payAmt > 0 && bankAmt > 0) {
      const ratio = bankAmt / payAmt;

      // Hard block: more than 5x (configurable)
      if (ratio > (cfg.amount_block_multiplier || 5)) {
        return {
          passed: false,
          reason: 'amount_blocked_' + bankAmt + '_vs_' + payAmt + '_ratio_' + ratio.toFixed(1),
          penalties: [{ gate: 'amount', penalty: 100, detail: 'exceeds ' + cfg.amount_block_multiplier + 'x' }]
        };
      }
      // Hard block: less than 5% of expected
      if (ratio < (cfg.amount_min_ratio || 0.05)) {
        return {
          passed: false,
          reason: 'amount_too_small_' + bankAmt + '_vs_' + payAmt,
          penalties: [{ gate: 'amount', penalty: 100, detail: 'below ' + ((cfg.amount_min_ratio || 0.05) * 100) + '%' }]
        };
      }

      // NOTE: Amount scoring is handled ONLY by scoreAmount().
      // Do NOT add amount penalties here  it would double-punish.
      // Only hard blocks above (> 5x, < 5%) remain as gates.
    }

    // --- GATE 2: Date  hard block only (> 365 days) ---
    // NOTE: Date scoring is handled ONLY by scoreDate(). 
    // Do NOT add date penalties here  it would double-punish.
    if (bankTx.parsed_date && payment.created_at) {
      const bankDate = new Date(bankTx.parsed_date);
      const payDate = new Date(payment.created_at);
      if (!isNaN(bankDate) && !isNaN(payDate)) {
        const diffDays = Math.abs((bankDate - payDate) / 86400000);
        if (diffDays > (cfg.date_hard_limit_days || 365)) {
          return {
            passed: false,
            reason: 'date_blocked_' + Math.round(diffDays) + '_days',
            penalties: [{ gate: 'date', penalty: 100, detail: 'exceeds ' + cfg.date_hard_limit_days + ' days' }]
          };
        }
      }
    }

    return {
      passed: true,
      reason: 'gates_passed',
      totalPenalty: Math.min(totalPenalty, 90),  // Cap: never penalize more than 90%
      penalties
    };
  }

  // === COMPONENT SCORES (all return 0-100) ===

  scoreAmount(bankAmount, paymentAmount) {
    if (!bankAmount || !paymentAmount) return 0;
    const diff = Math.abs(bankAmount - paymentAmount);
    const tolerance = ScoringEngine.calculateTolerance(paymentAmount);

    if (diff < 0.01) return 100;
    if (diff <= tolerance * 0.5) return 95;
    if (diff <= tolerance) return 85;
    // partial payment scoring
    if (bankAmount < paymentAmount && bankAmount >= paymentAmount * 0.5) return 70;
    if (bankAmount < paymentAmount && bankAmount >= paymentAmount * 0.1) return 50;
    // overpay scoring
    if (bankAmount > paymentAmount) {
      const ratio = bankAmount / paymentAmount;
      if (ratio <= 1.20) return 80;
      if (ratio <= 2.00) return 60;
      if (ratio <= 3.00) return 40;
      return 20;
    }
    return 0;
  }

  scoreName(bankTx, custName, aliases) {
    const candidates = NameNormalizer.buildNameCandidates(bankTx);
    if (candidates.length === 0) {
      const fallback = bankTx.parsed_name || bankTx.raw_description || '';
      if (fallback) candidates.push(fallback);
    }
    const result = NameNormalizer.calculateNameScore(candidates, custName, aliases);
    return { score: result.score, details: result };
  }

  scoreDate(bankDate, paymentDate) {
    if (!bankDate || !paymentDate) return 30;
    const d1 = new Date(bankDate);
    const d2 = new Date(paymentDate);
    if (isNaN(d1) || isNaN(d2)) return 30;
    const diffDays = Math.abs((d1 - d2) / 86400000);

    if (diffDays <= 1) return 100;
    if (diffDays <= 3) return 90;
    if (diffDays <= 7) return 80;
    if (diffDays <= 14) return 70;
    if (diffDays <= 30) return 60;
    if (diffDays <= 60) return 40;
    return 20;
  }

  scoreReference(bankTx, payment) {
    if (bankTx.reference_number && payment.invoice_id) {
      const ref = bankTx.reference_number.toString();
      const inv = payment.invoice_id.toString();
      if (ref.includes(inv) || inv.includes(ref)) return 100;
    }
    if (bankTx.raw_description && payment.invoice_id) {
      if (bankTx.raw_description.includes(payment.invoice_id.toString())) return 80;
    }
    return 0;
  }

  // === FINAL CONFIDENCE CALCULATION ===

  calculate(bankTx, payment, customer, aliases) {
    const custName = customer.name || payment.customer_name || '';

    // Step 1: Soft Gates (penalty-based)
    const gates = this.checkSoftGates(bankTx, payment, customer, aliases);
    if (!gates.passed) {
      return {
        totalScore: 0, confidence: 0, level: 'blocked',
        reason: gates.reason,
        breakdown: { gates: 'BLOCKED: ' + gates.reason, penalties: gates.penalties }
      };
    }

    // Step 2: Component Scores (all 0-100)
    const nameResult = this.scoreName(bankTx, custName, aliases);
    const amountScore = this.scoreAmount(bankTx.amount, payment.amount);
    const dateScore = this.scoreDate(bankTx.parsed_date, payment.created_at);
    const refScore = this.scoreReference(bankTx, payment);

    // Step 3: Weighted Total (0-100)
    // Name 35%, Amount 35%, Date 20%, Reference 10%
    let totalScore = Math.round(
      nameResult.score * 0.35 +
      amountScore * 0.35 +
      dateScore * 0.20 +
      refScore * 0.10
    );

    // Step 4: No penalty application needed
    // Amount and date scoring is handled by scoreAmount() and scoreDate() only.
    // Gates only do hard blocks for extreme cases (> 5x amount, > 365 days).

    const confidence = totalScore / 100;

    // Step 5: Decision thresholds
    let level;
    if (totalScore >= 90) level = 'auto_confirmed';
    else if (totalScore >= 55) level = 'suggested';
    else level = 'unmatched';

    const breakdown = {
      name_score: nameResult.score,
      name_method: nameResult.details ? nameResult.details.method : '',
      name_candidate: nameResult.details ? nameResult.details.matched_candidate : '',
      amount_score: amountScore,
      date_score: dateScore,
      ref_score: refScore,
      total: totalScore,
      gates: 'PASSED',
      gate_penalty: gates.totalPenalty,
      gate_details: gates.penalties
    };

    // Partial payment info
    const tolerance = ScoringEngine.calculateTolerance(payment.amount);
    const isPartial = bankTx.amount < payment.amount - tolerance;
    const remainingAfter = isPartial ? payment.amount - bankTx.amount : 0;

    console.log('[Score] ' + custName + ' vs ' + (bankTx.payer_name || bankTx.parsed_name) + ': total=' + totalScore + ' name=' + nameResult.score + '(' + (nameResult.details?.method || '') + ') amount=' + amountScore + ' date=' + dateScore + ' penalty=' + (gates.totalPenalty || 0));

    return { totalScore, confidence, level, breakdown, reason: 'scored', isPartial, remainingAfter };
  }
}

module.exports = ScoringEngine;