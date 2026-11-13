// 連続送信対策のテスト（node apps-script/rate-limit.test.cjs）
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
function setup() {
 const rows = Array.from({length:1000},()=>Array(26).fill(''));
 let locked = false; const mails = []; const state = {now:'2026-12-01T10:00:00+09:00'};
 const sheet = {getRange(a, b, h, w) {
  if (typeof a === 'string') return {getValue:()=>a === 'A1' ? '受付番号' : a === 'X1' ? '送信リクエストID（内部）' : a === 'Y1' ? '氏名掲載同意（SNS・横断幕等）' : a === 'Z1' ? '掲載名' : '公開本文（自動）'};
  return {getValues:()=>rows.slice(a-2,a-2+h).map(r=>r.slice(b-1,b-1+w)),
   setValues:v=>v.forEach((r,i)=>r.forEach((x,j)=>rows[a-2+i][b-1+j]=x)),
   setFormulas:v=>v.forEach((r,i)=>r.forEach((x,j)=>rows[a-2+i][b-1+j]=x))};
 }};
 const sequenceProperties = new Map();
 const context = vm.createContext({
  Utilities:{formatDate:(date,zone)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date).replaceAll('-','')},
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>sequenceProperties.get(key)??null,setProperty:(key,value)=>{assert.ok(locked);sequenceProperties.set(key,value);}})},
  SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush:()=>{}},
  LockService:{getScriptLock:()=>({tryLock:()=>{locked=true;return true;},releaseLock:()=>{locked=false;}})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:v=>({setMimeType:()=>JSON.parse(v)})},
  MailApp:{getRemainingDailyQuota:()=>100,sendEmail:m=>mails.push(m)}
 });
 vm.runInContext(readFileSync(__dirname+'/Code.gs','utf8'),context);
 vm.runInContext(readFileSync(__dirname+'/Receipt.gs','utf8'),context);
 const NativeDate = Date;
 context.Date = class extends NativeDate {constructor(...a){super(...(a.length?a:[state.now]));}};
 const post = d=>context.doPost({postData:{contents:JSON.stringify(d)}});
 return {rows, mails, state, post, sequenceProperties, isLocked:()=>locked};
}
const base = {name:'連続テスト',kana:'レンゾクテスト',email:'rate@example.invalid',phone:'09000000000',relation:'SNSファン',payment:'okinawa',message:'',messageConsent:'no',amount:1000,website:'',receiptVersion:2};
const req = c=>({...base,requestId:randomUUID(),...c});
const saved = rows=>rows.filter(r=>r[0]).length;

{ // 同じメールアドレスは24時間で5件まで（大文字小文字は同一扱い）
 const t = setup();
 for (let i=0;i<5;i++) assert.equal(t.post(req({email:i%2?'RATE@example.invalid':'rate@example.invalid'})).ok,true);
 const sixth = t.post(req());
 assert.equal(t.sequenceProperties.get('receipt-sequence:20261201'),'5','拒否で受付番号を消費しない');
 assert.equal(sixth.code,'LIMIT'); assert.equal(saved(t.rows),5); assert.equal(t.mails.length,5,'6件目は控えメールも送らない');
 assert.equal(t.post(req({email:'other@example.invalid'})).ok,true,'別のメールアドレスは受け付ける');
 t.state.now='2026-12-02T10:00:00+09:00';
 assert.equal(t.post(req()).ok,true,'24時間経てば受け付ける');
 assert.equal(t.isLocked(),false);
}
{ // 保存済み申込の再送信（同じ受付ID）は、上限に達していても受付済みとして返す
 const t = setup(); const first = req();
 assert.equal(t.post(first).ok,true);
 for (let i=0;i<4;i++) t.post(req());
 const retry = t.post(first);
 assert.equal(retry.ok,true); assert.equal(retry.duplicate,true); assert.equal(saved(t.rows),5);
}
{ // 全体で1時間30件まで
 const t = setup();
 for (let i=0;i<30;i++) assert.equal(t.post(req({email:`u${i}@example.invalid`})).ok,true);
 assert.equal(t.post(req({email:'u30@example.invalid'})).code,'BUSY'); assert.equal(saved(t.rows),30); assert.equal(t.mails.length,30);
 t.state.now='2026-12-01T11:00:00+09:00';
 assert.equal(t.post(req({email:'u31@example.invalid'})).ok,true,'1時間経てば受け付ける');
}
{ // 全体で24時間100件まで
 const t = setup();
 for (let i=0;i<100;i++) { t.state.now = new Date(Date.parse('2026-12-01T00:00:00+09:00') + i*10*60000).toISOString(); assert.equal(t.post(req({email:`d${i}@example.invalid`})).ok,true); }
 t.state.now='2026-12-01T17:00:00+09:00';
 assert.equal(t.post(req({email:'d100@example.invalid'})).code,'BUSY'); assert.equal(saved(t.rows),100);
}
{ // 締切後は件数に関係なく CLOSED を返す
 const t = setup(); t.state.now='2027-01-16T00:00:00+09:00';
 assert.equal(t.post(req()).code,'CLOSED');
}
{ // 新番号・旧画面とも、全体上限後・翌日・締切後の再送で番号も行数もメールも増やさない。
 for (const receiptVersion of [2, undefined]) {
  const t = setup(); const first = req({receiptVersion});
  const result = t.post(first);
  assert.equal(result.ok,true);
  assert.equal(result.receiptId,receiptVersion === 2 ? '20261201-001' : 'Y5-'+first.requestId);
  assert.equal(result.requestId,first.requestId);
  assert.equal(t.rows[0][23],first.requestId);
  for (let i=1;i<30;i++) assert.equal(t.post(req({email:`retry${i}@example.invalid`})).ok,true);
  const before = t.sequenceProperties.get('receipt-sequence:20261201');
  assert.equal(t.post(req({email:'blocked@example.invalid'})).code,'BUSY');
  for (const now of ['2026-12-01T10:00:00+09:00','2026-12-02T10:00:00+09:00','2027-01-16T00:00:00+09:00']) {
   t.state.now=now;
   const retry=t.post(first);
   assert.equal(retry.ok,true);assert.equal(retry.duplicate,true);
   assert.equal(retry.receiptId,result.receiptId);assert.equal(retry.requestId,first.requestId);
   assert.equal(saved(t.rows),30);assert.equal(t.mails.length,30);
   assert.equal(t.sequenceProperties.get('receipt-sequence:20261201'),before);
   assert.equal(t.isLocked(),false);
  }
 }
}
console.log('PASS: per-email 24h limit, retry of saved application, overall 1h/24h limits, exact window expiry, closing date, numbered/legacy retries after global cap and next day');
