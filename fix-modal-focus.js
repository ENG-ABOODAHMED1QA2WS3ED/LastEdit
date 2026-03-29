/**
 * fix-modal-focus.js
 * إصلاح #11: مشكلة تعليق الإدخال بعد إغلاق مودال إضافة الزبون
 * 
 * المشكلة: بعد إغلاق مودال إضافة الزبون، حقول الإدخال لا تستجيب
 * السبب: 
 *   1. حدث "النقر يعيد الفوكس للباركود" يسرق التركيز من أي حقل آخر
 *   2. hideModal لا تعيد الفوكس بشكل صحيح
 *   3. confirm() dialogs تخرب الفوكس في Electron
 */

const fs = require('fs');
const path = require('path');

function applyFix() {
    console.log('═══════════════════════════════════════════');
    console.log(' إصلاح #11: مشكلة الإدخال بعد إغلاق المودال');
    console.log('═══════════════════════════════════════════\n');

    const invoicePath = path.join(__dirname, 'src', 'renderer', 'scripts', 'invoice.js');
    let src = fs.readFileSync(invoicePath, 'utf8');
    let changes = 0;

    // ═══════════════════════════════════════════
    // FIX 1: hideModal - إضافة تأخير قبل إعادة الفوكس
    // ═══════════════════════════════════════════
    console.log('[1/3] إصلاح hideModal...');

    const oldHideModal = `function hideModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}`;

    const newHideModal = `function hideModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
        // إعادة الفوكس للباركود بعد تأخير بسيط لتجنب تعليق الإدخال
        setTimeout(() => {
            focusBarcode();
        }, 100);
    }
}`;

    if (src.includes(oldHideModal)) {
        src = src.replace(oldHideModal, newHideModal);
        changes++;
        console.log('   ✅ تم إصلاح hideModal');
    } else {
        console.log('   ⚠️  hideModal مختلفة - محاولة بديلة...');
        if (src.includes('function hideModal(id)') && !src.includes('setTimeout(() => {\n            focusBarcode();')) {
            src = src.replace(
                /function hideModal\(id\)\s*\{[^}]+\}/,
                newHideModal
            );
            changes++;
            console.log('   ✅ تم إصلاح hideModal (regex)');
        }
    }

    // ═══════════════════════════════════════════
    // FIX 2: حدث النقر - إضافة استثناء عند وجود مودال مفتوح
    // ═══════════════════════════════════════════
    console.log('[2/3] إصلاح حدث إعادة الفوكس...');

    const oldClickHandler = `    // 19. النقر على الصفحة يعيد التركيز للباركود
    document.addEventListener('click', (e) => {
        if (!e.target.closest('input, select, textarea, button, .modal-overlay, .customer-dropdown')) {
            focusBarcode();
        }
    });`;

    const newClickHandler = `    // 19. النقر على الصفحة يعيد التركيز للباركود (مع حماية من تعليق الإدخال)
    document.addEventListener('click', (e) => {
        // لا تسرق الفوكس إذا كان هناك مودال مفتوح
        const anyModalOpen = document.querySelector('.modal-overlay[style*="flex"], .modal-overlay.show');
        if (anyModalOpen) return;
        if (!e.target.closest('input, select, textarea, button, .modal-overlay, .customer-dropdown, .customer-dropdown-item')) {
            // تأخير بسيط لتجنب سرقة الفوكس من عناصر تم النقر عليها للتو
            setTimeout(() => focusBarcode(), 50);
        }
    });`;

    if (src.includes(oldClickHandler)) {
        src = src.replace(oldClickHandler, newClickHandler);
        changes++;
        console.log('   ✅ تم إصلاح حدث النقر');
    } else {
        console.log('   ⚠️  حدث النقر مختلف - محاولة بديلة...');
        // Try to find and fix just the click handler for focus
        const marker = "// 19.";
        const idx = src.indexOf(marker);
        if (idx !== -1) {
            const blockEnd = src.indexOf('});', idx);
            if (blockEnd !== -1) {
                src = src.substring(0, idx) + newClickHandler + src.substring(blockEnd + 3);
                changes++;
                console.log('   ✅ تم إصلاح حدث النقر (بديل)');
            }
        }
    }

    // ═══════════════════════════════════════════
    // FIX 3: handleAddCustomer - إصلاح confirm() تخرب الفوكس
    // ═══════════════════════════════════════════
    console.log('[3/3] إصلاح الفوكس بعد confirm()...');

    // بعد كشف التكرار (confirm dialog)، الفوكس يضيع
    // نضيف إعادة فوكس بعد return من confirm
    if (src.includes('checkSimilarCustomers')) {
        // Find the duplicate check section and ensure focus is restored after cancel
        const cancelReturn = "                    return;\n                }\n            }\n        }\n    } catch (e) {\n        console.log('تخطي فحص التشابه:', e.message);\n    }";
        
        const fixedCancelReturn = "                    // إعادة الفوكس بعد إلغاء confirm\n                    setTimeout(() => { document.getElementById('newCustomerName')?.focus(); }, 100);\n                    return;\n                }\n            }\n        }\n    } catch (e) {\n        console.log('تخطي فحص التشابه:', e.message);\n    }";

        if (src.includes(cancelReturn)) {
            src = src.replace(cancelReturn, fixedCancelReturn);
            changes++;
            console.log('   ✅ تم إصلاح الفوكس بعد confirm');
        } else {
            console.log('   ⏭️  كشف التكرار غير موجود أو مختلف');
        }
    } else {
        console.log('   ⏭️  لا يوجد كشف تكرار (سيُصلح لاحقاً)');
    }

    // ═══════════════════════════════════════════
    // SAVE
    // ═══════════════════════════════════════════
    if (changes === 0) {
        console.log('\n❌ لم يتم تطبيق أي تغيير');
        process.exit(1);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.copyFileSync(invoicePath, invoicePath + '.bak-modal-' + timestamp);
    console.log('\n💾 نسخة احتياطية: ' + invoicePath + '.bak-modal-' + timestamp);

    fs.writeFileSync(invoicePath, src, 'utf8');
    console.log(`\n✅ تم تطبيق ${changes} إصلاح!`);
    console.log('\n═══════════════════════════════════════════');
    console.log(' التغييرات:');
    console.log('═══════════════════════════════════════════');
    console.log(' 1️⃣  hideModal يرجّع الفوكس للباركود بعد تأخير');
    console.log(' 2️⃣  لا يُسرق الفوكس إذا كان مودال مفتوح');
    console.log(' 3️⃣  إعادة الفوكس بعد confirm() dialog');
    console.log('\n🔄 شغّل التطبيق: npm start');
}

applyFix();
