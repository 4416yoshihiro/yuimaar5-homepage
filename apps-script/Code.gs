/** 結マール５ 遠征支援受付。シート本体は非公開のまま使用する。 */
const SHEET_ID = '1yh74LKpFgBwufybeNaejLQh4_ubbfKcvgtEXNUC9whg';
const MAX_ENTRIES = 1000;
const RELATIONS = ['選手の家族・知人', '企業・団体', '地域・一般', 'SNSファン', '選手の職場'];
const BANKS = { okinawa: '沖縄銀行', ryukyu: '琉球銀行' };
// 連続送信対策（いたずらで受付枠・控えメールの送信枠を使い切られないようにする）
const LIMIT_PER_EMAIL_24H = 5;   // 同じメールアドレスからの申込：24時間で5件まで
const LIMIT_ALL_1H = 30;         // 全体の新規申込：1時間で30件まで
const LIMIT_ALL_24H = 100;       // 全体の新規申込：24時間で100件まで（控えメールの1日の送信枠と同程度）

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
    return json_(Object.assign({ ok: true, namePublicationVersion: 1 }, aggregate_(rows)));
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
    messageConsent: text('messageConsent', 3, true), amount: raw.amount,
    receiptVersion: raw.receiptVersion === 2 ? 2 : 1
  };
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(data.requestId)) fail_('INVALID', '受付番号を生成し直してください。');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || !/^[0-9+()\-\s]{6,30}$/.test(data.phone)) fail_('INVALID', 'メールアドレス・電話番号を確認してください。');
  if (!RELATIONS.includes(data.relation) || !Object.prototype.hasOwnProperty.call(BANKS, data.payment) || !['yes', 'no'].includes(data.messageConsent)) fail_('INVALID', '選択項目を確認してください。');
  if (!Number.isSafeInteger(data.amount) || data.amount < 1 || data.amount > 99999999) fail_('INVALID', '金額は1〜99,999,999円の整数で入力してください。');
  if (raw.website) fail_('INVALID', '受付できませんでした。');
  // 旧画面の申込は同意未取得。欠けた項目を同意として補わない。
  data.namePublicationVersion = 0;
  data.namePublicationConsent = '未取得';
  data.publicationName = '';
  if (['namePublicationVersion', 'namePublicationConsent', 'publicationName'].some(key => Object.prototype.hasOwnProperty.call(raw, key))) {
    if (raw.namePublicationVersion !== 1 || !['yes', 'no'].includes(raw.namePublicationConsent)) fail_('INVALID', 'お名前の掲載について選択してください。');
    const publicationName = text('publicationName', 100, raw.namePublicationConsent === 'yes');
    data.namePublicationVersion = 1;
    data.namePublicationConsent = raw.namePublicationConsent === 'yes' ? '掲載してよい' : '掲載を希望しない';
    data.publicationName = raw.namePublicationConsent === 'yes' ? publicationName : '';
  }
  return data;
}

function entries_() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('申込一覧');
  if (!sheet || sheet.getRange('A1').getValue() !== '受付番号' || sheet.getRange('W1').getValue() !== '公開本文（自動）' || sheet.getRange('X1').getValue() !== '送信リクエストID（内部）') throw new Error('Sheet schema mismatch');
  if (sheet.getRange('Y1').getValue() !== '氏名掲載同意（SNS・横断幕等）' || sheet.getRange('Z1').getValue() !== '掲載名') throw new Error('Name publication schema mismatch');
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

// 必ず保存処理のロック内で採番。削除・書込失敗後も発行済み番号を再利用しない。
function nextReceipt_(rows, now) {
  const day = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd');
  const properties = PropertiesService.getScriptProperties();
  const key = 'receipt-sequence:' + day;
  const stored = properties.getProperty(key);
  if (stored !== null && (!/^\d+$/.test(stored) || !Number.isSafeInteger(Number(stored)))) throw new Error('Invalid receipt sequence');
  let highest = Number(stored || 0), count = 0;
  rows.forEach(row => {
    if (!row[0]) return;
    if (row[1] && Utilities.formatDate(new Date(row[1]), 'Asia/Tokyo', 'yyyyMMdd') === day) count++;
    const match = String(row[0]).match(/^(\d{8})-(\d{3,})$/);
    if (match && match[1] === day) highest = Math.max(highest, Number(match[2]));
  });
  const next = Math.max(highest, count) + 1;
  if (!Number.isSafeInteger(next)) throw new Error('Receipt sequence exhausted');
  properties.setProperty(key, String(next));
  return day + '-' + String(next).padStart(3, '0');
}

function save_(data) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_('BUSY', '混み合っています。少し待って同じ内容で再送信してください。');
  try {
    const sheet = entries_();
    const rows = sheet.getRange(2, 1, MAX_ENTRIES, 26).getValues();
    const legacyId = 'Y5-' + data.requestId;
    const duplicate = rows.find(row => row[0] && (row[23] === data.requestId || row[0] === legacyId));
    const input = inputCells_(data);
    if (duplicate) {
      // 同じリクエストIDは二重登録しない。内容変更の再利用は拒否。
      if (!input.every((value, i) => duplicate[i + 2] === value || duplicate[i + 2] === literal_(String(value)))) fail_('CONFLICT', '以前の送信と内容が異なります。受付状況をお問い合わせください。');
      if (data.namePublicationVersion === 1 && ![data.namePublicationConsent, data.publicationName].every((value, i) => duplicate[i + 24] === value || duplicate[i + 24] === literal_(value))) fail_('CONFLICT', '以前の送信と掲載希望が異なります。受付番号を添えて運営へお問い合わせください。');
      return { ok: true, receiptId: duplicate[0], requestId: data.requestId, duplicate: true, namePublicationSaved: data.namePublicationVersion === 1 };
    }
    const now = new Date();
    if (now >= new Date('2027-01-16T00:00:00+09:00')) fail_('CLOSED', '募集を締め切りました。ご支援ありがとうございます。');
    const recent = recentCounts_(rows, data.email, now);
    if (recent.email24h >= LIMIT_PER_EMAIL_24H) fail_('LIMIT', '同じメールアドレスからのお申し込みは24時間で' + LIMIT_PER_EMAIL_24H + '件までです。追加のご支援はお問い合わせ先までご連絡ください。');
    if (recent.all1h >= LIMIT_ALL_1H || recent.all24h >= LIMIT_ALL_24H) fail_('BUSY', 'ただいまお申し込みが集中しています。時間をおいて再度お試しいただくか、お問い合わせください。');
    const index = rows.findIndex(row => !row[0]);
    if (index < 0) fail_('FULL', '受付件数の確認が必要です。お問い合わせください。');
    const rowNumber = index + 2;
    // 更新前に開かれた旧画面には従来形式を返し、保存済みなのにエラーになることを防ぐ。
    const receiptId = data.receiptVersion === 2 ? nextReceipt_(rows, now) : legacyId;
    const values = [receiptId, now, ...input.map(v => typeof v === 'string' ? literal_(v) : v), '未入金', 0, 0, '', '', '未確認', '', '未送信', '',
      '=IF(A' + rowNumber + '="","",IF(M' + rowNumber + '="入金確認済",MAX(0,N' + rowNumber + '-O' + rowNumber + '),0))',
      '=IF(AND(A' + rowNumber + '<>"",L' + rowNumber + '="同意する",R' + rowNumber + '="承認"),K' + rowNumber + ',"")', data.requestId, data.namePublicationConsent, literal_(data.publicationName)];
    // 受付番号と内部IDを同一の書込に含め、途中失敗後も再送を識別する。
    sheet.getRange(rowNumber, 1, 1, 26).setValues([values]);
    SpreadsheetApp.flush();
    return { ok: true, receiptId: receiptId, requestId: data.requestId, duplicate: false, namePublicationSaved: data.namePublicationVersion === 1 };
  } finally { lock.releaseLock(); }
}

// 直近の申込件数を数える（申込日時B列・メールE列）。日時のない行は数えない。
function recentCounts_(rows, email, now) {
  const key = String(email).replace(/^'/, '').trim().toLowerCase();
  const counts = { email24h: 0, all1h: 0, all24h: 0 };
  rows.forEach(row => {
    const at = row[1] && typeof row[1].getTime === 'function' ? row[1].getTime() : NaN;
    if (!row[0] || !Number.isFinite(at)) return;
    const age = now.getTime() - at;
    if (age < 0 || age >= 24 * 3600000) return;
    counts.all24h++;
    if (age < 3600000) counts.all1h++;
    if (String(row[4]).replace(/^'/, '').trim().toLowerCase() === key) counts.email24h++;
  });
  return counts;
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
