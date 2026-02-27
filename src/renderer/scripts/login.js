// ============================================
// سوبر ماركت أبو كميل - شاشة تسجيل الدخول
// ============================================

// مسح أي session قديمة عند فتح صفحة الـ login
sessionStorage.clear();
localStorage.removeItem('currentUser');

const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('errorMessage');
const loginBtn = document.getElementById('loginBtn');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        showError('أدخل اسم المستخدم وكلمة المرور');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'جاري التحقق...';
    errorMessage.textContent = '';

    try {
        console.log('🔐 محاولة تسجيل دخول:', username);
        const result = await window.api.login({ username, password });

        console.log('📋 نتيجة:', JSON.stringify(result));

        if (result.success) {
            // حفظ بيانات الجلسة
            sessionStorage.setItem('currentUser', JSON.stringify(result.user));
            sessionStorage.setItem('sessionId', result.session_id);

            console.log('✅ تم تسجيل الدخول:', result.user.display_name);

            // الانتقال للصفحة الرئيسية
            window.location.href = 'index.html';
        } else {
            // عرض رسالة الخطأ - main.js يرجع error مش message
            showError(result.error || result.message || 'اسم المستخدم أو كلمة المرور غير صحيحة');
            loginBtn.disabled = false;
            loginBtn.textContent = 'تسجيل الدخول';
            passwordInput.value = '';
            passwordInput.focus();
        }
    } catch (error) {
        console.error('❌ خطأ:', error);
        showError('حدث خطأ في الاتصال');
        loginBtn.disabled = false;
        loginBtn.textContent = 'تسجيل الدخول';
    }
});

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.animation = 'none';
    errorMessage.offsetHeight;
    errorMessage.style.animation = 'shake 0.5s ease';
}

passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        loginForm.dispatchEvent(new Event('submit'));
    }
});

// محاولات متعددة لإعادة الـ focus
function tryFocus() {
    if (usernameInput && !usernameInput.value) {
        usernameInput.focus();
    }
}
setTimeout(tryFocus, 100);
setTimeout(tryFocus, 500);
setTimeout(tryFocus, 1000);

// إعادة focus عند النقر على الصفحة
document.addEventListener('mousedown', function() {
    setTimeout(tryFocus, 50);
});
