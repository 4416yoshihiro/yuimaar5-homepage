/** 結マール５ 遠征支援受付。シート本体は非公開のまま使用する。 */
const SHEET_ID = '1yh74LKpFgBwufybeNaejLQh4_ubbfKcvgtEXNUC9whg';
const MAX_ENTRIES = 1000;
const RELATIONS = ['選手の家族・知人', '企業・団体', '地域・一般', 'SNSファン', '選手の職場'];
const BANKS = { okinawa: '沖縄銀行', ryukyu: '琉球銀行' };

function doPost(e) {
  try {
    if (!e || !e.postData || e.postData.contents.length > 12000) fail_('INVALID', '申込内容を確認してください。');
    const data = validate_(JSON.parse(e.postData.contents));
    return json_(saveAndEmail_(data));
  } catch (error) {
    return json_({ ok: false, code: error.publicCode || 'SERVER', message: error.publicMessage || '受付を確認できませんでした。同じ内容で再送信するか、お問い合わせください。' });
  }
}

function doGet() {
  try {
    const rows = entries_().getRange(2, 1, MAX_ENTRIES, 23).getValues();
    return json_(Object.assign({ ok: true }, aggregate_(rows)));
  } catch (error) {
    return json_({ ok: false, code: 'SERVER', message: '集計を取得できませんでした。' });
  }
}

function validate_(raw) {
  if (!raw || typeof raw !== 'object') fail_('INVALID', '申込内容を確認してください。');
  function text(key, max, required) {
    if (typeof raw[key] !== 'string') fail_('INVALID', '入力内容を確認してください。');
    const value = raw[key].trim();
    if (value.length > max || (required && !value) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail_('INVALID', '入力文字数・内容を確認してください。');
    return value;
  }
  const data = {
    requestId: text('requestId', 36, true), name: text('name', 100, true),
    kana: text('kana', 100, true), email: text('email', 254, true),
    phone: text('phone', 30, true), relation: text('relation', 30, true),
    payment: text('payment', 20, true), message: text('message', 1000, false),
    messageConsent: text('messageConsent', 3, true), amount: raw.amount
  };
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(data.requestId)) fail_('INVALID', '受付番号を生成し直してください。');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || !/^[0-9+()\-\s]{6,30}$/.test(data.phone)) fail_('INVALID', 'メールアドレス・電話番号を確認してください。');
  if (!RELATIONS.includes(data.relation) || !Object.prototype.hasOwnProperty.call(BANKS, data.payment) || !['yes', 'no'].includes(data.messageConsent)) fail_('INVALID', '選択項目を確認してください。');
  if (!Number.isSafeInteger(data.amount) || data.amount < 1 || data.amount > 99999999) fail_('INVALID', '金額は1〜99,999,999円の整数で入力してください。');
  if (raw.website) fail_('INVALID', '受付できませんでした。');
  return data;
}

function entries_() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('申込一覧');
  if (!sheet || sheet.getRange('A1').getValue() !== '受付番号' || sheet.getRange('W1').getValue() !== '公開本文（自動）') throw new Error('Sheet schema mismatch');
  return sheet;
}

function fail_(code, message) {
  const error = new Error(message);
  error.publicCode = code;
  error.publicMessage = message;
  throw error;
}

// 入力から数式を実行させない。電話番号の先頭0は列書式TEXTで保持。
function literal_(value) { return /^[=+\-@']/.test(value) ? "'" + value : value; }

function inputCells_(data) {
  return [data.name, data.kana, data.email, data.phone, data.relation, '寄付', data.amount,
    BANKS[data.payment], data.message, data.messageConsent === 'yes' ? '同意する' : '同意しない'];
}

function save_(data) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_('BUSY', '混み合っています。少し待って同じ内容で再送信してください。');
  try {
    const sheet = entries_();
    const rows = sheet.getRange(2, 1, MAX_ENTRIES, 23).getValues();
    const receiptId = 'Y5-' + data.requestId;
    const duplicate = rows.find(row => row[0] === receiptId);
    const input = inputCells_(data);
    if (duplicate) {
      // 同じリクエストIDは二重登録しない。内容変更の再利用は拒否。
      if (!input.every((value, i) => duplicate[i + 2] === value || duplicate[i + 2] === literal_(String(value)))) fail_('CONFLICT', '以前の送信と内容が異なります。受付状況をお問い合わせください。');
      return { ok: true, receiptId: receiptId, duplicate: true };
    }
    if (new Date() >= new Date('2027-01-16T00:00:00+09:00')) fail_('CLOSED', '募集を締め切りました。ご支援ありがとうございます。');
    const index = rows.findIndex(row => !row[0]);
    if (index < 0) fail_('FULL', '受付件数の確認が必要です。お問い合わせください。');
    const rowNumber = index + 2;
    const values = [receiptId, new Date(), ...input.map(v => typeof v === 'string' ? literal_(v) : v), '未入金', 0, 0, '', '', '未確認', '', '未送信', ''];
    sheet.getRange(rowNumber, 1, 1, 21).setValues([values]);
    sheet.getRange(rowNumber, 22, 1, 2).setFormulas([[
      '=IF(A' + rowNumber + '="","",IF(M' + rowNumber + '="入金確認済",MAX(0,N' + rowNumber + '-O' + rowNumber + '),0))',
      '=IF(AND(A' + rowNumber + '<>"",L' + rowNumber + '="同意する",R' + rowNumber + '="承認"),K' + rowNumber + ',"")'
    ]]);
    SpreadsheetApp.flush();
    return { ok: true, receiptId: receiptId, duplicate: false };
  } finally { lock.releaseLock(); }
}

function aggregate_(rows) {
  let amount = 0;
  const supporters = new Set();
  const messages = [];
  rows.forEach(row => {
    if (!row[0]) return;
    if (row[12] === '入金確認済') {
      const paid = Number(row[13]), refund = Number(row[14]);
      const net = Number.isFinite(paid) && Number.isFinite(refund) ? Math.max(0, paid - refund) : 0;
      amount += net;
      if (net > 0) supporters.add(String(row[4]).trim().toLowerCase() || String(row[0]));
    }
    if (row[11] === '同意する' && row[17] === '承認' && row[10]) messages.push(String(row[10]));
  });
  // 個人情報、受付番号、申込額、未承認メッセージはGETで返さない。
  return { amount: amount, supporters: supporters.size, messages: messages.slice(-30).reverse() };
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
