/* ========================================
   products.js - أبو كميل POS v4.0
   سكريبت صفحة إدارة المنتجات والمخزون
======================================== */

// ========== المتغيرات العامة ==========
let allProducts = [];
let allCategories = [];
let currentFilter = 'all';
let currentSort = 'name_asc';
let currentCategoryFilter = 'all';
let currentView = 'table';
let currentStockProductId = null;
let currentStockOperation = 'add';

// ========== تهيئة الصفحة ==========
document.addEventListener('DOMContentLoaded', () => {
    loadCurrentUser();
    loadCategories();
    loadProducts();
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
    const searchInput = document.getElementById('searchProduct');
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filterAndRenderProducts(); bindProductEvents();
        }, 300);
    });

    // زر إضافة منتج
    document.getElementById('btnAddProduct').addEventListener('click', () => openAddModal());

    // زر إدارة التصنيفات
    document.getElementById('btnManageCategories').addEventListener('click', openCategoriesModal);

    // أزرار الفلاتر
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            filterAndRenderProducts(); bindProductEvents();
        });
    });

    // فلتر التصنيف
    document.getElementById('filterCategory').addEventListener('change', (e) => {
        currentCategoryFilter = e.target.value;
        filterAndRenderProducts(); bindProductEvents();
    });

    // الترتيب
    document.getElementById('sortProducts').addEventListener('change', (e) => {
        currentSort = e.target.value;
        filterAndRenderProducts(); bindProductEvents();
    });

    // تبديل العرض
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentView = e.target.dataset.view;
            toggleView();
        });
    });

    // مودال المنتج
    document.getElementById('btnCloseModal').addEventListener('click', closeProductModal);
    document.getElementById('btnCancelModal').addEventListener('click', closeProductModal);
    document.getElementById('productModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeProductModal();
    });

    // حفظ المنتج
    document.getElementById('btnSaveProduct').addEventListener('click', saveProduct);

    // توليد باركود
    document.getElementById('btnGenerateBarcode').addEventListener('click', generateBarcode);

    // حساب الربح تلقائي
    document.getElementById('productPrice').addEventListener('input', calculateProfit);
    document.getElementById('productCost').addEventListener('input', calculateProfit);

    // مودال التصنيفات
    document.getElementById('btnCloseCategoriesModal').addEventListener('click', closeCategoriesModal);
    document.getElementById('btnCloseCategoriesFooter').addEventListener('click', closeCategoriesModal);
    document.getElementById('categoriesModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeCategoriesModal();
    });
    document.getElementById('btnAddCategory').addEventListener('click', addCategory);
    document.getElementById('newCategoryName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addCategory();
    });

    // مودال المخزون
    document.getElementById('btnCloseStockModal').addEventListener('click', closeStockModal);
    document.getElementById('btnCancelStock').addEventListener('click', closeStockModal);
    document.getElementById('stockModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeStockModal();
    });
    document.getElementById('btnConfirmStock').addEventListener('click', confirmStockUpdate);

    // أزرار عملية المخزون
    document.querySelectorAll('.stock-op-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.stock-op-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentStockOperation = e.target.dataset.op;
        });
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
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            openAddModal();
        }
        if (e.key === 'Escape') {
            closeProductModal();
            closeCategoriesModal();
            closeStockModal();
        }
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            searchInput.focus();
        }
    });
}

// ========== تحميل التصنيفات ==========
async function loadCategories() {
    try {
        const result = await window.api.getCategories();
        if (result.success) {
            allCategories = result.categories || result.data || [];
            populateCategoryDropdowns();
        }
    } catch (error) {
        console.error('خطأ في تحميل التصنيفات:', error);
    }
}

// ========== ملء قوائم التصنيفات ==========
function populateCategoryDropdowns() {
    // فلتر التصنيف
    const filterSelect = document.getElementById('filterCategory');
    filterSelect.innerHTML = '<option value="all">كل التصنيفات</option>';
    allCategories.forEach(cat => {
        filterSelect.innerHTML += `<option value="${cat.id}">${cat.icon || '📁'} ${cat.name}</option>`;
    });

    // قائمة التصنيف في المودال
    const productCategory = document.getElementById('productCategory');
    productCategory.innerHTML = '<option value="">-- اختر التصنيف --</option>';
    allCategories.forEach(cat => {
        productCategory.innerHTML += `<option value="${cat.id}">${cat.icon || '📁'} ${cat.name}</option>`;
    });
}

// ========== تحميل المنتجات ==========
async function loadProducts() {
    try {
        const result = await window.api.getProducts();
        if (result.success) {
            allProducts = result.products || result.data || [];
            filterAndRenderProducts(); bindProductEvents();
            updateStats();
        } else {
            console.error('فشل تحميل المنتجات:', result.error);
            showToast('فشل تحميل المنتجات', 'error');
        }
    } catch (error) {
        console.error('خطأ في تحميل المنتجات:', error);
        showToast('خطأ في الاتصال بقاعدة البيانات', 'error');
    }
}

// ========== تحديث الإحصائيات ==========
function updateStats() {
    const total = allProducts.length;
    const active = allProducts.filter(p => p.is_active !== 0).length;
    const lowStock = allProducts.filter(p => {
        const min = p.min_stock || 5;
        return p.is_active !== 0 && p.stock_qty > 0 && p.stock_qty <= min;
    }).length;
    const outOfStock = allProducts.filter(p => p.is_active !== 0 && p.stock_qty <= 0).length;
    const totalValue = allProducts.reduce((sum, p) => {
        return sum + ((p.cost_price || p.price || 0) * (p.stock_qty || 0));
    }, 0);

    document.getElementById('statTotalProducts').textContent = total;
    document.getElementById('statActiveProducts').textContent = active;
    document.getElementById('statLowStock').textContent = lowStock;
    document.getElementById('statOutOfStock').textContent = outOfStock;
    document.getElementById('statTotalValue').textContent = formatCurrency(totalValue);
}

// ========== فلترة وعرض المنتجات ==========
function filterAndRenderProducts() {
    let filtered = [...allProducts];
    const searchTerm = document.getElementById('searchProduct').value.trim().toLowerCase();

    // فلترة بالبحث
    if (searchTerm) {
        filtered = filtered.filter(p =>
            (p.name && p.name.toLowerCase().includes(searchTerm)) ||
            (p.barcode && p.barcode.toLowerCase().includes(searchTerm))
        );
    }

    // فلترة بالتصنيف
    if (currentCategoryFilter !== 'all') {
        filtered = filtered.filter(p => p.category_id == currentCategoryFilter);
    }

    // فلترة بالحالة
    switch (currentFilter) {
        case 'active':
            filtered = filtered.filter(p => p.is_active !== 0);
            break;
        case 'low_stock':
            filtered = filtered.filter(p => {
                const min = p.min_stock || 5;
                return p.stock_qty > 0 && p.stock_qty <= min;
            });
            break;
        case 'out_of_stock':
            filtered = filtered.filter(p => p.stock_qty <= 0);
            break;
        case 'inactive':
            filtered = filtered.filter(p => p.is_active === 0);
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
        case 'price_high':
            filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
            break;
        case 'price_low':
            filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
            break;
        case 'stock_low':
            filtered.sort((a, b) => (a.stock_qty || 0) - (b.stock_qty || 0));
            break;
        case 'stock_high':
            filtered.sort((a, b) => (b.stock_qty || 0) - (a.stock_qty || 0));
            break;
        case 'recent':
            filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            break;
    }

    // عرض
    if (currentView === 'table') {
        renderProductsTable(filtered);
    } else {
        renderProductsCards(filtered);
    }

    // حالة فارغة
    document.getElementById('noProducts').style.display = filtered.length === 0 ? 'block' : 'none';
}

// ========== عرض جدول المنتجات ==========
function renderProductsTable(products) {
    const tbody = document.getElementById('productsTableBody');

    if (products.length === 0) {
        tbody.innerHTML = '';
        return;
    }

    tbody.innerHTML = products.map((product, index) => {
        const category = allCategories.find(c => c.id === product.category_id);
        const categoryName = category ? category.name : '-';
        const categoryIcon = category ? (category.icon || '📁') : '📁';
        const profit = (product.price || 0) - (product.cost_price || 0);
        const profitPercent = product.cost_price > 0 ? ((profit / product.cost_price) * 100).toFixed(0) : 0;
        const profitClass = profit > 0 ? 'profit-positive' : profit < 0 ? 'profit-negative' : 'profit-zero';
        const stockStatus = getStockStatus(product);
        const saleTypeLabel = product.sale_type === 'weight' ? 'بالوزن' : product.sale_type === 'pack' ? 'بالعلبة' : 'بالحبة';
        const saleTypeBadge = product.sale_type === 'weight' ? 'badge-weight' : product.sale_type === 'pack' ? 'badge-pack' : 'badge-unit';
        const rowClass = product.is_active === 0 ? 'inactive' : stockStatus.class === 'critical' ? 'out-of-stock' : stockStatus.class === 'low' ? 'low-stock' : '';

        return `
            <tr class="${rowClass}" data-id="${product.id}">
                <td>${index + 1}</td>
                <td><code style="font-size:0.8rem; color:var(--gray);">${product.barcode || '-'}</code></td>
                <td>
                    <div class="product-name-cell">
                        <div class="product-icon">${categoryIcon}</div>
                        <div class="product-name-text">
                            <span class="name">${escapeHtml(product.name)}</span>
                        </div>
                    </div>
                </td>
                <td><span class="category-badge">${categoryIcon} ${escapeHtml(categoryName)}</span></td>
                <td><span class="badge ${saleTypeBadge}">${saleTypeLabel}</span></td>
                <td>${product.unit || 'حبة'}</td>
                <td style="font-weight:600;">${formatCurrency(product.price)}</td>
                <td style="color:var(--gray);">${product.cost_price ? formatCurrency(product.cost_price) : '-'}</td>
                <td>
                    <span class="${profitClass}">
                        ${profit > 0 ? '+' : ''}${formatCurrency(profit)}
                        ${product.cost_price > 0 ? `<small>(${profitPercent}%)</small>` : ''}
                    </span>
                </td>
                <td>
                    <div class="stock-indicator">
                        <span class="stock-qty ${stockStatus.class}">${product.stock_qty || 0}</span>
                        <div class="stock-bar">
                            <div class="stock-bar-fill ${stockStatus.class}" style="width: ${stockStatus.percent}%"></div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge ${product.is_active !== 0 ? 'badge-active' : 'badge-inactive'}">
                        ${product.is_active !== 0 ? 'نشط' : 'غير نشط'}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-icon-edit" title="تعديل" data-edit-product="${product.id}">✏️</button>
                        <button class="btn-icon btn-icon-stock" title="تعديل المخزون" data-stock-product="${product.id}">📦</button>
                        <button class="btn-icon btn-icon-delete" title="حذف" data-delete-product="${product.id}" data-product-name="${escapeHtml(product.name)}">🗑</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ========== عرض بطاقات المنتجات ==========
function renderProductsCards(products) {
    const grid = document.getElementById('productsGrid');

    if (products.length === 0) {
        grid.innerHTML = '';
        return;
    }

    grid.innerHTML = products.map(product => {
        const category = allCategories.find(c => c.id === product.category_id);
        const categoryName = category ? category.name : '-';
        const categoryIcon = category ? (category.icon || '📁') : '📁';
        const profit = (product.price || 0) - (product.cost_price || 0);
        const stockStatus = getStockStatus(product);
        const cardClass = product.is_active === 0 ? 'inactive' : stockStatus.class === 'critical' ? 'out-of-stock' : stockStatus.class === 'low' ? 'low-stock' : '';

        return `
            <div class="product-card ${cardClass}" data-id="${product.id}">
                <div class="card-header">
                    <div class="card-icon">${categoryIcon}</div>
                    <div class="card-title">
                        <span class="name">${escapeHtml(product.name)}</span>
                        <span class="barcode">${product.barcode || '-'}</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="card-info-row">
                        <span class="card-info-label">التصنيف</span>
                        <span class="card-info-value">${categoryIcon} ${escapeHtml(categoryName)}</span>
                    </div>
                    <div class="card-info-row">
                        <span class="card-info-label">سعر البيع</span>
                        <span class="card-info-value" style="color:var(--primary);">${formatCurrency(product.price)}</span>
                    </div>
                    <div class="card-info-row">
                        <span class="card-info-label">سعر التكلفة</span>
                        <span class="card-info-value">${product.cost_price ? formatCurrency(product.cost_price) : '-'}</span>
                    </div>
                    <div class="card-info-row">
                        <span class="card-info-label">الربح</span>
                        <span class="card-info-value" style="color: ${profit > 0 ? 'var(--success-dark)' : profit < 0 ? 'var(--danger-dark)' : 'var(--gray)'};">
                            ${profit > 0 ? '+' : ''}${formatCurrency(profit)}
                        </span>
                    </div>
                    <div class="card-info-row">
                        <span class="card-info-label">المخزون</span>
                        <span class="card-info-value stock-qty ${stockStatus.class}">${product.stock_qty || 0} ${product.unit || 'حبة'}</span>
                    </div>
                    <div class="card-stock-bar">
                        <div class="stock-bar">
                            <div class="stock-bar-fill ${stockStatus.class}" style="width: ${stockStatus.percent}%"></div>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <button class="btn-icon btn-icon-edit" title="تعديل" data-edit-product="${product.id}">✏️</button>
                    <button class="btn-icon btn-icon-stock" title="تعديل المخزون" data-stock-product="${product.id}">📦</button>
                    <button class="btn-icon btn-icon-delete" title="حذف" data-delete-product="${product.id}" data-product-name="${escapeHtml(product.name)}">🗑</button>
                </div>
            </div>
        `;
    }).join('');
}

// ========== تبديل العرض ==========
function toggleView() {
    if (currentView === 'table') {
        document.getElementById('tableView').style.display = 'block';
        document.getElementById('cardsView').style.display = 'none';
    } else {
        document.getElementById('tableView').style.display = 'none';
        document.getElementById('cardsView').style.display = 'block';
    }
    filterAndRenderProducts(); bindProductEvents();
}

// ========== حالة المخزون ==========
function getStockStatus(product) {
    const qty = product.stock_qty || 0;
    const min = product.min_stock || 5;
    const max = Math.max(min * 5, 50);
    const percent = Math.min((qty / max) * 100, 100);

    if (qty <= 0) return { class: 'critical', percent: 0, label: 'نفد' };
    if (qty <= min) return { class: 'low', percent: Math.max(percent, 10), label: 'منخفض' };
    return { class: 'good', percent: percent, label: 'متوفر' };
}

// ========== فتح مودال الإضافة ==========
function openAddModal() {
    document.getElementById('modalTitle').textContent = 'إضافة منتج جديد';
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('productActive').checked = true;
    document.getElementById('productStock').value = '0';
    document.getElementById('productMinStock').value = '5';
    document.getElementById('productUnit').value = 'حبة';
    resetProfitDisplay();
    document.getElementById('productModal').classList.add('show');
    setTimeout(() => document.getElementById('productBarcode').focus(), 200);
}

// ========== فتح مودال التعديل ==========
function openEditModal(product) {
    document.getElementById('modalTitle').textContent = 'تعديل المنتج';
    document.getElementById('productId').value = product.id;
    document.getElementById('productBarcode').value = product.barcode || '';
    document.getElementById('productName').value = product.name || '';
    document.getElementById('productCategory').value = product.category_id || '';
    document.getElementById('productSaleType').value = product.sale_type || 'unit';
    document.getElementById('productUnit').value = product.unit || 'حبة';
    document.getElementById('productPrice').value = product.price || '';
    document.getElementById('productCost').value = product.cost_price || '';
    document.getElementById('productStock').value = product.stock_qty || 0;
    document.getElementById('productMinStock').value = product.min_stock || 5;
    document.getElementById('productActive').checked = product.is_active !== 0;
    calculateProfit();
    document.getElementById('productModal').classList.add('show');
}

// ========== تعديل منتج ==========
function editProduct(id) {
    const product = allProducts.find(p => p.id === id);
    if (product) openEditModal(product);
}

// ========== إغلاق مودال المنتج ==========
function closeProductModal() {
    document.getElementById('productModal').classList.remove('show');
}

// ========== حفظ المنتج ==========
async function saveProduct() {
    const id = document.getElementById('productId').value;
    const barcode = document.getElementById('productBarcode').value.trim();
    const name = document.getElementById('productName').value.trim();
    const categoryId = document.getElementById('productCategory').value;
    const saleType = document.getElementById('productSaleType').value;
    const unit = document.getElementById('productUnit').value.trim();
    const price = parseFloat(document.getElementById('productPrice').value) || 0;
    const costPrice = parseFloat(document.getElementById('productCost').value) || 0;
    const stockQty = parseInt(document.getElementById('productStock').value) || 0;
    const minStock = parseInt(document.getElementById('productMinStock').value) || 5;
    const isActive = document.getElementById('productActive').checked ? 1 : 0;

    // التحقق
    if (!barcode) {
        showToast('يرجى إدخال الباركود', 'error');
        document.getElementById('productBarcode').focus();
        return;
    }
    if (!name) {
        showToast('يرجى إدخال اسم المنتج', 'error');
        document.getElementById('productName').focus();
        return;
    }
    if (!categoryId) {
        showToast('يرجى اختيار التصنيف', 'error');
        document.getElementById('productCategory').focus();
        return;
    }
    if (price <= 0) {
        showToast('يرجى إدخال سعر البيع', 'error');
        document.getElementById('productPrice').focus();
        return;
    }

    const productData = {
        barcode,
        name,
        category_id: parseInt(categoryId),
        sale_type: saleType,
        unit: unit || 'حبة',
        price,
        cost_price: costPrice,
        stock_qty: stockQty,
        min_stock: minStock,
        is_active: isActive
    };

    try {
        let result;
        if (id) {
            result = await window.api.updateProduct(parseInt(id), productData);
        } else {
            result = await window.api.addProduct(productData);
        }

        if (result.success) {
            showToast(id ? 'تم تعديل المنتج بنجاح ✅' : 'تم إضافة المنتج بنجاح ✅', 'success');
            closeProductModal();
            await loadProducts();
        } else {
            showToast(result.error || 'حدث خطأ أثناء الحفظ', 'error');
        }
    } catch (error) {
        console.error('خطأ في حفظ المنتج:', error);
        showToast('خطأ في الاتصال بقاعدة البيانات', 'error');
    }
}

// ========== حذف منتج ==========
async function deleteProduct(id, name) {
    const confirmed = confirm(`هل أنت متأكد من حذف المنتج "${name}"?\n\nملاحظة: لن يتم الحذف إذا كان المنتج مرتبط بفواتير.`);
    if (!confirmed) return;

    try {
        const result = await window.api.deleteProduct(id);
        if (result.success) {
            showToast(`تم حذف المنتج "${name}" ✅`, 'success');
            await loadProducts();
        } else {
            showToast(result.error || 'فشل حذف المنتج', 'error');
        }
    } catch (error) {
        console.error('خطأ في حذف المنتج:', error);
        showToast('خطأ في حذف المنتج', 'error');
    }
}

// ========== توليد باركود ==========
function generateBarcode() {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const barcode = `AK${timestamp}${random}`;
    document.getElementById('productBarcode').value = barcode;
    showToast('تم توليد باركود تلقائي', 'info');
}

// ========== حساب الربح ==========
function calculateProfit() {
    const price = parseFloat(document.getElementById('productPrice').value) || 0;
    const cost = parseFloat(document.getElementById('productCost').value) || 0;
    const profit = price - cost;
    const percent = cost > 0 ? ((profit / cost) * 100).toFixed(1) : 0;

    const display = document.getElementById('profitDisplay');
    const amountEl = display.querySelector('.profit-amount');
    const percentEl = display.querySelector('.profit-percent');

    amountEl.textContent = `${profit > 0 ? '+' : ''}${profit.toFixed(2)} ₪`;
    percentEl.textContent = cost > 0 ? `(${percent}%)` : '';

    display.classList.remove('positive', 'negative');
    if (profit > 0) display.classList.add('positive');
    else if (profit < 0) display.classList.add('negative');
}

function resetProfitDisplay() {
    const display = document.getElementById('profitDisplay');
    display.classList.remove('positive', 'negative');
    display.querySelector('.profit-amount').textContent = '0.00 ₪';
    display.querySelector('.profit-percent').textContent = '(0%)';
}

// ========== مودال التصنيفات ==========
function openCategoriesModal() {
    renderCategoriesList(); bindProductEvents();
    document.getElementById('categoriesModal').classList.add('show');
    setTimeout(() => document.getElementById('newCategoryName').focus(), 200);
}

function closeCategoriesModal() {
    document.getElementById('categoriesModal').classList.remove('show');
}

function renderCategoriesList() {
    const list = document.getElementById('categoriesList');

    if (allCategories.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:var(--gray); padding:20px;">لا توجد تصنيفات</p>';
        return;
    }

    list.innerHTML = allCategories.map(cat => {
        const productCount = allProducts.filter(p => p.category_id === cat.id).length;
        return `
            <div class="category-item" data-id="${cat.id}">
                <span class="category-item-icon">${cat.icon || '📁'}</span>
                <span class="category-item-name">${escapeHtml(cat.name)}</span>
                <span class="category-item-count">${productCount} منتج</span>
                <div class="category-item-actions"><button class="btn-icon btn-icon-edit" data-edit-category="${cat.id}" title="تعديل">&#9998;</button> <button class="btn-icon btn-icon-delete" data-delete-category="${cat.id}" data-category-name="${escapeHtml(cat.name)}" title="حذف" style="color:#e74c3c;">X</button></div>

            </div>

        `;
    }).join('');
}

async function addCategory() {
    const name = document.getElementById('newCategoryName').value.trim();
    const icon = document.getElementById('newCategoryIcon').value.trim() || '📁';

    if (!name) {
        showToast('يرجى إدخال اسم التصنيف', 'error');
        return;
    }

    try {
        const result = await window.api.addCategory({ name, icon, sort_order: allCategories.length + 1 });
        if (result.success) {
            showToast('تم إضافة التصنيف ✅', 'success');
            document.getElementById('newCategoryName').value = '';
            document.getElementById('newCategoryIcon').value = '';
            await loadCategories();
            renderCategoriesList(); bindProductEvents();
        } else {
            showToast(result.error || 'فشل إضافة التصنيف', 'error');
        }
    } catch (error) {
        console.error('خطأ في إضافة التصنيف:', error);
        showToast('خطأ في إضافة التصنيف', 'error');
    }
}

async function editCategory(catId) {
    const cat = allCategories.find(c => c.id === catId);
    if (!cat) { showToast('التصنيف غير موجود', 'error'); return; }

    // إنشاء مودال تعديل التصنيف
    const existingModal = document.getElementById('editCategoryModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'editCategoryModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:12px;padding:24px;width:380px;max-width:90%;direction:rtl;font-family:Tajawal,sans-serif;">
            <h3 style="margin:0 0 16px;color:#1a1a2e;">تعديل التصنيف</h3>
            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;font-weight:600;">اسم التصنيف:</label>
                <input id="editCatName" type="text" value="${cat.name}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;" />
            </div>
            <div style="margin-bottom:16px;">
                <label style="display:block;margin-bottom:4px;font-weight:600;">الأيقونة:</label>
                <input id="editCatIcon" type="text" value="${cat.icon || ''}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;" />
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-start;">
                <button id="editCatSave" style="padding:10px 24px;background:#27ae60;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;">حفظ</button>
                <button id="editCatCancel" style="padding:10px 24px;background:#e74c3c;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;">إلغاء</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // انتظار نتيجة المستخدم
    return new Promise((resolve) => {
        document.getElementById('editCatCancel').addEventListener('click', () => {
            modal.remove();
            resolve();
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) { modal.remove(); resolve(); }
        });
        document.getElementById('editCatSave').addEventListener('click', async () => {
            const newName = document.getElementById('editCatName').value.trim();
            const newIcon = document.getElementById('editCatIcon').value.trim();
            if (!newName) { showToast('اسم التصنيف مطلوب', 'error'); return; }
            try {
                const result = await window.api.updateCategory(catId, { name: newName, icon: newIcon || '' });
                if (result && result.success) {
                    showToast('تم تعديل التصنيف بنجاح', 'success');
                    await loadCategories();
                    renderCategoriesList(); bindProductEvents();
                    filterAndRenderProducts(); bindProductEvents();
                } else {
                    showToast(result?.error || 'فشل تعديل التصنيف', 'error');
                }
            } catch (err) {
                console.error('editCategory error:', err);
                showToast('حدث خطأ أثناء تعديل التصنيف', 'error');
            }
            modal.remove();
            resolve();
        });
        // تركيز على حقل الاسم
        setTimeout(() => document.getElementById('editCatName')?.focus(), 100);
    });
}

// ========== مودال المخزون ==========
function openStockModal(id) {
    const product = allProducts.find(p => p.id === id);
    if (!product) return;

    currentStockProductId = id;
    currentStockOperation = 'add';

    document.getElementById('stockProductName').textContent = product.name;
    document.getElementById('stockCurrentQty').textContent = `${product.stock_qty || 0} ${product.unit || 'حبة'}`;
    document.getElementById('stockQty').value = '';
    document.getElementById('stockReason').value = '';

    // إعادة تعيين أزرار العملية
    document.querySelectorAll('.stock-op-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.stock-op-btn[data-op="add"]').classList.add('active');

    document.getElementById('stockModal').classList.add('show');
    setTimeout(() => document.getElementById('stockQty').focus(), 200);
}

function closeStockModal() {
    document.getElementById('stockModal').classList.remove('show');
}

async function confirmStockUpdate() {
    const qty = parseInt(document.getElementById('stockQty').value);
    const reason = document.getElementById('stockReason').value.trim();

    if (!qty || qty < 0) {
        showToast('يرجى إدخال كمية صحيحة', 'error');
        return;
    }

    const product = allProducts.find(p => p.id === currentStockProductId);
    if (!product) return;

    let newQty;
    switch (currentStockOperation) {
        case 'add':
            newQty = (product.stock_qty || 0) + qty;
            break;
        case 'subtract':
            newQty = Math.max((product.stock_qty || 0) - qty, 0);
            break;
        case 'set':
            newQty = qty;
            break;
        default:
            newQty = (product.stock_qty || 0) + qty;
    }

    try {
        const result = await window.api.updateProduct(currentStockProductId, {
            ...product,
            stock_qty: newQty
        });

        if (result.success) {
            const opLabel = currentStockOperation === 'add' ? 'إضافة' :
                currentStockOperation === 'subtract' ? 'سحب' : 'تعيين';
            showToast(`تم ${opLabel} المخزون — الكمية الجديدة: ${newQty} ✅`, 'success');
            closeStockModal();
            await loadProducts();

            // تنبيه المخزون المنخفض
            if (newQty <= (product.min_stock || 5) && newQty > 0) {
                showToast(`⚠️ تنبيه: مخزون "${product.name}" منخفض (${newQty})`, 'warning');
            } else if (newQty <= 0) {
                showToast(`🚫 تنبيه: "${product.name}" نفد من المخزون!`, 'error');
            }
        } else {
            showToast(result.error || 'فشل تعديل المخزون', 'error');
        }
    } catch (error) {
        console.error('خطأ في تعديل المخزون:', error);
        showToast('خطأ في تعديل المخزون', 'error');
    }
}

// ========== دوال مساعدة ==========

function formatCurrency(amount) {
    return `${(parseFloat(amount) || 0).toFixed(2)} ₪`;
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



async function deleteCategory(catId, catName) {
    const productCount = allProducts.filter(p => p.category_id === catId).length;
    let msg = 'هل تريد حذف التصنيف "' + catName + '"؟';
    if (productCount > 0) {
        msg += '\n يوجد ' + productCount + ' منتج في هذا التصنيف. سيتم إزالة التصنيف من هذه المنتجات.';
    }
    if (!confirm(msg)) return;

    try {
        const result = await window.api.deleteCategory(catId);
        if (result && result.success) {
            showToast('تم حذف التصنيف بنجاح ', 'success');
            await loadCategories();
            renderCategoriesList(); bindProductEvents();
            filterAndRenderProducts(); bindProductEvents();
        } else {
            showToast(result?.error || 'فشل حذف التصنيف', 'error');
        }
    } catch (err) {
        console.error('deleteCategory error:', err);
        showToast('حدث خطأ أثناء حذف التصنيف', 'error');
    }
}

function bindProductEvents() {
    document.querySelectorAll('[data-edit-product]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            editProduct(parseInt(this.getAttribute('data-edit-product')));
        });
    });
    document.querySelectorAll('[data-stock-product]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            openStockModal(parseInt(this.getAttribute('data-stock-product')));
        });
    });
    document.querySelectorAll('[data-delete-product]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = parseInt(this.getAttribute('data-delete-product'));
            var name = this.getAttribute('data-product-name');
            deleteProduct(id, name);
        });
    });
    document.querySelectorAll('[data-edit-category]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            editCategory(parseInt(this.getAttribute('data-edit-category')));
        });
    });
    document.querySelectorAll('[data-delete-category]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = parseInt(this.getAttribute('data-delete-category'));
            var name = this.getAttribute('data-category-name');
            deleteCategory(id, name);
        });
    });
}



// CSP-compliant: empty state add product button
document.addEventListener("DOMContentLoaded", () => {
    const btnEmpty = document.getElementById("btnAddProductEmpty");
    if (btnEmpty) {
        btnEmpty.addEventListener("click", () => {
            const btnAdd = document.getElementById("btnAddProduct");
            if (btnAdd) btnAdd.click();
        });
    }
});