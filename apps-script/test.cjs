const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const rows = Array.from({length:1000},()=>Array(26).fill(''));
let locked = false, flushes = 0, writes = 0, quota = 100, mailFails = false, lockAvailable = true;
const mails = [];
const sequenceProperties = new Map();
const sheet = {getRange(a, b, h, w) {
 if (typeof a === 'string') return {getValue:()=>a === 'A1' ? '受付番号' : a === 'X1' ? '送信リクエストID（内部）' : a === 'Y1' ? '氏名掲載同意（SNS・横断幕等）' : a === 'Z1' ? '掲載名' : '公開本文（自動）'};
 return {
  getValues:()=>rows.slice(a-2,a-2+h).map(r=>r.slice(b-1,b-1+w)),
  setValues:values=>{assert.ok(locked);values.forEach((r,i)=>r.forEach((v,j)=>rows[a-2+i][b-1+j]=v));writes++;},
  setFormulas:values=>{values.forEach((r,i)=>r.forEach((v,j)=>rows[a-2+i][b-1+j]=v));}
 };
}};
const context = vm.createContext({
 Utilities:{formatDate:(date,zone)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date).replaceAll('-','')},
 PropertiesService:{getScriptProperties:()=>({getProperty:key=>sequenceProperties.get(key)??null,setProperty:(key,value)=>{assert.ok(locked);sequenceProperties.set(key,value);}})},
 SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush:()=>{assert.ok(locked);flushes++;}},
 LockService:{getScriptLock:()=>({tryLock:()=>{if(!lockAvailable)return false;locked=true;return true;},releaseLock:()=>{locked=false;}})},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:value=>({setMimeType:()=>JSON.parse(value)})},
 MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:message=>{assert.ok(locked);if(mailFails)throw Error('mail failure');mails.push(message);quota--;}}
});
vm.runInContext(readFileSync(__dirname+'/Code.gs','utf8'),context);
vm.runInContext(readFileSync(__dirname+'/Receipt.gs','utf8'),context);
const request = {
 requestId:'56ebaa1b-7e5f-466b-9322-6fe279bab308',name:'連携テスト',kana:'レンケイテスト',
 email:'test@example.invalid',phone:'09000000000',relation:'SNSファン',payment:'ryukyu',
 message:'<img src=x onerror=alert(1)>',messageConsent:'no',amount:5000,website:'',receiptVersion:2
};
const post = data=>context.doPost({postData:{contents:JSON.stringify(data)}});
const initial = post(request);
assert.equal(initial.ok,true);
assert.match(initial.receiptId,/^\d{8}-001$/);
assert.equal(initial.requestId,request.requestId);
assert.equal(rows[0][23],request.requestId);
assert.equal(rows[0][24],'未取得','old forms do not imply name-publication consent');
assert.equal(rows[0][25],'');
assert.equal(initial.mailStatus,'送信済');
assert.equal(rows[0][12],'未入金');
assert.equal(rows[0][13],0);
assert.equal(rows[0][9],'琉球銀行');
assert.equal(rows[0][5],'','phone from an old form must not be saved');
assert.ok(flushes >= 3);
assert.equal(mails.length,1);
assert.equal(mails[0].to,request.email);
assert.equal(mails[0].replyTo,'baseballokinawa.yuimaar5@gmail.com');
assert.ok(mails[0].body.includes('お問い合わせ：baseballokinawa.yuimaar5@gmail.com'));
assert.ok(!mails[0].body.includes('ya0468046'+'@gmail.com'));
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
assert.ok(!publicData.includes(request.requestId));
assert.ok(!publicData.includes(initial.receiptId));
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
const memoRow=Array(26).fill('');memoRow[20]='既存の運営メモ';
assert.ok(context.mailMemo_(memoRow,'送信理由').startsWith('既存の運営メモ\n'));
memoRow[20]='既存の運営メモ\n送信理由';
assert.equal(context.mailMemo_(memoRow,'送信理由'),memoRow[20]);
assert.equal(locked,false);
// Capacity, deadline, malformed input and lock contention must fail without saving or emailing.
const {randomUUID}=require('node:crypto');
const fresh=changes=>({...request,requestId:randomUUID(),...changes});
for(const changes of [{amount:100000000},{amount:'1000'},{name:' '},{message:'x'.repeat(1001)},
 {relation:'unknown'},{payment:'__proto__'},{email:'a@example.com;b@example.com'},{email:''},{email:'invalid'},{email:undefined}]) {
 const before=writes;assert.equal(post(fresh(changes)).code,'INVALID');assert.equal(writes,before);
}
assert.equal(context.doPost({postData:{contents:'{broken'}}).ok,false);
assert.equal(context.doPost({postData:{contents:'x'.repeat(12001)}}).code,'INVALID');
lockAvailable=false;
assert.equal(post(fresh({})).code,'BUSY');assert.equal(locked,false);
lockAvailable=true;
const NativeDate=Date;
let testNow='2027-01-15T23:59:59+09:00';
context.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[testNow]));}};
const lastDay=fresh({amount:1});assert.equal(post(lastDay).ok,true);
testNow='2027-01-16T00:00:00+09:00';
assert.equal(post(fresh({})).code,'CLOSED');
assert.equal(post(lastDay).duplicate,true,'saved application retry remains identifiable after close');
testNow='2027-01-15T12:00:00+09:00';
const maxAmount=fresh({amount:99999999});assert.equal(post(maxAmount).ok,true);
rows.forEach((row,i)=>{if(!row[0])row[0]='Y5-capacity-'+i;});
const beforeFull=writes;assert.equal(post(fresh({})).code,'FULL');assert.equal(writes,beforeFull);
assert.equal(locked,false);
// Daily sequence, legacy compatibility, deletion and retry safety (no live writes).
rows.forEach((row,i)=>{rows[i]=Array(26).fill('');});sequenceProperties.clear();quota=100;
testNow='2026-11-03T14:59:59Z';
const numberedFirst=fresh({});const numberedFirstResult=post(numberedFirst);
assert.equal(numberedFirstResult.receiptId,'20261103-001');
const numberedSecond=post(fresh({}));assert.equal(numberedSecond.receiptId,'20261103-002');
const mailCount=mails.length;
assert.equal(post(numberedFirst).receiptId,'20261103-001');assert.equal(mails.length,mailCount);
assert.equal(sequenceProperties.get('receipt-sequence:20261103'),'2','retry does not increment sequence');
testNow='2026-11-03T15:00:00Z';
assert.equal(post(fresh({})).receiptId,'20261104-001','midnight JST resets the day');
assert.equal(post(numberedFirst).receiptId,'20261103-001','next-day retry retains original number');
rows[2]=Array(26).fill('');
assert.equal(post(fresh({})).receiptId,'20261104-002','cleared rows do not permit number reuse');
const oldRequest=fresh({receiptVersion:undefined});const oldResult=post(oldRequest);
assert.equal(oldResult.receiptId,'Y5-'+oldRequest.requestId,'old open forms remain supported');
rows[3][23]=''; // An application created before the new internal column existed.
assert.equal(post({...oldRequest,receiptVersion:2}).receiptId,oldResult.receiptId,'legacy receipt remains valid');
assert.equal(post({...numberedFirst,amount:42}).code,'CONFLICT');
sequenceProperties.set('receipt-sequence:20261104','999');
assert.equal(post(fresh({})).receiptId,'20261104-1000','minimum three digits expands naturally');
assert.ok(mails.at(-1).body.includes('受付番号：20261104-1000'));
console.log('PASS: JST daily numbering, same-day order, next-day retry, deletion safety, legacy compatibility and four-digit sequence');
console.log('PASS: validation, mapping, idempotency, formula protection, totals/privacy, receipt contents, duplicate mail prevention, mail failure and quota handling');
console.log('PASS: closing date JST, retry after close, amount bounds, malformed input, lock contention and capacity');
// Publication choices are separate from message consent, immutable on retry, and never returned by GET.
rows.forEach((row,i)=>{rows[i]=Array(26).fill('');});sequenceProperties.clear();quota=100;
testNow='2026-11-10T12:00:00+09:00';
const publish=fresh({namePublicationVersion:1,namePublicationConsent:'yes',publicationName:'応援サポーター',messageConsent:'no'});
const published=post(publish);
assert.equal(published.ok,true);assert.equal(published.namePublicationSaved,true);
assert.equal(rows[0][24],'掲載してよい');assert.equal(rows[0][25],'応援サポーター');
assert.equal(rows[0][11],'同意しない','message consent remains independent');
assert.ok(mails.at(-1).body.includes('掲載名：応援サポーター'));
assert.equal(post(publish).duplicate,true);
assert.equal(post({...publish,publicationName:'別の表記'}).code,'CONFLICT');
assert.equal(post({...publish,namePublicationConsent:'no',publicationName:''}).code,'CONFLICT');
const decline=post(fresh({namePublicationVersion:1,namePublicationConsent:'no',publicationName:'残してはいけない'}));
assert.equal(decline.ok,true);assert.equal(rows[1][24],'掲載を希望しない');assert.equal(rows[1][25],'');
assert.ok(mails.at(-1).body.includes('掲載を希望しない'));assert.ok(!mails.at(-1).body.includes('残してはいけない'));
const publicationRowCount=rows.filter(row=>row[0]).length;
for(const changes of [
 {namePublicationVersion:1,namePublicationConsent:'yes',publicationName:''},
 {namePublicationVersion:1,namePublicationConsent:'yes',publicationName:' '.repeat(3)},
 {namePublicationVersion:1,namePublicationConsent:'yes',publicationName:'x'.repeat(101)},
 {namePublicationVersion:1,namePublicationConsent:'maybe',publicationName:''},
 {namePublicationVersion:1,namePublicationConsent:'no'},
 {namePublicationConsent:'yes',publicationName:'missing-version'},
 {namePublicationVersion:2,namePublicationConsent:'no',publicationName:''}
])assert.equal(post(fresh(changes)).code,'INVALID');
assert.equal(rows.filter(row=>row[0]).length,publicationRowCount);
const unsafeName=post(fresh({namePublicationVersion:1,namePublicationConsent:'yes',publicationName:'=HYPERLINK("x")'}));
assert.equal(unsafeName.ok,true);assert.ok(rows[2][25].startsWith("'="));
const publicPublicationData=JSON.stringify(context.doGet());
assert.ok(!publicPublicationData.includes('応援サポーター'));assert.ok(!publicPublicationData.includes('掲載してよい'));
assert.ok(!publicPublicationData.includes('publicationName'));assert.ok(!publicPublicationData.includes('namePublicationConsent'));
console.log('PASS: name-publication consent/name validation, legacy unknown, private storage, retry conflicts, mail copy and formula protection');
// Phone is ignored for both old and new forms; existing F values are not changed by retries.
rows.forEach((row,i)=>{rows[i]=Array(26).fill('');});sequenceProperties.clear();quota=100;
testNow='2026-11-13T12:00:00+09:00';
const noPhone=fresh({namePublicationVersion:1,namePublicationConsent:'no',publicationName:''});delete noPhone.phone;
assert.equal(Object.prototype.hasOwnProperty.call(context.validate_(noPhone),'phone'),false);
const noPhoneResult=post(noPhone);assert.equal(noPhoneResult.ok,true);assert.equal(noPhoneResult.mailStatus,'送信済');
assert.equal(rows[0][5],'');assert.equal(rows[0].length,26);
assert.equal(rows[0][6],noPhone.relation);assert.equal(rows[0][8],noPhone.amount);assert.equal(rows[0][9],'琉球銀行');
assert.equal(rows[0][23],noPhone.requestId);assert.equal(rows[0][24],'掲載を希望しない');
for(const [i,phone] of ['',null,12345,'abcdef','=HYPERLINK("phone")',{phone:'legacy-value'}].entries()) {
 const ignored=fresh({phone,email:`phone${i}@example.invalid`});
 assert.equal(Object.prototype.hasOwnProperty.call(context.validate_(ignored),'phone'),false);
 assert.equal(post(ignored).ok,true,'phone input must be ignored regardless of type/format');
 assert.equal(rows[i+1][5],'');
}
rows[0][5]='09000000000'; // Existing record created before phone collection was discontinued.
const phoneRetryWrites=writes,phoneRetryMails=mails.length;
for(const retry of [noPhone,{...noPhone,phone:'changed'},{...noPhone,phone:null}]) {
 const result=post(retry);assert.equal(result.ok,true);assert.equal(result.duplicate,true);assert.equal(result.receiptId,noPhoneResult.receiptId);
}
assert.equal(writes,phoneRetryWrites);assert.equal(mails.length,phoneRetryMails);
assert.equal(rows[0][5],'09000000000','API retries must not clear existing personal data before approved cleanup');
for(const changes of [{name:'別名'},{kana:'ベツメイ'},{email:'changed@example.invalid'},{relation:'地域・一般'},
 {amount:1000},{payment:'okinawa'},{message:'changed'},{messageConsent:'yes'}]) assert.equal(post({...noPhone,...changes}).code,'CONFLICT');
assert.equal(context.doGet().amount,0);assert.ok(!JSON.stringify(context.doGet()).includes('09000000000'));
assert.equal(post({...noPhone,email:'invalid'}).message,'メールアドレスを確認してください。');
console.log('PASS: phoneless requests, ignored phone values, fixed column positions, legacy phone retry compatibility and unchanged conflict/email checks');
