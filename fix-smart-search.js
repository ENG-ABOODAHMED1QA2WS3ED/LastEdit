/**
 * fix-smart-search.js
 * إصلاح #10: بحث ذكي عن الزبائن + كشف التكرار
 * 
 * التغييرات:
 * 1. main.js: تحسين search-customers ليدعم البحث المرن بالعربي + الأسماء البديلة + معلومات إضافية
 * 2. main.js: إضافة check-similar-customers للكشف عن التكرار عند إضافة زبون جديد
 * 3. invoice.js: تحسين القائمة المنسدلة لإظهار الدين وآخر شراء
 * 4. invoice.js: تحذير تلقائي عند إضافة اسم مشابه لزبون موجود
 * 5. preload.js: إضافة API جديد checkSimilarCustomers
 */

const fs = require('fs');
const path = require('path');

function applyFix() {
    console.log('═══════════════════════════════════════════');
    console.log(' إصلاح #10: بحث ذكي + كشف تكرار الزبائن');
    console.log('═══════════════════════════════════════════\n');

    const mainPath = path.join(__dirname, 'src', 'main', 'main.js');
    const invoicePath = path.join(__dirname, 'src', 'renderer', 'scripts', 'invoice.js');
    const preloadPath = path.join(__dirname, 'src', 'main', 'preload.js');

    // Read files
    let mainSrc = fs.readFileSync(mainPath, 'utf8');
    let invoiceSrc = fs.readFileSync(invoicePath, 'utf8');
    let preloadSrc = fs.readFileSync(preloadPath, 'utf8');
    
    let changes = 0;

    // ═══════════════════════════════════════════
    // FIX 1: Enhance search-customers in main.js
    // ═══════════════════════════════════════════
    console.log('[1/5] تحسين بحث الزبائن في main.js...');

    const oldSearchHandler = `ipcMain.handle('search-customers', async (event, query) => {
        try {
            const normalizeAr = (s) => (s||'').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
            const allCustomers = db.prepare('SELECT * FROM customers WHERE is_active = 1 ORDER BY name').all();
            const q = (query || '').trim();
            const qNorm = normalizeAr(q).toLowerCase();
            const customers = allCustomers.filter(c => {
                const nameNorm = normalizeAr(c.name || '').toLowerCase();
                const phone = (c.phone || '');
                return nameNorm.includes(qNorm) || (c.name||'').toLowerCase().includes(q.toLowerCase()) || phone.includes(q);
            }).slice(0, 20);
            return { success: true, customers };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });`;

    const newSearchHandler = `ipcMain.handle('search-customers', async (event, query) => {
        try {
            // ═══ بحث ذكي v2: يتجاهل الهمزات والتاء المربوطة ويبحث بالأسماء البديلة ═══
            const normalizeAr = (s) => (s||'')
                .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
                .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
                .replace(/[\\u064B-\\u065F\\u0670\\u0640]/g, '') // إزالة التشكيل
                .replace(/\\s+/g, ' ').trim();
            
            const q = (query || '').trim();
            if (!q) return { success: true, customers: [] };
            const qNorm = normalizeAr(q).toLowerCase();
            
            // جلب كل الزبائن مع آخر فاتورة وإجمالي الدين
            const allCustomers = db.prepare(\`
                SELECT c.*,
                    (SELECT COALESCE(SUM(p.amount - COALESCE(p.paid_amount, 0)), 0) 
                     FROM payments p JOIN invoices i ON p.invoice_id = i.id 
                     WHERE i.customer_id = c.id AND p.method = 'debt' AND p.status IN ('pending','unpaid')
                    ) as total_debt,
                    (SELECT MAX(i.created_at) FROM invoices i WHERE i.customer_id = c.id) as last_purchase_date,
                    (SELECT COUNT(*) FROM invoices i WHERE i.customer_id = c.id) as invoice_count
                FROM customers c WHERE c.is_active = 1 ORDER BY c.name
            \`).all();
            
            // جلب الأسماء البديلة
            let aliasMap = {};
            try {
                const aliases = db.prepare('SELECT customer_id, alias_name FROM customer_aliases').all();
                for (const a of aliases) {
                    if (!aliasMap[a.customer_id]) aliasMap[a.customer_id] = [];
                    aliasMap[a.customer_id].push(a.alias_name);
                }
            } catch(e) { /* الجدول قد لا يكون موجوداً */ }
            
            // البحث المرن
            const scored = [];
            for (const c of allCustomers) {
                let matchScore = 0;
                let matchReason = '';
                
                const nameNorm = normalizeAr(c.name || '').toLowerCase();
                const phone = (c.phone || '').replace(/[^0-9]/g, '');
                const qDigits = q.replace(/[^0-9]/g, '');
                
                // 1. تطابق بالاسم (مرن)
                if (nameNorm === qNorm) {
                    matchScore = 100; matchReason = 'exact';
                } else if (nameNorm.startsWith(qNorm)) {
                    matchScore = 90; matchReason = 'starts_with';
                } else if (nameNorm.includes(qNorm)) {
                    matchScore = 80; matchReason = 'contains';
                }
                // 2. تطابق بالاسم الأصلي بدون تطبيع
                else if ((c.name||'').toLowerCase().includes(q.toLowerCase())) {
                    matchScore = 75; matchReason = 'raw_contains';
                }
                // 3. بحث بالهاتف
                else if (qDigits.length >= 3 && phone.includes(qDigits)) {
                    matchScore = 85; matchReason = 'phone';
                }
                // 4. بحث بالأسماء البديلة (aliases)
                else {
                    const custAliases = aliasMap[c.id] || [];
                    for (const alias of custAliases) {
                        const aliasNorm = normalizeAr(alias).toLowerCase();
                        if (aliasNorm.includes(qNorm) || qNorm.includes(aliasNorm)) {
                            matchScore = 70; matchReason = 'alias:' + alias;
                            break;
                        }
                    }
                }
                // 5. بحث بالكلمات المفردة (إذا كتب جزء من الاسم)
                if (matchScore === 0 && qNorm.length >= 2) {
                    const qWords = qNorm.split(/\\s+/);
                    const nameWords = nameNorm.split(/\\s+/);
                    const matchedWords = qWords.filter(qw => nameWords.some(nw => nw.startsWith(qw) || nw.includes(qw)));
                    if (matchedWords.length > 0 && matchedWords.length >= qWords.length) {
                        matchScore = 65; matchReason = 'word_match';
                    } else if (matchedWords.length > 0) {
                        matchScore = 50; matchReason = 'partial_word';
                    }
                }
                
                if (matchScore > 0) {
                    scored.push({ ...c, _matchScore: matchScore, _matchReason: matchReason });
                }
            }
            
            // ترتيب النتائج: الأعلى تطابقاً أولاً، ثم بعدد الفواتير (الزبائن المتكررين أولاً)
            scored.sort((a, b) => {
                if (b._matchScore !== a._matchScore) return b._matchScore - a._matchScore;
                return (b.invoice_count || 0) - (a.invoice_count || 0);
            });
            
            const customers = scored.slice(0, 20);
            return { success: true, customers };
        } catch (error) {
            console.error('خطأ بحث الزبائن:', error);
            return { success: false, error: error.message };
        }
    });`;

    if (mainSrc.includes(oldSearchHandler)) {
        mainSrc = mainSrc.replace(oldSearchHandler, newSearchHandler);
        changes++;
        console.log('   ✅ تم تحسين search-customers');
    } else {
        console.log('   ⚠️  لم يُعثر على كود البحث القديم بالضبط - محاولة بديلة...');
        // Try a more flexible match
        const searchStart = mainSrc.indexOf("ipcMain.handle('search-customers'");
        if (searchStart !== -1) {
            // Find the matching closing
            let depth = 0;
            let searchEnd = -1;
            let inHandler = false;
            for (let i = searchStart; i < mainSrc.length; i++) {
                if (mainSrc[i] === '{') { depth++; inHandler = true; }
                if (mainSrc[i] === '}') { 
                    depth--;
                    if (inHandler && depth === 0) {
                        // Find the next ");" after this closing brace
                        const rest = mainSrc.substring(i);
                        const closeMatch = rest.match(/^\}\s*\)\s*;/);
                        if (closeMatch) {
                            searchEnd = i + closeMatch[0].length;
                            break;
                        }
                    }
                }
            }
            if (searchEnd !== -1) {
                mainSrc = mainSrc.substring(0, searchStart) + newSearchHandler + mainSrc.substring(searchEnd);
                changes++;
                console.log('   ✅ تم تحسين search-customers (طريقة بديلة)');
            } else {
                console.log('   ❌ فشل تحديد نهاية handler البحث');
            }
        } else {
            console.log('   ❌ لم يُعثر على search-customers handler');
        }
    }

    // ═══════════════════════════════════════════
    // FIX 2: Add check-similar-customers handler in main.js
    // ═══════════════════════════════════════════
    console.log('[2/5] إضافة كشف التكرار في main.js...');

    if (!mainSrc.includes("'check-similar-customers'")) {
        // Insert after search-customers handler
        const insertAfter = "ipcMain.handle('add-customer'";
        const insertPos = mainSrc.indexOf(insertAfter);
        if (insertPos !== -1) {
            const newHandler = `
    // ═══ كشف تكرار الزبائن عند الإضافة ═══
    ipcMain.handle('check-similar-customers', async (event, name) => {
        try {
            const normalizeAr = (s) => (s||'')
                .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
                .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
                .replace(/[\\u064B-\\u065F\\u0670\\u0640]/g, '')
                .replace(/\\s+/g, ' ').trim();
            
            const qNorm = normalizeAr(name).toLowerCase();
            if (qNorm.length < 2) return { success: true, similar: [] };
            
            const allCustomers = db.prepare('SELECT id, name, phone FROM customers WHERE is_active = 1').all();
            const similar = [];
            
            for (const c of allCustomers) {
                const cNorm = normalizeAr(c.name || '').toLowerCase();
                
                // تطابق تام
                if (cNorm === qNorm) {
                    similar.push({ ...c, similarity: 'exact', label: '⛔ اسم مطابق تماماً' });
                    continue;
                }
                
                // يبدأ بنفس الاسم أو العكس
                if (cNorm.startsWith(qNorm) || qNorm.startsWith(cNorm)) {
                    similar.push({ ...c, similarity: 'starts_with', label: '⚠️ اسم مشابه جداً' });
                    continue;
                }
                
                // أحدهما يحتوي الآخر
                if (cNorm.includes(qNorm) || qNorm.includes(cNorm)) {
                    similar.push({ ...c, similarity: 'contains', label: '🔍 اسم قريب' });
                    continue;
                }
                
                // مقارنة بالكلمات - إذا تطابقت كلمتين أو أكثر
                const qWords = qNorm.split(/\\s+/);
                const cWords = cNorm.split(/\\s+/);
                const matchedWords = qWords.filter(qw => cWords.some(cw => cw === qw || (cw.length > 3 && qw.length > 3 && (cw.startsWith(qw) || qw.startsWith(cw)))));
                if (matchedWords.length >= 2 || (matchedWords.length === 1 && qWords.length === 1 && cWords.length <= 2)) {
                    similar.push({ ...c, similarity: 'word_match', label: '🔍 تشابه بالكلمات' });
                }
            }
            
            return { success: true, similar: similar.slice(0, 5) };
        } catch (error) {
            return { success: false, error: error.message, similar: [] };
        }
    });

    `;
            mainSrc = mainSrc.substring(0, insertPos) + newHandler + mainSrc.substring(insertPos);
            changes++;
            console.log('   ✅ تم إضافة check-similar-customers');
        } else {
            console.log('   ❌ لم يُعثر على موقع الإدراج');
        }
    } else {
        console.log('   ⏭️  check-similar-customers موجود مسبقاً');
    }

    // ═══════════════════════════════════════════
    // FIX 3: Add checkSimilarCustomers to preload.js
    // ═══════════════════════════════════════════
    console.log('[3/5] إضافة API في preload.js...');

    if (!preloadSrc.includes('check-similar-customers')) {
        const insertPoint = preloadSrc.indexOf("deleteCustomer:");
        if (insertPoint !== -1) {
            const lineEnd = preloadSrc.indexOf('\n', insertPoint);
            preloadSrc = preloadSrc.substring(0, lineEnd + 1) +
                "    checkSimilarCustomers: (name) => ipcRenderer.invoke('check-similar-customers', name),\n" +
                preloadSrc.substring(lineEnd + 1);
            changes++;
            console.log('   ✅ تم إضافة checkSimilarCustomers في preload');
        } else {
            console.log('   ❌ لم يُعثر على deleteCustomer في preload');
        }
    } else {
        console.log('   ⏭️  checkSimilarCustomers موجود مسبقاً');
    }

    // ═══════════════════════════════════════════
    // FIX 4: Enhance invoice.js customer dropdown
    // ═══════════════════════════════════════════
    console.log('[4/5] تحسين القائمة المنسدلة في invoice.js...');

    const oldDropdown = `    _dropdownCustomers = customers;

    dropdown.innerHTML = customers.map(function(c, i) {
        var isBlacklisted = c.is_blacklisted ? true : false;
        var blacklistClass = isBlacklisted ? 'blacklisted' : '';
        return '<div class="customer-dropdown-item ' + blacklistClass + '" data-cust-idx="' + i + '"><div class="customer-item-name">' + escapeHtml(c.name) + (isBlacklisted ? ' ' : '') + '</div><div class="customer-item-phone">' + (c.phone || '') + '</div></div>';
    }).join('');`;

    const newDropdown = `    _dropdownCustomers = customers;

    dropdown.innerHTML = customers.map(function(c, i) {
        var isBlacklisted = c.is_blacklisted ? true : false;
        var blacklistClass = isBlacklisted ? 'blacklisted' : '';
        var debtStr = '';
        if (c.total_debt && c.total_debt > 0) {
            debtStr = '<span style="color:#e74c3c;font-size:11px;margin-right:6px;">💰 دين: ' + parseFloat(c.total_debt).toFixed(2) + '₪</span>';
        }
        var lastPurchase = '';
        if (c.last_purchase_date) {
            try {
                var d = new Date(c.last_purchase_date);
                var now = new Date();
                var diffDays = Math.floor((now - d) / (1000*60*60*24));
                if (diffDays === 0) lastPurchase = '<span style="color:#27ae60;font-size:11px;">🕐 اليوم</span>';
                else if (diffDays === 1) lastPurchase = '<span style="color:#27ae60;font-size:11px;">🕐 أمس</span>';
                else if (diffDays <= 7) lastPurchase = '<span style="color:#2980b9;font-size:11px;">🕐 قبل ' + diffDays + ' أيام</span>';
                else if (diffDays <= 30) lastPurchase = '<span style="color:#7f8c8d;font-size:11px;">🕐 قبل ' + Math.floor(diffDays/7) + ' أسابيع</span>';
                else lastPurchase = '<span style="color:#95a5a6;font-size:11px;">🕐 قبل ' + Math.floor(diffDays/30) + ' شهور</span>';
            } catch(e) {}
        }
        var invoiceCount = c.invoice_count ? '<span style="color:#8e44ad;font-size:11px;margin-right:6px;">📦 ' + c.invoice_count + ' فاتورة</span>' : '';
        var matchInfo = '';
        if (c._matchReason && c._matchReason.startsWith('alias:')) {
            matchInfo = '<div style="font-size:10px;color:#e67e22;">↳ معروف أيضاً بـ: ' + escapeHtml(c._matchReason.replace('alias:', '')) + '</div>';
        } else if (c._matchReason === 'phone') {
            matchInfo = '<div style="font-size:10px;color:#3498db;">↳ تطابق برقم الهاتف</div>';
        }
        var extraInfo = (debtStr || invoiceCount || lastPurchase) ?
            '<div class="customer-item-extra" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px;">' + debtStr + invoiceCount + lastPurchase + '</div>' : '';
        return '<div class="customer-dropdown-item ' + blacklistClass + '" data-cust-idx="' + i + '" style="padding:8px 12px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div class="customer-item-name" style="font-weight:600;">' + escapeHtml(c.name) + (isBlacklisted ? ' ⛔' : '') + '</div>' +
            '<div class="customer-item-phone" style="color:#7f8c8d;font-size:12px;direction:ltr;">' + (c.phone || '') + '</div>' +
            '</div>' +
            matchInfo + extraInfo + '</div>';
    }).join('');`;

    if (invoiceSrc.includes(oldDropdown)) {
        invoiceSrc = invoiceSrc.replace(oldDropdown, newDropdown);
        changes++;
        console.log('   ✅ تم تحسين القائمة المنسدلة');
    } else {
        console.log('   ⚠️  لم يُعثر على كود الدروب داون القديم بالضبط - محاولة بديلة...');
        // More flexible replacement
        if (invoiceSrc.includes('_dropdownCustomers = customers;') && invoiceSrc.includes('customer-dropdown-item')) {
            // Find and replace the dropdown rendering section
            const startMarker = '_dropdownCustomers = customers;';
            const startIdx = invoiceSrc.indexOf(startMarker);
            // Find the end of the join(''); line
            const joinIdx = invoiceSrc.indexOf("}).join('');", startIdx);
            if (joinIdx !== -1) {
                const endIdx = joinIdx + "}).join('');".length;
                invoiceSrc = invoiceSrc.substring(0, startIdx) + newDropdown.trimStart() + invoiceSrc.substring(endIdx);
                changes++;
                console.log('   ✅ تم تحسين القائمة المنسدلة (طريقة بديلة)');
            }
        }
    }

    // ═══════════════════════════════════════════
    // FIX 5: Add duplicate detection to handleAddCustomer in invoice.js
    // ═══════════════════════════════════════════
    console.log('[5/5] إضافة كشف التكرار عند إضافة زبون...');

    const oldAddCustomer = `async function handleAddCustomer() {
    const name = document.getElementById('newCustomerName')?.value.trim();
    const phone = document.getElementById('newCustomerPhone')?.value.trim();
    const address = document.getElementById('newCustomerAddress')?.value.trim();
    const debtLimit = parseFloat(document.getElementById('newCustomerDebtLimit')?.value) || 0;
    const notes = document.getElementById('newCustomerNotes')?.value.trim();

    if (!name) {
        showToast('❌ أدخل اسم الزبون', 'error');
        document.getElementById('newCustomerName')?.focus();
        return;
    }

    try {
        const result = await window.api.addCustomer({`;

    const newAddCustomer = `async function handleAddCustomer() {
    const name = document.getElementById('newCustomerName')?.value.trim();
    const phone = document.getElementById('newCustomerPhone')?.value.trim();
    const address = document.getElementById('newCustomerAddress')?.value.trim();
    const debtLimit = parseFloat(document.getElementById('newCustomerDebtLimit')?.value) || 0;
    const notes = document.getElementById('newCustomerNotes')?.value.trim();

    if (!name) {
        showToast('❌ أدخل اسم الزبون', 'error');
        document.getElementById('newCustomerName')?.focus();
        return;
    }

    // ═══ كشف التكرار: تحقق من وجود زبون مشابه ═══
    try {
        if (window.api.checkSimilarCustomers) {
            const similarResult = await window.api.checkSimilarCustomers(name);
            if (similarResult.success && similarResult.similar && similarResult.similar.length > 0) {
                let msg = '⚠️ تم العثور على زبائن مشابهين:\\n\\n';
                similarResult.similar.forEach(function(s) {
                    msg += s.label + ': ' + s.name + (s.phone ? ' (' + s.phone + ')' : '') + '\\n';
                });
                msg += '\\nهل تريد الإضافة على أي حال؟';
                if (!confirm(msg)) {
                    // حاول البحث عن الزبون الأول المشابه واختياره
                    var firstSimilar = similarResult.similar[0];
                    if (firstSimilar && firstSimilar.id && confirm('هل تريد اختيار "' + firstSimilar.name + '" بدلاً من الإضافة؟')) {
                        hideModal('addCustomerModal');
                        selectCustomer({
                            id: firstSimilar.id,
                            name: firstSimilar.name,
                            phone: firstSimilar.phone || '',
                            is_blacklisted: false,
                            current_debt: 0,
                            debt_ceiling: 0
                        });
                        return;
                    }
                    return;
                }
            }
        }
    } catch (e) {
        console.log('تخطي فحص التشابه:', e.message);
    }

    try {
        const result = await window.api.addCustomer({`;

    if (invoiceSrc.includes(oldAddCustomer)) {
        invoiceSrc = invoiceSrc.replace(oldAddCustomer, newAddCustomer);
        changes++;
        console.log('   ✅ تم إضافة كشف التكرار');
    } else {
        console.log('   ⚠️  محاولة بحث بديلة عن handleAddCustomer...');
        // Try flexible match
        if (invoiceSrc.includes('async function handleAddCustomer()') && invoiceSrc.includes("await window.api.addCustomer({")) {
            const fnStart = invoiceSrc.indexOf('async function handleAddCustomer()');
            const addCallIdx = invoiceSrc.indexOf("await window.api.addCustomer({", fnStart);
            // Find the "try {" right before addCustomer call
            const tryIdx = invoiceSrc.lastIndexOf('try {', addCallIdx);
            if (tryIdx > fnStart) {
                // Insert duplicate check before the try block
                const dupCheck = `
    // ═══ كشف التكرار: تحقق من وجود زبون مشابه ═══
    try {
        if (window.api.checkSimilarCustomers) {
            const similarResult = await window.api.checkSimilarCustomers(name);
            if (similarResult.success && similarResult.similar && similarResult.similar.length > 0) {
                let msg = '⚠️ تم العثور على زبائن مشابهين:\\n\\n';
                similarResult.similar.forEach(function(s) {
                    msg += s.label + ': ' + s.name + (s.phone ? ' (' + s.phone + ')' : '') + '\\n';
                });
                msg += '\\nهل تريد الإضافة على أي حال؟';
                if (!confirm(msg)) {
                    var firstSimilar = similarResult.similar[0];
                    if (firstSimilar && firstSimilar.id && confirm('هل تريد اختيار "' + firstSimilar.name + '" بدلاً من الإضافة؟')) {
                        hideModal('addCustomerModal');
                        selectCustomer({
                            id: firstSimilar.id, name: firstSimilar.name,
                            phone: firstSimilar.phone || '', is_blacklisted: false,
                            current_debt: 0, debt_ceiling: 0
                        });
                        return;
                    }
                    return;
                }
            }
        }
    } catch (e) { console.log('تخطي فحص التشابه:', e.message); }

`;
                invoiceSrc = invoiceSrc.substring(0, tryIdx) + dupCheck + invoiceSrc.substring(tryIdx);
                changes++;
                console.log('   ✅ تم إضافة كشف التكرار (طريقة بديلة)');
            }
        }
    }

    // ═══════════════════════════════════════════
    // SAVE FILES
    // ═══════════════════════════════════════════
    if (changes === 0) {
        console.log('\n❌ لم يتم تطبيق أي تغيير!');
        process.exit(1);
    }

    // Backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.copyFileSync(mainPath, mainPath + '.bak-' + timestamp);
    fs.copyFileSync(invoicePath, invoicePath + '.bak-' + timestamp);
    fs.copyFileSync(preloadPath, preloadPath + '.bak-' + timestamp);
    console.log('\n💾 نسخ احتياطية محفوظة');

    fs.writeFileSync(mainPath, mainSrc, 'utf8');
    fs.writeFileSync(invoicePath, invoiceSrc, 'utf8');
    fs.writeFileSync(preloadPath, preloadSrc, 'utf8');

    console.log(`\n✅ تم تطبيق ${changes} تغيير بنجاح!`);
    console.log('\n═══════════════════════════════════════════');
    console.log(' ماذا تغيّر:');
    console.log('═══════════════════════════════════════════');
    console.log(' 1️⃣  البحث يتجاهل الهمزات والتاء المربوطة');
    console.log('    ("احمد" يجد "أحمد" و "إحمد")');
    console.log(' 2️⃣  البحث يشمل الأسماء البديلة (aliases)');
    console.log('    (إذا سجلت "سناء" كاسم بديل لزبون, ستجده عند البحث)');
    console.log(' 3️⃣  القائمة تظهر: الدين الحالي + عدد الفواتير + آخر شراء');
    console.log(' 4️⃣  عند إضافة زبون جديد يظهر تحذير إذا وُجد اسم مشابه');
    console.log(' 5️⃣  النتائج مرتبة: الأكثر تطابقاً أولاً ثم المتكررين');
    console.log('\n🔄 شغّل التطبيق: npm start');
}

applyFix();
