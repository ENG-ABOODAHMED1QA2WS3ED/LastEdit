const fs = require('fs');
const path = require('path');

console.log('=============================================');
console.log('  LAYER 2.6: Smart Multi-Transfer Grouping  ');
console.log('=============================================\n');

const enginePath = path.join('src', 'main', 'matching-engine.js');
let code = fs.readFileSync(enginePath, 'utf8');
fs.writeFileSync(enginePath + '.bak-layer26', code);

// Insert Layer 2.6 AFTER the main loop ends (line 1095: closing "}")
// and BEFORE "Build results" section (line 1097)

const insertAfter = `    }

    // \u2500\u2500 Build results \u2500\u2500`;

const layer26Code = `    }

    // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
    // LAYER 2.6: Smart Multi-Transfer Grouping (post-processing)
    // Groups multiple bank transfers from same customer against their invoices
    // Example: transfers 18+4=22 vs invoice 20 => show smart suggestion
    // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
    try {
      // Step 1: Group unmatched bank transactions by customer (payer_name)
      const unmatchedBankForGrouping = pendingBankTxns.filter(tx => !usedBankIds.has(tx.id));
      
      // Also consider suggested matches that are partial (shortage exists)
      const partialSuggestions = suggested.filter(s => 
        s.match_type === 'partial' && s.shortage_amount > 0
      );
      
      if (partialSuggestions.length > 0 && unmatchedBankForGrouping.length > 0) {
        const processedPartials = new Set();
        
        for (const partial of partialSuggestions) {
          if (processedPartials.has(partial.bank_transaction_id)) continue;
          
          const partialPayerName = partial.bankTxn?.payer_name || '';
          if (!partialPayerName) continue;
          
          // Find other unmatched bank transfers from same payer
          const samePayer = unmatchedBankForGrouping.filter(tx => {
            if (usedBankIds.has(tx.id)) return false;
            if (tx.id === partial.bank_transaction_id) return false;
            
            // Compare payer names (normalized)
            const txPayer = (tx.payer_name || '').trim();
            const partPayer = partialPayerName.trim();
            
            if (txPayer === partPayer) return true;
            
            // Fuzzy: check if one name contains the other
            const txNorm = txPayer.replace(/\\s+/g, ' ').toLowerCase();
            const partNorm = partPayer.replace(/\\s+/g, ' ').toLowerCase();
            if (txNorm.includes(partNorm) || partNorm.includes(txNorm)) return true;
            
            // Check first+last name match
            const txParts = txNorm.split(' ').filter(w => w.length > 1);
            const partParts = partNorm.split(' ').filter(w => w.length > 1);
            if (txParts.length >= 2 && partParts.length >= 2) {
              if (txParts[0] === partParts[0] && txParts[txParts.length-1] === partParts[partParts.length-1]) return true;
            }
            
            return false;
          });
          
          if (samePayer.length === 0) continue;
          
          // Calculate totals
          const partialBankAmount = partial.bankTxn?.amount || partial.amount_paid || 0;
          const invoiceAmount = partial.invoice_amount || 0;
          const shortage = partial.shortage_amount || 0;
          
          // Check if any unmatched transfer covers the shortage
          for (const otherTx of samePayer) {
            const otherAmount = otherTx.amount || 0;
            const combinedTotal = partialBankAmount + otherAmount;
            const combinedDiff = combinedTotal - invoiceAmount;
            const combinedDiffAbs = Math.abs(combinedDiff);
            
            // Accept if combined amount is close to invoice (within 5% or 3 ILS)
            if (combinedDiffAbs <= Math.max(invoiceAmount * 0.05, 3)) {
              
              // Determine combined match type
              let combinedMatchType = 'full';
              let combinedSecurity = 'safe';
              let combinedShortage = 0;
              
              if (combinedDiff < -0.5) {
                combinedMatchType = 'partial';
                combinedShortage = Math.abs(combinedDiff);
                const pct = (combinedShortage / invoiceAmount) * 100;
                combinedSecurity = pct <= 5 ? 'safe' : pct <= 20 ? 'warning' : 'danger';
              } else if (combinedDiff > 0.5) {
                combinedMatchType = 'over';
                combinedSecurity = 'safe';
              }
              
              // Build smart grouped suggestion
              const amountScore = combinedDiffAbs <= 0.5 ? 100 : Math.round((1 - combinedDiffAbs / invoiceAmount) * 100);
              const nameScore = partial.breakdown?.name_score || 85;
              const smartConfidence = Math.round(nameScore * 0.50 + amountScore * 0.35 + 90 * 0.15);
              
              console.log('[Layer 2.6] Smart multi-transfer group:', partialPayerName);
              console.log('  Transfers:', partialBankAmount, '+', otherAmount, '=', combinedTotal);
              console.log('  Invoice:', invoiceAmount, '| Diff:', combinedDiff.toFixed(2));
              console.log('  Type:', combinedMatchType, '| Security:', combinedSecurity);
              
              // Remove the original partial suggestion
              const partialIdx = suggested.indexOf(partial);
              if (partialIdx >= 0) {
                suggested.splice(partialIdx, 1);
              }
              
              // Add smart grouped suggestion
              suggested.push({
                ...partial,
                match_type: 'multi_transfer',
                confidence: smartConfidence,
                confidence_note: 'multi_transfer_grouped',
                security_level: combinedSecurity,
                shortage_amount: combinedShortage,
                amount_paid: combinedTotal,
                
                // Multi-transfer specific fields
                bank_transfers: [
                  {
                    id: partial.bank_transaction_id,
                    amount: partialBankAmount,
                    payer_name: partialPayerName,
                    date: partial.bankTxn?.parsed_date || partial.bankTxn?.tx_date
                  },
                  {
                    id: otherTx.id,
                    amount: otherAmount,
                    payer_name: otherTx.payer_name,
                    date: otherTx.parsed_date || otherTx.tx_date
                  }
                ],
                total_transferred: combinedTotal,
                invoice_amount: invoiceAmount,
                excess_amount: combinedDiff > 0 ? combinedDiff : 0,
                
                breakdown: {
                  ...partial.breakdown,
                  amount_score: amountScore
                }
              });
              
              // Mark other transfer as used
              usedBankIds.add(otherTx.id);
              processedPartials.add(partial.bank_transaction_id);
              
              console.log('[Layer 2.6] Created multi-transfer suggestion: confidence', smartConfidence);
              break; // Found a match for this partial
            }
          }
        }
      }
      
      console.log('[Layer 2.6] Processing complete');
    } catch (layer26Err) {
      console.warn('[Layer 2.6] Error:', layer26Err.message);
    }

    // \u2500\u2500 Build results \u2500\u2500`;

// Apply the fix
const oldCode = code;
code = code.replace(insertAfter, layer26Code);

if (code !== oldCode) {
    console.log('\\x1b[32m\u2713 Layer 2.6 inserted successfully!\\x1b[0m');
} else {
    console.log('\\x1b[33m\u26A0 Exact match failed, trying flexible approach...\\x1b[0m');
    
    // Try finding the exact insertion point by line content
    const lines = code.split('\\n');
    let insertIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes('Build results') && lines[i].includes('\u2500\u2500')) {
            insertIdx = i;
            break;
        }
    }
    
    if (insertIdx > 0) {
        const layer26Lines = layer26Code.split('\\n');
        // Remove the first line (closing brace) and last line (Build results) 
        // since they already exist
        const insertLines = layer26Lines.slice(1, -1);
        lines.splice(insertIdx, 0, ...insertLines);
        code = lines.join('\\n');
        console.log('\\x1b[32m\u2713 Layer 2.6 inserted at line ' + (insertIdx + 1) + '\\x1b[0m');
    } else {
        console.log('\\x1b[31m\u2717 Could not find insertion point!\\x1b[0m');
        process.exit(1);
    }
}

fs.writeFileSync(enginePath, code, 'utf8');

// ============================================
// FILE 2: Update UI to handle multi_transfer type
// ============================================
const matchingUIPath = path.join('src', 'renderer', 'scripts', 'matching.js');
let ui = fs.readFileSync(matchingUIPath, 'utf8');
fs.writeFileSync(matchingUIPath + '.bak-layer26', ui);

// Add multi_transfer to typeLabels
const oldLabels = ui;
ui = ui.replace(
    /grouped_complementary['"]\s*:\s*['"][^'"]*['"]/,
    `grouped_complementary': '\u0645\u062C\u0645\u0639\u0629',\n      'multi_transfer': '\u062A\u062D\u0648\u064A\u0644\u0627\u062A \u0645\u062A\u0639\u062F\u062F\u0629'`
);
if (ui !== oldLabels) {
    console.log('\\x1b[32m\u2713 UI: Added multi_transfer label\\x1b[0m');
} else {
    console.log('\\x1b[33m\u26A0 UI: typeLabels pattern not found\\x1b[0m');
}

// Add multi-transfer display in renderMatchCard
// Find where groupedHtml is built and add multi-transfer section after it
const oldUI2 = ui;
const multiTransferHtml = `
  // === Multi-transfer display ===
  let multiTransferHtml = '';
  if (m.match_type === 'multi_transfer' && m.bank_transfers && m.bank_transfers.length > 0) {
    const totalTransferred = m.bank_transfers.reduce((s, t) => s + (t.amount || 0), 0);
    const invoiceAmt = m.invoice_amount || 0;
    const diff = totalTransferred - invoiceAmt;
    
    multiTransferHtml = '<div class="multi-transfer-box">' +
      '<div class="multi-transfer-title">\u062A\u062D\u0648\u064A\u0644\u0627\u062A \u0645\u062A\u0639\u062F\u062F\u0629 \u0645\u0646 \u0646\u0641\u0633 \u0627\u0644\u0632\u0628\u0648\u0646</div>';
    
    m.bank_transfers.forEach(function(t, i) {
      multiTransferHtml += '<div class="multi-transfer-item">' +
        '\u062A\u062D\u0648\u064A\u0644 ' + (i+1) + ': <strong>' + (t.amount || 0).toFixed(2) + ' \u20AA</strong>' +
        '</div>';
    });
    
    multiTransferHtml += '<div class="multi-transfer-total">' +
      '\u0627\u0644\u0645\u062C\u0645\u0648\u0639: <strong>' + totalTransferred.toFixed(2) + ' \u20AA</strong> | ' +
      '\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629: <strong>' + invoiceAmt.toFixed(2) + ' \u20AA</strong>';
    
    if (diff > 0.5) {
      multiTransferHtml += ' | <span class="excess-amount">\u0632\u064A\u0627\u062F\u0629: +' + diff.toFixed(2) + ' \u20AA (\u0631\u0635\u064A\u062F \u0644\u0644\u0632\u0628\u0648\u0646)</span>';
    } else if (diff < -0.5) {
      multiTransferHtml += ' | <span class="shortage-amount">\u0646\u0642\u0635: ' + Math.abs(diff).toFixed(2) + ' \u20AA</span>';
    } else {
      multiTransferHtml += ' | <span class="exact-amount">\u062A\u0637\u0627\u0628\u0642 \u062A\u0627\u0645! \u2714</span>';
    }
    
    multiTransferHtml += '</div></div>';
  }`;

// Insert before the return statement in renderMatchCard
// Find "let partialHtml" and insert before it
ui = ui.replace(
    /(\s*\/\/.*partial.*\n\s*let partialHtml)/i,
    multiTransferHtml + '\n$1'
);
if (ui !== oldUI2) {
    console.log('\\x1b[32m\u2713 UI: Multi-transfer HTML block added\\x1b[0m');
} else {
    console.log('\\x1b[33m\u26A0 UI: Could not insert multi-transfer HTML (will try alt)\\x1b[0m');
    // Alternative: insert before partialHtml declaration
    ui = ui.replace(
        /(let partialHtml\s*=\s*['"])/,
        multiTransferHtml + '\n  $1'
    );
    if (ui !== oldUI2) {
        console.log('\\x1b[32m\u2713 UI: Multi-transfer HTML block added (alt method)\\x1b[0m');
    }
}

// Add multiTransferHtml to the card template
const oldUI3 = ui;
ui = ui.replace(
    /groupedHtml\s*\+/,
    'groupedHtml +\n      multiTransferHtml +'
);
if (ui !== oldUI3) {
    console.log('\\x1b[32m\u2713 UI: multiTransferHtml added to card template\\x1b[0m');
} else {
    console.log('\\x1b[33m\u26A0 UI: Could not add to template\\x1b[0m');
}

fs.writeFileSync(matchingUIPath, ui, 'utf8');

// ============================================
// FILE 3: Add CSS for multi-transfer
// ============================================
const cssPath = path.join('src', 'renderer', 'styles', 'matching.css');
let css = fs.readFileSync(cssPath, 'utf8');

if (!css.includes('multi-transfer-box')) {
    css += `

/* === Multi-Transfer Grouping (Layer 2.6) === */
.multi-transfer-box {
    border: 2px solid #2196F3;
    border-radius: 10px;
    padding: 12px 16px;
    margin: 10px 0;
    background: linear-gradient(135deg, #E3F2FD, #BBDEFB);
}
.multi-transfer-title {
    font-weight: bold;
    color: #1565C0;
    font-size: 1.05em;
    margin-bottom: 8px;
    text-align: right;
}
.multi-transfer-item {
    padding: 4px 8px;
    margin: 3px 0;
    background: rgba(255,255,255,0.7);
    border-radius: 6px;
    text-align: right;
    border-right: 3px solid #2196F3;
}
.multi-transfer-total {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed #90CAF9;
    text-align: right;
    font-size: 1.05em;
}
.excess-amount {
    color: #2E7D32;
    font-weight: bold;
    background: #E8F5E9;
    padding: 2px 8px;
    border-radius: 4px;
}
.shortage-amount {
    color: #C62828;
    font-weight: bold;
    background: #FFEBEE;
    padding: 2px 8px;
    border-radius: 4px;
}
.exact-amount {
    color: #2E7D32;
    font-weight: bold;
    background: #E8F5E9;
    padding: 2px 8px;
    border-radius: 4px;
}
`;
    fs.writeFileSync(cssPath, css, 'utf8');
    console.log('\\x1b[32m\u2713 CSS: Multi-transfer styles added\\x1b[0m');
}

console.log('\\n=============================================');
console.log('  DONE! Run: npm start');  
console.log('=============================================');
console.log('\\nExpected for Samir:');
console.log('  Before: Transfer 18 -> Invoice 20 (partial, shortage 2)');
console.log('         Transfer 4 -> Unmatched');
console.log('  After:  Transfer 18+4=22 -> Invoice 20 (over, excess 2)');
console.log('         Smart card shows both transfers + options');
