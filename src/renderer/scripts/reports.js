// ============================================
// reports.js - أبو كميل POS v5.0
// صفحة التقارير
// ============================================

// ===== متغيرات عامة =====
let currentUser = null;
let currentReportType = 'sales';
let currentPeriod = 'today';
let reportData = {
    invoices: [],
    products: [],
    customers: [],
    debts: [],
    transfers: []
};

// ===== تهيئة الصفحة =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📊 تحميل صفحة التقارير v5.0...');

    loadCurrentUser();
    setDefaultDates();
    bindEvents();

    await loadReportData();
    renderCurrentReport();

    console.log('✅ صفحة التقارير جاهزة');
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

// ===== تعيين التواريخ الافتراضية =====
function setDefaultDates() {
    const today = new Date();
    const dateTo = document.getElementById('dateTo');
    const dateFrom = document.getElementById('dateFrom');

    if (dateTo) dateTo.value = formatDateForInput(today);
    if (dateFrom) dateFrom.value = formatDateForInput(today);
}

function formatDateForInput(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ===== ربط الأحداث =====
function bindEvents() {
    // === نوع التقرير ===
    document.querySelectorAll('.report-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.report-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentReportType = btn.dataset.report;
            renderCurrentReport();
        });
    });

    // === الفترة الزمنية ===
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPeriod = btn.dataset.period;

            const customPeriod = document.getElementById('customPeriod');
            if (currentPeriod === 'custom') {
                if (customPeriod) customPeriod.style.display = 'block';
            } else {
                if (customPeriod) customPeriod.style.display = 'none';
                await loadReportData();
                renderCurrentReport();
            }
        });
    });

    // === تطبيق الفترة المخصصة ===
    const btnApplyCustom = document.getElementById('btnApplyCustom');
    if (btnApplyCustom) {
        btnApplyCustom.addEventListener('click', async () => {
            await loadReportData();
            renderCurrentReport();
        });
    }

    // === التصدير ===
    const btnExport = document.getElementById('btnExport');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            const modal = document.getElementById('exportModal');
            if (modal) modal.classList.add('active');
        });
    }

    // === طباعة ===
    const btnPrint = document.getElementById('btnPrint');
    if (btnPrint) {
        btnPrint.addEventListener('click', () => window.print());
    }

    // === تصدير CSV ===
    const exportCSV = document.getElementById('exportCSV');
    if (exportCSV) {
        exportCSV.addEventListener('click', () => {
            exportToCSV();
            closeAllModals();
        });
    }

    // === تصدير طباعة ===
    const exportPrint = document.getElementById('exportPrint');
    if (exportPrint) {
        exportPrint.addEventListener('click', () => {
            closeAllModals();
            window.print();
        });
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

    // === تسجيل الخروج ===
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
    }

    // === اختصارات ===
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllModals();
    });
}

// ===== حساب نطاق التاريخ =====
function getDateRange() {
    const now = new Date();
    let from, to;

    switch (currentPeriod) {
        case 'today':
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            break;
        case 'week':
            const dayOfWeek = now.getDay();
            const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
            to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            break;
        case 'month':
            from = new Date(now.getFullYear(), now.getMonth(), 1);
            to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            break;
        case 'custom':
            const dateFrom = document.getElementById('dateFrom');
            const dateTo = document.getElementById('dateTo');
            from = dateFrom ? new Date(dateFrom.value) : new Date();
            to = dateTo ? new Date(dateTo.value + 'T23:59:59') : new Date();
            break;
        default:
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    }

    return {
        from: formatDateForDB(from),
        to: formatDateForDB(to)
    };
}

function formatDateForDB(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

// ===== تحميل بيانات التقرير =====
async function loadReportData() {
    try {
        const range = getDateRange();
        console.log(`📅 تحميل بيانات الفترة: ${range.from} → ${range.to}`);

        // تحميل كل البيانات بالتوازي
        const [invoicesRes, productsRes, customersRes, debtsRes, transfersRes] = await Promise.all([
            loadInvoicesData(range),
            loadProductsData(range),
            loadCustomersData(),
            loadDebtsData(),
            loadTransfersData()
        ]);

        reportData.invoices = invoicesRes;
        reportData.products = productsRes;
        reportData.customers = customersRes;
        reportData.debts = debtsRes;
        reportData.transfers = transfersRes;

        updateStats();
        console.log(`📊 تم تحميل البيانات: ${reportData.invoices.length} فاتورة`);

    } catch (e) {
        console.error('خطأ تحميل بيانات التقرير:', e);
        showToast('خطأ في تحميل البيانات', 'error');
    }
}

async function loadInvoicesData(range) {
    try {
        const result = await window.api.getRecentInvoices(1000);
        if (result && result.success && Array.isArray(result.invoices)) {
            // فلترة حسب التاريخ
            return result.invoices.filter(inv => {
                const invDate = inv.created_at || '';
                return invDate >= range.from && invDate <= range.to;
            });
        }
        return [];
    } catch (e) {
        console.warn('خطأ تحميل الفواتير:', e);
        return [];
    }
}

async function loadProductsData(range) {
    try {
        // جلب عناصر الفواتير عبر تفاصيل كل فاتورة
        const invoices = reportData.invoices.length > 0 ? reportData.invoices : [];
        const allItems = [];

        // جلب تفاصيل كل فاتورة
        for (const inv of invoices) {
            try {
                const detail = await window.api.getInvoiceDetails(inv.id);
                if (detail && detail.success && Array.isArray(detail.items)) {
                    detail.items.forEach(item => {
                        allItems.push({
                            ...item,
                            invoice_id: inv.id,
                            invoice_date: inv.created_at
                        });
                    });
                }
            } catch (e) {
                // تجاهل خطأ الفاتورة الفردية
            }
        }

        // تجميع حسب المنتج
        const productMap = {};
        allItems.forEach(item => {
            const key = item.product_id || item.product_name || item.name;
            if (!productMap[key]) {
                productMap[key] = {
                    product_id: item.product_id,
                    product_name: item.product_name || item.name || 'منتج',
                    barcode: item.barcode || '-',
                    price: parseFloat(item.price) || parseFloat(item.unit_price) || 0,
                    cost_price: parseFloat(item.cost_price) || 0,
                    total_qty: 0,
                    total_sales: 0,
                    total_cost: 0,
                    total_profit: 0
                };
            }
            const qty = parseInt(item.quantity) || 0;
            const price = parseFloat(item.price) || parseFloat(item.unit_price) || 0;
            const cost = parseFloat(item.cost_price) || 0;

            productMap[key].total_qty += qty;
            productMap[key].total_sales += qty * price;
            productMap[key].total_cost += qty * cost;
            productMap[key].total_profit += qty * (price - cost);
        });

        return Object.values(productMap).sort((a, b) => b.total_qty - a.total_qty);
    } catch (e) {
        console.warn('خطأ تحميل المنتجات:', e);
        return [];
    }
}

async function loadCustomersData() {
    try {
        const result = await window.api.getCustomers();
        if (result && result.success && Array.isArray(result.customers)) {
            // جلب ديون كل زبون
            const customers = result.customers;
            for (const cust of customers) {
                try {
                    const debtResult = await window.api.getCustomerDebts(cust.id);
                    if (debtResult && debtResult.success) {
                        cust.total_debt = (debtResult.debts || [])
                            .filter(d => d.status === 'pending')
                            .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
                    } else {
                        cust.total_debt = 0;
                    }
                } catch (e) {
                    cust.total_debt = 0;
                }
            }
            return customers;
        }
        return [];
    } catch (e) {
        console.warn('خطأ تحميل الزبائن:', e);
        return [];
    }
}

async function loadDebtsData() {
    try {
        const result = await window.api.getOutstandingDebts();
        if (result && result.success) {
            return result.debts || [];
        }
        return [];
    } catch (e) {
        console.warn('خطأ تحميل الديون:', e);
        return [];
    }
}

async function loadTransfersData() {
    try {
        const result = await window.api.getPendingTransfers();
        if (result && result.success) {
            return result.transfers || [];
        }
        return [];
    } catch (e) {
        console.warn('خطأ تحميل التحويلات:', e);
        return [];
    }
}

// ===== تحديث الإحصائيات =====
function updateStats() {
    const invoices = reportData.invoices;

    // إجمالي المبيعات
    const totalSales = invoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
    setText('statTotalSales', formatCurrency(totalSales));

    // عدد الفواتير
    setText('statInvoiceCount', invoices.length);

    // صافي الربح
    const products = reportData.products;
    const totalProfit = products.reduce((sum, p) => sum + (p.total_profit || 0), 0);
    setText('statTotalProfit', formatCurrency(totalProfit));

    // ديون الفترة
    const totalDebts = reportData.debts.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    setText('statTotalDebts', formatCurrency(totalDebts));
}

// ===== عرض التقرير الحالي =====
function renderCurrentReport() {
    // إخفاء جميع الأقسام
    document.querySelectorAll('.report-section').forEach(s => s.style.display = 'none');

    // عرض القسم المطلوب
    const section = document.getElementById(`report-${currentReportType}`);
    if (section) section.style.display = 'block';

    // رسم البيانات
    switch (currentReportType) {
        case 'sales': renderSalesReport(); break;
        case 'products': renderProductsReport(); break;
        case 'customers': renderCustomersReport(); break;
        case 'profits': renderProfitsReport(); break;
        case 'debts': renderDebtsReport(); break;
    }
}

// ===== تقرير المبيعات =====
function renderSalesReport() {
    const invoices = reportData.invoices;
    renderPaymentBreakdown(invoices);
    renderSalesTable(invoices);
}

async function renderPaymentBreakdown(invoices) {
    const totalSales = invoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
    let cashTotal = 0, transferTotal = 0, debtTotal = 0, cardTotal = 0;

    try {
        const range = getDateRange();
        if (window.api.getPaymentStats) {
            const result = await window.api.getPaymentStats(range.from, range.to);
            if (result && result.success && result.stats) {
                cashTotal = parseFloat(result.stats.cash_total) || 0;
                cardTotal = parseFloat(result.stats.card_total) || 0;
                transferTotal = parseFloat(result.stats.transfers_total) || 0;
                debtTotal = parseFloat(result.stats.debts_total) || 0;
            }
        }
    } catch (e) {
        console.warn('\u062E\u0637\u0623 \u062C\u0644\u0628 \u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A \u0627\u0644\u062F\u0641\u0639:', e);
    }

    updatePaymentBars(totalSales, cashTotal, transferTotal, debtTotal, cardTotal);
}

function updatePaymentBars(total, cash, transfer, debt, card) {
    if (total === 0) total = 1; // منع القسمة على صفر

    setText('cashAmount', formatCurrency(cash));
    setText('transferAmount', formatCurrency(transfer));
    setText('debtAmount', formatCurrency(debt));
    setText('cardAmount', formatCurrency(card));

    const cashPct = Math.round((cash / total) * 100);
    const transferPct = Math.round((transfer / total) * 100);
    const debtPct = Math.round((debt / total) * 100);
    const cardPct = Math.round((card / total) * 100);

    setBar('cashBar', cashPct);
    setBar('transferBar', transferPct);
    setBar('debtBar', debtPct);
    setBar('cardBar', cardPct);

    setText('cashPercent', cashPct + '%');
    setText('transferPercent', transferPct + '%');
    setText('debtPercent', debtPct + '%');
    setText('cardPercent', cardPct + '%');
}

function setBar(id, percent) {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.min(percent, 100) + '%';
}

function renderSalesTable(invoices) {
    const tbody = document.getElementById('salesTableBody');
    const noSales = document.getElementById('noSales');
    if (!tbody) return;

    if (invoices.length === 0) {
        tbody.innerHTML = '';
        if (noSales) noSales.style.display = 'flex';
        return;
    }
    if (noSales) noSales.style.display = 'none';

    tbody.innerHTML = invoices.map((inv, i) => {
        const total = parseFloat(inv.total) || 0;
        const invoiceNum = inv.invoice_number || `#${inv.id}`;
        const customer = escapeHtml(inv.customer_name || 'زبون عابر');
        const status = inv.status === 'completed'
            ? '<span class="badge badge-success">مكتملة</span>'
            : '<span class="badge badge-warning">معلقة</span>';
        const date = formatDate(inv.created_at);
        const paymentType = inv.payment_type || '-';

        let paymentLabel = '-';
        if (paymentType === 'cash') paymentLabel = '<span class="badge badge-success">نقدي</span>';
        else if (paymentType === 'transfer') paymentLabel = '<span class="badge badge-primary">تحويل</span>';
        else if (paymentType === 'debt') paymentLabel = '<span class="badge badge-danger">دين</span>';
        else if (paymentType === 'card') paymentLabel = '<span class="badge badge-info">بطاقة</span>';
        else if (paymentType === 'mixed') paymentLabel = '<span class="badge badge-warning">مختلط</span>';

        return `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${invoiceNum}</strong></td>
                <td>${customer}</td>
                <td class="amount-neutral">${formatCurrency(total)}</td>
                <td>${paymentLabel}</td>
                <td>${status}</td>
                <td>${date}</td>
            </tr>
        `;
    }).join('');
}

// ===== تقرير المنتجات =====
function renderProductsReport() {
    const products = reportData.products;
    renderProductsRanking(products);
    renderProductsTable(products);
}

function renderProductsRanking(products) {
    const container = document.getElementById('productsRanking');
    if (!container) return;

    const top10 = products.slice(0, 10);

    if (top10.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px;">لا توجد بيانات</p>';
        return;
    }

    container.innerHTML = top10.map((p, i) => `
        <div class="ranking-item">
            <span class="ranking-number">${i + 1}</span>
            <div class="ranking-info">
                <span class="ranking-name">${escapeHtml(p.product_name)}</span>
                <div class="ranking-stats">
                    <span>📦 ${p.total_qty} قطعة</span>
                    <span>💵 ${formatCurrency(p.total_sales)}</span>
                    <span>📈 ${formatCurrency(p.total_profit)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function renderProductsTable(products) {
    const tbody = document.getElementById('productsReportBody');
    const noProducts = document.getElementById('noProductsReport');
    if (!tbody) return;

    if (products.length === 0) {
        tbody.innerHTML = '';
        if (noProducts) noProducts.style.display = 'flex';
        return;
    }
    if (noProducts) noProducts.style.display = 'none';

    tbody.innerHTML = products.map((p, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><strong>${escapeHtml(p.product_name)}</strong></td>
            <td>${escapeHtml(p.barcode)}</td>
            <td>${p.total_qty}</td>
            <td>${formatCurrency(p.price)}</td>
            <td>${formatCurrency(p.cost_price)}</td>
            <td class="amount-neutral">${formatCurrency(p.total_sales)}</td>
            <td class="amount-positive">${formatCurrency(p.total_profit)}</td>
        </tr>
    `).join('');
}

// ===== تقرير الزبائن =====
function renderCustomersReport() {
    const customers = reportData.customers;
    const tbody = document.getElementById('customersReportBody');
    const noCustomers = document.getElementById('noCustomersReport');
    if (!tbody) return;

    if (customers.length === 0) {
        tbody.innerHTML = '';
        if (noCustomers) noCustomers.style.display = 'flex';
        return;
    }
    if (noCustomers) noCustomers.style.display = 'none';

    // حساب عدد الفواتير لكل زبون من الفواتير المحملة
    const invoicesByCustomer = {};
    reportData.invoices.forEach(inv => {
        const cid = inv.customer_id;
        if (cid) {
            if (!invoicesByCustomer[cid]) invoicesByCustomer[cid] = { count: 0, total: 0 };
            invoicesByCustomer[cid].count++;
            invoicesByCustomer[cid].total += parseFloat(inv.total) || 0;
        }
    });

    tbody.innerHTML = customers.map((c, i) => {
        const custInvoices = invoicesByCustomer[c.id] || { count: 0, total: 0 };
        const debt = c.total_debt || 0;
        const ceiling = parseFloat(c.debt_ceiling) || 0;
        const usagePercent = ceiling > 0 ? Math.round((debt / ceiling) * 100) : 0;
        const usageClass = usagePercent >= 90 ? 'high' : usagePercent >= 60 ? 'medium' : 'low';

        let typeLabel = 'عادي';
        if (c.customer_type === 'wholesale') typeLabel = 'جملة';
        else if (c.customer_type === 'vip') typeLabel = 'VIP';

        return `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${escapeHtml(c.name)}</strong></td>
                <td>${escapeHtml(c.phone || '-')}</td>
                <td><span class="badge badge-info">${typeLabel}</span></td>
                <td>${custInvoices.count}</td>
                <td class="amount-neutral">${formatCurrency(custInvoices.total)}</td>
                <td class="${debt > 0 ? 'amount-negative' : 'amount-neutral'}">${formatCurrency(debt)}</td>
                <td>${formatCurrency(ceiling)}</td>
                <td>
                    <div class="usage-bar-container">
                        <div class="usage-bar">
                            <div class="usage-bar-fill ${usageClass}" style="width:${Math.min(usagePercent, 100)}%"></div>
                        </div>
                        <span class="usage-percent">${usagePercent}%</span>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ===== تقرير الأرباح =====
function renderProfitsReport() {
    const products = reportData.products;

    const totalSales = products.reduce((sum, p) => sum + (p.total_sales || 0), 0);
    const totalCost = products.reduce((sum, p) => sum + (p.total_cost || 0), 0);
    const netProfit = totalSales - totalCost;
    const profitMargin = totalSales > 0 ? Math.round((netProfit / totalSales) * 100) : 0;

    setText('profitTotalSales', formatCurrency(totalSales));
    setText('profitTotalCost', formatCurrency(totalCost));
    setText('profitNet', formatCurrency(netProfit));
    setText('profitMargin', profitMargin + '%');

    const tbody = document.getElementById('profitsTableBody');
    const noProfits = document.getElementById('noProfits');
    if (!tbody) return;

    if (products.length === 0) {
        tbody.innerHTML = '';
        if (noProfits) noProfits.style.display = 'flex';
        return;
    }
    if (noProfits) noProfits.style.display = 'none';

    // ترتيب حسب الربح الأعلى
    const sorted = [...products].sort((a, b) => b.total_profit - a.total_profit);

    tbody.innerHTML = sorted.map((p, i) => {
        const profitPerUnit = p.price - p.cost_price;
        const margin = p.price > 0 ? Math.round((profitPerUnit / p.price) * 100) : 0;
        const profitClass = p.total_profit >= 0 ? 'amount-positive' : 'amount-negative';

        return `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${escapeHtml(p.product_name)}</strong></td>
                <td>${p.total_qty}</td>
                <td>${formatCurrency(p.price)}</td>
                <td>${formatCurrency(p.cost_price)}</td>
                <td class="${profitClass}">${formatCurrency(profitPerUnit)}</td>
                <td class="${profitClass}">${formatCurrency(p.total_profit)}</td>
                <td>
                    <span class="badge ${margin >= 30 ? 'badge-success' : margin >= 15 ? 'badge-warning' : 'badge-danger'}">
                        ${margin}%
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

// ===== تقرير الديون =====
function renderDebtsReport() {
    const debts = reportData.debts;
    const transfers = reportData.transfers;

    // ملخص
    const totalDebts = debts.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    const totalPending = transfers.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

    setText('debtSummaryTotal', formatCurrency(totalDebts));
    setText('debtSummaryPending', formatCurrency(totalPending));
    setText('debtSummaryPaid', formatCurrency(0)); // يتطلب تتبع المدفوعات

    // تجميع الديون حسب الزبون
    const debtsByCustomer = {};
    debts.forEach(d => {
        const cid = d.customer_id || 'unknown';
        if (!debtsByCustomer[cid]) {
            debtsByCustomer[cid] = {
                customer_id: d.customer_id,
                customer_name: d.customer_name || 'زبون عابر',
                debts_count: 0,
                total_debt: 0,
                debt_ceiling: 0
            };
        }
        debtsByCustomer[cid].debts_count++;
        debtsByCustomer[cid].total_debt += parseFloat(d.amount) || 0;
    });

    // إضافة سقف الدين من بيانات الزبائن
    reportData.customers.forEach(c => {
        if (debtsByCustomer[c.id]) {
            debtsByCustomer[c.id].debt_ceiling = parseFloat(c.debt_ceiling) || 0;
        }
    });

    const customerDebts = Object.values(debtsByCustomer).sort((a, b) => b.total_debt - a.total_debt);

    const tbody = document.getElementById('debtsReportBody');
    const noDebts = document.getElementById('noDebtsReport');
    if (!tbody) return;

    if (customerDebts.length === 0) {
        tbody.innerHTML = '';
        if (noDebts) noDebts.style.display = 'flex';
        return;
    }
    if (noDebts) noDebts.style.display = 'none';

    tbody.innerHTML = customerDebts.map((c, i) => {
        const usagePercent = c.debt_ceiling > 0 ? Math.round((c.total_debt / c.debt_ceiling) * 100) : 0;
        const usageClass = usagePercent >= 90 ? 'high' : usagePercent >= 60 ? 'medium' : 'low';
        const statusBadge = usagePercent >= 100
            ? '<span class="badge badge-danger">تجاوز الحد</span>'
            : usagePercent >= 80
                ? '<span class="badge badge-warning">قريب من الحد</span>'
                : '<span class="badge badge-success">طبيعي</span>';

        return `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${escapeHtml(c.customer_name)}</strong></td>
                <td>${c.debts_count}</td>
                <td class="amount-negative">${formatCurrency(c.total_debt)}</td>
                <td>${formatCurrency(c.debt_ceiling)}</td>
                <td>
                    <div class="usage-bar-container">
                        <div class="usage-bar">
                            <div class="usage-bar-fill ${usageClass}" style="width:${Math.min(usagePercent, 100)}%"></div>
                        </div>
                        <span class="usage-percent">${usagePercent}%</span>
                    </div>
                </td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join('');
}

// ===== تصدير CSV =====
function exportToCSV() {
    let csvContent = '';
    let filename = '';

    switch (currentReportType) {
        case 'sales':
            csvContent = generateSalesCSV();
            filename = 'تقرير_المبيعات';
            break;
        case 'products':
            csvContent = generateProductsCSV();
            filename = 'تقرير_المنتجات';
            break;
        case 'customers':
            csvContent = generateCustomersCSV();
            filename = 'تقرير_الزبائن';
            break;
        case 'profits':
            csvContent = generateProfitsCSV();
            filename = 'تقرير_الأرباح';
            break;
        case 'debts':
            csvContent = generateDebtsCSV();
            filename = 'تقرير_الديون';
            break;
    }

    if (!csvContent) {
        showToast('لا توجد بيانات للتصدير', 'warning');
        return;
    }

    // إضافة BOM للعربية
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${formatDateForInput(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('✅ تم تصدير التقرير', 'success');
}

function generateSalesCSV() {
    const headers = ['#', 'رقم الفاتورة', 'الزبون', 'المبلغ', 'الحالة', 'التاريخ'];
    const rows = reportData.invoices.map((inv, i) => [
        i + 1,
        inv.invoice_number || `#${inv.id}`,
        inv.customer_name || 'زبون عابر',
        parseFloat(inv.total) || 0,
        inv.status === 'completed' ? 'مكتملة' : 'معلقة',
        inv.created_at || '-'
    ]);
    return [headers, ...rows].map(r => r.join(',')).join('\n');
}

function generateProductsCSV() {
    const headers = ['#', 'المنتج', 'الباركود', 'الكمية المباعة', 'سعر البيع', 'سعر التكلفة', 'إجمالي المبيعات', 'إجمالي الربح'];
    const rows = reportData.products.map((p, i) => [
        i + 1, p.product_name, p.barcode, p.total_qty, p.price, p.cost_price, p.total_sales.toFixed(2), p.total_profit.toFixed(2)
    ]);
    return [headers, ...rows].map(r => r.join(',')).join('\n');
}

function generateCustomersCSV() {
    const headers = ['#', 'الزبون', 'الهاتف', 'النوع', 'الديون الحالية', 'سقف الدين'];
    const rows = reportData.customers.map((c, i) => [
        i + 1, c.name, c.phone || '-', c.customer_type || 'regular', c.total_debt || 0, c.debt_ceiling || 0
    ]);
    return [headers, ...rows].map(r => r.join(',')).join('\n');
}

function generateProfitsCSV() {
    const headers = ['#', 'المنتج', 'الكمية', 'سعر البيع', 'التكلفة', 'الربح/وحدة', 'إجمالي الربح'];
    const sorted = [...reportData.products].sort((a, b) => b.total_profit - a.total_profit);
    const rows = sorted.map((p, i) => [
        i + 1, p.product_name, p.total_qty, p.price, p.cost_price,
        (p.price - p.cost_price).toFixed(2), p.total_profit.toFixed(2)
    ]);
    return [headers, ...rows].map(r => r.join(',')).join('\n');
}

function generateDebtsCSV() {
    const headers = ['#', 'الزبون', 'المبلغ', 'السبب', 'التاريخ'];
    const rows = reportData.debts.map((d, i) => [
        i + 1, d.customer_name || 'زبون عابر', parseFloat(d.amount) || 0,
        d.notes || d.reason || 'دين', d.created_at || '-'
    ]);
    return [headers, ...rows].map(r => r.join(',')).join('\n');
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

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => { toast.classList.add('show'); });
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

console.log('📄 reports.js v5.0 loaded');
