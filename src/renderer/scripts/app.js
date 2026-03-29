// ============================================
// نظام نقاط البيع - سوبر ماركت أبو كميل
// الصفحة الرئيسية - app.js
// الإصدار 5.0
// ============================================

let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    startClock();
    loadTodayStats();
    loadRecentInvoices();
    loadBadges();
    bindNavigation();
    console.log('✅ الصفحة الرئيسية جاهزة v5.0');
});

// ─── التحقق من الجلسة ───
function checkSession() {
    const userData = sessionStorage.getItem('currentUser');
    if (!userData) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = JSON.parse(userData);

    const userEl = document.getElementById('currentUserName');
    if (userEl) userEl.textContent = currentUser.display_name || currentUser.username;
}

// ─── الساعة ───
function startClock() {
    function update() {
        const now = new Date();
        const el = document.getElementById('currentTime');
        if (el) {
            el.textContent = now.toLocaleTimeString('ar-PS', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        }
    }
    update();
    setInterval(update, 1000);
}

// ─── إحصائيات اليوم ───
async function loadTodayStats() {
    try {
        const result = await window.api.getTodayStats();

        // API بترجع: { success, stats: { sales_count, sales_total, cash_total, transfers_total, debts_total, pending_transfers_count, pending_transfers_total } }
        let stats = {};
        if (result && result.success && result.stats) {
            stats = result.stats;
        } else if (result && typeof result.sales_total !== 'undefined') {
            stats = result;
        }

        // الحقول الصحيحة من API:
        // sales_count, sales_total, cash_total, transfers_total, debts_total, pending_transfers_count, pending_transfers_total
        setText('statTotalSales', formatMoney(stats.sales_total));
        setText('statInvoiceCount', stats.sales_count || 0);
        setText('statCash', formatMoney(stats.cash_total));
        setText('statTransfers', formatMoney(stats.transfers_total));
        setText('statDebts', formatMoney(stats.debts_total));
        setText('statPending', stats.pending_transfers_count || 0);

        // الشريط العلوي
        const header = document.getElementById('todaySalesHeader');
        if (header) header.textContent = `₪${(stats.sales_total || 0).toFixed(0)} مبيعات اليوم`;

        console.log(`📊 إحصائيات اليوم: ${stats.sales_count || 0} فاتورة | ${stats.sales_total || 0}₪`);
    } catch (error) {
        console.error('خطأ تحميل الإحصائيات:', error);
    }
}

// ─── آخر الفواتير ───
async function loadRecentInvoices() {
    try {
        const result = await window.api.getRecentInvoices(10);

        // API بترجع: { success, invoices: [...] }
        let invoices = [];
        if (result && result.success && Array.isArray(result.invoices)) {
            invoices = result.invoices;
        } else if (Array.isArray(result)) {
            invoices = result;
        }

        const tbody = document.getElementById('recentInvoicesBody');
        if (!tbody) return;

        if (invoices.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; padding:30px; color:#7f8c8d;">
                        لا توجد فواتير بعد - ابدأ بإنشاء فاتورة جديدة
                    </td>
                </tr>
            `;
            return;
        }

        // API بترجع: id, customer_name, subtotal, discount, total, status, created_at
        tbody.innerHTML = invoices.map(inv => {
            const statusLabel = inv.status === 'completed' ? '✅ مكتملة' : '⏳ معلّقة';
            const statusClass = inv.status === 'completed' ? 'status-success' : 'status-pending';
            const total = inv.total || inv.total_amount || inv.subtotal || 0;
            const invoiceNum = inv.invoice_number || `#${inv.id}`;
            const date = inv.created_at ? new Date(inv.created_at).toLocaleString('ar-PS', {
                month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            }) : '—';

            return `
                <tr>
                    <td><strong>${invoiceNum}</strong></td>
                    <td>${inv.customer_name || 'زبون عابر'}</td>
                    <td><strong>${formatMoney(total)}</strong></td>
                    <td><span class="${statusClass}">${statusLabel}</span></td>
                    <td>${date}</td>
                </tr>
            `;
        }).join('');

        console.log(`📋 تم تحميل ${invoices.length} فاتورة`);

    } catch (error) {
        console.error('خطأ تحميل الفواتير:', error);
    }
}

// ─── شارات الإشعارات ───
async function loadBadges() {
    try {
        let pendingTransfersCount = 0;
        let customersWithDebt = 0;

        // جلب التحويلات المعلقة
        try {
            const transfersResult = await window.api.getPendingTransfers();
            if (transfersResult && transfersResult.success) {
                pendingTransfersCount = (transfersResult.transfers || []).length;
            }
        } catch (e) {
            console.warn('تعذر جلب التحويلات:', e);
        }

        // جلب الديون
        try {
            const debtsResult = await window.api.getOutstandingDebts();
            if (debtsResult && debtsResult.success) {
                const debts = debtsResult.debts || [];
                const uniqueCustomers = new Set(debts.map(d => d.customer_id).filter(Boolean));
                customersWithDebt = uniqueCustomers.size;
            }
        } catch (e) {
            console.warn('تعذر جلب الديون:', e);
        }

        // تحديث الشارات
        const badgeMatching = document.getElementById('badgeMatching');
        const badgeDebts = document.getElementById('badgeDebts');

        if (badgeMatching) {
            badgeMatching.textContent = pendingTransfersCount;
            badgeMatching.style.display = pendingTransfersCount > 0 ? 'inline-flex' : 'none';
        }

        if (badgeDebts) {
            badgeDebts.textContent = customersWithDebt;
            badgeDebts.style.display = customersWithDebt > 0 ? 'inline-flex' : 'none';
        }

        console.log(`🔔 شارات: ${pendingTransfersCount} تحويل معلق | ${customersWithDebt} زبون عليه دين`);

    } catch (e) {
        console.error('خطأ الشارات:', e);
    }
}

// ─── التنقل ───
function bindNavigation() {
    const pageMap = {
        'dashboard': null,
        'invoice': 'invoice.html',
        'customers': 'customers.html',
        'products': 'products.html',
        'balances': 'debts.html',
        'matching': 'matching.html',
        'reports': 'reports.html',
        'closing': 'closing.html',
        'settings': 'settings.html',
        'debts': 'debts.html',
        'statement': 'statement.html'
    };


    document.querySelectorAll('[data-page]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            const page = el.dataset.page;
            const target = pageMap[page];

            if (target) {
                window.location.href = target;
            } else if (page === 'dashboard') {
                loadTodayStats();
                loadRecentInvoices();
                loadBadges();
            }
        });
    });

    // تسجيل الخروج
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
    }

    // اختصارات لوحة المفاتيح
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F1') { e.preventDefault(); loadTodayStats(); loadRecentInvoices(); loadBadges(); }
        if (e.key === 'F2') { e.preventDefault(); window.location.href = 'invoice.html'; }
        if (e.key === 'F3') { e.preventDefault(); window.location.href = 'customers.html'; }
        if (e.key === 'F4') { e.preventDefault(); window.location.href = 'products.html'; }
        if (e.key === 'F5') { e.preventDefault(); window.location.href = 'debts.html'; }
        if (e.key === 'F6') { e.preventDefault(); window.location.href = 'reports.html'; }
    });
}

// ─── تسجيل الخروج ───
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

// ═══════════ أدوات مساعدة ═══════════

function formatMoney(amount) {
    return (parseFloat(amount) || 0).toFixed(2) + '₪';
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

console.log('📄 app.js v5.0 loaded');
