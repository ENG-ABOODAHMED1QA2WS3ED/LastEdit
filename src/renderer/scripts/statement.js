'use strict';

let allCustomers = [];
let currentStatement = null;

document.addEventListener('DOMContentLoaded', async () => {
  // تحميل الزبائن
  try {
    const result = await window.api.getCustomers();
    allCustomers = result.customers || result || [];
  } catch(e) { console.error('Failed to load customers:', e); }

  // تعيين التواريخ الافتراضية (هذا الشهر)
  setThisMonth();

  // ربط الأحداث
  document.getElementById('customerSearch').addEventListener('input', onSearchInput);
  document.getElementById('customerSearch').addEventListener('focus', onSearchInput);
  document.getElementById('btnGenerate').addEventListener('click', generateStatement);
  document.getElementById('btnPrint').addEventListener('click', () => window.print());
  document.getElementById('btnQuickMonth').addEventListener('click', setThisMonth);
  document.getElementById('btnQuickAll').addEventListener('click', setAllTime);
  document.getElementById('btnWhatsApp').addEventListener('click', shareWhatsApp);

  // إغلاق dropdown عند النقر خارجه
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.control-group')) {
      document.getElementById('customerDropdown').classList.remove('show');
    }
  });

  // لو جاي من صفحة ثانية مع customer_id بالـ URL
  const params = new URLSearchParams(window.location.search);
  if (params.get('customer_id')) {
    const cId = parseInt(params.get('customer_id'));
    const cust = allCustomers.find(c => c.id === cId);
    if (cust) {
      selectCustomer(cust);
      generateStatement();
    }
  }
});

function setThisMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('fromDate').value = `${y}-${m}-01`;
  document.getElementById('toDate').value = `${y}-${m}-${String(new Date(y, now.getMonth()+1, 0).getDate()).padStart(2,'0')}`;
}

function setAllTime() {
  document.getElementById('fromDate').value = '2020-01-01';
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  document.getElementById('toDate').value = `${y}-${m}-${d}`;
}

function onSearchInput(e) {
  const query = e.target.value.trim().toLowerCase();
  const dropdown = document.getElementById('customerDropdown');

  if (query.length < 1) {
    // نعرض كل الزبائن
    showDropdown(allCustomers.slice(0, 15));
    return;
  }

  const normalizeAr = (s) => (s||'').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  const qNorm = normalizeAr(query);

  const filtered = allCustomers.filter(c => {
    const name = normalizeAr(c.name || '').toLowerCase();
    const phone = (c.phone || '');
    return name.includes(qNorm) || (c.name||'').toLowerCase().includes(query) || phone.includes(query);
  }).slice(0, 15);

  showDropdown(filtered);
}

function showDropdown(customers) {
  const dropdown = document.getElementById('customerDropdown');
  if (customers.length === 0) {
    dropdown.classList.remove('show');
    return;
  }

  dropdown.innerHTML = customers.map(c => 
    `<div class="dropdown-item" data-id="${c.id}">
      ${c.name} ${c.phone ? '<span class="phone">' + c.phone + '</span>' : ''}
    </div>`
  ).join('');

  dropdown.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      const cust = allCustomers.find(c => c.id === parseInt(item.dataset.id));
      if (cust) selectCustomer(cust);
    });
  });

  dropdown.classList.add('show');
}

function selectCustomer(cust) {
  document.getElementById('customerSearch').value = cust.name + (cust.phone ? ' - ' + cust.phone : '');
  document.getElementById('customerId').value = cust.id;
  document.getElementById('customerDropdown').classList.remove('show');
}

async function generateStatement() {
  const customerId = document.getElementById('customerId').value;
  const fromDate = document.getElementById('fromDate').value;
  const toDate = document.getElementById('toDate').value;

  if (!customerId) { alert('اختر زبون أولا'); return; }
  if (!fromDate || !toDate) { alert('حدد الفترة الزمنية'); return; }
  if (fromDate > toDate) { alert('تاريخ البداية يجب أن يكون قبل النهاية'); return; }

  try {
    document.getElementById('btnGenerate').textContent = 'جار التحميل...';
    document.getElementById('btnGenerate').disabled = true;

    const result = await window.api.getCustomerStatement(
      parseInt(customerId), fromDate, toDate
    );

    if (!result.success) {
      alert('خطأ: ' + result.error);
      return;
    }

    currentStatement = result;
    displayStatement(result);

  } catch(err) {
    alert('خطأ في الاتصال: ' + err.message);
  } finally {
    document.getElementById('btnGenerate').textContent = 'عرض الكشف';
    document.getElementById('btnGenerate').disabled = false;
  }
}

function displayStatement(data) {
  // إظهار المحتوى
  document.getElementById('statementContent').style.display = 'block';
  document.getElementById('actionBar').style.display = 'flex';
  document.getElementById('emptyMsg').style.display = 'none';

  // معلومات الزبون
  document.getElementById('stCustName').textContent = data.customer.name + 
    (data.customer.alt_name ? ' (' + data.customer.alt_name + ')' : '');
  document.getElementById('stCustPhone').textContent = data.customer.phone || 'غير محدد';
  document.getElementById('stPeriod').textContent = data.period.formattedFrom + ' - ' + data.period.formattedTo;
  document.getElementById('stPrintDate').textContent = data.formattedGeneratedAt;

  // جدول الحركات
  const tbody = document.getElementById('txnBody');
  tbody.innerHTML = '';

  let totalDebit = 0, totalCredit = 0;

  for (const txn of data.transactions) {
    const tr = document.createElement('tr');
    tr.className = 'type-' + txn.type;

    const balClass = txn.balanceClass === 'debit' ? 'balance-debit' : 
                     txn.balanceClass === 'credit' ? 'balance-credit' : 'balance-zero';

    tr.innerHTML = `
      <td class="col-date">${txn.formattedDate}</td>
      <td class="col-desc">${txn.description}</td>
      <td class="col-amount">${txn.formattedDebit}</td>
      <td class="col-amount">${txn.formattedCredit}</td>
      <td class="col-balance ${balClass}">${txn.formattedBalance}</td>
    `;

    tbody.appendChild(tr);
    totalDebit += txn.debit || 0;
    totalCredit += txn.credit || 0;
  }

  // أسطر الإجمالي
  const finalBal = data.summary.finalBalance;
  const finalClass = finalBal > 0.01 ? 'balance-debit' : finalBal < -0.01 ? 'balance-credit' : 'balance-zero';
  document.getElementById('tfootDebit').textContent = totalDebit > 0 ? totalDebit.toFixed(2) : '-';
  document.getElementById('tfootCredit').textContent = totalCredit > 0 ? totalCredit.toFixed(2) : '-';
  document.getElementById('tfootBalance').innerHTML = `<span class="${finalClass}">${finalBal.toFixed(2)}</span>`;

  // الملخص
  const sm = data.summary;
  document.getElementById('smOpening').textContent = sm.openingBalance.toFixed(2) + ' \u20AA';
  document.getElementById('smPurchases').textContent = sm.totalPurchases.toFixed(2) + ' \u20AA';
  document.getElementById('smPayments').textContent = sm.totalPayments.toFixed(2) + ' \u20AA';
  document.getElementById('smDebts').textContent = sm.totalDebts.toFixed(2) + ' \u20AA';

  const finalEl = document.getElementById('smFinal');
  finalEl.textContent = sm.finalBalance.toFixed(2) + ' \u20AA';
  finalEl.className = 'summary-value ' + (sm.finalBalance > 0.01 ? 'balance-debit' : 
    sm.finalBalance < -0.01 ? 'balance-credit' : 'balance-zero');

  const statusEl = document.getElementById('smStatus');
  statusEl.textContent = sm.balanceStatus;
  statusEl.className = 'summary-value ' + (sm.balanceStatus === '\u0639\u0644\u064a\u0647' ? 'balance-debit' : 
    sm.balanceStatus === '\u0645\u0633\u062f\u062f' ? 'balance-zero' : 'balance-credit');

  document.getElementById('smInvCount').textContent = sm.invoiceCount;
  document.getElementById('smPayCount').textContent = sm.paymentCount;
  document.getElementById('smDebtCount').textContent = sm.debtCount;

  // تفصيل المدفوعات
  const mbDiv = document.getElementById('smMethodBreakdown');
  const methods = sm.paymentsByMethod || {};
  const parts = Object.entries(methods).map(([k, v]) => k + ': ' + v.toFixed(2) + ' \u20AA');
  mbDiv.textContent = parts.length > 0 ? '\u062A\u0641\u0635\u064A\u0644: ' + parts.join(' | ') : '';

  // لو ما في حركات
  if (data.transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:#999;">\u0644\u0627 \u062A\u0648\u062C\u062F \u062D\u0631\u0643\u0627\u062A \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0641\u062A\u0631\u0629</td></tr>';
  }
}

function shareWhatsApp() {
  if (!currentStatement) { alert('\u0623\u0646\u0634\u0626 \u0627\u0644\u0643\u0634\u0641 \u0623\u0648\u0644\u0627\u064B'); return; }
  
  const data = currentStatement;
  const phone = (data.customer.phone || '').replace(/\D/g, '');
  
  if (!phone) { alert('\u0631\u0642\u0645 \u062C\u0648\u0627\u0644 \u0627\u0644\u0632\u0628\u0648\u0646 \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631'); return; }

  const sm = data.summary;
  let msg = '\u0645\u0631\u062D\u0628\u0627\u064B ' + data.customer.name + ',\n\n';
  msg += '\u0643\u0634\u0641 \u062D\u0633\u0627\u0628 \u0644\u0644\u0641\u062A\u0631\u0629: ' + data.period.formattedFrom + ' - ' + data.period.formattedTo + '\n';
  msg += '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0634\u062A\u0631\u064A\u0627\u062A: ' + sm.totalPurchases.toFixed(2) + ' \u20AA\n';
  msg += '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0627\u062A: ' + sm.totalPayments.toFixed(2) + ' \u20AA\n';
  msg += '\u0627\u0644\u0631\u0635\u064A\u062F \u0627\u0644\u0646\u0647\u0627\u0626\u064A: ' + sm.finalBalance.toFixed(2) + ' \u20AA (' + sm.balanceStatus + ')\n\n';
  msg += '\u0633\u0648\u0628\u0631 \u0645\u0627\u0631\u0643\u062A \u0623\u0628\u0648 \u0643\u0627\u0645\u0644';

  const fullPhone = phone.startsWith('972') ? phone : '972' + phone.replace(/^0/, '');
  window.open('https://wa.me/' + fullPhone + '?text=' + encodeURIComponent(msg), '_blank');
}
