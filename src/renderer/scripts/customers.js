/* ========================================
   customers.js - أبو كميل POS v4.0
   سكريبت صفحة إدارة الزبائن
======================================== */

// ========== المتغيرات العامة ==========
let allCustomers = [];
let currentFilter = 'all';
let currentSort = 'name_asc';
let currentCustomerId = null;
let currentCustomerDebt = 0;

// ========== تهيئة الصفحة ==========
document.addEventListener('DOMContentLoaded', () => {
    loadCurrentUser();
    loadCustomers();
    loadStats();
    bindEvents();
});

// ========== تحميل المستخدم الحالي ==========
function loadCurrentUser() {
    try {
        const session = JSON.parse(sessionStorage.getItem('userSession') || localStorage.getItem('userSession') || '{}');
        if (session && session.display_name) {
            document.getElementById('currentUser').textContent = session.display_name;
        }
    } catch (e) {
        console.log('لم يتم العثور على جلسة مستخدم');
    }
}

// ========== ربط الأحداث ==========
function bindEvents() {
    // بحث
    const searchInput = document.getElementById('searchCustomer');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filterAndRenderCustomers(); bindCustomerEvents();
        }, 300);
    });

    // زر إضافة زبون
    document.getElementById('btnAddCustomer').addEventListener('click', () => openAddModal());

    // أزرار الفلاتر
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            filterAndRenderCustomers(); bindCustomerEvents();
        });
    });

    // الترتيب
    document.getElementById('sortCustomers').addEventListener('change', (e) => {
        currentSort = e.target.value;
        filterAndRenderCustomers(); bindCustomerEvents();
    });

    // مودال الزبون - إغلاق
    document.getElementById('btnCloseModal').addEventListener('click', closeModal);
    document.getElementById('btnCancelModal').addEventListener('click', closeModal);
    document.getElementById('customerModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    // مودال التفاصيل - إغلاق
    document.getElementById('btnCloseDetails').addEventListener('click', closeDetailsModal);
    document.getElementById('btnCloseDetailsFooter').addEventListener('click', closeDetailsModal);
    document.getElementById('customerDetailsModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeDetailsModal();
    });

    // حفظ الزبون
    document.getElementById('btnSaveCustomer').addEventListener('click', saveCustomer);

    // القائمة السوداء - إظهار حقل السبب
    document.getElementById('btnAddFirstCustomer')?.addEventListener('click', () => {
        document.getElementById('btnAddCustomer')?.click();
    });

    document.getElementById('customerBlacklist').addEventListener('change', (e) => {
        document.getElementById('blacklistReason').style.display = e.target.checked ? 'block' : 'none';
    });

    // تبويبات التفاصيل
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(`tab-${e.target.dataset.tab}`).classList.add('active');
        });
    });

    // سداد دين
    document.getElementById('btnPayDebt').addEventListener('click', openPayDebtModal);
    document.getElementById('btnClosePayDebt').addEventListener('click', closePayDebtModal);
    document.getElementById('btnCancelPayDebt').addEventListener('click', closePayDebtModal);
    document.getElementById('payDebtModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closePayDebtModal();
    });
    document.getElementById('btnConfirmPayDebt').addEventListener('click', confirmPayDebt);

    // أزرار المبالغ السريعة
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const amount = e.target.dataset.amount;
            if (amount === 'full') {
                document.getElementById('payAmount').value = currentCustomerDebt;
            } else {
                document.getElementById('payAmount').value = amount;
            }
        });
    });

    // تعديل من التفاصيل
    document.getElementById('btnEditFromDetails').addEventListener('click', () => {
        closeDetailsModal();
        const customer = allCustomers.find(c => c.id === currentCustomerId);
        if (customer) openEditModal(customer);
    });

    // تسجيل خروج
    document.getElementById('btnLogout').addEventListener('click', async () => {
        try {
            const session = JSON.parse(sessionStorage.getItem('userSession') || localStorage.getItem('userSession') || '{}');
            if (session && session.session_id) {
                await window.api.logout(session.session_id);
            }
            sessionStorage.removeItem('userSession');
            localStorage.removeItem('userSession');
            window.location.href = 'login.html';
        } catch (e) {
            window.location.href = 'login.html';
        }
    });

    // اختصارات لوحة المفاتيح
    document.addEventListener('keydown', (e) => {
        // Ctrl+N = زبون جديد
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            openAddModal();
        }
        // Escape = إغلاق المودال
        if (e.key === 'Escape') {
            closeModal();
            closeDetailsModal();
            closePayDebtModal();
        }
        // Ctrl+F = تركيز البحث
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            searchInput.focus();
        }
    });
}

// ========== تحميل الزبائن ==========
async function loadCustomers() {
    try {
        const result = await window.api.getCustomers();
        if (result.success) {
            allCustomers = result.customers || result.data || [];
            // تحميل الديون لكل زبون
            await loadCustomerDebts();
            filterAndRenderCustomers(); bindCustomerEvents();
        } else {
            console.error('فشل تحميل الزبائن:', result.error);
            showToast('فشل تحميل بيانات الزبائن', 'error');
        }
    } catch (error) {
        console.error('خطأ في تحميل الزبائن:', error);
        showToast('خطأ في الاتصال بقاعدة البيانات', 'error');
    }
}

// ========== تحميل ديون الزبائن ==========
async function loadCustomerDebts() {
    for (let customer of allCustomers) {
        try {
            const debtResult = await window.api.getCustomerDebts(customer.id);
            if (debtResult.success) {
                customer.total_debt = debtResult.total_debt || 0;
            } else {
                customer.total_debt = 0;
            }
        } catch (e) {
            customer.total_debt = 0;
        }
    }
}

// ========== تحميل الإحصائيات ==========
async function loadStats() {
    try {
        const result = await window.api.getCustomers();
        if (result.success) {
            const customers = result.customers || result.data || [];
            const total = customers.length;
            const active = customers.filter(c => c.is_active !== 0 && !c.is_blacklisted).length;
            const blacklisted = customers.filter(c => c.is_blacklisted).length;

            document.getElementById('statTotalCustomers').textContent = total;
            document.getElementById('statActiveCustomers').textContent = active;
            document.getElementById('statBlacklisted').textContent = blacklisted;

            // حساب إجمالي الديون
            let totalDebts = 0;
            for (let c of customers) {
                try {
                    const d = await window.api.getCustomerDebts(c.id);
                    if (d.success) totalDebts += (d.total_debt || 0);
                } catch (e) { }
            }
            document.getElementById('statTotalDebts').textContent = formatCurrency(totalDebts);
        }
    } catch (error) {
        console.error('خطأ في تحميل الإحصائيات:', error);
    }
}

// ========== فلترة وعرض الزبائن ==========
function filterAndRenderCustomers() {
    let filtered = [...allCustomers];
    const searchTerm = document.getElementById('searchCustomer').value.trim().toLowerCase();

    // فلترة بالبحث
    if (searchTerm) {
        filtered = filtered.filter(c =>
            (c.name && c.name.toLowerCase().includes(searchTerm)) ||
            (c.phone && c.phone.includes(searchTerm)) ||
            (c.address && c.address.toLowerCase().includes(searchTerm))
        );
    }

    // فلترة بالنوع
    switch (currentFilter) {
        case 'active':
            filtered = filtered.filter(c => c.is_active !== 0 && !c.is_blacklisted);
            break;
        case 'has_debt':
            filtered = filtered.filter(c => (c.total_debt || 0) > 0);
            break;
        case 'near_ceiling':
            filtered = filtered.filter(c => {
                const ceiling = c.debt_ceiling || 0;
                const debt = c.total_debt || 0;
                return ceiling > 0 && (debt / ceiling) >= 0.7;
            });
            break;
        case 'blacklisted':
            filtered = filtered.filter(c => c.is_blacklisted);
            break;
    }

    // ترتيب
    switch (currentSort) {
        case 'name_asc':
            filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
            break;
        case 'name_desc':
            filtered.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'ar'));
            break;
        case 'debt_high':
            filtered.sort((a, b) => (b.total_debt || 0) - (a.total_debt || 0));
            break;
        case 'debt_low':
            filtered.sort((a, b) => (a.total_debt || 0) - (b.total_debt || 0));
            break;
        case 'recent':
            filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            break;
    }

    renderCustomersTable(filtered);
}

// ========== عرض جدول الزبائن ==========
function renderCustomersTable(customers) {
    const tbody = document.getElementById('customersTableBody');
    const noCustomers = document.getElementById('noCustomers');

    if (customers.length === 0) {
        tbody.innerHTML = '';
        noCustomers.style.display = 'block';
        return;
    }

    noCustomers.style.display = 'none';

    tbody.innerHTML = customers.map((customer, index) => {
        const debt = customer.total_debt || 0;
        const ceiling = customer.debt_ceiling || 0;
        const usagePercent = ceiling > 0 ? Math.min((debt / ceiling) * 100, 100) : 0;
        const usageClass = usagePercent >= 80 ? 'high' : usagePercent >= 50 ? 'medium' : 'low';
        const initial = (customer.name || '?').charAt(0);
        const avatarClass = customer.customer_type === 'wholesale' ? 'avatar-wholesale' :
            customer.customer_type === 'vip' ? 'avatar-vip' : 'avatar-regular';
        const typeLabel = customer.customer_type === 'wholesale' ? 'جملة' :
            customer.customer_type === 'vip' ? 'VIP' : 'عادي';
        const typeBadge = customer.customer_type === 'wholesale' ? 'badge-wholesale' :
            customer.customer_type === 'vip' ? 'badge-vip' : 'badge-regular';
        const statusBadge = customer.is_blacklisted ? 'badge-blacklisted' :
            customer.is_active !== 0 ? 'badge-active' : 'badge-inactive';
        const statusLabel = customer.is_blacklisted ? '🚫 محظور' :
            customer.is_active !== 0 ? 'نشط' : 'غير نشط';
        const rowClass = customer.is_blacklisted ? 'blacklisted' : '';

        return `
            <tr class="${rowClass}" data-id="${customer.id}">
                <td>${index + 1}</td>
                <td>
                    <div class="customer-name-cell">
                        <div class="customer-avatar ${avatarClass}">${initial}</div>
                        <div class="customer-name-text">
                            <span class="name" data-view-customer="${customer.id}">${escapeHtml(customer.name)}</span>
                            ${customer.address ? `<span class="address">${escapeHtml(customer.address)}</span>` : ''}
                        </div>
                    </div>
                </td>
                <td>${customer.phone || '-'}</td>
                <td><span class="badge ${typeBadge}">${typeLabel}</span></td>
                <td>${ceiling > 0 ? formatCurrency(ceiling) : 'بدون سقف'}</td>
                <td style="color: ${debt > 0 ? 'var(--danger)' : 'var(--success)'}; font-weight: 600;">
                    ${formatCurrency(debt)}
                </td>
                <td>
                    ${ceiling > 0 ? `
                        <div class="debt-usage-text">${usagePercent.toFixed(0)}%</div>
                        <div class="debt-usage-bar">
                            <div class="debt-usage-fill ${usageClass}" style="width: ${usagePercent}%"></div>
                        </div>
                    ` : '<span style="color:var(--gray-light)">-</span>'}
                </td>
                <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-icon-view" title="عرض التفاصيل" data-view-customer="${customer.id}">👁</button>
                        <button class="btn-icon btn-icon-edit" title="تعديل" data-edit-customer="${customer.id}">✏️</button>
                        <button class="btn-icon btn-icon-delete" title="حذف" data-delete-customer="${customer.id}" data-customer-name="${escapeHtml(customer.name)}">🗑</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ========== فتح مودال الإضافة ==========
function openAddModal() {
    document.getElementById('modalTitle').textContent = 'إضافة زبون جديد';
    document.getElementById('customerForm').reset();
    document.getElementById('customerId').value = '';
    document.getElementById('debtCeiling').value = '500';
    document.getElementById('blacklistReason').style.display = 'none';
    document.getElementById('customerModal').classList.add('show');
    setTimeout(() => document.getElementById('customerName').focus(), 200);
}

// ========== فتح مودال التعديل ==========
function openEditModal(customer) {
    document.getElementById('modalTitle').textContent = 'تعديل بيانات الزبون';
    document.getElementById('customerId').value = customer.id;
    document.getElementById('customerName').value = customer.name || '';
    document.getElementById('customerPhone').value = customer.phone || '';
    document.getElementById('customerType').value = customer.customer_type || 'regular';
    document.getElementById('debtCeiling').value = customer.debt_ceiling || 0;
    document.getElementById('customerAddress').value = customer.address || '';
    document.getElementById('customerNotes').value = customer.notes || '';
    document.getElementById('customerBlacklist').checked = customer.is_blacklisted ? true : false;

    if (customer.is_blacklisted) {
        document.getElementById('blacklistReason').style.display = 'block';
        document.getElementById('blacklistReasonText').value = customer.blacklist_reason || '';
    } else {
        document.getElementById('blacklistReason').style.display = 'none';
    }

    document.getElementById('customerModal').classList.add('show');
}

// ========== تعديل زبون من الجدول ==========
function editCustomer(id) {
    const customer = allCustomers.find(c => c.id === id);
    if (customer) openEditModal(customer);
}

// ========== إغلاق المودال ==========
function closeModal() {
    document.getElementById('customerModal').classList.remove('show');
}

// ========== حفظ الزبون ==========
async function saveCustomer() {
    const id = document.getElementById('customerId').value;
    const name = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    const customerType = document.getElementById('customerType').value;
    const debtCeiling = parseFloat(document.getElementById('debtCeiling').value) || 0;
    const address = document.getElementById('customerAddress').value.trim();
    const notes = document.getElementById('customerNotes').value.trim();
    const isBlacklisted = document.getElementById('customerBlacklist').checked ? 1 : 0;
    const blacklistReason = document.getElementById('blacklistReasonText').value.trim();

    // التحقق
    if (!name) {
        showToast('يرجى إدخال اسم الزبون', 'error');
        document.getElementById('customerName').focus();
        return;
    }

    const customerData = {
        name,
        phone,
        customer_type: customerType,
        debt_ceiling: debtCeiling,
        address,
        notes: isBlacklisted && blacklistReason ? `${notes}\n[سبب الحظر: ${blacklistReason}]` : notes,
        is_blacklisted: isBlacklisted
    };

    try {
        let result;
        if (id) {
            // تعديل
            result = await window.api.updateCustomer(parseInt(id), customerData);
        } else {
            // إضافة
            result = await window.api.addCustomer(customerData);
        }

        if (result.success) {
            showToast(id ? 'تم تعديل بيانات الزبون بنجاح ✅' : 'تم إضافة الزبون بنجاح ✅', 'success');
            closeModal();
            await loadCustomers();
            await loadStats();
        } else {
            showToast(result.error || 'حدث خطأ أثناء الحفظ', 'error');
        }
    } catch (error) {
        console.error('خطأ في حفظ الزبون:', error);
        showToast('خطأ في الاتصال بقاعدة البيانات', 'error');
    }
}

// ========== حذف زبون ==========
async function deleteCustomer(id, name) {
    const confirmed = confirm(`هل أنت متأكد من حذف الزبون "${name}"?\n\nملاحظة: لن يتم حذف الزبون إذا كان لديه فواتير أو ديون.`);
    if (!confirmed) return;

    try {
        // نتحقق إذا عنده ديون أولاً
        const debtResult = await window.api.getCustomerDebts(id);
        if (debtResult.success && debtResult.total_debt > 0) {
            showToast(`لا يمكن حذف "${name}" - عليه ديون بقيمة ${formatCurrency(debtResult.total_debt)}`, 'error');
            return;
        }

        const result = await window.api.deleteCustomer(id);
        if (result.success) {
            showToast(`تم حذف الزبون "${name}" ✅`, 'success');
            await loadCustomers();
            await loadStats();
        } else {
            showToast(result.error || 'فشل حذف الزبون', 'error');
        }
    } catch (error) {
        console.error('خطأ في حذف الزبون:', error);
        showToast('خطأ في حذف الزبون', 'error');
    }
}

// ========== عرض تفاصيل الزبون ==========
async function viewCustomerDetails(id) {
    currentCustomerId = id;
    const customer = allCustomers.find(c => c.id === id);
    if (!customer) return;

    const debt = customer.total_debt || 0;
    const ceiling = customer.debt_ceiling || 0;
    const remaining = Math.max(ceiling - debt, 0);
    const percent = ceiling > 0 ? Math.min((debt / ceiling) * 100, 100) : 0;
    currentCustomerDebt = debt;

    // معلومات الزبون
    document.getElementById('detailAvatar').textContent = (customer.name || '?').charAt(0);
    document.getElementById('detailName').textContent = customer.name;
    document.getElementById('detailPhone').textContent = customer.phone || 'بدون رقم';
    document.getElementById('detailAddress').textContent = customer.address || 'بدون عنوان';

    const typeLabel = customer.customer_type === 'wholesale' ? 'جملة' :
        customer.customer_type === 'vip' ? 'VIP' : 'عادي';
    const typeBadge = customer.customer_type === 'wholesale' ? 'badge-wholesale' :
        customer.customer_type === 'vip' ? 'badge-vip' : 'badge-regular';
    document.getElementById('detailType').textContent = typeLabel;
    document.getElementById('detailType').className = `badge ${typeBadge}`;

    const statusLabel = customer.is_blacklisted ? '🚫 محظور' : 'نشط';
    const statusBadge = customer.is_blacklisted ? 'badge-blacklisted' : 'badge-active';
    document.getElementById('detailStatus').textContent = statusLabel;
    document.getElementById('detailStatus').className = `badge ${statusBadge}`;

    // دائرة الدين
    const arc = document.getElementById('debtArc');
    arc.setAttribute('stroke-dasharray', `${percent}, 100`);
    arc.className.baseVal = percent >= 80 ? 'circle high' : percent >= 50 ? 'circle medium' : 'circle';
    document.getElementById('debtPercentText').textContent = `${percent.toFixed(0)}%`;

    document.getElementById('detailCurrentDebt').textContent = formatCurrency(debt);
    document.getElementById('detailCeiling').textContent = ceiling > 0 ? formatCurrency(ceiling) : 'بدون سقف';
    document.getElementById('detailRemaining').textContent = ceiling > 0 ? formatCurrency(remaining) : '-';

    // زر السداد
    document.getElementById('btnPayDebt').style.display = debt > 0 ? 'inline-flex' : 'none';

    // تحميل الفواتير
    await loadCustomerInvoices(id);

    // تحميل الديون
    await loadCustomerDebtDetails(id);

    // تحميل المدفوعات
    await loadCustomerPayments(id);

    // إعادة تفعيل أول تبويب
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="invoices"]').classList.add('active');
    document.getElementById('tab-invoices').classList.add('active');

    document.getElementById('customerDetailsModal').classList.add('show');
}

// ========== تحميل فواتير الزبون ==========
async function loadCustomerInvoices(customerId) {
    const tbody = document.getElementById('detailInvoicesBody');
    const noData = document.getElementById('noInvoices');

    try {
        const result = await window.api.searchInvoices({ customer_id: customerId });
        const invoices = result.success ? (result.invoices || result.data || []) : [];

        if (invoices.length === 0) {
            tbody.innerHTML = '';
            noData.style.display = 'block';
            return;
        }

        noData.style.display = 'none';
        tbody.innerHTML = invoices.map(inv => {
            const paymentLabel = getPaymentLabel(inv.payment_method);
            const statusLabel = inv.status === 'completed' ? '✅ مكتملة' :
                inv.status === 'pending' ? '⏳ معلقة' : inv.status;
            return `
                <tr>
                    <td>#${inv.id}</td>
                    <td>${formatDate(inv.created_at)}</td>
                    <td>${formatCurrency(inv.total)}</td>
                    <td>${paymentLabel}</td>
                    <td>${statusLabel}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('خطأ في تحميل فواتير الزبون:', error);
        tbody.innerHTML = '';
        noData.style.display = 'block';
    }
}

// ========== تحميل تفاصيل ديون الزبون ==========
async function loadCustomerDebtDetails(customerId) {
    const tbody = document.getElementById('detailDebtsBody');
    const noData = document.getElementById('noDebts');

    try {
        const result = await window.api.getCustomerDebts(customerId);
        const debts = result.success ? (result.debts || []) : [];

        if (debts.length === 0) {
            tbody.innerHTML = '';
            noData.style.display = 'block';
            return;
        }

        noData.style.display = 'none';
        tbody.innerHTML = debts.map(d => {
            const statusLabel = d.status === 'pending' ? '⏳ غير مسدد' :
                d.status === 'paid' ? '✅ مسدد' :
                    d.status === 'overdue_to_debt' ? '🔴 متأخر' : d.status;
            return `
                <tr>
                    <td>#${d.invoice_id}</td>
                    <td>${formatDate(d.created_at)}</td>
                    <td style="color: var(--danger); font-weight: 600;">${formatCurrency(d.amount)}</td>
                    <td>${d.debt_reason || d.notes || '-'}</td>
                    <td>${statusLabel}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('خطأ في تحميل ديون الزبون:', error);
        tbody.innerHTML = '';
        noData.style.display = 'block';
    }
}

// ========== تحميل مدفوعات الزبون ==========
async function loadCustomerPayments(customerId) {
    const tbody = document.getElementById('detailPaymentsBody');
    const noData = document.getElementById('noPayments');

    try {
        const result = await window.api.searchInvoices({ customer_id: customerId });
        const invoices = result.success ? (result.invoices || result.data || []) : [];
        const invoiceIds = invoices.map(i => i.id);

        // نعرض المدفوعات المكتملة فقط
        let allPayments = [];
        for (let inv of invoices) {
            try {
                const detail = await window.api.getInvoiceDetails(inv.id);
                if (detail.success && detail.payments) {
                    detail.payments.forEach(p => {
                        if (p.status === 'confirmed' || p.status === 'paid' || p.method === 'cash') {
                            allPayments.push({
                                ...p,
                                invoice_id: inv.id
                            });
                        }
                    });
                }
            } catch (e) { }
        }

        if (allPayments.length === 0) {
            tbody.innerHTML = '';
            noData.style.display = 'block';
            return;
        }

        noData.style.display = 'none';
        tbody.innerHTML = allPayments.map(p => {
            return `
                <tr>
                    <td>${formatDate(p.created_at)}</td>
                    <td style="color: var(--success); font-weight: 600;">${formatCurrency(p.amount)}</td>
                    <td>${getPaymentLabel(p.method)}</td>
                    <td>${p.notes || '-'}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('خطأ في تحميل مدفوعات الزبون:', error);
        tbody.innerHTML = '';
        noData.style.display = 'block';
    }
}

// ========== إغلاق مودال التفاصيل ==========
function closeDetailsModal() {
    document.getElementById('customerDetailsModal').classList.remove('show');
}

// ========== فتح مودال سداد الدين ==========
function openPayDebtModal() {
    const customer = allCustomers.find(c => c.id === currentCustomerId);
    if (!customer) return;

    document.getElementById('payDebtCustomerName').textContent = customer.name;
    document.getElementById('payDebtCurrentAmount').textContent = formatCurrency(currentCustomerDebt);
    document.getElementById('payAmount').value = '';
    document.getElementById('payMethod').value = 'cash';
    document.getElementById('payNotes').value = '';

    document.getElementById('payDebtModal').classList.add('show');
    setTimeout(() => document.getElementById('payAmount').focus(), 200);
}

// ========== إغلاق مودال السداد ==========
function closePayDebtModal() {
    document.getElementById('payDebtModal').classList.remove('show');
}

// ========== تأكيد سداد الدين ==========
async function confirmPayDebt() {
    const amount = parseFloat(document.getElementById('payAmount').value);
    const method = document.getElementById('payMethod').value;
    const notes = document.getElementById('payNotes').value.trim();

    if (!amount || amount <= 0) {
        showToast('يرجى إدخال مبلغ صحيح', 'error');
        return;
    }

    if (amount > currentCustomerDebt) {
        showToast(`المبلغ أكبر من الدين الحالي (${formatCurrency(currentCustomerDebt)})`, 'error');
        return;
    }

    try {
        const result = await window.api.payDebt({
            customer_id: currentCustomerId,
            amount: amount,
            method: method,
            notes: notes || `سداد دين - ${method === 'cash' ? 'نقداً' : method === 'transfer' ? 'تحويل بنكي' : 'PalPay'}`
        });

        if (result.success) {
            showToast(`تم سداد ${formatCurrency(amount)} بنجاح ✅`, 'success');
            closePayDebtModal();

            // تحديث البيانات
            await loadCustomers();
            await loadStats();

            // تحديث التفاصيل إذا مفتوحة
            if (currentCustomerId) {
                await viewCustomerDetails(currentCustomerId);
            }
        } else {
            showToast(result.error || 'فشل عملية السداد', 'error');
        }
    } catch (error) {
        console.error('خطأ في سداد الدين:', error);
        showToast('خطأ في عملية السداد', 'error');
    }
}

// ========== دوال مساعدة ==========

function formatCurrency(amount) {
    return `${(parseFloat(amount) || 0).toFixed(2)} ₪`;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('ar-PS', {
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

function getPaymentLabel(method) {
    const labels = {
        'cash': '💵 نقداً',
        'transfer': '🏦 تحويل بنكي',
        'wallet': '📱 PalPay',
        'debt': '📋 دين',
        'card': '💳 بطاقة'
    };
    return labels[method] || method;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}


function bindCustomerEvents() {
    document.querySelectorAll('[data-view-customer]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            viewCustomerDetails(parseInt(this.getAttribute('data-view-customer')));
        });
    });
    document.querySelectorAll('[data-edit-customer]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            editCustomer(parseInt(this.getAttribute('data-edit-customer')));
        });
    });
    document.querySelectorAll('[data-delete-customer]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = parseInt(this.getAttribute('data-delete-customer'));
            var name = this.getAttribute('data-customer-name');
            deleteCustomer(id, name);
        });
    });
}
