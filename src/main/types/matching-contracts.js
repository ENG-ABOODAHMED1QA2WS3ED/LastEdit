/**
 * ABU KAMIL POS - MATCHING SYSTEM DATA CONTRACTS
 * Single Source of Truth for all data structures
 * 
 * @module matching-contracts
 */

/**
 * @typedef {Object} BankTransaction
 * @property {number} id - INTEGER PRIMARY KEY (SQLite AUTOINCREMENT)
 * @property {string} import_batch_id
 * @property {number} row_number
 * @property {string} raw_date - "21/02/2026" as received
 * @property {string} raw_description - "Omar Ali Mohammed" original
 * @property {number} raw_amount
 * @property {string} parsed_date - "2026-02-21" ISO format
 * @property {string} parsed_name - Normalized name
 * @property {number} amount
 * @property {string} transaction_hash - SHA256 for deduplication
 * @property {('pending'|'matched_manual'|'matched_auto')} match_status
 * @property {string} file_name
 */

/**
 * @typedef {Object} Payment
 * @property {number} id - INTEGER PRIMARY KEY
 * @property {number} amount
 * @property {('transfer'|'cash'|'check')} method
 * @property {('pending'|'confirmed'|'partial')} status
 * @property {number} invoice_id
 * @property {number} customer_id
 * @property {string} customer_name
 */

/**
 * What runMatching() returns
 * @typedef {Object} MatchingEngineResult
 * @property {boolean} success
 * @property {SuggestedMatch[]} auto_confirmed - score >= 95
 * @property {SuggestedMatch[]} suggested - score 75-94
 * @property {BankTransaction[]} unmatched_bank
 * @property {Payment[]} unmatched_payments
 */

/**
 * @typedef {Object} SuggestedMatch
 * @property {number} bank_transaction_id
 * @property {Object} bank_transaction
 * @property {PaymentCandidate[]} payments
 * @property {number} score - 0-100
 * @property {number} confidence - 0-1
 * @property {string} type
 * @property {MatchBreakdown} breakdown
 */

/**
 * CRITICAL: uses payment_id, NOT id
 * @typedef {Object} PaymentCandidate
 * @property {number} payment_id
 * @property {number} amount
 * @property {string} customer_name
 * @property {number} invoice_id
 * @property {number} customer_id
 */

/**
 * @typedef {Object} MatchBreakdown
 * @property {number} name - 0-100
 * @property {number} amount - 0-100
 * @property {number} date - 0-100
 * @property {number} confidence - 0-100
 * @property {string} gates - "PASSED" | "FAILED: reason"
 */

module.exports = {};
