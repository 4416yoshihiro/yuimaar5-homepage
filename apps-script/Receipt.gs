/** 受付控え。MailAppの送信権限だけを使い、受信メールにはアクセスしない。 */
const RECEIPT_REPLY_TO = 'ya0468046@gmail.com';

function singleEmail_(email) {
  return typeof email === 'string' && /^[^\s@,;<>"()]+@[^\s@,;<>"()]+\.[^\s@,;<>"()]+$/.test(email);
}

function saveAndEmail_(data) {
  if (!singleEmail_(data.email)) fail_('INVALID', 'メールアドレスを1件だけ正しく入力してください。');
  const result = save_(data);
  // メール送信の問題で「申込失敗」と表示したり、申込を再登録したりしない。
  try { result.mailStatus = sendReceipt_(result.receiptId); }
  catch (error) { result.mailStatus = '要確認'; }
  return result;
}

function receiptMessage_(row) {
  const bank = row[9] === '沖縄銀行'
    ? ['沖縄銀行 新都心支店（店番号132）', '普通口座：1621287', '口座名義：シャ）ベースボールオキナワ']
    : row[9] === '琉球銀行'
      ? ['琉球銀行 東風平支店（店番号606）', '普通口座：0542458', '口座名義：オキナワドジャース'] : null;
  if (!bank || !singleEmail_(row[4]) || !Number.isSafeInteger(row[8]) || row[8] < 1) throw new Error('Invalid receipt data');
  return {
    to: row[4], name: '結マール５ 遠征支援窓口', replyTo: RECEIPT_REPLY_TO,
    subject: '【結マール５】ご支援のお申し込み控え（' + row[0] + '）',
    body: [
      String(row[2]) + ' 様', '',
      '結マール５の挑戦への温かい応援をありがとうございます。',
      '以下の内容でご支援のお申し込みを受け付けました。', '',
      '受付番号：' + row[0],
      '申込金額：' + Number(row[8]).toLocaleString('ja-JP') + '円',
      '送金方法：銀行振込（' + row[9] + '）', '',
      '【お振込先】', ...bank, '',
      'お申し込みのお名前でお振り込みください。異なる名義の場合は、受付番号と振込名義を下記窓口へお知らせください。',
      '振込手数料はご負担をお願いいたします。',
      'このメールは申込内容の控えです。入金確認・決済完了のお知らせや領収書ではありません。',
      'すでにお振り込み済みの場合は、重ねてお振り込みいただく必要はありません。', '',
      'ご支援は、第4回BASEBALL5日本選手権に向けた選手たちの遠征費として大切に活用します。',
      '大会：2027年1月16日・17日／横浜武道館', '',
      '内容の訂正やお心当たりのないお申し込みは、このメールに返信してお知らせください。',
      'お問い合わせ：' + RECEIPT_REPLY_TO, '',
      '一般社団法人ベースボール沖縄／結マール５'
    ].join('\n')
  };
}

function mailMemo_(row, note) {
  const previous = String(row[20] || '');
  return literal_(previous.includes(note) ? previous : (previous ? previous + '\n' : '') + note);
}

function sendReceipt_(receiptId) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return '要確認';
  try {
    const sheet = entries_();
    const rows = sheet.getRange(2, 1, MAX_ENTRIES, 23).getValues();
    const index = rows.findIndex(row => row[0] === receiptId);
    if (index < 0) throw new Error('Receipt not found');
    const row = rows[index], rowNumber = index + 2;
    const state = row[19] || '未送信';
    // 送信済・送信中・失敗は自動再送しない。通信再試行でもメールを重ねない。
    if (state !== '未送信') return state;
    const message = receiptMessage_(row);
    if (MailApp.getRemainingDailyQuota() < 1) {
      sheet.getRange(rowNumber, 21, 1, 1).setValues([[mailMemo_(row, '控えメール：Googleの送信上限のため未送信。運営から再送してください。')]]);
      SpreadsheetApp.flush();
      return '未送信';
    }
    // 送信直前の状態を先に確定し、実行中断後の自動二重送信を防ぐ。
    sheet.getRange(rowNumber, 20, 1, 1).setValues([['送信中']]);
    SpreadsheetApp.flush();
    try { MailApp.sendEmail(message); }
    catch (error) {
      sheet.getRange(rowNumber, 20, 1, 2).setValues([['送信失敗', mailMemo_(row, '控えメール：送信処理エラー。送信履歴・宛先を確認してから再送してください。')]]);
      SpreadsheetApp.flush();
      return '送信失敗';
    }
    // 送信後にシート更新が失敗した場合は「送信中」が残る。再送前に送信履歴を確認する。
    sheet.getRange(rowNumber, 20, 1, 1).setValues([['送信済']]);
    SpreadsheetApp.flush();
    return '送信済';
  } finally { lock.releaseLock(); }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('控えメール').addItem('選択行の未送信・失敗メールを送る', 'sendSelectedReceipt').addToUi();
}

function sendSelectedReceipt() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getActiveSheet(), ui = SpreadsheetApp.getUi();
  const range = sheet.getActiveRange();
  if (ss.getId() !== SHEET_ID || sheet.getName() !== '申込一覧' || !range || range.getNumRows() !== 1 || range.getRow() < 2 || range.getRow() > MAX_ENTRIES + 1) {
    ui.alert('「申込一覧」で対象の申込を1行だけ選択してください。'); return;
  }
  const rowNumber = range.getRow(), row = sheet.getRange(rowNumber, 1, 1, 23).getValues()[0];
  if (!row[0] || !singleEmail_(row[4]) || !['未送信', '送信失敗'].includes(row[19])) {
    ui.alert('受付番号・宛先とメール状態を確認してください。「送信済」「送信中」は二重送信防止のため対象外です。'); return;
  }
  if (ui.alert('控えメールを送信', row[0] + '\n宛先：' + row[4] + '\n送信履歴を確認のうえ送信しますか？', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {ui.alert('混み合っています。再度お試しください。');return;}
  try {
    const latest = sheet.getRange(rowNumber, 1, 1, 23).getValues()[0];
    if (latest[0] !== row[0] || latest[4] !== row[4] || !['未送信', '送信失敗'].includes(latest[19])) {
      ui.alert('対象の内容が変わりました。再度確認してください。'); return;
    }
    sheet.getRange(rowNumber, 20, 1, 1).setValues([['未送信']]);
    SpreadsheetApp.flush();
  } finally {lock.releaseLock();}
  ui.alert('メール状態：' + sendReceipt_(row[0]));
}
