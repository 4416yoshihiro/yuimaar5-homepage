"use strict";
// apiUrlが空欄ならプレビュー。保存確認を受け取るまで受付完了にしない。
const apiUrl = window.FUNDRAISING_CONFIG?.apiUrl || '';
const connected = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(apiUrl);
const form = document.getElementById('fundraisingForm');
const custom = document.getElementById('custom-donation');
const buttons = [...document.querySelectorAll('[data-amount]')];
const status = document.getElementById('form-status');
let amount = 0;
let pending = null;
let submitting = false;
async function requestApi(options = {}) {
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), 25000);
 try {
  const response = await fetch(apiUrl, {...options, signal:controller.signal, redirect:'follow', cache:'no-store'});
  if (!response.ok) throw new Error('通信に失敗しました。');
  const data = await response.json();
  if (!data || data.ok !== true) throw new Error(data?.message || '受付結果を確認できませんでした。');
  return data;
 } finally {clearTimeout(timer);}
}

async function refreshPublicData() {
 if (!connected) return;
 try {
  const data = await requestApi();
  if (!Number.isFinite(data.amount) || data.amount < 0 || !Number.isSafeInteger(data.supporters) || data.supporters < 0 || !Array.isArray(data.messages)) throw new Error('Invalid public data');
  const percent = data.amount / 1000000 * 100;
  const stats = document.querySelectorAll('.stat-val');
  stats[0].textContent = data.amount.toLocaleString('ja-JP') + ' 円';
  // 円単位から丸め、0.45%などの浮動小数点誤差を避けてシート表示に合わせる。
  stats[1].textContent = (Math.round(data.amount / 1000) / 10).toFixed(1) + ' %';
  stats[2].textContent = data.supporters.toLocaleString('ja-JP') + ' 人';
  document.querySelector('.progress-bar').style.width = Math.min(100, percent) + '%';
  document.querySelector('.stats-note').textContent = '入金確認済みの実入金額から返金額を差し引いて集計します。サポーター数はメールアドレス単位です。';
  const list = document.getElementById('message-list-container');
  list.replaceChildren();
  const messages = data.messages.filter(v => typeof v === 'string');
  if (!messages.length) {
   const p = document.createElement('p'); p.className = 'form-note';
   p.textContent = '公開に同意いただき、運営が確認した応援メッセージを掲載します。';list.appendChild(p);
  }
  messages.forEach(message => {
   const p = document.createElement('p');p.className = 'public-support-message';p.textContent = message;list.appendChild(p);
  });
 } catch {
  document.querySelector('.stats-note').textContent = '現在、集計を取得できません。時間をおいてページを開き直してください。';
 }
}
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
form.addEventListener('submit', async event => {
 event.preventDefault();
 if (submitting) return;
 if (amount <= 0) {status.textContent = '寄付金額を選択するか、円単位の正の整数で入力してください。';custom.focus();return;}
 const bank = form.elements.payment.value;
 const submittedAmount = amount;
 if (connected) {
  const payload = Object.fromEntries(new FormData(form));
  payload.amount = submittedAmount;
  payload.messageConsent = payload.messageConsent === 'yes' ? 'yes' : 'no';
  const fingerprint = JSON.stringify(payload);
  if (!pending || pending.fingerprint !== fingerprint) pending = {fingerprint, requestId:crypto.randomUUID()};
  payload.requestId = pending.requestId;
  submitting = true;
  status.textContent = 'お申し込み内容を保存しています。画面を閉じずにお待ちください。';
  const enabledControls = [...form.elements].filter(el => !el.disabled);
  enabledControls.forEach(el => {el.disabled = true;});
  try {
   const result = await requestApi({method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(payload)});
   if (result.receiptId !== 'Y5-' + payload.requestId) throw new Error('受付番号を確認できませんでした。');
   document.querySelector('#paymentDialog .modal-title').textContent = 'お申し込みを受け付けました';
   document.getElementById('receipt-id').textContent = result.receiptId;
   document.getElementById('receipt-line').hidden = false;
   const mailNotice = result.mailStatus === '送信済'
    ? 'ご入力のメールアドレス宛てに控えメールを送信しました。届かない場合は迷惑メールフォルダもご確認ください。'
    : 'お申し込みは保存済みですが、控えメールの送信を確認できませんでした。この画面を保存し、必要な場合は受付番号を添えて運営へお問い合わせください。メールのために再度申し込む必要はありません。';
   document.querySelector('#paymentDialog .form-note').textContent = '受付番号と振込先を保存し、下記口座へお振り込みください。この申込だけで入金完了にはなりません。' + mailNotice;
   document.querySelector('#paymentDialog .amount-label').textContent = 'お申し込み額';
   status.textContent = 'お申し込みを保存しました。受付番号：' + result.receiptId;
   refreshPublicData();
  } catch (error) {
   status.textContent = (error.name === 'AbortError' ? '受付の確認に時間がかかっています。' : error.message) + ' 完了を確認できていません。入力内容を変えずに再送信してください。画面を閉じた場合は、重複申込を避けるため運営へお問い合わせください。';
   return;
  } finally {
   enabledControls.forEach(el => {el.disabled = false;});
   submitting = false;
  }
 }
 const bankInfo = document.getElementById('bank-info');
 const copyButton = document.getElementById('copy-bank');
 document.getElementById('bank-title').textContent = bank === 'okinawa' ? '🏦 沖縄銀行 振込先' : '🏦 琉球銀行 振込先';
 bankInfo.replaceChildren();
 const lines = bank === 'okinawa'
   ? ['沖縄銀行 新都心支店（店番号132）', '普通口座：1621287', '口座名義：シャ）ベースボールオキナワ']
   : ['琉球銀行 東風平支店（店番号606）', '普通口座：0542458', '口座名義：オキナワドジャース'];
 lines.forEach((line, index) => {if (index) bankInfo.appendChild(document.createElement('br'));bankInfo.appendChild(document.createTextNode(line));});
 copyButton.disabled = false;
 copyButton.textContent = '口座情報をコピーする';
 document.getElementById('modal-amount').textContent = '¥' + submittedAmount.toLocaleString('ja-JP');
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
if (connected) {
 document.querySelectorAll('.preview-banner').forEach((el, index) => {
  el.textContent = index === 0 ? 'お申し込み後、銀行振込でご支援いただけます。' : '申込情報は運営の管理シートに保存されます。連絡先は申込管理・入金確認のために使用し、公開しません。';
 });
 form.querySelector('.submit-btn').textContent = '✨ 申し込んで振込先を確認する';
 document.getElementById('integration-note').textContent = '申込完了後に受付番号と振込先を表示し、ご入力のメールアドレスに控えを自動送信します。メールアドレスをお確かめください。';
 refreshPublicData();
}
