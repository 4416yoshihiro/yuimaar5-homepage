const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const rows = Array.from({length:1000},()=>Array(23).fill(''));
let locked = false, flushes = 0, writes = 0, quota = 100, mailFails = false;
const mails = [];
const sheet = {getRange(a, b, h, w) {
 if (typeof a === 'string') return {getValue:()=>a === 'A1' ? '受付番号' : '公開本文（自動）'};
 return {
  getValues:()=>rows.slice(a-2,a-2+h).map(r=>r.slice(b-1,b-1+w)),
  setValues:values=>{assert.ok(locked);values.forEach((r,i)=>r.forEach((v,j)=>rows[a-2+i][b-1+j]=v));writes++;},
  setFormulas:values=>{values.forEach((r,i)=>r.forEach((v,j)=>rows[a-2+i][b-1+j]=v));}
 };
}};
const context = vm.createContext({
 SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush:()=>{assert.ok(locked);flushes++;}},
 LockService:{getScriptLock:()=>({tryLock:()=>{locked=true;return true;},releaseLock:()=>{locked=false;}})},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:value=>({setMimeType:()=>JSON.parse(value)})},
 MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:message=>{assert.ok(locked);if(mailFails)throw Error('mail failure');mails.push(message);quota--;}}
});
vm.runInContext(readFileSync(__dirname+'/Code.gs','utf8'),context);
vm.runInContext(readFileSync(__dirname+'/Receipt.gs','utf8'),context);
const request = {
 requestId:'56ebaa1b-7e5f-466b-9322-6fe279bab308',name:'連携テスト',kana:'レンケイテスト',
 email:'test@example.invalid',phone:'09000000000',relation:'SNSファン',payment:'ryukyu',
 message:'<img src=x onerror=alert(1)>',messageConsent:'no',amount:5000,website:''
};
const post = data=>context.doPost({postData:{contents:JSON.stringify(data)}});
const initial = post(request);
assert.equal(initial.ok,true);
assert.equal(initial.mailStatus,'送信済');
assert.equal(rows[0][12],'未入金');
assert.equal(rows[0][13],0);
assert.equal(rows[0][9],'琉球銀行');
assert.equal(rows[0][5],'09000000000');
assert.ok(flushes >= 3);
assert.equal(mails.length,1);
assert.equal(mails[0].to,request.email);
assert.equal(mails[0].replyTo,'ya0468046@gmail.com');
assert.ok(mails[0].body.includes('普通口座：0542458'));
assert.ok(mails[0].body.includes('5,000円'));
assert.ok(mails[0].body.includes(initial.receiptId));
assert.ok(!mails[0].body.includes(request.phone));
assert.ok(!mails[0].body.includes(request.message));
const writesAfterFirst=writes;
assert.equal(post(request).duplicate,true);
assert.equal(writes,writesAfterFirst,'retry must not create another entry');
assert.equal(mails.length,1,'retry must not send another email');
assert.equal(post({...request,amount:10000}).code,'CONFLICT');
assert.equal(post({...request,requestId:'invalid'}).code,'INVALID');
assert.equal(post({...request,payment:'paypay'}).code,'INVALID');
assert.equal(post({...request,amount:0}).code,'INVALID');
assert.equal(post({...request,amount:1.5}).code,'INVALID');
assert.equal(post({...request,messageConsent:'maybe'}).code,'INVALID');
assert.equal(post({...request,website:'bot'}).code,'INVALID');
assert.equal(post({...request,email:'x,y@example.com'}).code,'INVALID');
assert.equal(context.doGet().amount,0,'unpaid applications must not add to totals');
assert.equal(context.doGet().messages.length,0,'private/unapproved messages must not be public');
rows[0][12]='入金確認済';rows[0][13]=5000;rows[0][14]=1000;
assert.equal(context.doGet().amount,4000);
rows[1]=rows[0].slice();rows[1][0]='Y5-other';rows[1][4]='TEST@example.invalid';
assert.equal(context.doGet().supporters,1,'same email counts once');
rows[0][11]='同意する';rows[0][17]='承認';
assert.equal(context.doGet().messages.length,1);
const publicData=JSON.stringify(context.doGet());
assert.ok(!publicData.includes('test@example.invalid'));
assert.ok(!publicData.includes('09000000000'));
const injection = {...request,requestId:'56ebaa1b-7e5f-466b-9322-6fe279bab309',name:'=IMPORTXML("x")',message:'=HYPERLINK("x")'};
assert.equal(post(injection).ok,true);
assert.ok(rows[2][2].startsWith("'="));
assert.ok(rows[2][10].startsWith("'="));
assert.equal(post(injection).duplicate,true);
const failedRequest={...request,requestId:'56ebaa1b-7e5f-466b-9322-6fe279bab310',payment:'okinawa'};
mailFails=true;
const failed=post(failedRequest);
assert.equal(failed.ok,true,'mail failure must not fail a saved application');
assert.equal(failed.mailStatus,'送信失敗');
assert.equal(rows[3][19],'送信失敗');
const sentBeforeRetry=mails.length;
mailFails=false;
assert.equal(post(failedRequest).mailStatus,'送信失敗');
assert.equal(mails.length,sentBeforeRetry,'failed send must not be retried automatically');
quota=0;
const capped=post({...request,requestId:'56ebaa1b-7e5f-466b-9322-6fe279bab311'});
assert.equal(capped.ok,true);
assert.equal(capped.mailStatus,'未送信');
assert.equal(rows[4][19],'未送信');
assert.equal(mails.length,sentBeforeRetry);
const okinawaBody=context.receiptMessage_(rows[3]).body;
assert.ok(okinawaBody.includes('沖縄銀行 新都心支店（店番号132）'));
assert.ok(okinawaBody.includes('普通口座：1621287'));
const memoRow=Array(23).fill('');memoRow[20]='既存の運営メモ';
assert.ok(context.mailMemo_(memoRow,'送信理由').startsWith('既存の運営メモ\n'));
memoRow[20]='既存の運営メモ\n送信理由';
assert.equal(context.mailMemo_(memoRow,'送信理由'),memoRow[20]);
assert.equal(locked,false);
console.log('PASS: validation, mapping, idempotency, formula protection, totals/privacy, receipt contents, duplicate mail prevention, mail failure and quota handling');
