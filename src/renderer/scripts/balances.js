// ============================================
// نظام نقاط البيع - سوبر ماركت أبو كميل
// صفحة الأرصدة والديون - balances.js
// ============================================

let currentUser = null;
let allDebts = [];
let allTransfers = [];
let selectedPaymentId = null;
let selectedDebtCustomerId = null;

// ─── التهيئة ───
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    startClock();
    setupTabs();
    bindEvents();
    loadData();
    console.log('✅ صفحة الأرصدة جاهزة');
});

// ─── التحقق من الجلسة ───
function checkSession() {
    const userData = sessionStorage.getItem('currentUser');
    if (!userData) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = JSON.parse(userData);
    const userName = document.getElementById('userName');
    if (userName) {
        userName.textContent = currentUser.display_name || currentUser.username;
    }
}

// ─── الساعة ───
function startClock() {
    function update() {
        const now = new Date();
        const clock = document.getElementById('clock');
        if (clock) {
            clock.textContent = now.toLocaleTimeString('ar-PS', { hour: '2-digit', minute: '2-digit' });
        }
    }
    update();
    setInterval(update, 30000);
}

// ─── التبويبات ───
function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;

            // تحديث الأزرار
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // تحديث المحتوى
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const targetTab = document.getElementById(tabName + 'Tab');
            if (targetTab) targetTab.classList.add('active');
        });
    });
}

// ─── ربط الأحداث ───
function bindEvents() {
    // بحث الديون
    const debtSearch = document.getElementById('debtSearch');
    if (debtSearch) {
        let debounce;
        debtSearch.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => filterDebts(debtSearch.value.trim()), 300);
        });
    }

    // بحث التحويلات
    const transferSearch = document.getElementById('transferSearch');
    if (transferSearch) {
        let debounce;
        transferSearch.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => filterTransfers(transferSearch.value.trim()), 300);
        });
    }

    // أزرار التحديث
    const refreshDebts = document.getElementById('refreshDebtsBtn');
    if (refreshDebts) refreshDebts.addEventListener('click', loadData);

    const refreshTransfers = document.getElementById('refreshTransfersBtn');
    if (refreshTransfers) refreshTransfers.addEventListener('click', loadData);

    // إغلاق المودالات
    document.getElementById('closeDebtModal')?.addEventListener('click', () => closeModal('debtDetailModal'));
    document.getElementById('closeConfirmModal')?.addEventListener('click', () => closeModal('confirmTransferModal'));
    document.getElementById('closePayDebtModal')?.addEventListener('click', () => closeModal('payDebtModal'));
    document.getElementById('btnCancelConfirm')?.addEventListener('click', () => closeModal('confirmTransferModal'));
    document.getElementById('btnCancelPayDebt')?.addEventListener('click', () => closeModal('payDebtModal'));

    // تأكيد / رفض التحويل
    document.getElementById('btnConfirmTransfer')?.addEventListener('click', confirmTransfer);
    document.getElementById('btnRejectTransfer')?.addEventListener('click', rejectTransfer);

    // تسديد الدين
    document.getElementById('btnConfirmPayDebt')?.addEventListener('click', confirmPayDebt);

    // إغلاق المودال بالنقر على الخلفية
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    // زر الخروج
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

    // اختصارات لوحة المفاتيح
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
        }
        if (e.key === 'F5') {
            e.preventDefault();
            loadData();
        }
    });
}

// ═══════════════════════════════════════════
//          تحميل البيانات
// ═══════════════════════════════════════════

async function loadData() {
    try {
        showToast('جاري تحميل البيانات...', 'info');

        // تحميل الملخص
        const summary = await window.api.getDebtsSummary();
        updateSummaryCards(summary);

        // تحميل الديون
        const debts = await window.api.getCustomersWithDebts();
        allDebts = debts || [];
        renderDebtsTable(allDebts);

        // تحميل التحويلات المعلقة
        const transfers = await window.api.getPendingTransfers();
        allTransfers = transfers || [];
        renderTransfersTable(allTransfers);

        console.log(`📊 تم تحميل: ${allDebts.length} زبون بديون، ${allTransfers.length} تحويل معلق`);

    } catch (error) {
        console.error('❌ خطأ تحميل البيانات:', error);
        showToast('خطأ في تحميل البيانات', 'error');
    }
}

// ─── تحديث بطاقات الملخص ───
function updateSummaryCards(summary) {
    const totalDebts = document.getElementById('totalDebts');
    const totalPending = document.getElementById('totalPendingTransfers');
    const customersCount = document.getElementById('customersWithDebt');
    const pendingCount = document.getElementById('pendingCount');

    if (totalDebts) totalDebts.textContent = formatMoney(summary.total_debts);
    if (totalPending) totalPending.textContent = formatMoney(summary.total_pending_transfers);
    if (customersCount) customersCount.textContent = summary.customers_with_debt || 0;
    if (pendingCount) pendingCount.textContent = summary.pending_transfers_count || 0;
}

// ═══════════════════════════════════════════
//          جدول الديون
// ═══════════════════════════════════════════

function renderDebtsTable(debts) {
    const tbody = document.getElementById('debtsTableBody');
    if (!tbody) return;

    if (!debts || debts.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="8">
                    <div style="padding:30px; text-align:center;">
                        <div style="font-size:48px; margin-bottom:12px;">✅</div>
                        <div style="font-size:18px; font-weight:600; color:#27ae60;">لا توجد ديون معلّقة</div>
                        <div style="color:#7f8c8d; margin-top:6px;">جميع الزبائن سدّدوا ديونهم</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = debts.map((debt, index) => {
        const isOverLimit = debt.debt_ceiling > 0 && debt.total_debt > debt.debt_ceiling;
        const rowClass = isOverLimit ? 'over-limit' : '';
        const lastDate = debt.last_debt_date ? formatDate(debt.last_debt_date) : '—';

        return `
            <tr class="${rowClass}">
                <td>${index + 1}</td>
                <td><strong>${escapeHtml(debt.name)}</strong></td>
                <td>${debt.phone || '—'}</td>
                <td><span class="badge badge-warning">${debt.debt_count}</span></td>
                <td class="amount-danger">${formatMoney(debt.total_debt)}</td>
                <td>${debt.debt_ceiling > 0 ? formatMoney(debt.debt_ceiling) : '<span style="color:#7f8c8d">غير محدد</span>'}</td>
                <td>${lastDate}</td>
                <td>
                    <div class="actions-cell">
                        <button class="btn btn-info btn-sm" onclick="viewDebtDetails(${debt.id}, '${escapeHtml(debt.name)}', ${debt.total_debt}, ${debt.debt_ceiling || 0})">
                            📋 تفاصيل
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ─── فلترة الديون ───
function filterDebts(query) {
    if (!query) {
        renderDebtsTable(allDebts);
        return;
    }
    const filtered = allDebts.filter(d =>
        d.name.includes(query) || (d.phone && d.phone.includes(query))
    );
    renderDebtsTable(filtered);
}

// ─── عرض تفاصيل دين زبون ───
async function viewDebtDetails(customerId, customerName, totalDebt, debtCeiling) {
    selectedDebtCustomerId = customerId;

    document.getElementById('debtCustomerName').textContent = customerName;
    document.getElementById('debtTotalAmount').textContent = formatMoney(totalDebt);
    document.getElementById('debtCeiling').textContent = debtCeiling > 0 ? formatMoney(debtCeiling) : 'غير محدد';

    const detailsBody = document.getElementById('debtDetailsBody');
    detailsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">جاري التحميل...</td></tr>';

    openModal('debtDetailModal');

    try {
        const debts = await window.api.getCustomerDebts(customerId);

        if (!debts || debts.length === 0) {
            detailsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#27ae60;">لا توجد ديون معلّقة</td></tr>';
            return;
        }

        detailsBody.innerHTML = debts.map(d => `
            <tr>
                <td>${d.invoice_number || '—'}</td>
                <td>${formatDate(d.opened_at)}</td>
                <td class="amount-danger">${formatMoney(d.amount)}</td>
                <td>${d.debt_reason || '—'}</td>
                <td>
                    <button class="btn btn-success btn-sm" onclick="openPayDebtModal(${d.id}, '${d.invoice_number || ''}', ${d.amount})">
                        💵 تسديد
                    </button>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('خطأ تحميل تفاصيل الديون:', error);
        detailsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#e74c3c;">خطأ في التحميل</td></tr>';
    }
}

// ─── مودال تسديد الدين ───
function openPayDebtModal(paymentId, invoiceNumber, amount) {
    selectedPaymentId = paymentId;

    document.getElementById('payDebtInvoice').textContent = invoiceNumber || '—';
    document.getElementById('payDebtAmount').textContent = formatMoney(amount);
    document.getElementById('payDebtMethod').value = 'cash';

    openModal('payDebtModal');
}

// ─── تأكيد تسديد الدين ───
async function confirmPayDebt() {
    if (!selectedPaymentId) return;

    const method = document.getElementById('payDebtMethod').value;

    try {
        const result = await window.api.payCustomerDebt({
            payment_id: selectedPaymentId,
            pay_method: method,
            user_id: currentUser?.id || 1,
            amount: 0 // المبلغ محسوب تلقائياً
        });

        if (result.success) {
            showToast('✅ تم تسديد الدين بنجاح', 'success');
            closeModal('payDebtModal');
            closeModal('debtDetailModal');
            loadData(); // إعادة تحميل البيانات
        } else {
            showToast('❌ ' + (result.error || 'خطأ في التسديد'), 'error');
        }
    } catch (error) {
        console.error('خطأ تسديد الدين:', error);
        showToast('❌ خطأ في التسديد', 'error');
    }
}

// ═══════════════════════════════════════════
//          جدول التحويلات المعلقة
// ═══════════════════════════════════════════

function renderTransfersTable(transfers) {
    const tbody = document.getElementById('transfersTableBody');
    if (!tbody) return;

    if (!transfers || transfers.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="9">
                    <div style="padding:30px; text-align:center;">
                        <div style="font-size:48px; margin-bottom:12px;">✅</div>
                        <div style="font-size:18px; font-weight:600; color:#27ae60;">لا توجد تحويلات معلّقة</div>
                        <div style="color:#7f8c8d; margin-top:6px;">جميع التحويلات تمت مطابقتها</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = transfers.map((t, index) => {
        const methodLabel = getPaymentMethodLabel(t.method);
        const sourceLabel = getTransferSourceLabel(t.transfer_source);
        const deadline = t.transfer_deadline ? formatDate(t.transfer_deadline) : '—';
        const isExpired = t.transfer_deadline && new Date(t.transfer_deadline) < new Date();
        const deadlineClass = isExpired ? 'amount-danger' : '';

        return `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${t.invoice_number || '—'}</strong></td>
                <td>${escapeHtml(t.customer_name || 'زبون عابر')}</td>
                <td class="amount-danger">${formatMoney(t.amount)}</td>
                <td><span class="badge badge-info">${methodLabel}</span></td>
                <td>${sourceLabel}</td>
                <td class="${deadlineClass}">${deadline}${isExpired ? ' ⚠️' : ''}</td>
                <td>${formatDate(t.invoice_date)}</td>
                <td>
                    <div class="actions-cell">
                        <button class="btn btn-success btn-sm" onclick="openConfirmTransferModal(${t.id}, '${t.invoice_number || ''}', ${t.amount}, '${escapeHtml(sourceLabel)}')">
                            ✅ تأكيد
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="quickRejectTransfer(${t.id})">
                            ❌
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ─── فلترة التحويلات ───
function filterTransfers(query) {
    if (!query) {
        renderTransfersTable(allTransfers);
        return;
    }
    const filtered = allTransfers.filter(t =>
        (t.invoice_number && t.invoice_number.includes(query)) ||
        (t.customer_name && t.customer_name.includes(query))
    );
    renderTransfersTable(filtered);
}

// ─── مودال تأكيد التحويل ───
function openConfirmTransferModal(paymentId, invoiceNumber, amount, source) {
    selectedPaymentId = paymentId;

    document.getElementById('confirmInvoiceNum').textContent = invoiceNumber || '—';
    document.getElementById('confirmAmount').textContent = formatMoney(amount);
    document.getElementById('confirmSource').textContent = source;

    openModal('confirmTransferModal');
}

// ─── تأكيد التحويل ───
async function confirmTransfer() {
    if (!selectedPaymentId) return;

    try {
        const result = await window.api.confirmTransfer(selectedPaymentId);
        if (result.success) {
            showToast('✅ تم تأكيد التحويل', 'success');
            closeModal('confirmTransferModal');
            loadData();
        } else {
            showToast('❌ ' + (result.error || 'خطأ'), 'error');
        }
    } catch (error) {
        console.error('خطأ تأكيد التحويل:', error);
        showToast('❌ خطأ في تأكيد التحويل', 'error');
    }
}

// ─── رفض التحويل ───
async function rejectTransfer() {
    if (!selectedPaymentId) return;

    const reason = prompt('سبب الرفض (اختياري):');

    try {
        const result = await window.api.rejectTransfer(selectedPaymentId, reason || '');
        if (result.success) {
            showToast('تم رفض التحويل', 'warning');
            closeModal('confirmTransferModal');
            loadData();
        } else {
            showToast('❌ ' + (result.error || 'خطأ'), 'error');
        }
    } catch (error) {
        console.error('خطأ رفض التحويل:', error);
        showToast('❌ خطأ', 'error');
    }
}

// ─── رفض سريع ───
async function quickRejectTransfer(paymentId) {
    if (!confirm('هل تريد رفض هذا التحويل؟')) return;

    try {
        const result = await window.api.rejectTransfer(paymentId, 'رفض سريع');
        if (result.success) {
            showToast('تم رفض التحويل', 'warning');
            loadData();
        }
    } catch (error) {
        console.error('خطأ:', error);
        showToast('❌ خطأ', 'error');
    }
}

// ═══════════════════════════════════════════
//          أدوات مساعدة
// ═══════════════════════════════════════════

function formatMoney(amount) {
    const num = parseFloat(amount) || 0;
    return num.toFixed(2) + '₪';
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
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

function getPaymentMethodLabel(method) {
    const labels = {
        'transfer': 'تحويل بنكي',
        'jawwal_pay': 'جوال بي',
        'palPay': 'بالبي',
        'wallet': 'محفظة',
        'cash': 'نقد',
        'card': 'بطاقة',
        'debt': 'دين'
    };
    return labels[method] || method;
}

function getTransferSourceLabel(source) {
    const labels = {
        'bank_palestine': 'بنك فلسطين',
        'buraq': 'براق',
        'jawwal_pay': 'جوال بي',
        'palPay': 'بالبي'
    };
    return labels[source] || source || '—';
}

// ─── المودالات ───
function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
    selectedPaymentId = null;
}

// ─── إشعار Toast ───
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ─── تسجيل الخروج ───
async function handleLogout() {
    if (!confirm('هل تريد تسجيل الخروج؟')) return;

    try {
        const sessionId = sessionStorage.getItem('sessionId');
        if (sessionId) {
            await window.api.logout(parseInt(sessionId));
        }
    } catch (e) {
        console.error('خطأ تسجيل الخروج:', e);
    }

    sessionStorage.clear();
    window.location.href = 'login.html';
}
