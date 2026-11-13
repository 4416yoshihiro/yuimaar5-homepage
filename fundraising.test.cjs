// Run with Node.js. No browser, network requests, or real email is used here.
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const html=readFileSync(__dirname+'/fundraising.html','utf8');
const formMarkup=html.match(/<form\b[^>]*\bid="fundraisingForm"[^>]*>([\s\S]*?)<\/form>/)[1];
const formFieldNames=new Set([...formMarkup.matchAll(/<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"[^>]*>/g)].map(match=>match[1]));
assert.equal(formFieldNames.has('phone'),false,'the actual HTML form must not collect phone numbers');
assert.doesNotMatch(formMarkup,/(?:for|id)="phone"|type="tel"|autocomplete="tel"|電話番号/,'remove the phone label and input together');
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
 const stats=Array.from({length:4},element), banners=[element(),element()], publicationChoices=[element(),element()];
 const form=get('fundraisingForm');form.elements=[element(),element()];form.elements.payment={value:'ryukyu'};form.elements.namePublicationConsent={value:'no'};form.querySelector=query;
 // Keep an old phone fixture so the HTML-derived FormData would expose a reintroduced phone control.
 const payload={name:'テスト',kana:'テスト',email:'test@example.invalid',phone:'00000000000',relation:'SNSファン',payment:'ryukyu',message:'',website:''};
 const posts=[];let response=async body=>({ok:true,receiptId:'Y5-'+body.requestId,namePublicationSaved:true,mailStatus:'送信済'});
 const publicData={ok:true,amount:0,supporters:0,messages:[],namePublicationVersion:1};
 const context=vm.createContext({
  window:{FUNDRAISING_CONFIG:{apiUrl:'https://script.google.com/macros/s/test/exec'}},
  document:{getElementById:get,querySelector:query,querySelectorAll:s=>s==='[data-amount]'?buttons:s==='.stat-val'?stats:s==='[name="namePublicationConsent"]'?publicationChoices:banners,
   createElement:element,createTextNode:text=>({textContent:text})},
  FormData:class{constructor(){return Object.entries(payload).filter(([name])=>formFieldNames.has(name));}},
  crypto:{randomUUID},AbortController,setTimeout,clearTimeout,
  navigator:{clipboard:{writeText:async()=>{}}},
  fetch:async(url,options)=>{
   const data=options.method==='POST'?(posts.push(JSON.parse(options.body)),await response(JSON.parse(options.body))):publicData;
   return {ok:true,json:async()=>data};
  }
 });
 vm.runInContext(readFileSync(__dirname+'/fundraising.js','utf8'),context);
 return {get,query,form,buttons,stats,publicationChoices,posts,publicData,context,payload,setResponse:fn=>response=fn,
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
 app.setResponse(async body=>({ok:true,receiptId:'wrong',namePublicationSaved:true,mailStatus:'送信済'}));await app.submit();
 assert.equal(app.get('paymentDialog').open,undefined,'wrong receipt must not show success');
 assert.equal(app.posts[1].requestId,requestId,'same payload retry keeps its request ID');
 let release;app.setResponse(body=>new Promise(resolve=>{release=()=>resolve({ok:true,receiptId:'Y5-'+body.requestId,namePublicationSaved:true,mailStatus:'送信失敗'});}));
 const waiting=app.submit();await app.submit();assert.equal(app.posts.length,3,'double submit must not add a request');
 release();await waiting;
 assert.equal(app.get('paymentDialog').open,true,'saved application survives mail failure');
 assert.match(app.query('#paymentDialog .form-note').textContent,/お申し込みは保存済み/);
 assert.equal(app.get('receipt-id').textContent,'Y5-'+requestId);
 assert.equal(app.get('modal-amount').textContent,'¥3,000');
 assert.ok(app.get('bank-info').children.some(el=>el.textContent==='普通口座：0542458'));
 app.buttons[2].listeners.click();
 app.setResponse(async body=>({ok:true,receiptId:'20261104-001',requestId:body.requestId,namePublicationSaved:true,mailStatus:'送信済'}));await app.submit();
 assert.notEqual(app.posts[3].requestId,requestId,'changed application must get a new ID');
 assert.equal(app.posts[3].receiptVersion,2);
 for(const submitted of app.posts) {
  assert.equal(Object.prototype.hasOwnProperty.call(submitted,'phone'),false,'POST payload must not contain phone');
  for(const name of ['name','kana','email','relation','payment','message','website']) assert.equal(submitted[name],app.payload[name],'keep the other form fields');
 }
 assert.equal(app.get('receipt-id').textContent,'20261104-001');
 const mismatch=setup();await mismatch.context.refreshPublicData();mismatch.buttons[0].listeners.click();
 mismatch.setResponse(async()=>({ok:true,receiptId:'20261104-002',requestId:randomUUID(),namePublicationSaved:true,mailStatus:'送信済'}));
 await mismatch.submit();assert.equal(mismatch.get('paymentDialog').open,undefined,'receipt for another request must be rejected');
 assert.match(app.query('#paymentDialog .form-note').textContent,/控えメールを送信しました/);
 const publication=setup();await publication.context.refreshPublicData();publication.buttons[0].listeners.click();
 publication.form.elements.namePublicationConsent.value='';publication.publicationChoices[0].listeners.change();
 assert.equal(publication.get('publication-name-group').hidden,true);
 await publication.submit();assert.equal(publication.posts.length,0,'explicit publication choice is required');
 publication.form.elements.namePublicationConsent.value='yes';publication.publicationChoices[0].listeners.change();
 assert.equal(publication.get('publication-name-group').hidden,false);assert.equal(publication.get('publication-name').required,true);
 await publication.submit();assert.equal(publication.posts.length,0,'allowed publication requires a name');
 publication.get('publication-name').value='  応援サポーター  ';
 await publication.submit();assert.equal(publication.posts[0].publicationName,'応援サポーター');
 assert.equal(publication.posts[0].namePublicationConsent,'yes');assert.equal(publication.posts[0].namePublicationVersion,1);
 assert.match(publication.get('name-publication-summary').textContent,/掲載名：応援サポーター/);
 publication.form.elements.namePublicationConsent.value='no';publication.publicationChoices[1].listeners.change();
 assert.equal(publication.get('publication-name').value,'');assert.equal(publication.get('publication-name').disabled,true);
 await publication.submit();assert.equal(publication.posts[1].publicationName,'');assert.equal(publication.posts[1].namePublicationConsent,'no');
 assert.match(publication.get('name-publication-summary').textContent,/掲載を希望しない/);
 const unconfirmed=setup();await unconfirmed.context.refreshPublicData();unconfirmed.buttons[0].listeners.click();
 unconfirmed.setResponse(async body=>({ok:true,receiptId:'Y5-'+body.requestId,mailStatus:'送信済'}));
 await unconfirmed.submit();assert.equal(unconfirmed.get('paymentDialog').open,undefined,'old backend must not silently discard publication choice');
 const outdated=setup();outdated.publicData.namePublicationVersion=undefined;await outdated.context.refreshPublicData();
 outdated.buttons[0].listeners.click();await outdated.submit();
 assert.equal(outdated.posts.length,0,'do not POST publication choices to an API that cannot store them');
 assert.equal(outdated.query('.submit-btn').disabled,true);
 assert.ok(publication.posts.every(submitted=>!Object.prototype.hasOwnProperty.call(submitted,'phone')),'both publication choices must omit phone');
 console.log('PASS: actual HTML has no phone label/control; HTML-derived FormData and POST payloads omit phone while retaining other fields');
 console.log('PASS: explicit name-publication choices, conditional name validation, clearing declined names, payload/receipt summary and save acknowledgement');
 console.log('PASS: percentage rounding, progress cap, safe message rendering, no amount, network failure, receipt mismatch, retry ID, double submit, mail failure and success');
})().catch(error=>{console.error(error);process.exitCode=1;});
