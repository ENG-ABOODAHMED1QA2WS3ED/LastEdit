// ============================================
// debts.js - أبو كميل POS v5.0
// صفحة الأرصدة والديون
// ============================================

// ===== متغيرات عامة =====
let allDebts = [];
let allTransfers = [];
let currentTab = 'debts';
let currentUser = null;

// ===== تهيئة الصفحة =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('💰 تحميل صفحة الأرصدة والديون v5.0...');

    loadCurrentUser();
    bindEvents();

    await loadAllData();

    console.log('✅ صفحة الأرصدة والديون جاهزة');
});

// ===== تحميل المستخدم =====
function loadCurrentUser() {
    try {
        const userData = sessionStorage.getItem('currentUser');
        if (!userData) {
            window.location.href = 'login.html';
            return;
        }
        currentUser = JSON.parse(userData);
        const userEl = document.getElementById('currentUser');
        if (userEl) userEl.textContent = currentUser.display_name || currentUser.username;
    } catch (e) {
        console.error('خطأ تحميل المستخدم:', e);
        window.location.href = 'login.html';
    }
}

// ===== ربط الأحداث =====
function bindEvents() {
    // === التبويبات ===
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchTab(tab);
        });
    });

    // === بحث الديون ===
    const searchDebts = document.getElementById('searchDebts');
    if (searchDebts) {
        let debounceTimer;
        searchDebts.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => filterAndRenderDebts(), 300);
        });
    }

    // === فلتر الديون ===
    const filterDebts = document.getElementById('filterDebts');
    if (filterDebts) {
        filterDebts.addEventListener('change', () => filterAndRenderDebts());
    }

    // === بحث التحويلات ===
    const searchTransfers = document.getElementById('searchTransfers');
    if (searchTransfers) {
        let debounceTimer;
        searchTransfers.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => filterAndRenderTransfers(), 300);
        });
    }

    // === فلتر التحويلات ===
    const filterTransfers = document.getElementById('filterTransfers');
    if (filterTransfers) {
        filterTransfers.addEventListener('change', () => filterAndRenderTransfers());
    }

    // === إغلاق المودالات ===
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAllModals();
        });
    });

    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', () => closeAllModals());
    });

    // === مودال دفع الدين ===
    const btnConfirmPay = document.getElementById('btnConfirmPay');
    if (btnConfirmPay) {
        btnConfirmPay.addEventListener('click', () => confirmPayDebt());
    }

    // === أزرار المبالغ السريعة ===
    document.querySelectorAll('.quick-amount').forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = btn.dataset.amount;
            const payInput = document.getElementById('payAmountInput');
            if (payInput) {
                if (amount === 'full') {
                    payInput.value = payInput.dataset.maxAmount || '0';
                } else {
                    payInput.value = amount;
                }
            }
        });
    });

    // === مودال إجراء التحويل ===
    const btnConfirmTransferAction = document.getElementById('btnConfirmTransferAction');
    if (btnConfirmTransferAction) {
        btnConfirmTransferAction.addEventListener('click', () => confirmTransferAction());
    }






    // === تسجيل الخروج ===
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
    }

    // === اختصارات لوحة المفاتيح ===
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeAllModals();
    });

    // === أزرار إغلاق وإلغاء المودالات ===
    var btnClosePayDebt = document.getElementById("btnClosePayDebt");
    if (btnClosePayDebt) btnClosePayDebt.addEventListener("click", function() { closeAllModals(); });
    var btnCancelPay = document.getElementById("btnCancelPay");
    if (btnCancelPay) btnCancelPay.addEventListener("click", function() { closeAllModals(); });
    var btnCloseTransferAction = document.getElementById("btnCloseTransferAction");
    if (btnCloseTransferAction) btnCloseTransferAction.addEventListener("click", function() { closeAllModals(); });
    var btnCancelTransferAction = document.getElementById("btnCancelTransferAction");
    if (btnCancelTransferAction) btnCancelTransferAction.addEventListener("click", function() { closeAllModals(); });

    var btnRejectTransferAction = document.getElementById("btnRejectTransferAction"); if (btnRejectTransferAction) btnRejectTransferAction.addEventListener("click", function() { rejectTransferAction(); });


    // Event delegation for dynamic buttons
    document.addEventListener("click", function(e) {
        var btn = e.target.closest("[data-action]");
        if (!btn) return;
        var action = btn.getAttribute("data-action");
        if (action === "payDebt") {
            var did = parseInt(btn.getAttribute("data-did"));
            var name = btn.getAttribute("data-name") || "";
            var amount = parseFloat(btn.getAttribute("data-amount")) || 0;
            openPayDebtModal(did, name, amount);
        } else if (action === "transferAction") {
            var tid = parseInt(btn.getAttribute("data-tid"));
            var name = btn.getAttribute("data-name") || "";
            var amount = parseFloat(btn.getAttribute("data-amount")) || 0;
            var status = btn.getAttribute("data-status") || "";
            openTransferActionModal(tid, name, amount, status);
        }
    });
}

// ===== تبديل التبويبات =====
function switchTab(tab) {
    currentTab = tab;

    // تحديث الأزرار
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // تحديث المحتوى
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tab}`);
    });
}

// ===== تحميل جميع البيانات =====
async function loadAllData() {
    try {
        await Promise.all([
            loadDebts(),
            loadTransfers()
        ]);
        updateStats();
    } catch (e) {
        console.error('خطأ تحميل البيانات:', e);
        showToast('خطأ في تحميل البيانات', 'error');
    }
}

// ===== تحميل الديون =====
async function loadDebts() {
    try {
        const result = await window.api.getOutstandingDebts();
        console.log('📋 نتيجة الديون:', result);

        if (result.success) {
            allDebts = result.debts || [];
            console.log(`💰 عدد الديون: ${allDebts.length}`);
            filterAndRenderDebts();
        } else {
            console.warn('⚠️ فشل تحميل الديون:', result.error);
            allDebts = [];
            filterAndRenderDebts();
        }
    } catch (e) {
        console.error('خطأ تحميل الديون:', e);
        allDebts = [];
        filterAndRenderDebts();
    }
}

// ===== تحميل التحويلات المعلقة =====
async function loadTransfers() {
    try {
        const result = await window.api.getPendingTransfers();
        console.log('📋 نتيجة التحويلات:', result);

        if (result.success) {
            allTransfers = result.transfers || [];
            console.log(`🔄 عدد التحويلات المعلقة: ${allTransfers.length}`);
            filterAndRenderTransfers();
        } else {
            console.warn('⚠️ فشل تحميل التحويلات:', result.error);
            allTransfers = [];
            filterAndRenderTransfers();
        }
    } catch (e) {
        console.error('خطأ تحميل التحويلات:', e);
        allTransfers = [];
        filterAndRenderTransfers();
    }
}

// ===== تحديث الإحصائيات =====
function updateStats() {
    // إجمالي الديون المعلقة
    const totalDebts = allDebts.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    const statTotalDebts = document.getElementById('statTotalDebts');
    if (statTotalDebts) statTotalDebts.textContent = formatCurrency(totalDebts);

    // تحويلات بانتظار التأكيد
    const totalPendingTransfers = allTransfers.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const statPendingTransfers = document.getElementById('statPendingTransfers');
    if (statPendingTransfers) statPendingTransfers.textContent = formatCurrency(totalPendingTransfers);

    // عدد الزبائن اللي عليهم ديون
    const debtCustomerIds = new Set(allDebts.map(d => d.customer_id).filter(Boolean));
    const statDebtCustomers = document.getElementById('statDebtCustomers');
    if (statDebtCustomers) statDebtCustomers.textContent = debtCustomerIds.size;

    // عمليات معلقة
    const statPendingCount = document.getElementById('statPendingCount');
    if (statPendingCount) statPendingCount.textContent = allTransfers.length;
}

// ===== فلترة وعرض الديون =====
function filterAndRenderDebts() {
    let filtered = [...allDebts];

    // البحث
    const searchInput = document.getElementById('searchDebts');
    if (searchInput && searchInput.value.trim()) {
        const term = searchInput.value.trim().toLowerCase();
        filtered = filtered.filter(d =>
            (d.customer_name || '').toLowerCase().includes(term) ||
            (d.invoice_number || '').toLowerCase().includes(term)
        );
    }

    // الفلتر
    const filterSelect = document.getElementById('filterDebts');
    if (filterSelect) {
        const filterVal = filterSelect.value;
        if (filterVal === 'high') {
            filtered.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
        } else if (filterVal === 'old') {
            filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        }
    }

    renderDebtsTable(filtered);
}

// ===== رسم جدول الديون =====
function renderDebtsTable(debts) {
    const tbody = document.getElementById('debtsTableBody');
    const noDebts = document.getElementById('noDebts');

    if (!tbody) return;

    if (debts.length === 0) {
        tbody.innerHTML = '';
        if (noDebts) noDebts.style.display = 'flex';
        return;
    }

    if (noDebts) noDebts.style.display = 'none';

    tbody.innerHTML = debts.map((debt, index) => {
        const amount = parseFloat(debt.amount) || 0;
        const customerName = escapeHtml(debt.customer_name || 'زبون عابر');
        const invoiceNum = escapeHtml(debt.invoice_number || '-');
        const reason = escapeHtml(debt.notes || debt.reason || 'دين');
        const date = formatDate(debt.created_at);

        return `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <div class="customer-cell">
                        <span class="customer-name">${customerName}</span>
                    </div>
                </td>
                <td><span class="invoice-num">${invoiceNum}</span></td>
                <td><span class="amount-debt">${formatCurrency(amount)}</span></td>
                <td><span class="badge badge-info">${reason}</span></td>
                <td>${date}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-pay" data-action="payDebt" data-did="${debt.id}" data-name="${customerName}" data-amount="${amount}" title="دفع">
                            💳
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ===== فلترة وعرض التحويلات =====
function filterAndRenderTransfers() {
    let filtered = [...allTransfers];

    // البحث
    const searchInput = document.getElementById('searchTransfers');
    if (searchInput && searchInput.value.trim()) {
        const term = searchInput.value.trim().toLowerCase();
        filtered = filtered.filter(t =>
            (t.customer_name || '').toLowerCase().includes(term) ||
            (t.invoice_number || '').toLowerCase().includes(term)
        );
    }

    // الفلتر
    const filterSelect = document.getElementById('filterTransfers');
    if (filterSelect) {
        const filterVal = filterSelect.value;
        if (filterVal === 'pending') {
            filtered = filtered.filter(t => t.status === 'pending' || t.status === 'unpaid');
        } else if (filterVal === 'awaiting') {
            filtered = filtered.filter(t => t.status === 'awaiting_transfer');
        }
    }

    renderTransfersTable(filtered);
}

// ===== رسم جدول التحويلات =====
function renderTransfersTable(transfers) {
    const tbody = document.getElementById('transfersTableBody');
    const noTransfers = document.getElementById('noTransfers');

    if (!tbody) return;

    if (transfers.length === 0) {
        tbody.innerHTML = '';
        if (noTransfers) noTransfers.style.display = 'flex';
        return;
    }

    if (noTransfers) noTransfers.style.display = 'none';

    tbody.innerHTML = transfers.map((transfer, index) => {
        const amount = parseFloat(transfer.amount) || 0;
        const customerName = escapeHtml(transfer.customer_name || 'زبون عابر');
        const invoiceNum = escapeHtml(transfer.invoice_number || '-');
        const method = transfer.method === 'wallet' ? 'محفظة' : 'تحويل بنكي';
        const date = formatDate(transfer.created_at);

        // حالة التحويل
        let statusBadge = '';
        if (transfer.status === 'pending' || transfer.status === 'unpaid') {
            statusBadge = '<span class="badge badge-warning">فوري - بانتظار المطابقة</span>';
        } else if (transfer.status === 'awaiting_transfer') {
            statusBadge = '<span class="badge badge-danger">سيحوّل لاحقاً</span>';
        }

        // حساب بديل
        let altAccount = '-';
        if (transfer.alt_account_name) {
            altAccount = `<span class="alt-account">${escapeHtml(transfer.alt_account_name)}`;
            if (transfer.alt_account_relation) {
                altAccount += ` (${escapeHtml(transfer.alt_account_relation)})`;
            }
            altAccount += '</span>';
        }

        return `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <div class="customer-cell">
                        <span class="customer-name">${customerName}</span>
                    </div>
                </td>
                <td><span class="invoice-num">${invoiceNum}</span></td>
                <td><span class="amount-transfer">${formatCurrency(amount)}</span></td>
                <td>${method}</td>
                <td>${statusBadge}</td>
                <td>${altAccount}</td>
                <td>${date}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-confirm" data-action="transferAction" data-tid="${transfer.id}" data-name="${escapeHtml(customerName)}" data-amount="${amount}" data-status="${transfer.status}" title="مراجعة">
                            🔍
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ===== مودال دفع الدين =====
let currentPayDebtId = null;

function openPayDebtModal(debtId, customerName, amount) {
    currentPayDebtId = debtId;

    const modal = document.getElementById('payDebtModal');
    if (!modal) return;

    // تعبئة البيانات
    const nameEl = document.getElementById('payDebtCustomer');
    if (nameEl) nameEl.textContent = customerName;

    const amountEl = document.getElementById('payDebtAmount');
    if (amountEl) amountEl.textContent = formatCurrency(amount);

    const payInput = document.getElementById('payAmountInput');
    if (payInput) {
        payInput.value = amount;
        payInput.max = amount;
        payInput.dataset.maxAmount = amount;
    }

    // إعادة تعيين طريقة الدفع
    const payMethod = document.getElementById('payDebtMethod');
    if (payMethod) payMethod.value = 'cash';

    modal.classList.add('show');
}

async function confirmPayDebt() {
    if (!currentPayDebtId) return;

    const payInput = document.getElementById('payAmountInput');
    const payMethod = document.getElementById('payDebtMethod');
    const payNotes = document.getElementById('payDebtNotes');

    const amount = parseFloat(payInput?.value) || 0;
    const maxAmount = parseFloat(payInput?.dataset.maxAmount) || 0;

    if (amount <= 0) {
        showToast('أدخل مبلغ صحيح', 'error');
        return;
    }

    if (amount > maxAmount) {
        showToast('المبلغ أكبر من قيمة الدين', 'error');
        return;
    }

    try {
        const result = await window.api.payDebt({
            payment_id: currentPayDebtId,
            amount: amount,
            method: payMethod?.value || 'cash',
            notes: payNotes?.value || ''
        });

        if (result.success) {
            showToast('✅ تم تسجيل الدفعة بنجاح', 'success');
            closeAllModals();
            await loadAllData();
        } else {
            showToast(result.error || 'فشل تسجيل الدفعة', 'error');
        }
    } catch (e) {
        console.error('خطأ دفع الدين:', e);
        showToast('حدث خطأ أثناء الدفع', 'error');
    }
}

// ===== مودال إجراء التحويل =====
let currentTransferId = null;
let currentTransferStatus = null;

function openTransferActionModal(transferId, customerName, amount, status) {
    currentTransferId = transferId;
    currentTransferStatus = status;

    const modal = document.getElementById('transferActionModal');
    if (!modal) return;

    // تعبئة البيانات
    const nameEl = document.getElementById('transferCustomer');
    if (nameEl) nameEl.textContent = customerName;

    const amountEl = document.getElementById('transferAmount');
    if (amountEl) amountEl.textContent = formatCurrency(amount);

    const statusEl = document.getElementById('transferStatus');
    if (statusEl) {
        if (status === 'pending' || status === 'unpaid') {
            statusEl.textContent = 'تحويل فوري - بانتظار المطابقة';
            statusEl.className = 'badge badge-warning';
        } else {
            statusEl.textContent = 'سيحوّل لاحقاً - مسجل كدين';
            statusEl.className = 'badge badge-danger';
        }
    }

    // ملاحظات المطابقة
    const notesEl = document.getElementById('transferNotes');
    if (notesEl) notesEl.value = '';

    modal.classList.add('show');
}

async function confirmTransferAction() {
    if (!currentTransferId) return;

    const notesEl = document.getElementById('transferNotes');
    const notes = notesEl?.value || '';

    try {
        const result = await window.api.confirmTransfer({
            payment_id: currentTransferId,
            notes: notes
        });

        if (result.success) {
            showToast('✅ تم تأكيد التحويل بنجاح', 'success');
            closeAllModals();
            await loadAllData();
        } else {
            showToast(result.error || 'فشل تأكيد التحويل', 'error');
        }
    } catch (e) {
        console.error('خطأ تأكيد التحويل:', e);
        showToast('حدث خطأ أثناء التأكيد', 'error');
    }
}

async function rejectTransferAction() {
    if (!currentTransferId) return;

    const notesEl = document.getElementById('transferNotes');
    const notes = notesEl?.value || '';

    // السبب اختياري
    // showToast removed
    // notesEl focus removed
    // return removed
    // end block

    if (!confirm('هل أنت متأكد من رفض هذا التحويل؟ سيبقى المبلغ كدين مستحق.')) {
        return;
    }

    try {
        const result = await window.api.rejectTransfer({
            payment_id: currentTransferId,
            notes: notes
        });

        if (result.success) {
            showToast('تم تحويل الدفعة إلى دين مستحق بنجاح', 'success');
            closeAllModals();
            await loadAllData();
        } else {
            showToast(result.error || 'فشل رفض التحويل', 'error');
        }
    } catch (e) {
        console.error('خطأ رفض التحويل:', e);
        showToast('حدث خطأ أثناء الرفض', 'error');
    }
}

// ===== إغلاق المودالات =====
function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('show');
    });
    currentPayDebtId = null;
    currentTransferId = null;
    currentTransferStatus = null;
}

// ===== دوال مساعدة =====

function formatCurrency(amount) {
    const num = parseFloat(amount) || 0;
    return num.toFixed(2) + ' ₪';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ar-PS', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateStr;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function handleLogout() {
    if (confirm('هل تريد تسجيل الخروج؟')) {
        sessionStorage.clear();
        localStorage.removeItem('currentUser');
        if (window.api && window.api.appRelaunch) {
            window.api.appRelaunch();
        } else {
            window.location.href = 'login.html';
        }
    }
}

console.log('📄 debts.js v5.0 loaded');






