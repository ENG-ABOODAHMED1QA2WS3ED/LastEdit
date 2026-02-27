const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\renderer\\scripts\\matching.js';
let lines = fs.readFileSync(f, 'utf8').split('\n');

// Find the header search section (lines 76-90) and expand it
let headerSearchStart = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('البحث عن صف الهيدر الحقيقي')) { headerSearchStart = i; break; }
}

if (headerSearchStart !== -1) {
    // Find end of header search (the if headerIndex === -1 check)
    let headerSearchEnd = -1;
    for (let i = headerSearchStart; i < lines.length; i++) {
        if (lines[i].includes('if (headerIndex === -1)')) { headerSearchEnd = i; break; }
    }
    
    if (headerSearchEnd !== -1) {
        // Also find end of column detection
        let colDetectEnd = -1;
        for (let i = headerSearchEnd; i < lines.length; i++) {
            if (lines[i].includes('if (colDesc === -1')) { colDetectEnd = i; break; }
        }
        
        // Replace from headerSearchStart to colDetectEnd with new logic
        const newCode = [
            '    // البحث عن صف الهيدر الحقيقي - يدعم هيكل Excel الأصلي وكشف بنك فلسطين PDF',
            '    let headerIndex = -1;',
            '    let bankFormat = "standard"; // standard or bop (Bank of Palestine)',
            '    for (let i = 0; i < allLines.length; i++) {',
            '      const line = allLines[i];',
            '      // هيكل Excel الأصلي',
            '      if (line.includes("التاريخ البنكي") && line.includes("الإيضاحات")) {',
            '        headerIndex = i; bankFormat = "standard";',
            '        console.log("هيدر Excel موجود بالصف:", i); break;',
            '      }',
            '      if (line.includes("تاريخ") && (line.includes("ايضاح") || line.includes("إيضاح")) && line.includes("مبالغ")) {',
            '        headerIndex = i; bankFormat = "standard";',
            '        console.log("هيدر مرن بالصف:", i); break;',
            '      }',
            '      // هيكل بنك فلسطين PDF->CSV',
            '      if (line.includes("التاريخ البنكي") && line.includes("التفاصيل")) {',
            '        headerIndex = i; bankFormat = "bop";',
            '        console.log("هيدر بنك فلسطين بالصف:", i); break;',
            '      }',
            '      // هيكل بنك فلسطين بأحرف عربية مختلفة',
            '      if ((line.includes("اﻟﺘﺎرﯾﺦ") || line.includes("ﺗﺎرﯾﺦ")) && (line.includes("اﻟﺘﻔﺎﺻﯿﻞ") || line.includes("ﺗﻔﺎﺻﯿﻞ"))) {',
            '        headerIndex = i; bankFormat = "bop";',
            '        console.log("هيدر بنك فلسطين (unicode) بالصف:", i); break;',
            '      }',
            '      // أي سطر فيه تاريخ ومبالغ',
            '      if (line.includes("تاريخ") && (line.includes("مبالغ") || line.includes("المبالغ")) && (line.includes("مدفوع") || line.includes("مستلم"))) {',
            '        headerIndex = i; bankFormat = "standard";',
            '        console.log("هيدر عام بالصف:", i); break;',
            '      }',
            '    }',
            '',
            '    // لو ما لقينا هيدر، نحاول نحلل كبنك فلسطين بدون هيدر',
            '    if (headerIndex === -1) {',
            '      // نبحث عن أول سطر فيه "تحويل الكتروني" أو "ﺗﺤﻮﯾﻞ"',
            '      for (let i = 0; i < allLines.length; i++) {',
            '        if (allLines[i].includes("تحويل الكتروني") || allLines[i].includes("ﺗﺤﻮﯾﻞ اﻟﻜﺘﺮوﻧﻲ") || allLines[i].includes("Transfer")) {',
            '          headerIndex = i - 1; bankFormat = "bop_noheader";',
            '          console.log("بنك فلسطين بدون هيدر، البيانات تبدأ من:", i); break;',
            '        }',
            '      }',
            '    }',
            '',
            '    if (headerIndex === -1) {',
            '      hideLoading();',
            '      showToast("لم يتم العثور على هيدر الكشف البنكي", "error");',
            '      return;',
            '    }',
            '',
            '    console.log("صيغة الكشف:", bankFormat);',
            '',
            '    // === تحليل حسب الصيغة ===',
            '    let rows = [];',
            '    let incoming = 0, outgoing = 0, skipped = 0;',
            '    let parsedEntries = [];',
            '    let headers = [];',
            '',
            '    if (bankFormat === "bop" || bankFormat === "bop_noheader") {',
            '      // === بنك فلسطين: البيانات موزعة على عدة أسطر ===',
            '      headers = ["التاريخ", "الاسم", "المبلغ", "النوع"];',
            '      const dataLines = bankFormat === "bop_noheader" ? allLines.slice(headerIndex + 1) : allLines.slice(headerIndex + 1);',
            '',
            '      let currentName = "";',
            '      let currentType = "";',
            '',
            '      for (let i = 0; i < dataLines.length; i++) {',
            '        const line = dataLines[i];',
            '',
            '        // تخطي أسطر الهيدر المتكررة',
            '        if (line.includes("اﻟﺘﺎرﯾﺦ اﻟﺒﻨﻜﻲ") || line.includes("التاريخ البنكي")) continue;',
            '        // تخطي أسطر العمولة',
            '        if (line.includes("ﻋﻤﻮﻟﺔ") || line.includes("عمولة")) continue;',
            '',
            '        // سطر وصف العملية - يحتوي اسم المحوّل',
            '        const nameMatch = line.match(/(?:ﻣﻦ|من)\\s+(.+?)\\s*,|(?:from)\\s+(.+?)\\s*,/i);',
            '        if (nameMatch) {',
            '          currentName = (nameMatch[1] || nameMatch[2] || "").trim();',
            '          // نوع العملية',
            '          if (line.includes("ﻟﺼﺪﯾﻖ") || line.includes("لصديق") || line.includes("Pay To Friend")) currentType = "دفع لصديق";',
            '          else if (line.includes("ﻟﺘﺎﺟﺮ") || line.includes("لتاجر")) currentType = "دفع لتاجر";',
            '          else if (line.includes("ﻟﻼﺧﺮﯾﻦ") || line.includes("للاخرين") || line.includes("Transfer to Others")) currentType = "تحويل للاخرين";',
            '          else currentType = "تحويل";',
            '          continue;',
            '        }',
            '',
            '        // سطر المبلغ - يحتوي أرقام وتاريخ',
            '        const amountMatch = line.match(/([\\d,]+\\.\\d{2}).*?(\\d{2}\\/\\d{2}\\/\\d{4})/);',
            '        if (amountMatch && currentName) {',
            '          const cols = line.split(",").map(c => c.replace(/"/g, "").trim());',
            '          // نبحث عن المبلغ (ليس الرصيد)',
            '          let amount = 0;',
            '          let dateStr = "";',
            '          for (const col of cols) {',
            '            const num = parseFloat(col.replace(/,/g, ""));',
            '            if (!isNaN(num) && num > 0 && num < 10000) { amount = num; }',
            '            const dm = col.match(/(\\d{2}\\/\\d{2}\\/\\d{4})/);',
            '            if (dm) dateStr = dm[1];',
            '          }',
            '',
            '          if (amount > 0) {',
            '            // تخطي المبالغ السالبة (مدفوعات صادرة)',
            '            const rawLine = line;',
            '            const isNegative = rawLine.includes("-") && rawLine.indexOf("-") < rawLine.indexOf(amount.toString().replace(".", "").substring(0,3));',
            '            if (!isNegative) {',
            '              parsedEntries.push({ date: dateStr, description: currentName, amount: amount, type: currentType, rawRow: cols });',
            '              incoming++;',
            '            } else {',
            '              outgoing++;',
            '            }',
            '          }',
            '          currentName = "";',
            '          currentType = "";',
            '          continue;',
            '        }',
            '',
            '        // سطر التفاصيل الإضافية (WALLET...) - نتخطاه',
            '      }',
            '',
            '    } else {',
            '      // === الهيكل القياسي (Excel) ===',
            '      headers = parseCSVLine(allLines[headerIndex]);',
            '      console.log("Headers:", headers);',
            '',
            '      let colDate = -1, colDesc = -1, colPaid = -1, colReceived = -1, colBalance = -1;',
            '      for (let i = 0; i < headers.length; i++) {',
            '        const h = headers[i].trim();',
            '        if (h.includes("التاريخ البنكي") || (h.includes("تاريخ") && h.includes("بنك"))) colDate = i;',
            '        if (h.includes("الإيضاحات") || h.includes("ايضاح") || h.includes("إيضاح") || h.includes("وصف")) colDesc = i;',
            '        if (h.includes("مدفوعة") || h.includes("مدين")) colPaid = i;',
            '        if (h.includes("مستلمة") || h.includes("دائن") || h.includes("وارد")) colReceived = i;',
            '        if (h.includes("رصيد") || h.includes("الرصيد")) colBalance = i;',
            '      }',
            '',
            '      console.log("أعمدة:", { colDate, colDesc, colPaid, colReceived, colBalance });',
            '',
            '      if (colDesc === -1 || colReceived === -1) {',
        ];
        
        lines.splice(headerSearchStart, colDetectEnd - headerSearchStart, ...newCode);
        
        // Now find where standard parsing continues and wrap it
        // Find "const dataLines" in the new code area
        let dataLinesIdx = -1;
        for (let i = headerSearchStart + newCode.length; i < lines.length; i++) {
            if (lines[i].includes('const dataLines = allLines.slice')) { dataLinesIdx = i; break; }
        }
        
        if (dataLinesIdx !== -1) {
            // Find end of standard parsing (showImportSummary)
            let summaryIdx = -1;
            for (let i = dataLinesIdx; i < lines.length; i++) {
                if (lines[i].includes('showImportSummary')) { summaryIdx = i; break; }
            }
            
            if (summaryIdx !== -1) {
                // Find the parsedEntries section after summary
                let parsedIdx = -1;
                for (let i = summaryIdx; i < lines.length; i++) {
                    if (lines[i].includes('const parsedEntries = rows.map')) { parsedIdx = i; break; }
                }
                
                if (parsedIdx !== -1) {
                    // Find end of parsedEntries block
                    let parsedEnd = -1;
                    for (let i = parsedIdx; i < lines.length; i++) {
                        if (lines[i].includes('}).filter(e => e.amount > 0)')) { parsedEnd = i + 1; break; }
                    }
                    
                    if (parsedEnd !== -1) {
                        // Add closing brace for the else block before showImportSummary
                        // and merge parsedEntries
                        const closingCode = [
                            '    } // end standard format',
                            '',
                            '    console.log("عمليات واردة محللة:", parsedEntries.length);',
                            '    parsedEntries.forEach(e => console.log("  ", (e.description || "").substring(0,60), "|", e.amount));',
                        ];
                        
                        // Remove old parsedEntries and summary display, replace with unified version
                        lines.splice(summaryIdx, parsedEnd - summaryIdx, ...closingCode);
                    }
                }
            }
        }
        
        fs.writeFileSync(f, lines.join('\n'), 'utf8');
        console.log('Parser updated for Bank of Palestine!');
        console.log('Total lines:', lines.length);
    } else {
        console.log('ERROR: colDetectEnd not found');
    }
} else {
    console.log('ERROR: headerSearchStart not found');
}
