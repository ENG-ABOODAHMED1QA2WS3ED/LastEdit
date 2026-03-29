/* ========================================
   invoice.js - أبو كميل POS v5.0
   شاشة الفاتورة - متوافق مع API
======================================== */

let currentUser = null;
let invoiceItems = [];
let selectedCustomer = null;
let invoiceNumber = '';
let selectedPaymentMethod = 'cash';
let selectedTransferSource = 'bank_palestine';
let selectedDeadlineHours = 0;
let invoiceStartTime = null;
let lastInvoiceData = null; // بيانات آخر فاتورة للطباعة
let storeSettings = {};     // إعدادات المحل

// ─── التهيئة ───
document.addEventListener('DOMContentLoaded', () => {
    // Delegated event handler for remove-item buttons (CSP safe)
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('.remove-item-btn[data-remove-index]');
        if (btn) {
            const index = parseInt(btn.getAttribute('data-remove-index'));
            if (!isNaN(index)) {
                removeItem(index);
            }
        }
    });
    checkSession();
    generateInvoiceNumber();
    startClock();
    startTimer();
    loadTodayStats();
    // جلب إعدادات المحل للطباعة
    window.api.getStoreSettings().then(ss => { if (ss && ss.success) storeSettings = ss.settings || {}; }).catch(() => {});
    focusBarcode();
    bindAllEvents();
    updateTotals();
    console.log('✅ شاشة الفاتورة جاهزة v5.0');
});

//  إعادة تهيئة عند العودة للصفحة (حل مشكلة تعليق البحث) 
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        console.log('[invoice] Page restored from cache - rebinding events');
        bindAllEvents();
    }
});

//  Fallback: إعادة تهيئة عند focus على الصفحة 
let _lastBindTime = 0;
window.addEventListener('focus', () => {
    const now = Date.now();
    if (now - _lastBindTime > 3000) {
        _lastBindTime = now;
        const cs = document.getElementById('customerSearch');
        if (cs && !cs._hasBoundListener) {
            console.log('[invoice] Re-binding search listener on focus');
            let debounce;
            cs.addEventListener('input', () => {
                clearTimeout(debounce);
                const query = cs.value.trim();
                if (query.length >= 2) {
                    debounce = setTimeout(() => searchCustomers(query), 300);
                } else {
                    hideCustomerDropdown();
                }
            });
            cs._hasBoundListener = true;
        }
    }
});

// ═══════════════════════════════════════════
//          الجلسة والمعلومات
// ═══════════════════════════════════════════

function checkSession() {
    const userData = sessionStorage.getItem('currentUser');
    if (!userData) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = JSON.parse(userData);

    const cashierInfo = document.getElementById('cashierInfo');
    if (cashierInfo) {
        const roleLabel = { admin: 'مدير', owner: 'صاحب المحل', accountant: 'محاسب', cashier: 'كاشير' };
        cashierInfo.textContent = `👤 ${currentUser.display_name} (${roleLabel[currentUser.role] || currentUser.role})`;
    }
}

function generateInvoiceNumber() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    invoiceNumber = `INV-${date}-${time}-${rand}`;

    const el = document.getElementById('invoiceNumber');
    if (el) el.textContent = `فاتورة جديدة #${rand}`;
}

function startClock() {
    function update() {
        const el = document.getElementById('currentTime');
        if (el) el.textContent = new Date().toLocaleTimeString('ar-PS', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    update();
    setInterval(update, 1000);
}

function startTimer() {
    invoiceStartTime = new Date();
    function update() {
        const diff = Math.floor((new Date() - invoiceStartTime) / 1000);
        const mins = Math.floor(diff / 60);
        const secs = diff % 60;
        const el = document.getElementById('invoiceTimer');
        if (el) el.textContent = `⏱️ مفتوحة منذ ${mins}:${String(secs).padStart(2, '0')}`;
    }
    update();
    setInterval(update, 1000);
}

async function loadTodayStats() {
    try {
        const result = await window.api.getTodayStats();
        if (result.success && result.stats) {
            console.log(`📊 إحصائيات اليوم: ${result.stats.sales_count} فاتورة | ${result.stats.sales_total}₪`);
        }
    } catch (e) {
        console.error('خطأ الإحصائيات:', e);
    }
}

function focusBarcode() {
    const input = document.getElementById('barcodeInput');
    if (input) input.focus();
}

// ═══════════════════════════════════════════
//          ربط الأحداث
// ═══════════════════════════════════════════

function bindAllEvents() {

    // 1. الباركود
    const barcodeInput = document.getElementById('barcodeInput');
    if (barcodeInput) {
        barcodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addProductByBarcode();
            }
        });
    }

    // 2. بحث الزبائن
    const customerSearch = document.getElementById('customerSearch');
    if (customerSearch) {
        let debounce;
        customerSearch.addEventListener('input', () => {
            clearTimeout(debounce);
            const query = customerSearch.value.trim();
            if (query.length >= 2) {
                debounce = setTimeout(() => searchCustomers(query), 300);
            } else {
                hideCustomerDropdown();
            }
        });
    }

    // 3. زبون عابر
    document.getElementById('walkInBtn')?.addEventListener('click', selectWalkIn);

    // 4. إزالة الزبون
    document.getElementById('removeCustomerBtn')?.addEventListener('click', removeCustomer);

    // 5. إضافة زبون جديد
    document.getElementById('addCustomerBtn')?.addEventListener('click', openAddCustomerModal);
    document.getElementById('closeAddCustomer')?.addEventListener('click', () => hideModal('addCustomerModal'));
    document.getElementById('cancelAddCustomer')?.addEventListener('click', () => hideModal('addCustomerModal'));
    document.getElementById('confirmAddCustomer')?.addEventListener('click', handleAddCustomer);

    // 6. بحث يدوي
    document.getElementById('manualSearchBtn')?.addEventListener('click', openManualSearch);
    document.getElementById('closeManualSearch')?.addEventListener('click', () => hideModal('manualSearchModal'));

    const manualSearch = document.getElementById('manualProductSearch');
    if (manualSearch) {
        let debounce;
        manualSearch.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => searchProductsManual(manualSearch.value.trim()), 300);
        });
    }

    // 7. طرق الدفع
    document.querySelectorAll('.payment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const method = btn.dataset.method;
            selectPaymentMethod(method);
        });
    });

    document.getElementById('payDebt')?.addEventListener('click', () => selectPaymentMethod('debt'));

    // 8. الكاش - حساب الباقي
    const cashReceived = document.getElementById('cashReceived');
    if (cashReceived) {
        cashReceived.addEventListener('input', updateCashChange);
    }

    // 9. تشيك بوكس الحساب البديل
    const altAccountCheck = document.getElementById('altAccountCheck');
    if (altAccountCheck) {
        altAccountCheck.addEventListener('change', (e) => {
            const fields = document.getElementById('altAccountFields');
            if (fields) {
                fields.style.display = e.target.checked ? 'flex' : 'none';
                if (e.target.checked) {
                    document.getElementById('altAccountName')?.focus();
                }
            }
        });

    // 9.5 التحقق من الرقم المرجعي البنكي
    const bankRefInput = document.getElementById("bankReference");
    if (bankRefInput) {
        bankRefInput.addEventListener("input", (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, "");
        });
        bankRefInput.addEventListener("blur", async () => {
            const ref = bankRefInput.value.trim();
            const status = document.getElementById("bankRefStatus");
            const msg = document.getElementById("bankRefMessage");
            if (!ref) {
                if (status) status.textContent = "";
                if (msg) { msg.textContent = "يظهر في إشعار التحويل من البنك  يضمن مطابقة فورية 100%"; msg.style.color = "#666"; }
                return;
            }
            if (ref.length < 8) {
                if (status) status.textContent = "";
                if (msg) { msg.textContent = "الرقم المرجعي يجب أن يكون 8-10 أرقام"; msg.style.color = "#e67e22"; }
                return;
            }
            try {
                const result = await window.api.checkBankReference(ref);
                if (result.exists) {
                    if (status) status.textContent = "";
                    if (msg) { msg.textContent = "هذا الرقم مستخدم بفاتورة " + result.customerName + " (" + result.amount + ")"; msg.style.color = "#e74c3c"; }
                    bankRefInput.style.borderColor = "#e74c3c";
                } else {
                    if (status) status.textContent = "";
                    if (msg) { msg.textContent = "رقم مرجعي صالح  سيتم المطابقة تلقائيا عند رفع الكشف"; msg.style.color = "#27ae60"; }
                    bankRefInput.style.borderColor = "#27ae60";
                }
            } catch(e) {
                if (status) status.textContent = "";
                if (msg) { msg.textContent = "سيتم التحقق عند رفع الكشف"; msg.style.color = "#666"; }
            }
        });
    }
    }

    // 10. التحويل - فوري/مؤجل
    document.querySelectorAll('input[name="transferType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const deferred = document.getElementById('deferredOptions');
            if (deferred) {
                deferred.style.display = e.target.value === 'deferred' ? 'block' : 'none';
            }
        });
    });

    // 11. المهلة
    document.querySelectorAll('.deadline-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.deadline-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedDeadlineHours = parseInt(btn.dataset.hours) || 0;
        });
    });

    // 12. الدفع المختلط
    document.getElementById('mixedPaymentLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        selectPaymentMethod('mixed');
    });

    const mixedAmount1 = document.getElementById('mixedAmount1');
    if (mixedAmount1) {
        mixedAmount1.addEventListener('input', updateMixedRemaining);
    }

    // 13. سبب الدين
    document.querySelectorAll('input[name="debtReason"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const otherInput = document.getElementById('debtReasonOther');
            if (otherInput) {
                otherInput.style.display = e.target.value === 'other' ? 'block' : 'none';
            }
        });
    });

    // 14. PIN
    document.querySelectorAll('.pin-digit').forEach(input => {
        input.addEventListener('input', (e) => {
            if (e.target.value.length === 1) {
                const next = e.target.nextElementSibling;
                if (next && next.classList.contains('pin-digit')) next.focus();
            }
            checkPinComplete();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value) {
                const prev = e.target.previousElementSibling;
                if (prev && prev.classList.contains('pin-digit')) prev.focus();
            }
        });
    });

    // 15. حفظ الفاتورة
    document.getElementById('saveInvoiceBtn')?.addEventListener('click', handleSaveInvoice);

    // 16. طباعة
    document.getElementById('printBtn')?.addEventListener('click', () => { if (lastInvoiceData) printReceipt(lastInvoiceData); else showToast('لا توجد فاتورة للطباعة', 'info'); });

    // 17. الخروج
    document.getElementById('exitInvoiceBtn')?.addEventListener('click', showExitModal);
    document.getElementById('confirmExit')?.addEventListener('click', () => { window.location.href = 'index.html'; });
    document.getElementById('cancelExit')?.addEventListener('click', () => hideModal('exitModal'));

    // 18. اختصارات لوحة المفاتيح
    document.addEventListener('keydown', handleKeyboard);

    // 19. النقر على الصفحة يعيد التركيز للباركود
    document.addEventListener('click', (e) => {
        if (!e.target.closest('input, select, textarea, button, .modal-overlay, .customer-dropdown')) {
            focusBarcode();
        }
    });

    console.log('✅ تم ربط جميع الأحداث');
}

// ═══════════════════════════════════════════
//          المنتجات
// ═══════════════════════════════════════════

async function addProductByBarcode() {
    const input = document.getElementById('barcodeInput');
    if (!input) return;
    const barcode = input.value.trim();
    if (!barcode) return;

    try {
        const result = await window.api.getProductByBarcode(barcode);
        if (result.success && result.product) {
            addProductToInvoice(result.product);
            input.value = '';
            console.log(`✅ تم العثور على المنتج: ${result.product.name}`);
        } else {
            showToast('❌ المنتج غير موجود', 'error');
            input.select();
        }
    } catch (error) {
        console.error('خطأ البحث:', error);
        showToast('❌ خطأ في البحث', 'error');
    }
    focusBarcode();
}

function addProductToInvoice(product) {
    const existing = invoiceItems.find(item => item.product_id === product.id);
    if (existing) {
        existing.quantity += 1;
        existing.total_price = existing.quantity * existing.unit_price;
    } else {
        invoiceItems.push({
            product_id: product.id,
            barcode: product.barcode || '',
            name: product.name,
            unit_price: product.price,
            quantity: 1,
            total_price: product.price
        });
    }
    updateProductTable();
    updateTotals();
}

function updateProductTable() {
    const tbody = document.getElementById('productsTableBody');
    const empty = document.getElementById('emptyProducts');
    if (!tbody) return;

    if (invoiceItems.length === 0) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = 'flex';
        return;
    }

    if (empty) empty.style.display = 'none';

    tbody.innerHTML = invoiceItems.map((item, i) => `
        <tr>
            <td class="col-product">${escapeHtml(item.name)}</td>
            <td class="col-qty">
                <div class="qty-control">
                    <button class="qty-btn" data-qty-index="${i}" data-qty-delta="-1">−</button>
                    <span class="qty-value">${item.quantity}</span>
                    <button class="qty-btn" data-qty-index="${i}" data-qty-delta="1">+</button>
                </div>
            </td>
            <td class="col-price">${item.unit_price.toFixed(2)}</td>
            <td class="col-total">${item.total_price.toFixed(2)}</td>
            <td class="col-action">
                <button class="remove-item-btn" data-remove-index="${i}">حذف</button>
            </td>
        </tr>
    `).join('');
}

function changeQuantity(index, delta) {
    if (index < 0 || index >= invoiceItems.length) return;
    invoiceItems[index].quantity = Math.max(1, invoiceItems[index].quantity + delta);
    invoiceItems[index].total_price = invoiceItems[index].quantity * invoiceItems[index].unit_price;
    updateProductTable();
    updateTotals();
}

// Event delegation for quantity buttons (CSP-compliant)
document.addEventListener("click", function(e) {
    var btn = e.target.closest("[data-qty-index]");
    if (btn) {
        var index = parseInt(btn.getAttribute("data-qty-index"));
        var delta = parseInt(btn.getAttribute("data-qty-delta"));
        changeQuantity(index, delta);
    }
});

function removeItem(index) {
    invoiceItems.splice(index, 1);
    updateProductTable();
    updateTotals();
}

// ═══════════════════════════════════════════
//          الإجمالي
// ═══════════════════════════════════════════

function getInvoiceTotal() {
    return invoiceItems.reduce((sum, item) => sum + item.total_price, 0);
}

function updateTotals() {
    const total = getInvoiceTotal();

    const totalEl = document.getElementById('totalAmount');
    if (totalEl) totalEl.textContent = total.toFixed(2) + '₪';

    updateCashChange();
    updateMixedRemaining();

    const hasItems = invoiceItems.length > 0;

    const saveBtn = document.getElementById('saveInvoiceBtn');
    if (saveBtn) {
        saveBtn.disabled = !hasItems;
        saveBtn.style.opacity = hasItems ? '1' : '0.5';
    }

    ['payCash', 'payTransfer', 'payWallet', 'payCard', 'payDebt'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = !hasItems;
            btn.style.opacity = hasItems ? '1' : '0.6';
        }
    });

    console.log(`📊 الإجمالي: ${total.toFixed(2)}₪ | أصناف: ${invoiceItems.length}`);
}

function updateCashChange() {
    const cashInput = document.getElementById('cashReceived');
    const changeEl = document.getElementById('cashChange');
    if (!cashInput || !changeEl) return;

    const paid = parseFloat(cashInput.value) || 0;
    const total = getInvoiceTotal();
    const change = paid - total;

    changeEl.textContent = change.toFixed(2) + '₪';
    changeEl.style.color = change >= 0 ? '#27ae60' : '#e74c3c';
}

function updateMixedRemaining() {
    const amount1 = parseFloat(document.getElementById('mixedAmount1')?.value) || 0;
    const total = getInvoiceTotal();
    const remaining = total - amount1;

    const el = document.getElementById('mixedRemaining');
    if (el) el.textContent = `الباقي: ${remaining.toFixed(2)}₪`;
}

// ═══════════════════════════════════════════
//          الزبائن
// ═══════════════════════════════════════════

async function searchCustomers(query) {
    try {
        const result = await window.api.searchCustomers(query);
        const customers = result.success ? (result.customers || []) : [];
        console.log(`نتائج بحث الزبائن: ${customers.length}`);
        showCustomerDropdown(customers);
    } catch (error) {
        console.error('خطأ بحث الزبائن:', error);
    }
}

function showCustomerDropdown(customers) {
    var dropdown = document.getElementById('customerDropdown');
    if (!dropdown) return;

    if (!customers || customers.length === 0) {
        dropdown.innerHTML = '<div class="customer-dropdown-item" style="color:#7f8c8d; text-align:center;">لم يتم العثور على زبائن</div>';
        dropdown.classList.add('show');
        dropdown.style.display = 'block';
        return;
    }

    _dropdownCustomers = customers;

    dropdown.innerHTML = customers.map(function(c, i) {
        var isBlacklisted = c.is_blacklisted ? true : false;
        var blacklistClass = isBlacklisted ? 'blacklisted' : '';
        return '<div class="customer-dropdown-item ' + blacklistClass + '" data-cust-idx="' + i + '"><div class="customer-item-name">' + escapeHtml(c.name) + (isBlacklisted ? ' ' : '') + '</div><div class="customer-item-phone">' + (c.phone || '') + '</div></div>';
    }).join('');

    dropdown.querySelectorAll('[data-cust-idx]').forEach(function(el) {
        el.addEventListener('click', function() {
            var idx = parseInt(this.getAttribute('data-cust-idx'));
            var cust = _dropdownCustomers[idx];
            if (cust && cust.is_blacklisted) {
                if (!confirm('تحذير: هذا الزبون في القائمة السوداء!\nالزبون: ' + cust.name + '\nهل تريد المتابعة؟ (لن يمكن البيع بالدين)')) {
                    return;
                }
            }
            selectCustomerFromDropdown(cust);
        });
    });

    dropdown.classList.add('show');
    dropdown.style.display = 'block';
}

function selectCustomerFromDropdown(customer) {
    selectCustomer(customer);
}

function hideCustomerDropdown() {
    const dropdown = document.getElementById('customerDropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
        dropdown.style.display = 'none';
    }
}

function selectCustomer(customer) {
    selectedCustomer = customer;
    hideCustomerDropdown();

    const searchInput = document.getElementById('customerSearch');
    if (searchInput) searchInput.value = '';

    const selected = document.getElementById('selectedCustomer');
    if (selected) selected.style.display = 'block';

    const nameEl = document.getElementById('customerName');
    if (nameEl) nameEl.textContent = `👤 ${customer.name}`;

    const phoneEl = document.getElementById('customerPhone');
    if (phoneEl) phoneEl.textContent = customer.phone ? `📞 ${customer.phone}` : '';

    const debtInfo = document.getElementById('customerDebtInfo');
    if (debtInfo) {
        if (customer.is_blacklisted) {
            debtInfo.innerHTML = '<span class="debt-status-black">⛔ زبون محظور - لا يمكن البيع بالدين</span>';
        } else {
            debtInfo.innerHTML = '<span class="debt-status-green">✅ لا يوجد ديون</span>';
        }
    }

    // تحميل ديون الزبون
    loadCustomerDebtInfo(customer.id);

    const debtBtn = document.getElementById('payDebt');
    if (debtBtn) debtBtn.style.display = 'block';

    console.log(`✅ تم اختيار الزبون: ${customer.name}`);
    focusBarcode();
}

async function loadCustomerDebtInfo(customerId) {
    if (!customerId) return;
    try {
        const result = await window.api.getCustomerDebts(customerId);
        if (result.success) {
            const totalDebt = result.total_debt || 0;
            selectedCustomer.current_debt = totalDebt;

            const debtInfo = document.getElementById('customerDebtInfo');
            if (debtInfo) {
                if (totalDebt > 0) {
                    debtInfo.innerHTML = `<span class="debt-status-red">دين حالي: ${totalDebt.toFixed(2)}₪</span> | <span>سقف: ${(selectedCustomer.debt_ceiling || 0).toFixed(2)}₪</span>`;
                } else {
                    debtInfo.innerHTML = '<span class="debt-status-green">✅ لا يوجد ديون</span>';
                }
            }

            updateDebtInfo();
        }
    } catch (e) {
        console.error('خطأ تحميل ديون الزبون:', e);
    }
}

function selectWalkIn() {
    selectedCustomer = { id: null, name: 'زبون عابر', phone: '', is_blacklisted: false, current_debt: 0, debt_ceiling: 0 };

    const selected = document.getElementById('selectedCustomer');
    if (selected) selected.style.display = 'block';

    const nameEl = document.getElementById('customerName');
    if (nameEl) nameEl.textContent = '👤 زبون عابر';

    const phoneEl = document.getElementById('customerPhone');
    if (phoneEl) phoneEl.textContent = '';

    const debtInfo = document.getElementById('customerDebtInfo');
    if (debtInfo) debtInfo.innerHTML = '';

    const debtBtn = document.getElementById('payDebt');
    if (debtBtn) debtBtn.style.display = 'none';

    hideCustomerDropdown();
    const searchInput = document.getElementById('customerSearch');
    if (searchInput) searchInput.value = '';

    focusBarcode();
}

function removeCustomer() {
    selectedCustomer = null;

    const selected = document.getElementById('selectedCustomer');
    if (selected) selected.style.display = 'none';

    const debtBtn = document.getElementById('payDebt');
    if (debtBtn) debtBtn.style.display = 'none';

    if (selectedPaymentMethod === 'debt') {
        selectPaymentMethod('cash');
    }

    focusBarcode();
}

function updateDebtInfo() {
    if (!selectedCustomer || !selectedCustomer.id) return;

    const currentDebt = selectedCustomer.current_debt || 0;
    const debtCeiling = selectedCustomer.debt_ceiling || 0;
    const available = Math.max(0, debtCeiling - currentDebt);

    const balanceEl = document.getElementById('debtCurrentBalance');
    if (balanceEl) balanceEl.textContent = currentDebt.toFixed(2) + '₪';

    const availableEl = document.getElementById('debtAvailable');
    if (availableEl) availableEl.textContent = available.toFixed(2) + '₪';
}

// ─── إضافة زبون جديد ───
function openAddCustomerModal() {
    document.getElementById('newCustomerName').value = '';
    document.getElementById('newCustomerPhone').value = '';
    document.getElementById('newCustomerAddress').value = '';
    document.getElementById('newCustomerDebtLimit').value = '0';
    document.getElementById('newCustomerNotes').value = '';

    showModal('addCustomerModal');
    document.getElementById('newCustomerName')?.focus();
}

async function handleAddCustomer() {
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
        const result = await window.api.addCustomer({
            name,
            phone,
            address,
            customer_type: 'regular',
            debt_ceiling: debtLimit,
            notes
        });

        if (result.success) {
            showToast(`✅ تم إضافة ${name}`, 'success');
            hideModal('addCustomerModal');

            selectCustomer({
                id: result.id,
                name,
                phone,
                address,
                customer_type: 'regular',
                debt_ceiling: debtLimit,
                current_debt: 0,
                is_blacklisted: false,
                notes
            });
        } else {
            showToast('❌ ' + (result.error || 'خطأ في الإضافة'), 'error');
        }
    } catch (error) {
        console.error('خطأ إضافة زبون:', error);
        showToast('❌ خطأ في الإضافة', 'error');
    }
}

// ═══════════════════════════════════════════
//          البحث اليدوي
// ═══════════════════════════════════════════

function openManualSearch() {
    showModal('manualSearchModal');
    const input = document.getElementById('manualProductSearch');
    if (input) {
        input.value = '';
        input.focus();
    }
    searchProductsManual('');
}

async function searchProductsManual(query) {
    try {
        let result;
        if (query) {
            result = await window.api.searchProducts(query);
        } else {
            result = await window.api.getProducts();
        }

        const products = result.success ? (result.products || []) : [];
        const container = document.getElementById('manualSearchResults');
        if (!container) return;

        if (products.length === 0) {
            container.innerHTML = '<div style="padding:20px; text-align:center; color:#7f8c8d;">لا توجد نتائج</div>';
            return;
        }

var _searchProducts = products;
        container.innerHTML = products.map(function(p, i) {
            return '<div class="manual-result-item" data-manual-idx="' + i + '">' +
                '<div><div class="manual-result-name">' + escapeHtml(p.name) + '</div>' +
                '<div class="manual-result-category">' + escapeHtml(p.category_name || '') + ' | ' + (p.barcode || '') + '</div></div>' +
                '<div class="manual-result-price">' + p.price.toFixed(2) + '</div></div>';
        }).join('');

        container.querySelectorAll('[data-manual-idx]').forEach(function(el) {
            el.addEventListener('click', function() {
                var idx = parseInt(this.getAttribute('data-manual-idx'));
                var p = _searchProducts[idx];
                if (p) {
                    addProductToInvoice({ id: p.id, barcode: p.barcode || '', name: p.name, price: p.price, category_name: p.category_name || '' });
                    hideModal('manualSearchModal');
                    focusBarcode();
                }
            });
        });


    } catch (error) {
        console.error('خطأ البحث:', error);
    }
}

function addManualProduct(id, barcode, name, price, category) {
    addProductToInvoice({ id, barcode, name, price, category_name: category });
    hideModal('manualSearchModal');
    focusBarcode();
}

// ═══════════════════════════════════════════
//          طرق الدفع
// ═══════════════════════════════════════════

function selectPaymentMethod(method) {
    selectedPaymentMethod = method;

    document.querySelectorAll('.payment-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.method === method);
    });

    ['cashDetails', 'transferDetails', 'debtDetails', 'mixedDetails'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    if (method === 'cash') {
        const el = document.getElementById('cashDetails');
        if (el) el.style.display = 'block';
        document.getElementById('cashReceived')?.focus();
    }
    else if (method === 'transfer' || method === 'wallet') {
        const el = document.getElementById('transferDetails');
        if (el) el.style.display = 'block';
        selectedTransferSource = method === 'wallet' ? 'palPay' : 'bank_palestine';
    }
    else if (method === 'card') {
        // فيزا
    }
    else if (method === 'debt') {
        if (!selectedCustomer || !selectedCustomer.id) {
            showToast('❌ اختر زبون أولاً (الدين غير متاح لزبون عابر)', 'error');
            selectPaymentMethod('cash');
            return;
        }
        const el = document.getElementById('debtDetails');
        if (el) el.style.display = 'block';
        updateDebtInfo();
    }
    else if (method === 'mixed') {
        const el = document.getElementById('mixedDetails');
        if (el) el.style.display = 'block';
        document.querySelectorAll('.payment-btn').forEach(btn => btn.classList.remove('active'));
        updateMixedRemaining();
    }

    console.log(`💳 طريقة الدفع: ${method}`);
}

async function checkPinComplete() {
    const digits = document.querySelectorAll('.pin-digit');
    let pin = '';
    digits.forEach(d => pin += d.value);

    if (pin.length === 4) {
        const result = await window.api.verifyOwnerPin(pin);
        const valid = result.success ? result.valid : false;
        const status = document.getElementById('pinStatus');
        if (status) {
            status.textContent = valid ? '✅ الرمز صحيح' : '❌ الرمز غير صحيح';
            status.style.color = valid ? '#27ae60' : '#e74c3c';
        }
    }
}

// ═══════════════════════════════════════════
//          حفظ الفاتورة
// ═══════════════════════════════════════════

async function handleSaveInvoice() {
    if (invoiceItems.length === 0) {
        showToast('❌ أضف منتجات أولاً', 'error');
        return;
    }

    // منع فاتورة بدون زبون إذا الدفع مش كاش
    if (!selectedCustomer || !selectedCustomer.id) {
        if (selectedPaymentMethod !== "cash" && selectedPaymentMethod !== "card") {
            showToast(" اختر زبون أولاً لطريقة الدفع هذه", "error");
            return;
        }
    }

    const total = getInvoiceTotal();
    let payments = [];

    if (selectedPaymentMethod === 'cash') {
        const paid = parseFloat(document.getElementById('cashReceived')?.value) || 0;
        if (paid < total) {
            showToast('❌ المبلغ المدفوع أقل من الإجمالي', 'error');
            document.getElementById('cashReceived')?.focus();
            return;
        }
        payments.push({
            method: 'cash',
            amount: total
        });
    }
    else if (selectedPaymentMethod === 'transfer' || selectedPaymentMethod === 'wallet') {
        const transferType = document.querySelector('input[name="transferType"]:checked')?.value || 'immediate';

        let payment = {
            method: selectedPaymentMethod === 'wallet' ? 'wallet' : 'transfer',
            amount: total,
            bank: selectedPaymentMethod === 'wallet' ? 'palpay' : 'bank_palestine',
            transfer_type: transferType === 'deferred' ? 'later' : 'now',
            timing: transferType === 'deferred' ? 'later' : 'now'
        };
        // إضافة المهلة للتحويل اللاحق
        if (transferType === 'deferred' && selectedDeadlineHours > 0) {
            payment.transfer_deadline_hours = selectedDeadlineHours;
        }
        const altCheck = document.getElementById('altAccountCheck');
        if (altCheck && altCheck.checked) {
            const altName = document.getElementById('altAccountName')?.value.trim();
            if (!altName) {
                showToast('❌ أدخل اسم صاحب الحساب البديل', 'error');
                document.getElementById('altAccountName')?.focus();
                return;
            }
            payment.alt_account_name = altName;
            payment.alt_account_relation = document.getElementById('altAccountRelation')?.value || '';
        }
        // إضافة الرقم المرجعي إن وجد
        const bankRefInput = document.getElementById("bankReference");
        if (bankRefInput && bankRefInput.value.trim()) {
            payment.bank_reference = bankRefInput.value.trim();
        }

        payments.push(payment);
    }
    else if (selectedPaymentMethod === 'card') {
        payments.push({ method: 'card', amount: total });
    }
    else if (selectedPaymentMethod === 'debt') {
        let pin = '';
        document.querySelectorAll('.pin-digit').forEach(d => pin += d.value);
        if (pin.length !== 4) {
            showToast('❌ أدخل رمز PIN كامل', 'error');
            return;
        }
        const pinResult = await window.api.verifyOwnerPin(pin);
        if (!pinResult.success || !pinResult.valid) {
            showToast('❌ رمز PIN غير صحيح', 'error');
            return;
        }

        const reasonRadio = document.querySelector('input[name="debtReason"]:checked');
        if (!reasonRadio) {
            showToast('❌ اختر سبب الدين', 'error');
            return;
        }
        let reason = reasonRadio.value;
        if (reason === 'other') {
            reason = document.getElementById('debtReasonOther')?.value.trim();
            if (!reason) {
                showToast('❌ أدخل سبب الدين', 'error');
                return;
            }
        }

        payments.push({
            method: 'debt',
            amount: total,
            debt_reason: reason
        });
    }
    else if (selectedPaymentMethod === 'mixed') {
        const method1 = document.getElementById('mixedMethod1')?.value;
        const amount1 = parseFloat(document.getElementById('mixedAmount1')?.value) || 0;
        const method2 = document.getElementById('mixedMethod2')?.value;
        const amount2 = total - amount1;

        if (amount1 <= 0 || amount2 <= 0) {
            showToast('❌ أدخل مبلغ صحيح للطريقة الأولى', 'error');
            return;
        }

        payments.push({ method: method1, amount: amount1 });
        payments.push({ method: method2, amount: amount2 });
    }

    // بناء بيانات الفاتورة
    const invoiceData = {
        customer_id: selectedCustomer?.id || null,
        customer_name: selectedCustomer?.name || 'زبون عابر',
        customer_phone: selectedCustomer?.phone || null,
        items: invoiceItems.map(item => ({
            product_id: item.product_id,
            name: item.name,
            barcode: item.barcode || '',
            quantity: item.quantity,
            price: item.unit_price
        })),
        payments: payments,
        discount: 0,
        notes: document.getElementById('invoiceNotes')?.value.trim() || ''
    };

    console.log('📤 بيانات الفاتورة:', JSON.stringify(invoiceData));

    try {
        const result = await window.api.saveInvoice(invoiceData);
        if (result.success) {
            // حفظ بيانات الفاتورة للطباعة
            lastInvoiceData = {
                invoiceNumber: invoiceNumber,
                invoiceId: result.invoice_id,
                total: total,
                items: [...invoiceItems],
                customer: selectedCustomer ? { ...selectedCustomer } : null,
                paymentMethod: selectedPaymentMethod,
                payments: [...(invoiceData.payments || [])],
                discount: invoiceData.discount || 0,
                notes: invoiceData.notes || '',
                date: new Date().toLocaleString('ar-PS'),
                cashReceived: parseFloat(document.getElementById('cashReceived')?.value) || 0
            };
            showSuccessOverlay(invoiceNumber, total);
            console.log(`✅ الفاتورة محفوظة: ${invoiceNumber} | ID: ${result.invoice_id}`);
        } else {
            showToast('❌ ' + (result.error || 'خطأ في الحفظ'), 'error');
            console.error('خطأ الحفظ:', result.error);
        }
    } catch (error) {
        console.error('خطأ حفظ الفاتورة:', error);
        showToast('❌ خطأ في حفظ الفاتورة', 'error');
    }
}

// ═══════════════════════════════════════════
//          بعد الحفظ
// ═══════════════════════════════════════════

function showSuccessOverlay(invNumber, total) {
    const methodLabels = {
        'cash': 'نقدي',
        'transfer': 'تحويل',
        'card': 'بطاقة',
        'debt': 'دين',
        'mixed': 'مختلط'
    };
    const methodIcons = {
        'cash': '💵',
        'transfer': '🏦',
        'card': '💳',
        'debt': '📋',
        'mixed': '🔀'
    };
    const pm = lastInvoiceData ? lastInvoiceData.paymentMethod : 'cash';
    const icon = methodIcons[pm] || '💵';
    const label = methodLabels[pm] || pm;

    let altInfo = '';
    if (lastInvoiceData && lastInvoiceData.payments) {
        lastInvoiceData.payments.forEach(function(p) {
            if (p.bank && p.bank !== 'bank_palestine') {
                altInfo = '<div style="color:#e67e22;font-size:13px;margin-top:4px;">⚠️ حساب بديل: ' + p.bank + '</div>';
            }
        });
    }

    const customerName = lastInvoiceData && lastInvoiceData.customer ? lastInvoiceData.customer.name : '';

    const reviewContent = document.getElementById('reviewContent');
    if (reviewContent) {
        reviewContent.innerHTML = '<div style="text-align:center;padding:20px;">' +
            '<div style="font-size:60px;margin-bottom:10px;">✅</div>' +
            '<div style="font-size:18px;font-weight:bold;margin-bottom:8px;">' + invNumber + '</div>' +
            '<div style="font-size:15px;margin-bottom:4px;">' + icon + ' ' + label + '</div>' +
            (customerName ? '<div style="font-size:14px;color:#555;margin-bottom:4px;">' + customerName + '</div>' : '') +
            altInfo +
            '<div style="font-size:28px;font-weight:bold;color:#27ae60;margin:12px 0;">' + parseFloat(total).toFixed(2) + '₪</div>' +
            '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px;">' +
            '<button id="receiptPrintBtn" style="padding:10px 24px;font-size:15px;background:#27ae60;color:white;border:none;border-radius:8px;cursor:pointer;">🖨️ طباعة إيصال</button>' +
            '<button id="receiptCloseBtn" style="padding:10px 24px;font-size:15px;background:#e0e0e0;color:#333;border:none;border-radius:8px;cursor:pointer;">✕ إغلاق</button>' +
            '</div></div>';

        // Attach event listeners AFTER innerHTML is set
        setTimeout(function() {
            var printBtn = document.getElementById('receiptPrintBtn');
            if (printBtn) {
                printBtn.addEventListener('click', function() {
                    printReceipt(lastInvoiceData);
                });
            }
            var closeBtn = document.getElementById('receiptCloseBtn');
            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    hideModal('reviewModal');
                    resetInvoice();
                });
            }
        }, 50);
    }

    showModal('reviewModal');
    showToast('✅ تم حفظ الفاتورة - ' + parseFloat(total).toFixed(2) + '₪', 'success');
}

// ═══════════════════════════════════════════
//          طباعة الإيصال
// ═══════════════════════════════════════════

function printReceipt(data) {
    if (!data) {
        showToast('❌ لا توجد بيانات للطباعة', 'error');
        return;
    }

    const storeName = storeSettings.store_name || 'سوبر ماركت';
    const storePhone = storeSettings.store_phone || '';
    const storeAddress = storeSettings.store_address || '';

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    const methodLabels = {
        'cash': 'نقدي',
        'transfer': 'تحويل',
        'card': 'بطاقة',
        'debt': 'دين',
        'mixed': 'مختلط'
    };
    const payLabel = methodLabels[data.paymentMethod] || data.paymentMethod || 'نقدي';

    let itemsRows = '';
    if (data.items && data.items.length > 0) {
        data.items.forEach(function(item) {
            const name = escapeHtml(item.name || '');
            const qty = item.quantity || 0;
            const price = parseFloat(item.unit_price || item.price || 0).toFixed(2);
            const lineTotal = (qty * parseFloat(item.unit_price || item.price || 0)).toFixed(2);
            itemsRows += '<tr><td style="text-align:right;padding:2px 0;">' + name + '</td>';
            itemsRows += '<td style="text-align:center;padding:2px 4px;">' + qty + '</td>';
            itemsRows += '<td style="text-align:center;padding:2px 4px;">' + price + '</td>';
            itemsRows += '<td style="text-align:left;padding:2px 0;">' + lineTotal + '</td></tr>';
        });
    }

    let paymentSection = '';
    const total = parseFloat(data.total || 0).toFixed(2);

    if (data.paymentMethod === 'debt') {
        const paid = parseFloat(data.paidAmount || 0).toFixed(2);
        const remaining = (parseFloat(data.total || 0) - parseFloat(data.paidAmount || 0)).toFixed(2);
        paymentSection = '<div style="text-align:center;font-weight:bold;margin:4px 0;">' +
            'طريقة الدفع: ' + payLabel + '</div>' +
            '<div style="display:flex;justify-content:space-between;padding:2px 0;">' +
            '<span>الإجمالي:</span><span>' + total + ' ₪</span></div>' +
            '<div style="display:flex;justify-content:space-between;padding:2px 0;">' +
            '<span>المدفوع:</span><span>' + paid + ' ₪</span></div>' +
            '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:16px;font-weight:bold;color:#c0392b;border-top:1px dashed #000;margin-top:4px;">' +
            '<span>المتبقي (دين):</span><span>' + remaining + ' ₪</span></div>';
    } else if (data.paymentMethod === 'mixed' && data.payments) {
        paymentSection = '<div style="text-align:center;font-weight:bold;margin:4px 0;">' +
            'طريقة الدفع: مختلط</div>';
        var mixedLabels = { 'cash': 'نقدي', 'transfer': 'تحويل', 'card': 'بطاقة', 'debt': 'دين' };
        data.payments.forEach(function(p) {
            var lbl = mixedLabels[p.method] || p.method;
            paymentSection += '<div style="display:flex;justify-content:space-between;padding:1px 0;">' +
                '<span>' + lbl + ':</span><span>' + parseFloat(p.amount || 0).toFixed(2) + ' ₪</span></div>';
        });
        paymentSection += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:bold;border-top:1px dashed #000;margin-top:4px;">' +
            '<span>الإجمالي:</span><span>' + total + ' ₪</span></div>';
    } else if (data.paymentMethod === 'cash') {
        const cashReceived = parseFloat(data.cashReceived || data.total || 0).toFixed(2);
        const change = parseFloat(data.change || 0).toFixed(2);
        paymentSection = '<div style="text-align:center;font-weight:bold;margin:4px 0;">' +
            'طريقة الدفع: ' + payLabel + '</div>' +
            '<div style="display:flex;justify-content:space-between;padding:2px 0;">' +
            '<span>الإجمالي:</span><span>' + total + ' ₪</span></div>' +
            '<div style="display:flex;justify-content:space-between;padding:2px 0;">' +
            '<span>المدفوع:</span><span>' + cashReceived + ' ₪</span></div>' +
            '<div style="display:flex;justify-content:space-between;padding:2px 0;">' +
            '<span>الباقي:</span><span>' + change + ' ₪</span></div>';
    } else {
        paymentSection = '<div style="text-align:center;font-weight:bold;margin:4px 0;">' +
            'طريقة الدفع: ' + payLabel + '</div>' +
            '<div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:bold;">' +
            '<span>الإجمالي:</span><span>' + total + ' ₪</span></div>';
    }

    let discountLine = '';
    if (data.discount && parseFloat(data.discount) > 0) {
        discountLine = '<div style="display:flex;justify-content:space-between;padding:2px 0;color:#c0392b;">' +
            '<span>الخصم:</span><span>-' + parseFloat(data.discount).toFixed(2) + ' ₪</span></div>';
    }

    let notesLine = '';
    if (data.notes) {
        notesLine = '<div style="border-top:1px dashed #000;margin-top:4px;padding-top:4px;font-size:11px;">' +
            'ملاحظات: ' + escapeHtml(data.notes) + '</div>';
    }

    const receiptHTML = '<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">' +
        '<style>' +
        '* { margin:0; padding:0; box-sizing:border-box; }' +
        'body { font-family: Arial, sans-serif; width:76mm; margin:0 auto; padding:4mm; font-size:13px; direction:rtl; }' +
        '.store-name { text-align:center; font-size:18px; font-weight:bold; margin-bottom:2px; }' +
        '.store-info { text-align:center; font-size:11px; color:#555; }' +
        '.divider { border-top:1px dashed #000; margin:6px 0; }' +
        '.invoice-num { text-align:center; font-size:14px; font-weight:bold; }' +
        '.invoice-date { text-align:center; font-size:11px; color:#555; margin-bottom:2px; }' +
        '.customer-name { text-align:center; font-size:13px; font-weight:bold; margin-bottom:4px; }' +
        'table { width:100%; border-collapse:collapse; font-size:12px; }' +
        'th { border-bottom:1px solid #000; padding:3px 0; font-size:11px; }' +
        '.footer { text-align:center; font-size:11px; margin-top:8px; color:#777; }' +
        '@media print { body { width:76mm; } }' +
        '</style></head><body>' +
        '<div class="store-name">' + escapeHtml(storeName) + '</div>' +
        (storeAddress ? '<div class="store-info">' + escapeHtml(storeAddress) + '</div>' : '') +
        (storePhone ? '<div class="store-info">هاتف: ' + escapeHtml(storePhone) + '</div>' : '') +
        '<div class="divider"></div>' +
        '<div class="invoice-num">' + (data.invoiceNumber || '') + '</div>' +
        '<div class="invoice-date">' + (data.date || new Date().toLocaleString('ar-PS')) + '</div>' +
        '<div class="customer-name">' + escapeHtml(data.customer && data.customer.name ? data.customer.name : 'زبون عابر') + '</div>' +
        '<div class="divider"></div>' +
        '<table><thead><tr>' +
        '<th style="text-align:right;">الصنف</th>' +
        '<th style="text-align:center;">الكمية</th>' +
        '<th style="text-align:center;">السعر</th>' +
        '<th style="text-align:left;">المجموع</th>' +
        '</tr></thead><tbody>' + itemsRows + '</tbody></table>' +
        '<div class="divider"></div>' +
        discountLine +
        paymentSection +
        notesLine +
        '<div class="divider"></div>' +
        '<div class="footer">شكراً لتعاملكم معنا</div>' +
        '<div style="margin-bottom:20mm;"></div>' +
        '</body></html>';

    const printWin = window.open('', '_blank', 'width=350,height=600');
    if (printWin) {
        printWin.document.write(receiptHTML);
        printWin.document.close();
        printWin.focus();
        printWin.print();
    } else {
        showToast('❌ تعذر فتح نافذة الطباعة', 'error');
    }
}

function resetInvoice() {
    invoiceItems = [];
    selectedCustomer = null;
    selectedPaymentMethod = 'cash';
    invoiceStartTime = new Date();

    generateInvoiceNumber();
    updateProductTable();
    updateTotals();
    selectPaymentMethod('cash');

    const customerSearch = document.getElementById('customerSearch');
    if (customerSearch) customerSearch.value = '';

    const selectedEl = document.getElementById('selectedCustomer');
    if (selectedEl) selectedEl.style.display = 'none';

    const cashReceived = document.getElementById('cashReceived');
    if (cashReceived) cashReceived.value = '';

    const cashChange = document.getElementById('cashChange');
    if (cashChange) cashChange.textContent = '0.00₪';

    const invoiceNotes = document.getElementById('invoiceNotes');
    if (invoiceNotes) invoiceNotes.value = '';

    const debtBtn = document.getElementById('payDebt');
    if (debtBtn) debtBtn.style.display = 'none';

    document.querySelectorAll('.pin-digit').forEach(d => d.value = '');
    const pinStatus = document.getElementById('pinStatus');
    if (pinStatus) pinStatus.textContent = '';

    document.querySelectorAll('input[name="debtReason"]').forEach(r => r.checked = false);
    const debtOther = document.getElementById('debtReasonOther');
    if (debtOther) { debtOther.value = ''; debtOther.style.display = 'none'; }

    const altCheck = document.getElementById('altAccountCheck');
    if (altCheck) altCheck.checked = false;
    const altFields = document.getElementById('altAccountFields');
    if (altFields) altFields.style.display = 'none';
    const altName = document.getElementById('altAccountName');
    if (altName) altName.value = '';
    const altRelation = document.getElementById('altAccountRelation');
    if (altRelation) altRelation.value = '';

    const immediateRadio = document.querySelector('input[name="transferType"][value="immediate"]');
    if (immediateRadio) immediateRadio.checked = true;
    const deferredOptions = document.getElementById('deferredOptions');
    if (deferredOptions) deferredOptions.style.display = 'none';

    focusBarcode();
    console.log('🔄 تم إعادة تعيين الفاتورة');
}

// ═══════════════════════════════════════════
//          المودالات والأدوات
// ═══════════════════════════════════════════

function showModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
}

function hideModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

function showExitModal() {
    if (invoiceItems.length === 0) {
        window.location.href = 'index.html';
        return;
    }
    showModal('exitModal');
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast show';
    if (type === 'success') toast.style.background = '#27ae60';
    else if (type === 'error') toast.style.background = '#e74c3c';
    else if (type === 'warning') toast.style.background = '#f39c12';
    else toast.style.background = '#5D4037';

    setTimeout(() => toast.classList.remove('show'), 1500);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function handleKeyboard(e) {
    if (e.key === 'Escape') {
        const modals = ['addCustomerModal', 'manualSearchModal', 'reviewModal'];
        let closedOne = false;
        modals.forEach(id => {
            const m = document.getElementById(id);
            if (m && m.style.display !== 'none') {
                hideModal(id);
                closedOne = true;
            }
        });
        if (!closedOne) showExitModal();
    }

    if (e.key === 'Enter' && !e.target.closest('input, textarea, select')) {
        e.preventDefault();
        document.getElementById('saveInvoiceBtn')?.click();
    }

    if (e.key === 'F3') {
        e.preventDefault();
        document.getElementById('customerSearch')?.focus();
    }

    if (e.key === 'F4') {
        e.preventDefault();
        openManualSearch();
    }
}

async function handleLogout() {
    if (invoiceItems.length > 0) {
        if (!confirm('هناك فاتورة مفتوحة. هل تريد الخروج وإلغائها؟')) return;
    }
    try {
        const sessionId = sessionStorage.getItem('sessionId');
        if (sessionId) await window.api.logout(parseInt(sessionId));
    } catch (e) { console.error(e); }
    sessionStorage.clear();
    window.location.href = 'login.html';
}

