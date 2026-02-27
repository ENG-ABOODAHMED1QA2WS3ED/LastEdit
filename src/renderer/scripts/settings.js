// ============================================
// settings.js - أبو كميل POS v5.0
// صفحة الإعدادات
// ============================================

// ===== متغيرات عامة =====
let currentUser = null;
let allUsers = [];
let editingUserId = null;
let auditPage = 1;
const auditPerPage = 50;
let allAuditLogs = [];

// ===== تهيئة الصفحة =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('⚙️ تحميل صفحة الإعدادات v5.0...');

    loadCurrentUser();
    bindEvents();

    // تحميل البيانات الأولية
    await loadStoreSettings();
    await loadReceiptSettings();
    await loadUsers();
    await loadDbInfo();

    console.log('✅ صفحة الإعدادات جاهزة');
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

        // فحص الصلاحيات - فقط المدير يدخل الإعدادات
        if (currentUser.role !== 'admin') {
            showToast('ليس لديك صلاحية الوصول للإعدادات', 'error');
            setTimeout(() => window.location.href = 'index.html', 1500);
            return;
        }
    } catch (e) {
        console.error('خطأ تحميل المستخدم:', e);
        window.location.href = 'login.html';
    }
}

// ===== ربط الأحداث =====
function bindEvents() {
    // === التبويبات ===
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);

            // تحميل بيانات السجل عند النقر على تبويب التدقيق
            if (tabName === 'audit') {
                loadAuditLog();
            }
        });
    });

    // === نموذج المتجر ===
    const storeForm = document.getElementById('storeForm');
    if (storeForm) {
        storeForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveStoreSettings();
        });
    }

    // === نموذج الإيصال ===
    const receiptForm = document.getElementById('receiptForm');
    if (receiptForm) {
        receiptForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveReceiptSettings();
        });
    }

    // === معاينة الإيصال (تحديث مباشر) ===
    const receiptHeader = document.getElementById('receiptHeader');
    const receiptFooter = document.getElementById('receiptFooter');
    if (receiptHeader) {
        receiptHeader.addEventListener('input', () => {
            const preview = document.getElementById('receiptHeaderPreview');
            if (preview) preview.textContent = receiptHeader.value || 'رأس الإيصال';
        });
    }
    if (receiptFooter) {
        receiptFooter.addEventListener('input', () => {
            const preview = document.getElementById('receiptFooterPreview');
            if (preview) preview.textContent = receiptFooter.value || 'تذييل الإيصال';
        });
    }

    // === نموذج PIN ===
    const pinForm = document.getElementById('pinForm');
    if (pinForm) {
        pinForm.addEventListener('submit', (e) => {
            e.preventDefault();
            changePin();
        });
    }

    // === نموذج كلمة المرور ===
    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            changePassword();
        });
    }

    // === إدارة المستخدمين ===
    const btnAddUser = document.getElementById('btnAddUser');
    if (btnAddUser) {
        btnAddUser.addEventListener('click', () => openUserModal());
    }

    const btnSaveUser = document.getElementById('btnSaveUser');
    if (btnSaveUser) {
        btnSaveUser.addEventListener('click', () => saveUser());
    }

    // === النسخ الاحتياطي ===
    const btnCreateBackup = document.getElementById('btnCreateBackup');
    if (btnCreateBackup) {
        btnCreateBackup.addEventListener('click', () => createBackup());
    }

    const btnRestoreBackup = document.getElementById('btnRestoreBackup');
    if (btnRestoreBackup) {
        btnRestoreBackup.addEventListener('click', () => {
            const fileInput = document.getElementById('restoreFileInput');
            if (fileInput) fileInput.click();
        });
    }

    const restoreFileInput = document.getElementById('restoreFileInput');
    if (restoreFileInput) {
        restoreFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                restoreBackup(e.target.files[0]);
            }
        });
    }

    // === سجل التدقيق ===
    const btnRefreshAudit = document.getElementById('btnRefreshAudit');
    if (btnRefreshAudit) {
        btnRefreshAudit.addEventListener('click', () => loadAuditLog());
    }

    const auditSearch = document.getElementById('auditSearch');
    if (auditSearch) {
        let debounce;
        auditSearch.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => filterAndRenderAudit(), 300);
        });
    }

    const auditFilter = document.getElementById('auditFilter');
    if (auditFilter) {
        auditFilter.addEventListener('change', () => filterAndRenderAudit());
    }

    const btnAuditPrev = document.getElementById('btnAuditPrev');
    const btnAuditNext = document.getElementById('btnAuditNext');
    if (btnAuditPrev) btnAuditPrev.addEventListener('click', () => { auditPage--; filterAndRenderAudit(); });
    if (btnAuditNext) btnAuditNext.addEventListener('click', () => { auditPage++; filterAndRenderAudit(); });

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
    if (btnLogout) btnLogout.addEventListener('click', handleLogout);

    // === اختصارات ===
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllModals();
    });
}

// ===== تبديل التبويبات =====
function switchTab(tabName) {
    document.querySelectorAll('.settings-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });
    document.querySelectorAll('.settings-panel').forEach(p => {
        p.classList.toggle('active', p.id === `panel-${tabName}`);
    });
}

// ========================================
// 1. إعدادات المتجر
// ========================================

async function loadStoreSettings() {
    try {
        const result = await window.api.getStoreSettings();
        if (result && result.success && result.settings) {
            const s = result.settings;
            setInputValue('storeName', s.store_name);
            setInputValue('storePhone', s.phone);
            setInputValue('storeAddress', s.address);
            setInputValue('storeTaxNumber', s.tax_number);
            setInputValue('storeCurrency', s.currency);
            setInputValue('defaultDebtCeiling', s.default_debt_ceiling || 500);
            console.log('🏪 تم تحميل إعدادات المتجر');
        }
    } catch (e) {
        console.error('خطأ تحميل إعدادات المتجر:', e);
    }
}

async function saveStoreSettings() {
    const data = {
        store_name: getInputValue('storeName'),
        phone: getInputValue('storePhone'),
        address: getInputValue('storeAddress'),
        tax_number: getInputValue('storeTaxNumber'),
        currency: getInputValue('storeCurrency'),
        default_debt_ceiling: getInputValue('defaultDebtCeiling')
    };

    if (!data.store_name) {
        showToast('اسم المتجر مطلوب', 'error');
        return;
    }

    try {
        const result = await window.api.updateStoreSettings(data);
        if (result && result.success) {
            showToast('✅ تم حفظ إعدادات المتجر', 'success');
        } else {
            showToast(result?.error || 'فشل حفظ الإعدادات', 'error');
        }
    } catch (e) {
        console.error('خطأ حفظ الإعدادات:', e);
        showToast('حدث خطأ أثناء الحفظ', 'error');
    }
}

// ========================================
// 2. إعدادات الإيصال
// ========================================

async function loadReceiptSettings() {
    try {
        const result = await window.api.getStoreSettings();
        if (result && result.success && result.settings) {
            const s = result.settings;
            setInputValue('receiptHeader', s.receipt_header);
            setInputValue('receiptFooter', s.receipt_footer);

            // تحديث المعاينة
            const headerPreview = document.getElementById('receiptHeaderPreview');
            const footerPreview = document.getElementById('receiptFooterPreview');
            if (headerPreview) headerPreview.textContent = s.receipt_header || 'رأس الإيصال';
            if (footerPreview) footerPreview.textContent = s.receipt_footer || 'تذييل الإيصال';

            console.log('🧾 تم تحميل إعدادات الإيصال');
        }
    } catch (e) {
        console.error('خطأ تحميل إعدادات الإيصال:', e);
    }
}

async function saveReceiptSettings() {
    const data = {
        receipt_header: getInputValue('receiptHeader'),
        receipt_footer: getInputValue('receiptFooter')
    };

    try {
        const result = await window.api.updateStoreSettings(data);
        if (result && result.success) {
            showToast('✅ تم حفظ إعدادات الإيصال', 'success');
        } else {
            showToast(result?.error || 'فشل حفظ الإعدادات', 'error');
        }
    } catch (e) {
        console.error('خطأ حفظ إعدادات الإيصال:', e);
        showToast('حدث خطأ أثناء الحفظ', 'error');
    }
}

// ========================================
// 3. الأمان - تغيير PIN
// ========================================

async function changePin() {
    const currentPin = getInputValue('currentPin');
    const newPin = getInputValue('newPin');
    const confirmPin = getInputValue('confirmPin');

    if (!currentPin) {
        showToast('أدخل رقم PIN الحالي', 'error');
        return;
    }

    if (!newPin || newPin.length < 4) {
        showToast('رقم PIN الجديد يجب أن يكون 4 أرقام على الأقل', 'error');
        return;
    }

    if (newPin !== confirmPin) {
        showToast('رقم PIN الجديد غير متطابق', 'error');
        return;
    }

    try {
        // التحقق من PIN الحالي
        const verifyResult = await window.api.verifyOwnerPin(currentPin);
        if (!verifyResult || !verifyResult.success || !verifyResult.valid) {
            showToast('رقم PIN الحالي غير صحيح', 'error');
            return;
        }

        // تحديث PIN
        const result = await window.api.updateStoreSettings({ owner_pin: newPin });
        if (result && result.success) {
            showToast('✅ تم تغيير رقم PIN بنجاح', 'success');
            document.getElementById('pinForm').reset();
        } else {
            showToast(result?.error || 'فشل تغيير PIN', 'error');
        }
    } catch (e) {
        console.error('خطأ تغيير PIN:', e);
        showToast('حدث خطأ أثناء تغيير PIN', 'error');
    }
}

// ========================================
// 4. الأمان - تغيير كلمة المرور
// ========================================

async function changePassword() {
    const currentPassword = getInputValue('currentPassword');
    const newPassword = getInputValue('newPassword');
    const confirmPassword = getInputValue('confirmPassword');

    if (!currentPassword) {
        showToast('أدخل كلمة المرور الحالية', 'error');
        return;
    }

    if (!newPassword || newPassword.length < 4) {
        showToast('كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('كلمة المرور الجديدة غير متطابقة', 'error');
        return;
    }

    try {
        // التحقق من كلمة المرور الحالية
        const loginResult = await window.api.login({
            username: currentUser.username,
            password: currentPassword
        });

        if (!loginResult || !loginResult.success) {
            showToast('كلمة المرور الحالية غير صحيحة', 'error');
            return;
        }

        // تحديث كلمة المرور
        const result = await window.api.updateUser({
            id: currentUser.id,
            password: newPassword
        });

        if (result && result.success) {
            showToast('✅ تم تغيير كلمة المرور بنجاح', 'success');
            document.getElementById('passwordForm').reset();
        } else {
            showToast(result?.error || 'فشل تغيير كلمة المرور', 'error');
        }
    } catch (e) {
        console.error('خطأ تغيير كلمة المرور:', e);
        showToast('حدث خطأ أثناء تغيير كلمة المرور', 'error');
    }
}

// ========================================
// 5. إدارة المستخدمين
// ========================================

async function loadUsers() {
    try {
        const result = await window.api.getUsers();
        if (result && result.success) {
            allUsers = result.users || [];
            renderUsersTable(); bindUserTableEvents();
            console.log(`👥 تم تحميل ${allUsers.length} مستخدم`);
        }
    } catch (e) {
        console.error('خطأ تحميل المستخدمين:', e);
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (allUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;padding:30px;color:var(--gray);">
                    لا يوجد مستخدمين
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = allUsers.map((user, i) => {
        const roleLabel = user.role === 'admin' ? 'مدير' : 'كاشير';
        const roleBadge = user.role === 'admin'
            ? '<span class="badge badge-primary">مدير</span>'
            : '<span class="badge badge-info">كاشير</span>';

        const statusBadge = user.is_active
            ? '<span class="badge badge-success">مفعّل</span>'
            : '<span class="badge badge-danger">معطّل</span>';

        const toggleIcon = user.is_active ? '🔴' : '🟢';
        const toggleTitle = user.is_active ? 'تعطيل' : 'تفعيل';

        const date = user.created_at ? formatDate(user.created_at) : '-';

        return `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${escapeHtml(user.username)}</strong></td>
                <td>${escapeHtml(user.display_name || '-')}</td>
                <td>${roleBadge}</td>
                <td>${statusBadge}</td>
                <td>${date}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-edit" data-edit-user="${user.id}" title="تعديل">✏️</button>
                        <button class="btn-icon btn-toggle" data-toggle-user="${user.id}" data-new-status="${user.is_active ? 0 : 1}" title="${toggleTitle}">${toggleIcon}</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function bindUserTableEvents() {
    document.querySelectorAll('[data-edit-user]').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = parseInt(btn.getAttribute('data-edit-user'));
            openUserModal(userId);
        });
    });
    document.querySelectorAll('[data-toggle-user]').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = parseInt(btn.getAttribute('data-toggle-user'));
            const newStatus = parseInt(btn.getAttribute('data-new-status'));
            toggleUser(userId, newStatus);
        });
    });
}

function openUserModal(userId = null) {
    editingUserId = userId;
    const modal = document.getElementById('userModal');
    const title = document.getElementById('userModalTitle');
    const passwordHint = document.getElementById('passwordHint');
    const passwordRequired = document.getElementById('passwordRequired');

    if (userId) {
        // تعديل
        const user = allUsers.find(u => u.id === userId);
        if (!user) return;

        if (title) title.textContent = '✏️ تعديل المستخدم';
        setInputValue('userUsername', user.username);
        setInputValue('userDisplayName', user.display_name);
        setInputValue('userPassword', '');
        setInputValue('userRole', user.role);
        setInputValue('userPin', '');

        if (passwordHint) passwordHint.style.display = 'block';
        if (passwordRequired) passwordRequired.style.display = 'none';

        // منع تعديل اسم المستخدم
        const usernameInput = document.getElementById('userUsername');
        if (usernameInput) usernameInput.disabled = true;
    } else {
        // إضافة
        if (title) title.textContent = '➕ إضافة مستخدم جديد';
        document.getElementById('userForm')?.reset();

        if (passwordHint) passwordHint.style.display = 'none';
        if (passwordRequired) passwordRequired.style.display = 'inline';

        const usernameInput = document.getElementById('userUsername');
        if (usernameInput) usernameInput.disabled = false;
    }

    if (modal) modal.classList.add('active');
}

function editUser(userId) {
    openUserModal(userId);
}

async function saveUser() {
    const username = getInputValue('userUsername');
    const displayName = getInputValue('userDisplayName');
    const password = getInputValue('userPassword');
    const role = getInputValue('userRole');
    const pin = getInputValue('userPin');

    if (!username) {
        showToast('اسم المستخدم مطلوب', 'error');
        return;
    }
    if (!displayName) {
        showToast('الاسم الظاهر مطلوب', 'error');
        return;
    }

    try {
        if (editingUserId) {
            // تعديل
            const updateData = {
                id: editingUserId,
                display_name: displayName,
                role: role
            };
            if (password) updateData.password = password;
            if (pin) updateData.pin_code = pin;

            const result = await window.api.updateUser(updateData);
            if (result && result.success) {
                showToast('✅ تم تعديل المستخدم', 'success');
                closeAllModals();
                await loadUsers();
            } else {
                showToast(result?.error || 'فشل التعديل', 'error');
            }
        } else {
            // إضافة
            if (!password) {
                showToast('كلمة المرور مطلوبة للمستخدم الجديد', 'error');
                return;
            }

            const result = await window.api.addUser({
                username: username,
                password: password,
                display_name: displayName,
                role: role,
                pin_code: pin || null
            });

            if (result && result.success) {
                showToast('✅ تم إضافة المستخدم', 'success');
                closeAllModals();
                await loadUsers();
            } else {
                showToast(result?.error || 'فشل الإضافة', 'error');
            }
        }
    } catch (e) {
        console.error('خطأ حفظ المستخدم:', e);
        showToast('حدث خطأ أثناء الحفظ', 'error');
    }
}

async function toggleUser(userId, newStatus) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    // منع تعطيل المستخدم الحالي
    if (userId === currentUser.id && newStatus === 0) {
        showToast('لا يمكنك تعطيل حسابك الخاص', 'error');
        return;
    }

    const action = newStatus ? 'تفعيل' : 'تعطيل';
    if (!confirm(`هل تريد ${action} المستخدم "${user.display_name || user.username}"؟`)) return;

    try {
        const result = await window.api.toggleUserStatus(userId);
        if (result && result.success) {
            showToast(`✅ تم ${action} المستخدم`, 'success');
            await loadUsers();
        } else {
            showToast(result?.error || `فشل ${action} المستخدم`, 'error');
        }
    } catch (e) {
        console.error('خطأ تبديل حالة المستخدم:', e);
        showToast('حدث خطأ', 'error');
    }
}

// ========================================
// 6. النسخ الاحتياطي
// ========================================

async function createBackup() {
    try {
        showToast('⏳ جاري إنشاء النسخة الاحتياطية...', 'info');

        const result = await window.api.backupDatabase();
        if (result && result.success) {
            showToast(`✅ تم إنشاء النسخة الاحتياطية: ${result.path || 'تم بنجاح'}`, 'success');

            const backupInfo = document.getElementById('lastBackupInfo');
            if (backupInfo) {
                const now = new Date().toLocaleString('ar-PS');
                backupInfo.innerHTML = `<span>✅ آخر نسخة: ${now}</span>`;
            }
        } else {
            showToast(result?.error || 'فشل إنشاء النسخة الاحتياطية', 'error');
        }
    } catch (e) {
        console.error('خطأ النسخ الاحتياطي:', e);
        showToast('حدث خطأ أثناء النسخ الاحتياطي', 'error');
    }
}

async function restoreBackup(file) {
    if (!confirm('⚠️ تحذير!\n\nاستعادة النسخة الاحتياطية ستستبدل جميع البيانات الحالية.\n\nهل أنت متأكد؟')) {
        return;
    }

    if (!confirm('⚠️ تأكيد أخير: هل تريد فعلاً استبدال كل البيانات؟')) {
        return;
    }

    try {
        showToast('⏳ جاري استعادة النسخة الاحتياطية...', 'info');

        // قراءة الملف
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const result = await window.api.restoreDatabase({ path: file.path || file.name });
                if (result && result.success) {
                    showToast('✅ تم استعادة النسخة الاحتياطية - سيتم إعادة التشغيل', 'success');
                    setTimeout(() => window.location.reload(), 2000);
                } else {
                    showToast(result?.error || 'فشل الاستعادة', 'error');
                }
            } catch (err) {
                console.error('خطأ الاستعادة:', err);
                showToast('حدث خطأ أثناء الاستعادة', 'error');
            }
        };
        reader.readAsArrayBuffer(file);

    } catch (e) {
        console.error('خطأ استعادة النسخة:', e);
        showToast('حدث خطأ', 'error');
    }
}

async function loadDbInfo() {
    try {
        const appInfo = await window.api.getAppInfo();
        if (appInfo && appInfo.success) {
            setText('dbPath', appInfo.dbPath || '-');
            setText('dbVersion', appInfo.version || 'v5.0');
        }

        // عدد المنتجات
        try {
            const products = await window.api.getProducts();
            if (products && products.success) {
                setText('dbProducts', (products.products || []).length);
            }
        } catch (e) { setText('dbProducts', '-'); }

        // عدد الزبائن
        try {
            const customers = await window.api.getCustomers();
            if (customers && customers.success) {
                setText('dbCustomers', (customers.customers || []).length);
            }
        } catch (e) { setText('dbCustomers', '-'); }

        // عدد الفواتير
        try {
            const invoices = await window.api.getRecentInvoices(99999);
            if (invoices && invoices.success) {
                setText('dbInvoices', (invoices.invoices || []).length);
            }
        } catch (e) { setText('dbInvoices', '-'); }

    } catch (e) {
        console.error('خطأ تحميل معلومات القاعدة:', e);
    }
}

// ========================================
// 7. سجل التدقيق
// ========================================

async function loadAuditLog() {
    try {
        const result = await window.api.getAuditLog();
        if (result && result.success) {
            allAuditLogs = result.logs || [];
            console.log(`📋 سجل التدقيق: ${allAuditLogs.length} سجل`);
            auditPage = 1;
            filterAndRenderAudit();
        } else {
            allAuditLogs = [];
            filterAndRenderAudit();
        }
    } catch (e) {
        console.error('خطأ تحميل سجل التدقيق:', e);
        allAuditLogs = [];
        filterAndRenderAudit();
    }
}

function filterAndRenderAudit() {
    let filtered = [...allAuditLogs];

    // البحث
    const searchInput = document.getElementById('auditSearch');
    if (searchInput && searchInput.value.trim()) {
        const term = searchInput.value.trim().toLowerCase();
        filtered = filtered.filter(log =>
            (log.action || '').toLowerCase().includes(term) ||
            (log.details || '').toLowerCase().includes(term) ||
            (log.username || '').toLowerCase().includes(term) ||
            (log.table_name || '').toLowerCase().includes(term)
        );
    }

    // الفلتر
    const filterSelect = document.getElementById('auditFilter');
    if (filterSelect && filterSelect.value !== 'all') {
        const filterVal = filterSelect.value;
        filtered = filtered.filter(log => {
            const action = (log.action || '').toLowerCase();
            const table = (log.table_name || '').toLowerCase();
            switch (filterVal) {
                case 'login': return action.includes('login') || action.includes('logout');
                case 'invoice': return table.includes('invoice') || action.includes('invoice');
                case 'payment': return table.includes('payment') || action.includes('payment') || action.includes('debt');
                case 'customer': return table.includes('customer');
                case 'product': return table.includes('product');
                case 'transfer': return action.includes('transfer') || action.includes('confirm') || action.includes('reject');
                case 'settings': return table.includes('setting') || action.includes('setting');
                default: return true;
            }
        });
    }

    // ترتيب من الأحدث
    filtered.sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
    });

    // تقسيم الصفحات
    const totalPages = Math.ceil(filtered.length / auditPerPage) || 1;
    if (auditPage > totalPages) auditPage = totalPages;
    if (auditPage < 1) auditPage = 1;

    const start = (auditPage - 1) * auditPerPage;
    const pageItems = filtered.slice(start, start + auditPerPage);

    renderAuditTable(pageItems, start);

    // تحديث التنقل
    setText('auditPageInfo', `صفحة ${auditPage} من ${totalPages} (${filtered.length} سجل)`);
    const btnPrev = document.getElementById('btnAuditPrev');
    const btnNext = document.getElementById('btnAuditNext');
    if (btnPrev) btnPrev.disabled = auditPage <= 1;
    if (btnNext) btnNext.disabled = auditPage >= totalPages;
}

function renderAuditTable(logs, startIndex) {
    const tbody = document.getElementById('auditTableBody');
    const noAudit = document.getElementById('noAudit');
    if (!tbody) return;

    if (logs.length === 0) {
        tbody.innerHTML = '';
        if (noAudit) noAudit.style.display = 'flex';
        return;
    }
    if (noAudit) noAudit.style.display = 'none';

    tbody.innerHTML = logs.map((log, i) => {
        const action = escapeHtml(log.action || '-');
        const details = escapeHtml(truncate(log.details || '-', 80));
        const table = escapeHtml(log.table_name || '-');
        const user = escapeHtml(log.username || log.user_id || '-');
        const date = formatDate(log.created_at);

        // أيقونة حسب نوع العملية
        let actionIcon = '📝';
        const actionLower = (log.action || '').toLowerCase();
        if (actionLower.includes('login')) actionIcon = '🔑';
        else if (actionLower.includes('logout')) actionIcon = '🚪';
        else if (actionLower.includes('invoice') || actionLower.includes('sale')) actionIcon = '🧾';
        else if (actionLower.includes('payment') || actionLower.includes('debt')) actionIcon = '💰';
        else if (actionLower.includes('customer')) actionIcon = '👤';
        else if (actionLower.includes('product')) actionIcon = '📦';
        else if (actionLower.includes('transfer') || actionLower.includes('confirm')) actionIcon = '🔄';
        else if (actionLower.includes('reject')) actionIcon = '❌';
        else if (actionLower.includes('setting')) actionIcon = '⚙️';
        else if (actionLower.includes('backup')) actionIcon = '💾';

        return `
            <tr>
                <td>${startIndex + i + 1}</td>
                <td>${user}</td>
                <td>${actionIcon} ${action}</td>
                <td title="${escapeHtml(log.details || '')}">${details}</td>
                <td><span class="badge badge-info">${table}</span></td>
                <td>${date}</td>
            </tr>
        `;
    }).join('');
}

// ========================================
// دوال مساعدة
// ========================================

function formatCurrency(amount) {
    return (parseFloat(amount) || 0).toFixed(2) + ' ₪';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        return new Date(dateStr).toLocaleDateString('ar-PS', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) { return dateStr; }
}

function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

function getInputValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
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
    editingUserId = null;

    // إعادة تفعيل حقل اسم المستخدم
    const usernameInput = document.getElementById('userUsername');
    if (usernameInput) usernameInput.disabled = false;
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

console.log('📄 settings.js v5.0 loaded');
