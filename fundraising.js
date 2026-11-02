"use strict";
// Preview only: no network requests, storage, email, or payment execution.
const form = document.getElementById('fundraisingForm');
const custom = document.getElementById('custom-donation');
const buttons = [...document.querySelectorAll('[data-amount]')];
const status = document.getElementById('form-status');
let amount = 0;
function updateAmount(value) {
 amount = Number.isSafeInteger(value) && value > 0 ? value : 0;
 for (const id of ['summary-donation-price', 'total-amount']) document.getElementById(id).textContent = amount.toLocaleString('ja-JP');
 document.getElementById('modal-amount').textContent = '¥' + amount.toLocaleString('ja-JP');
 status.textContent = '';
}
buttons.forEach(button => button.addEventListener('click', () => {
 buttons.forEach(b => {b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button));});
 custom.value = ''; updateAmount(Number(button.dataset.amount));
}));
buttons.forEach(b => b.setAttribute('aria-pressed', 'false'));
custom.addEventListener('input', () => {buttons.forEach(b => {b.classList.remove('selected');b.setAttribute('aria-pressed','false');});updateAmount(Number(custom.value));});
form.addEventListener('submit', event => {
 event.preventDefault();
 if (amount <= 0) {status.textContent = '寄付金額を選択するか、円単位の正の整数で入力してください。';custom.focus();return;}
 document.getElementById('paymentDialog').showModal();
});
document.getElementById('close-dialog').addEventListener('click', () => document.getElementById('paymentDialog').close());
document.getElementById('copy-bank').addEventListener('click', async event => {
 try {await navigator.clipboard.writeText(document.getElementById('bank-info').innerText);event.target.textContent = 'コピーしました';}
 catch {event.target.textContent = '口座情報を選択してコピーしてください';}
});
// Date-only countdown; exact closing time is to be confirmed before launch.
const day = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const today = new Date(day + 'T00:00:00+09:00');
const deadline = new Date('2027-01-15T00:00:00+09:00');
document.getElementById('days-left').textContent = Math.max(0, Math.ceil((deadline - today)/86400000)) + ' 日';
