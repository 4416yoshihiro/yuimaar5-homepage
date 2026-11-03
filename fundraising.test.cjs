// Run with Node.js. No browser, network requests, or real email is used here.
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
function element() {
 return {textContent:'', value:'', hidden:true, disabled:false, style:{}, dataset:{}, children:[], listeners:{},
  classList:{toggle(){},remove(){}}, setAttribute(){}, focus(){},
  addEventListener(name,fn){this.listeners[name]=fn;},
  replaceChildren(){this.children=[];}, appendChild(child){this.children.push(child);},
  showModal(){this.open=true;}, close(){this.open=false;}};
}
function setup() {
 const ids=new Map(), selectors=new Map();
 const get=id=>{if(!ids.has(id))ids.set(id,element());return ids.get(id);};
 const query=s=>{if(!selectors.has(s))selectors.set(s,element());return selectors.get(s);};
 const buttons=[1000,3000,5000,10000].map(n=>Object.assign(element(),{dataset:{amount:String(n)}}));
 const stats=Array.from({length:4},element), banners=[element(),element()];
 const form=get('fundraisingForm');form.elements=[element(),element()];form.elements.payment={value:'ryukyu'};form.querySelector=query;
 const payload={name:'テスト',kana:'テスト',email:'test@example.invalid',phone:'00000000000',relation:'SNSファン',payment:'ryukyu',message:'',website:''};
 const posts=[];let response=async body=>({ok:true,receiptId:'Y5-'+body.requestId,mailStatus:'送信済'});
 const publicData={ok:true,amount:0,supporters:0,messages:[]};
 const context=vm.createContext({
  window:{FUNDRAISING_CONFIG:{apiUrl:'https://script.google.com/macros/s/test/exec'}},
  document:{getElementById:get,querySelector:query,querySelectorAll:s=>s==='[data-amount]'?buttons:s==='.stat-val'?stats:banners,
   createElement:element,createTextNode:text=>({textContent:text})},
  FormData:class{constructor(){return Object.entries(payload);}},
  crypto:{randomUUID},AbortController,setTimeout,clearTimeout,
  navigator:{clipboard:{writeText:async()=>{}}},
  fetch:async(url,options)=>{
   const data=options.method==='POST'?(posts.push(JSON.parse(options.body)),await response(JSON.parse(options.body))):publicData;
   return {ok:true,json:async()=>data};
  }
 });
 vm.runInContext(readFileSync(__dirname+'/fundraising.js','utf8'),context);
 return {get,query,form,buttons,stats,posts,publicData,context,payload,setResponse:fn=>response=fn,
  submit:()=>form.listeners.submit({preventDefault(){}})};
}
(async()=>{
 const app=setup();await app.context.refreshPublicData();
 app.publicData.amount=4500;await app.context.refreshPublicData();
 assert.equal(app.stats[1].textContent,'0.5 %','halfway percentage must match the sheet');
 app.publicData.amount=999499;await app.context.refreshPublicData();assert.equal(app.stats[1].textContent,'99.9 %');
 app.publicData.amount=1000500;await app.context.refreshPublicData();
 assert.equal(app.stats[1].textContent,'100.1 %');assert.equal(app.query('.progress-bar').style.width,'100%');
 app.publicData.messages=['<img src=x onerror=alert(1)>'];await app.context.refreshPublicData();
 assert.equal(app.get('message-list-container').children[0].textContent,app.publicData.messages[0]);
 await app.submit();assert.equal(app.posts.length,0,'no amount must not send');
 app.buttons[1].listeners.click();
 app.setResponse(async()=>{throw Error('Network failure');});await app.submit();
 assert.equal(app.get('paymentDialog').open,undefined,'failed requests must not show success');
 assert.match(app.get('form-status').textContent,/完了を確認できていません/);
 assert.ok(app.form.elements.every(el=>!el.disabled),'retry must remain usable');
 const requestId=app.posts[0].requestId;
 app.setResponse(async body=>({ok:true,receiptId:'wrong',mailStatus:'送信済'}));await app.submit();
 assert.equal(app.get('paymentDialog').open,undefined,'wrong receipt must not show success');
 assert.equal(app.posts[1].requestId,requestId,'same payload retry keeps its request ID');
 let release;app.setResponse(body=>new Promise(resolve=>{release=()=>resolve({ok:true,receiptId:'Y5-'+body.requestId,mailStatus:'送信失敗'});}));
 const waiting=app.submit();await app.submit();assert.equal(app.posts.length,3,'double submit must not add a request');
 release();await waiting;
 assert.equal(app.get('paymentDialog').open,true,'saved application survives mail failure');
 assert.match(app.query('#paymentDialog .form-note').textContent,/お申し込みは保存済み/);
 assert.equal(app.get('receipt-id').textContent,'Y5-'+requestId);
 assert.equal(app.get('modal-amount').textContent,'¥3,000');
 assert.ok(app.get('bank-info').children.some(el=>el.textContent==='普通口座：0542458'));
 app.buttons[2].listeners.click();
 app.setResponse(async body=>({ok:true,receiptId:'Y5-'+body.requestId,mailStatus:'送信済'}));await app.submit();
 assert.notEqual(app.posts[3].requestId,requestId,'changed application must get a new ID');
 assert.match(app.query('#paymentDialog .form-note').textContent,/控えメールを送信しました/);
 console.log('PASS: percentage rounding, progress cap, safe message rendering, no amount, network failure, receipt mismatch, retry ID, double submit, mail failure and success');
})().catch(error=>{console.error(error);process.exitCode=1;});
