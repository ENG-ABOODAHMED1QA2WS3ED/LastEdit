const crypto = require('crypto');

function calculateTransactionHash(tx) {
  const date   = normalizeDate(tx.date || tx.transaction_date || '');
  const amount = normalizeAmount(tx.amount || 0);
  const desc   = normalizeDescription(tx.raw_description || tx.description || '');
  const ref    = (tx.tx_reference || tx.reference || '').trim();

  const key = ref
    ? `${date}|${amount}|${desc}|${ref}`
    : `${date}|${amount}|${desc}`;

  return crypto
    .createHash('sha256')
    .update(key, 'utf8')
    .digest('hex')
    .substring(0, 16);
}

function normalizeDate(d) {
  if (!d) return 'NO_DATE';
  const cleaned = d.toString().trim().replace(/[\/\.]/g, '-');
  const parts = cleaned.split('-');
  if (parts.length === 3 && parts[0].length === 2) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return cleaned;
}

function normalizeAmount(a) {
  const n = parseFloat(
    a.toString().replace(/[,\u0660-\u0669\s]/g, '').replace(/[^0-9.\-]/g, '')
  );
  return isNaN(n) ? '0' : Math.abs(n).toFixed(2);
}

function normalizeDescription(d) {
  if (!d) return 'NO_DESC';
  return d
    .toString()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\u0600-\u06FF\w\s\/\-\.]/g, '')
    .toLowerCase()
    .substring(0, 150);
}

module.exports = { calculateTransactionHash };