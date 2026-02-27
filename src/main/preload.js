/* ========================================
   preload.js - أبو كميل POS v6.0
   الجسر بين العملية الرئيسية وواجهة المستخدم
   محدث: نظام المطابقة الذكية
======================================== */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

    // ==================== معلومات التطبيق ====================
    appRelaunch: () => ipcRenderer.invoke('app-relaunch'),
    readExcelFile: (filePath) => ipcRenderer.invoke('read-excel-file', filePath),
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),

    // ==================== إعدادات المتجر ====================
    getStoreSettings: () => ipcRenderer.invoke('get-store-settings'),
    updateStoreSettings: (data) => ipcRenderer.invoke('update-store-settings', data),

    // ==================== المنتجات ====================
    getProducts: () => ipcRenderer.invoke('get-products'),
    searchProducts: (query) => ipcRenderer.invoke('search-products', query),
    getProductByBarcode: (barcode) => ipcRenderer.invoke('get-product-by-barcode', barcode),
    addProduct: (data) => ipcRenderer.invoke('add-product', data),
    updateProduct: (id, data) => ipcRenderer.invoke('update-product', id, data),
    deleteProduct: (id) => ipcRenderer.invoke('delete-product', id),

    // ==================== التصنيفات ====================
    getCategories: () => ipcRenderer.invoke('get-categories'),
    addCategory: (data) => ipcRenderer.invoke('add-category', data),
    updateCategory: (id, data) => ipcRenderer.invoke('update-category', id, data),
    deleteCategory: (id) => ipcRenderer.invoke('delete-category', id),

    // ==================== الزبائن ====================
    getCustomers: () => ipcRenderer.invoke('get-customers'),
    searchCustomers: (query) => ipcRenderer.invoke('search-customers', query),
    addCustomer: (data) => ipcRenderer.invoke('add-customer', data),
    updateCustomer: (id, data) => ipcRenderer.invoke('update-customer', id, data),
    deleteCustomer: (id) => ipcRenderer.invoke('delete-customer', id),

    // ==================== ديون الزبائن ====================
    getCustomerDebts: (customerId) => ipcRenderer.invoke('get-customer-debts', customerId),
    payDebt: (data) => ipcRenderer.invoke('pay-debt', data),
    getOutstandingDebts: () => ipcRenderer.invoke('get-outstanding-debts'),

    // ==================== تسجيل الدخول ====================
    login: (credentials) => ipcRenderer.invoke('login', credentials),
    logout: (sessionId) => ipcRenderer.invoke('logout', sessionId),
    verifyOwnerPin: (pin) => ipcRenderer.invoke('verify-owner-pin', pin),

    // ==================== إحصائيات اليوم ====================
    getTodayStats: () => ipcRenderer.invoke('get-today-stats'),

    // ==================== الفواتير ====================
    saveInvoice: (data) => ipcRenderer.invoke('save-invoice', data),
    getRecentInvoices: (limit) => ipcRenderer.invoke('get-recent-invoices', limit),
    getInvoiceDetails: (id) => ipcRenderer.invoke('get-invoice-details', id),
    searchInvoices: (filters) => ipcRenderer.invoke('search-invoices', filters),

    // ==================== التحويلات ====================
    getPendingTransfers: () => ipcRenderer.invoke('get-pending-transfers'),
    confirmTransfer: (data) => ipcRenderer.invoke('confirm-transfer', data),
    rejectTransfer: (data) => ipcRenderer.invoke('reject-transfer', data),

    // ==================== الإشعارات ====================
    getNotifications: (filters) => ipcRenderer.invoke('get-notifications', filters),
    getUnreadNotificationsCount: () => ipcRenderer.invoke('get-unread-notifications-count'),
    markNotificationRead: (id) => ipcRenderer.invoke('mark-notification-read', id),
    markAllNotificationsRead: () => ipcRenderer.invoke('mark-all-notifications-read'),

    // ==================== التقارير ====================
    getDailyReport: (date) => ipcRenderer.invoke('get-daily-report', date),
    getWeeklyReport: () => ipcRenderer.invoke('get-weekly-report'),
    getMonthlyReport: (month) => ipcRenderer.invoke('get-monthly-report', month),
    getProductSalesReport: (filters) => ipcRenderer.invoke('get-product-sales-report', filters),
    getCustomerReport: (filters) => ipcRenderer.invoke('get-customer-report', filters),

    // ==================== الإقفال اليومي ====================
    saveDailyClosing: (data) => ipcRenderer.invoke('save-daily-closing', data),
    getLastClosing: () => ipcRenderer.invoke('get-last-closing'),

    // ==================== المستخدمين ====================
    getUsers: () => ipcRenderer.invoke('get-users'),
    addUser: (data) => ipcRenderer.invoke('add-user', data),
    updateUser: (id, data) => ipcRenderer.invoke('update-user', id, data),
    toggleUserStatus: (id) => ipcRenderer.invoke('toggle-user-status', id),
    toggleUser: (data) => ipcRenderer.invoke('toggle-user-status', data),

    // ==================== سجل التدقيق ====================
    getAuditLog: (limit) => ipcRenderer.invoke('get-audit-log', limit),
    addAuditLog: (data) => ipcRenderer.invoke('add-audit-log', data),

    // ==================== النسخ الاحتياطي ====================
    backupDatabase: () => ipcRenderer.invoke('backup-database'),
    restoreDatabase: () => ipcRenderer.invoke('restore-database'),

    // ==================== المطابقة الذكية ====================
    importBankStatement: (rows, headers, fileName) => ipcRenderer.invoke('import-bank-statement', {rows, headers, fileName}),
    runMatching: (batchId) => ipcRenderer.invoke('run-matching', {batchId}),
    acceptMatch: (bankId, paymentIds) => ipcRenderer.invoke('accept-match', {bankTransactionId: bankId, paymentIds: paymentIds}),
    rejectMatch: (bankId, paymentIds) => ipcRenderer.invoke('reject-match', {bankTransactionId: bankId, paymentIds: paymentIds}),
    undoMatch: (bankId) => ipcRenderer.invoke('undo-match', {bankTransactionId: bankId}),
        manualMatch: (bankId, paymentIds) => ipcRenderer.invoke('manual-match', {bankTransactionId: bankId, paymentIds: paymentIds}),
    addCustomerAlias: (data) => ipcRenderer.invoke('add-customer-alias', data),
    getCustomerAliases: (data) => ipcRenderer.invoke('get-customer-aliases', data),
    getMatchingStats: () => ipcRenderer.invoke('get-matching-stats'),
    getPendingMatches: () => ipcRenderer.invoke('get-pending-matches'),
    ignoreBankTransaction: (data) => ipcRenderer.invoke('ignore-bank-transaction', data),
    deleteBankTransactions: (ids) => ipcRenderer.invoke('delete-bank-transactions', ids),
    fullTestCleanup: () => ipcRenderer.invoke('full-test-cleanup'),
        resetAllBankTransactions: () => ipcRenderer.invoke('reset-all-bank-transactions'),
        clearOldBankData: () => ipcRenderer.invoke('clear-old-bank-data'),
        resetIgnoredTransactions: () => ipcRenderer.invoke('reset-ignored-transactions'),
    getDebtsForMatching: () => ipcRenderer.invoke('get-debts-for-matching'),
    getUnmatchedBankTransactions: () => ipcRenderer.invoke('get-unmatched-bank-transactions'),
        resetPaymentStatus: (paymentId, status) => ipcRenderer.invoke('reset-payment-status', paymentId, status),
    debugBankStatuses: () => ipcRenderer.invoke('debug-bank-statuses'),
            getFeedbackStats: () => ipcRenderer.invoke('get-feedback-stats'),
      getAuditTrail: (bankTxId) => ipcRenderer.invoke('get-audit-trail', {bankTransactionId: bankTxId}),
      reverseMatch: (auditId, reason) => ipcRenderer.invoke('reverse-match', {auditId, reason}),
      getAliasesForCustomer: (customerId) => ipcRenderer.invoke('get-aliases-for-customer', {customerId}),
      addAlias: (customerId, aliasName, aliasType) => ipcRenderer.invoke('add-alias', {customerId, aliasName, aliasType}),
      deleteAlias: (aliasId) => ipcRenderer.invoke('delete-alias', {aliasId}),
      findCustomerByAlias: (name) => ipcRenderer.invoke('find-customer-by-alias', {name}),

    getOverdueTransfers: () => ipcRenderer.invoke('get-overdue-transfers'),
    convertTransferToDebt: (paymentId) => ipcRenderer.invoke('convert-transfer-to-debt', paymentId),
    // ==================== أحداث من Main Process ====================
      getLearningData: () => ipcRenderer.invoke('get-learning-data'),
      checkBankReference: (ref) => ipcRenderer.invoke('check-bank-reference', ref),
    onOverdueTransfers: (callback) => {
        ipcRenderer.on('overdue-transfers', (event, data) => callback(data));
    }
});

console.log(' Preload script loaded (v6.0 - المطابقة الذكية)');











