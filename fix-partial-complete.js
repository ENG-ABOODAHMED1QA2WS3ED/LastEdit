const fs = require("fs");
const path = require("path");

// ===================== FIX matching-engine.js =====================
const enginePath = path.join("src", "main", "matching-engine.js");
let engine = fs.readFileSync(enginePath, "utf8");
fs.writeFileSync(enginePath + ".bak6", engine);
console.log("Backup: " + enginePath + ".bak6");

let engineFixes = 0;

// ═══════════════════════════════════════════════════════════════
// FIX A: _acceptResult → NEVER auto-confirm, ALL go to suggestions
// ═══════════════════════════════════════════════════════════════
// Find the _acceptResult function and replace completely
const acceptResultRegex = /_acceptResult\s*\([^)]*\)\s*\{[\s\S]*?usedBankIds\.add\([^)]*\);\s*\}/;
const acceptResultMatch = engine.match(acceptResultRegex);

if (acceptResultMatch) {
  const newAcceptResult = `_acceptResult(result, autoConfirmed, suggested, usedPaymentIds, usedBankIds) {
    // ═══ AUTO-CONFIRM COMPLETELY DISABLED (Safety Mode) ═══
    // ALL matches from ALL layers go to suggestions - requires manual approval
    suggested.push(formatMatch(result));
    usedPaymentIds.add(result.payment.id);
    usedBankIds.add(result.bankTxn.id);
  }`;
  engine = engine.replace(acceptResultMatch[0], newAcceptResult);
  console.log("FIX A applied: _acceptResult now sends ALL matches to suggestions");
  engineFixes++;
} else {
  // Try alternate pattern - maybe it was partially fixed before
  const altPattern = /_acceptResult\s*\([^)]*\)\s*\{[^}]*suggested\.push\(formatMatch\(result\)\)[^}]*\}/;
  if (engine.match(altPattern)) {
    console.log("FIX A: _acceptResult already fixed (sends to suggestions)");
    engineFixes++;
  } else {
    console.log("WARN FIX A: _acceptResult pattern not found - manual check needed");
  }
}

// ═══════════════════════════════════════════════════════════════
// FIX B: getMatchType → strict comparison, 2₪ difference = PARTIAL
// ═══════════════════════════════════════════════════════════════
const getMatchTypeRegex = /function getMatchType\s*\(txAmount,\s*invoiceAmount\)\s*\{[\s\S]*?\}/;
const getMatchTypeMatch = engine.match(getMatchTypeRegex);

if (getMatchTypeMatch) {
  const newGetMatchType = `function getMatchType(txAmount, invoiceAmount) {
    // Strict tolerance: only 0.5₪ or 1% (whichever is smaller)
    const tolerance = Math.min(0.5, invoiceAmount * 0.01);
    if (Math.abs(txAmount - invoiceAmount) <= tolerance) return 'full';
    if (txAmount < invoiceAmount) return 'partial';
    return 'over';
  }`;
  engine = engine.replace(getMatchTypeMatch[0], newGetMatchType);
  console.log("FIX B applied: getMatchType now uses strict tolerance (0.5₪ or 1%)");
  console.log("  → 18₪ vs 20₪ = PARTIAL (diff 2₪ > tolerance 0.2₪)");
  engineFixes++;
} else {
  console.log("WARN FIX B: getMatchType not found");
}

// ═══════════════════════════════════════════════════════════════
// FIX C: formatMatch → ensure shortage fields are always passed through
// ═══════════════════════════════════════════════════════════════
// Make sure formatMatch calculates shortage if not provided
const formatMatchRegex = /function formatMatch\s*\(m\)\s*\{/;
const fmMatch = engine.match(formatMatchRegex);

if (fmMatch) {
  const insertAfter = fmMatch[0];
  const shortageCalc = `function formatMatch(m) {
    // ═══ Auto-calculate shortage if not set ═══
    const bankAmount = m.bankTxn ? m.bankTxn.amount : 0;
    const invoiceAmt = m.payment ? (m.payment.total_amount || m.payment.amount || 0) : 0;
    if (!m.match_type) {
      const tol = Math.min(0.5, invoiceAmt * 0.01);
      if (Math.abs(bankAmount - invoiceAmt) <= tol) m.match_type = 'full';
      else if (bankAmount < invoiceAmt) m.match_type = 'partial';
      else m.match_type = 'over';
    }
    if (m.match_type === 'partial' && !m.shortage_amount) {
      m.shortage_amount = invoiceAmt - bankAmount;
    }
    if (m.match_type === 'partial' && !m.security_level) {
      const pct = invoiceAmt > 0 ? (m.shortage_amount / invoiceAmt) * 100 : 0;
      m.security_level = pct <= 5 ? 'safe' : pct <= 15 ? 'warning' : 'danger';
    }`;
  engine = engine.replace(insertAfter, shortageCalc);
  console.log("FIX C applied: formatMatch auto-calculates shortage fields");
  engineFixes++;
} else {
  console.log("WARN FIX C: formatMatch not found");
}

// ═══════════════════════════════════════════════════════════════
// FIX D: Layer 2.5 grouped results → include total shortage info
// ═══════════════════════════════════════════════════════════════
// Find where Layer 2.5 creates the grouped result and add shortage calculation
const groupedPattern = /match_type:\s*['"]grouped_complementary['"]/g;
let groupedCount = 0;
let groupedPos;
while ((groupedPos = groupedPattern.exec(engine)) !== null) {
  groupedCount++;
}

if (groupedCount > 0) {
  // Add total_invoice_amount and shortage info to grouped results
  // Find the grouped suggestion push and ensure it includes shortage info
  const groupedSuggestionPattern = /grouped_payments:\s*groupedPayments[\s\S]*?confidence_note:\s*['"][^'"]*['"]/;
  const groupedSuggMatch = engine.match(groupedSuggestionPattern);
  
  if (groupedSuggMatch) {
    const oldGrouped = groupedSuggMatch[0];
    // Check if shortage_amount already in the grouped section
    if (!oldGrouped.includes('total_grouped_amount')) {
      const newGrouped = oldGrouped + `,
              total_grouped_amount: groupedTotal,
              total_invoice_shortage: Math.max(0, groupedTotal - bankTxn.amount),
              grouped_match_type: Math.abs(groupedTotal - bankTxn.amount) <= 0.5 ? 'full' : bankTxn.amount < groupedTotal ? 'partial' : 'over',
              grouped_shortage_pct: groupedTotal > 0 ? ((Math.max(0, groupedTotal - bankTxn.amount)) / groupedTotal * 100).toFixed(1) : 0`;
      engine = engine.replace(oldGrouped, newGrouped);
      console.log("FIX D applied: Layer 2.5 grouped results now include shortage calculations");
      engineFixes++;
    } else {
      console.log("FIX D: grouped shortage info already present");
      engineFixes++;
    }
  } else {
    console.log("WARN FIX D: grouped suggestion pattern not found exactly");
  }
} else {
  console.log("WARN FIX D: no grouped_complementary found in engine");
}

fs.writeFileSync(enginePath, engine);
console.log("\n✅ matching-engine.js: " + engineFixes + " fixes applied\n");

// ===================== FIX matching.js (renderer) =====================
const matchingPath = path.join("src", "renderer", "scripts", "matching.js");
let matching = fs.readFileSync(matchingPath, "utf8");
fs.writeFileSync(matchingPath + ".bak3", matching);
console.log("Backup: " + matchingPath + ".bak3");

let renderFixes = 0;

// ═══════════════════════════════════════════════════════════════
// FIX E: renderMatchCard → better partial payment display with shortage warning
// ═══════════════════════════════════════════════════════════════
// Find the partialHtml section
const partialRegex = /\/\/\s*(?:جزئي|partial)\s*\n\s*let partialHtml\s*=\s*['"](?:['"])?;[\s\S]*?(?:partialHtml\s*\+=[\s\S]*?['"];?\s*\}|\}\s*(?=\n\s*\/\/|\n\s*let\s+(?:alt|grouped)))/;
const partialMatch = matching.match(partialRegex);

if (partialMatch) {
  const newPartial = `// === Partial Payment Detection (Enhanced) ===
  let partialHtml = '';
  {
    // Determine effective amounts based on match type
    let effectiveInvoiceTotal = 0;
    let effectivePaid = 0;
    
    if (m.match_type === 'grouped_complementary' && m.grouped_payments) {
      // For grouped matches: sum all invoice amounts
      effectiveInvoiceTotal = m.grouped_payments.reduce(function(sum, p) { return sum + (p.amount || 0); }, 0);
      effectivePaid = m.bankTxn ? m.bankTxn.amount : (m.amount_paid || 0);
    } else {
      effectiveInvoiceTotal = m.invoice_amount || 0;
      effectivePaid = m.amount_paid || (m.bankTxn ? m.bankTxn.amount : 0);
    }
    
    const effectiveShortage = Math.max(0, effectiveInvoiceTotal - effectivePaid);
    const shortagePct = effectiveInvoiceTotal > 0 ? (effectiveShortage / effectiveInvoiceTotal * 100) : 0;
    
    if (effectiveShortage > 0.5) {
      // Determine severity
      let severityClass = 'safe';
      let severityIcon = '\\u26A0\\uFE0F';
      let severityText = '\\u0646\\u0642\\u0635 \\u0628\\u0633\\u064A\\u0637';
      
      if (shortagePct > 15) {
        severityClass = 'danger';
        severityIcon = '\\u274C';
        severityText = '\\u0646\\u0642\\u0635 \\u0643\\u0628\\u064A\\u0631';
      } else if (shortagePct > 5) {
        severityClass = 'warning';
        severityIcon = '\\u26A0\\uFE0F';
        severityText = '\\u0646\\u0642\\u0635 \\u0645\\u062A\\u0648\\u0633\\u0637';
      }
      
      const paidPct = effectiveInvoiceTotal > 0 ? (effectivePaid / effectiveInvoiceTotal * 100).toFixed(0) : 0;
      
      partialHtml = '<div class="partial-box ' + severityClass + '">' +
        '<div class="partial-header">' + severityIcon + ' <strong>' + severityText + '!</strong></div>' +
        '<div class="partial-details">' +
          '<div>\\u0627\\u0644\\u0645\\u0637\\u0644\\u0648\\u0628: <strong>' + effectiveInvoiceTotal.toFixed(2) + ' \\u20AA</strong></div>' +
          '<div>\\u0627\\u0644\\u0645\\u062D\\u0648\\u0651\\u0644: <strong>' + effectivePaid.toFixed(2) + ' \\u20AA</strong></div>' +
          '<div class="shortage-highlight">\\u0627\\u0644\\u0645\\u062A\\u0628\\u0642\\u064A: <strong>' + effectiveShortage.toFixed(2) + ' \\u20AA</strong></div>' +
        '</div>' +
        '<div class="partial-progress">' +
          '<div class="partial-bar ' + severityClass + '" style="width:' + paidPct + '%"></div>' +
          '<span>' + paidPct + '% \\u0645\\u062F\\u0641\\u0648\\u0639</span>' +
        '</div>' +
        '<div class="security-tag ' + severityClass + '">' +
          (severityClass === 'danger' ? '\\u063A\\u064A\\u0631 \\u0622\\u0645\\u0646' : 
           severityClass === 'warning' ? '\\u062A\\u062D\\u0642\\u0642 \\u0645\\u0637\\u0644\\u0648\\u0628' : '\\u0622\\u0645\\u0646 \\u0646\\u0633\\u0628\\u064A\\u0627\\u064B') +
        '</div>' +
      '</div>';
    }
  }`;
  matching = matching.replace(partialMatch[0], newPartial);
  console.log("FIX E applied: Enhanced partial payment display with shortage warning");
  renderFixes++;
} else {
  console.log("WARN FIX E: partialHtml section not found - trying alternate approach");
  
  // Try to find just "let partialHtml = '';" and replace
  const simplePartialPattern = /let partialHtml\s*=\s*['"]['"]\s*;/;
  const simpleMatch = matching.match(simplePartialPattern);
  if (simpleMatch) {
    // Insert the enhanced logic after this line
    const enhancedPartial = `let partialHtml = '';
  {
    let effectiveInvoiceTotal = (m.match_type === 'grouped_complementary' && m.grouped_payments) ?
      m.grouped_payments.reduce(function(sum, p) { return sum + (p.amount || 0); }, 0) : (m.invoice_amount || 0);
    let effectivePaid = m.amount_paid || (m.bankTxn ? m.bankTxn.amount : 0);
    let effectiveShortage = Math.max(0, effectiveInvoiceTotal - effectivePaid);
    let shortagePct = effectiveInvoiceTotal > 0 ? (effectiveShortage / effectiveInvoiceTotal * 100) : 0;
    
    if (effectiveShortage > 0.5) {
      let sev = shortagePct > 15 ? 'danger' : shortagePct > 5 ? 'warning' : 'safe';
      let icon = sev === 'danger' ? '\\u274C' : '\\u26A0\\uFE0F';
      let txt = sev === 'danger' ? '\\u0646\\u0642\\u0635 \\u0643\\u0628\\u064A\\u0631' : sev === 'warning' ? '\\u0646\\u0642\\u0635 \\u0645\\u062A\\u0648\\u0633\\u0637' : '\\u0646\\u0642\\u0635 \\u0628\\u0633\\u064A\\u0637';
      let paidPct = (effectivePaid / effectiveInvoiceTotal * 100).toFixed(0);
      
      partialHtml = '<div class="partial-box ' + sev + '">' +
        '<div class="partial-header">' + icon + ' <strong>' + txt + '!</strong></div>' +
        '<div class="partial-details">' +
          '<div>\\u0627\\u0644\\u0645\\u0637\\u0644\\u0648\\u0628: <strong>' + effectiveInvoiceTotal.toFixed(2) + ' \\u20AA</strong></div>' +
          '<div>\\u0627\\u0644\\u0645\\u062D\\u0648\\u0651\\u0644: <strong>' + effectivePaid.toFixed(2) + ' \\u20AA</strong></div>' +
          '<div class="shortage-highlight">\\u0627\\u0644\\u0645\\u062A\\u0628\\u0642\\u064A: <strong>' + effectiveShortage.toFixed(2) + ' \\u20AA</strong></div>' +
        '</div>' +
        '<div class="partial-progress"><div class="partial-bar ' + sev + '" style="width:' + paidPct + '%"></div>' +
          '<span>' + paidPct + '% \\u0645\\u062F\\u0641\\u0648\\u0639</span></div>' +
        '<div class="security-tag ' + sev + '">' +
          (sev === 'danger' ? '\\u063A\\u064A\\u0631 \\u0622\\u0645\\u0646' : sev === 'warning' ? '\\u062A\\u062D\\u0642\\u0642 \\u0645\\u0637\\u0644\\u0648\\u0628' : '\\u0622\\u0645\\u0646 \\u0646\\u0633\\u0628\\u064A\\u0627\\u064B') +
        '</div></div>';
    }
  }`;
    matching = matching.replace(simpleMatch[0], enhancedPartial);
    console.log("FIX E (alt) applied: Enhanced partial payment via simple replacement");
    renderFixes++;
  } else {
    console.log("WARN FIX E: Could not find partialHtml at all");
  }
}

// ═══════════════════════════════════════════════════════════════
// FIX F: Update security/match-type labels in renderMatchCard
// ═══════════════════════════════════════════════════════════════
// Fix the matchLabel to properly show 'partial' instead of 'full' for shortage cases
const matchLabelPattern = /const matchLabel\s*=\s*\{[\s\S]*?\}/;
const matchLabelMatch = matching.match(matchLabelPattern);

if (matchLabelMatch) {
  const newMatchLabel = `const matchLabel = {
      full: '\\u0643\\u0627\\u0645\\u0644\\u0629',
      partial: '\\u062C\\u0632\\u0626\\u064A\\u0629',
      over: '\\u0632\\u064A\\u0627\\u062F\\u0629',
      grouped_complementary: '\\u0645\\u062C\\u0645\\u0639\\u0629',
      unknown: '\\u063A\\u064A\\u0631 \\u0645\\u062D\\u062F\\u062F'
    }`;
  matching = matching.replace(matchLabelMatch[0], newMatchLabel);
  console.log("FIX F applied: matchLabel includes grouped_complementary + partial");
  renderFixes++;
} else {
  console.log("WARN FIX F: matchLabel not found");
}

// ═══════════════════════════════════════════════════════════════  
// FIX G: Security badge → override for partial matches
// ═══════════════════════════════════════════════════════════════
const securityPattern = /const secLevel\s*=\s*m\.security_level\s*\|\|\s*['"]normal['"]/;
const secMatch = matching.match(securityPattern);

if (secMatch) {
  const newSec = `// Override security level for partial payments
    let effectiveMatchType = m.match_type || 'full';
    let effectiveSecLevel = m.security_level || 'normal';
    
    // If invoice > transfer amount, it's partial regardless of what engine says
    const cardInvoiceAmt = m.invoice_amount || 0;
    const cardPaidAmt = m.amount_paid || (m.bankTxn ? m.bankTxn.amount : 0);
    if (cardInvoiceAmt > 0 && cardPaidAmt > 0 && (cardInvoiceAmt - cardPaidAmt) > 0.5) {
      effectiveMatchType = 'partial';
      const shortPct = ((cardInvoiceAmt - cardPaidAmt) / cardInvoiceAmt) * 100;
      if (shortPct > 15) effectiveSecLevel = 'danger';
      else if (shortPct > 5) effectiveSecLevel = 'warning';
      else effectiveSecLevel = 'safe';
    }
    
    const secLevel = effectiveSecLevel`;
  matching = matching.replace(secMatch[0], newSec);
  console.log("FIX G applied: Security level correctly reflects partial payments");
  renderFixes++;
} else {
  console.log("WARN FIX G: secLevel pattern not found");
}

// Also override the match type display to use effectiveMatchType
const mtPattern = /const mt\s*=\s*m\.match_type\s*\|\|\s*['"]full['"]/;
const mtMatch = matching.match(mtPattern);
if (mtMatch) {
  matching = matching.replace(mtMatch[0], "const mt = effectiveMatchType || m.match_type || 'full'");
  console.log("FIX G2 applied: match type display uses effectiveMatchType");
  renderFixes++;
} else {
  console.log("WARN FIX G2: mt pattern not found");
}

fs.writeFileSync(matchingPath, matching);
console.log("\n\\u2705 matching.js: " + renderFixes + " fixes applied\n");

// ===================== FIX matching.css =====================
const cssPath = path.join("src", "renderer", "styles", "matching.css");
let css = "";
try { css = fs.readFileSync(cssPath, "utf8"); } catch(e) { css = ""; }

// Add partial payment CSS if not already present
if (!css.includes(".partial-box")) {
  const partialCSS = `
/* ═══ Partial Payment Warning Styles ═══ */
.partial-box {
  border-radius: 8px;
  padding: 12px;
  margin: 8px 0;
  border-right: 4px solid;
}
.partial-box.safe {
  background: #e8f5e9;
  border-color: #4caf50;
}
.partial-box.warning {
  background: #fff3e0;
  border-color: #ff9800;
}
.partial-box.danger {
  background: #ffebee;
  border-color: #f44336;
}
.partial-header {
  font-size: 14px;
  margin-bottom: 8px;
  color: #333;
}
.partial-details {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  direction: rtl;
}
.partial-details div {
  flex: 1;
  text-align: center;
}
.shortage-highlight {
  color: #d32f2f;
  font-weight: bold;
}
.partial-progress {
  position: relative;
  height: 24px;
  background: #e0e0e0;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 8px;
}
.partial-bar {
  height: 100%;
  border-radius: 12px;
  transition: width 0.5s ease;
}
.partial-bar.safe { background: linear-gradient(90deg, #66bb6a, #4caf50); }
.partial-bar.warning { background: linear-gradient(90deg, #ffa726, #ff9800); }
.partial-bar.danger { background: linear-gradient(90deg, #ef5350, #f44336); }
.partial-progress span {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}
.security-tag {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
}
.security-tag.safe { background: #c8e6c9; color: #2e7d32; }
.security-tag.warning { background: #ffe0b2; color: #e65100; }
.security-tag.danger { background: #ffcdd2; color: #c62828; }
`;
  fs.appendFileSync(cssPath, partialCSS);
  console.log("\\u2705 CSS: Partial payment styles added to matching.css");
} else {
  console.log("CSS: Partial payment styles already present");
}

// ═══════════════════════════════════════════════════════════════
console.log("\n========================================");
console.log("\\u2705 ALL FIXES COMPLETE!");
console.log("========================================");
console.log("\\nEngine fixes: " + engineFixes);
console.log("Renderer fixes: " + renderFixes);
console.log("\\nChanges summary:");
console.log("  A. _acceptResult: ALL matches go to suggestions (no auto-confirm)");
console.log("  B. getMatchType: Strict tolerance (0.5\\u20AA or 1%)");
console.log("     \\u2192 18\\u20AA vs 20\\u20AA = PARTIAL (not full!)");
console.log("  C. formatMatch: Auto-calculates shortage fields");
console.log("  D. Layer 2.5: Grouped results include shortage info");
console.log("  E. UI: Enhanced partial payment warning with progress bar");
console.log("  F. Labels: Added grouped_complementary + partial types");
console.log("  G. Security: Override badge for partial payments");
console.log("\\n\\u{1F680} Next: Run 'npm start' and test Samir's case:");
console.log("   Invoice 20\\u20AA, Transfer 18\\u20AA \\u2192 should show PARTIAL + shortage 2\\u20AA");
