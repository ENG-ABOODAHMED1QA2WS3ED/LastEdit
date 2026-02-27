/**
 * Input sanitization for bank statement imports
 * Handles both array and object formats
 * Parses dates in multiple formats
 * 
 * @module input-sanitizer
 */

const crypto = require('crypto');

class InputSanitizer {

  /**
   * Parse date from ANY format to ISO YYYY-MM-DD
   * @param {string} dateStr
   * @returns {string} ISO format "YYYY-MM-DD"
   */
  static parseDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
      throw new Error(`Invalid date: ${dateStr}`);
    }

    const cleaned = dateStr.trim();

    const patterns = [
      { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: 'DMY' },
      { regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: 'DMY' },
      { regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: 'YMD' },
      { regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, order: 'DMY' }
    ];

    for (const pattern of patterns) {
      const match = cleaned.match(pattern.regex);
      if (!match) continue;

      let year, month, day;

      if (pattern.order === 'DMY') {
        day = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
      } else {
        year = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        day = parseInt(match[3], 10);
      }

      // Auto-fix swapped day/month
      if (month > 12 && day <= 12) {
        [day, month] = [month, day];
      }

      if (month < 1 || month > 12 || day < 1 || day > 31) continue;
      if (year < 2020 || year > 2030) continue;

      // Validate date is real (not Feb 30, etc)
      const dateObj = new Date(year, month - 1, day);
      if (
        dateObj.getFullYear() !== year ||
        dateObj.getMonth() !== month - 1 ||
        dateObj.getDate() !== day
      ) {
        continue;
      }

      const mm = month.toString().padStart(2, '0');
      const dd = day.toString().padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }

    throw new Error(
      `Cannot parse date '${dateStr}'. ` +
      `Expected: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD.MM.YYYY`
    );
  }

  /**
   * Parse amount from number or string
   * @param {number|string} amountInput
   * @returns {number} Positive number
   */
  static parseAmount(amountInput) {
    if (typeof amountInput === 'number') {
      if (isNaN(amountInput) || amountInput <= 0) {
        throw new Error(`Invalid amount: ${amountInput}`);
      }
      return Math.abs(amountInput);
    }

    if (typeof amountInput === 'string') {
      const cleaned = amountInput.replace(/[$,\s]/g, '').trim();
      const parsed = parseFloat(cleaned);

      if (isNaN(parsed) || parsed <= 0) {
        throw new Error(`Invalid amount: ${amountInput}`);
      }

      return parsed;
    }

    throw new Error(`Invalid amount type: ${typeof amountInput}`);
  }

  /**
   * Normalize a single row (handles both array and object)
   * @param {Array|Object} row
   * @param {number} rowIndex
   * @returns {{date: string, description: string, amount: number, reference: string|null}}
   */
  static normalizeRow(row, rowIndex) {
    // ARRAY FORMAT: [date, description, amount, ...]
    if (Array.isArray(row)) {
      if (row.length < 3) {
        throw new Error(`Row ${rowIndex}: Array needs 3+ elements`);
      }

      return {
        date: this.parseDate(String(row[0] || '')),
        description: String(row[1] || '').trim(),
        amount: this.parseAmount(row[2]),
        reference: row[3] ? String(row[3]).trim() : null
      };
    }

    // OBJECT FORMAT: {date, description, amount, ...}
    if (typeof row === 'object' && row !== null) {
      const date = row.date || row.transaction_date || row.Date;
      const description =
        row.description || row.payer_name || row.name ||
        row.desc || row.Description;
      const amount = row.amount !== undefined ? row.amount : row.Amount;

      if (!date) {
        throw new Error(
          `Row ${rowIndex}: Missing date. Keys: ${Object.keys(row).join(', ')}`
        );
      }
      if (!description) {
        throw new Error(
          `Row ${rowIndex}: Missing description. Keys: ${Object.keys(row).join(', ')}`
        );
      }
      if (amount === undefined || amount === null) {
        throw new Error(
          `Row ${rowIndex}: Missing amount. Keys: ${Object.keys(row).join(', ')}`
        );
      }

      return {
        date: this.parseDate(String(date)),
        description: String(description).trim(),
        amount: this.parseAmount(amount),
        reference: row.reference || null
      };
    }

    throw new Error(`Row ${rowIndex}: Invalid format (not array or object)`);
  }

  /**
   * Sanitize entire batch - never throws, collects errors
   * @param {Array} rows
   * @returns {{sanitized: Array, errors: Array}}
   */
  static sanitizeBatch(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { sanitized: [], errors: [{ row: 0, error: 'Empty or invalid input' }] };
    }

    console.log(`[InputSanitizer] Processing ${rows.length} rows`);
    console.log(`[InputSanitizer] First row type: ${Array.isArray(rows[0]) ? 'array' : typeof rows[0]}`);
    console.log(`[InputSanitizer] First row sample:`, JSON.stringify(rows[0]).substring(0, 200));

    const sanitized = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const normalized = this.normalizeRow(rows[i], i + 1);
        sanitized.push(normalized);
      } catch (error) {
        console.error(`[InputSanitizer] Row ${i + 1} failed:`, error.message);
        errors.push({ row: i + 1, error: error.message, raw: rows[i] });
      }
    }

    console.log(`[InputSanitizer] Result: ${sanitized.length} ok, ${errors.length} errors`);
    return { sanitized, errors };
  }

  /**
   * Calculate SHA256 hash for deduplication
   * @param {{date: string, description: string, amount: number, reference: string|null}} row
   * @returns {string} hex hash
   */
  static calculateHash(row) {
    const date = row.date;
    const amount = Number(row.amount).toFixed(2);
    const name = (row.description || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const ref = row.reference || '';

    const str = `${date}|${amount}|${name}|${ref}`;
    return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
  }
}

module.exports = InputSanitizer;
