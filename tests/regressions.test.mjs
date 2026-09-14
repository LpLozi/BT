import test from 'node:test';
import assert from 'node:assert/strict';
import {periodsFor,clientRow,expensesFor,fee,validDate} from '../src/clients-domain.js';
import {normalizeData,defaultData,expandRec,makeInstallment,periodRange,periodFor,isReferenced,carryCalc} from '../src/domain.js';
import {pdfHtml} from '../src/clients-export.js';
import * as storage from '../src/storage.js';
const settings={minimumWage:28000,vatRate:20};
const client={id:'c',name:'Deneme',startDate:'2026-08-19',firstDueDate:'2026-09-19',feeType:'fixed',fixedAmount:100,periods:[]};
test('a new period appears on its start day, not before',()=>{
 assert.deepEqual(periodsFor(client,settings,'2026-09-18').map(p=>p.start),['2026-08-19']);
 assert.deepEqual(periodsFor(client,settings,'2026-09-19').map(p=>[p.start,p.end]),[['2026-08-19','2026-09-19'],['2026-09-19','2026-10-19']]);
 assert.equal(periodsFor({...client,startDate:'2026-10-19'},settings,'2026-09-19').length,0);
});
test('old, future and unmatched saved records survive without mutation',()=>{
 const c={...client,periods:[{key:'2026-09-19_2026-10-19',paidAmount:75,note:'future saved'},{key:'unmatched',amount:123}]};const before=JSON.stringify(c);
 assert.equal(periodsFor(c,settings,'2026-09-18').length,1);
 assert.equal(periodsFor(c,settings,'2026-09-19')[1].paidAmount,75);assert.equal(JSON.stringify(c),before);
 assert(periodsFor({...client,startDate:'2010-01-19',firstDueDate:'2010-02-19'},settings,'2026-09-19').length>120);
});
test('invalid dates do not crash; month end uses anchored dates',()=>{
 assert.equal(validDate('2026-02-30'),false);assert.equal(periodsFor({...client,startDate:'bad'},settings).length,0);
 const c={...client,startDate:'2024-01-31',firstDueDate:'2024-02-29'};assert.equal(periodsFor(c,settings,'2024-03-31')[2].start,'2024-03-31');
});
test('current partial payments are not overdue; zero fee inputs respected',()=>{
 const c={...client,periods:[{key:'2026-08-19_2026-09-19',paidAmount:25}]};assert.equal(clientRow(c,settings,'2026-09-19').late,0);assert.equal(clientRow(c,settings,'2026-09-20').late,75);
 assert.equal(fee({...client,feeType:'minimum',multiplier:0},settings),0);
});
test('monthly expenses, reimbursements and balance remain separate from fees',()=>{
 const c={...client,expenses:[{id:'e',date:'2026-09-10',description:'Harç',amount:250.5,paidAmount:50},{id:'older',date:'2026-08-10',amount:10},{id:'future',date:'2026-10-10',amount:999}]};
 const row=clientRow(c,settings,'2026-09-19');assert.equal(row.expenseTotal,260.5);assert.equal(row.expenseBalance,210.5);assert.equal(row.feeBalance,100);assert.equal(row.balance,310.5);assert.equal(expensesFor(c,'2026-09-19','2026-09').length,1);
 assert.strictEqual(row,clientRow(c,{...settings},'2026-09-19'));assert.notStrictEqual(row,clientRow(c,settings,'2026-09-20'));
});
test('client PDF includes expenses safely, excludes internal notes and future periods',()=>{
 const c={...client,notes:'PRIVATE',expenses:[{id:'e',date:'2026-09-10',description:'<script>test</script>',amount:250,paidAmount:0}]};
 const html=pdfHtml(c,settings,{day:'2026-09-18'});assert(html.includes('&lt;script&gt;test&lt;/script&gt;'));assert(!html.includes('PRIVATE'));assert(!html.includes('19 Ekim'));
 const monthly=pdfHtml(c,settings,{day:'2026-09-18',month:'2026-08',expensesOnly:true});assert(!monthly.includes('test&lt;'));assert(!monthly.includes('Başlamış hizmet'));
});
test('recurring dates do not drift and pausing preserves recorded history',()=>{
 const r={id:'r',start:'2026-01-31',count:4,amount:1};assert.deepEqual(expandRec([r]).map(t=>t.date),['2026-01-31','2026-02-28','2026-03-31','2026-04-30']);
 assert.deepEqual(expandRec([{...r,active:false,pausedAt:'2026-03-01'}]).map(t=>t.date),['2026-01-31','2026-02-28']);
 assert.equal(expandRec([{...r,count:Infinity}]).length,240);
});
test('installment totals are exact to cents and runaway counts are bounded',()=>{
 const i=makeInstallment({amount:100,count:3,date:'2026-01-31'});assert.equal(i.items.reduce((s,x)=>s+Math.round(x.amount*100),0),10000);assert.equal(i.items[2].date,'2026-03-31');assert.equal(makeInstallment({amount:100,count:Infinity,date:'2026-01-01'}).items.length,240);
});
test('custom period boundaries are contiguous and select the correct period',()=>{
 const s={periodDay:25,overrides:{'2026-8':19}};assert.deepEqual(periodRange(2026,7,s),['2026-08-25','2026-09-18']);assert.deepEqual(periodRange(2026,8,s),['2026-09-19','2026-10-24']);assert.deepEqual(periodFor('2026-09-20',s),{y:2026,m:8});
 const d=normalizeData({...defaultData,settings:s});assert.equal(carryCalc([{date:'2026-09-19',type:'gelir',amount:100}],2026,8,d),0);
});
test('trash references prevent orphaning a category or account',()=>{
 const d=normalizeData({...defaultData,trash:[{deletedAt:new Date().toISOString(),payload:{cat:'custom',acc:'custom'}}]});assert(isReferenced(d,'cat','custom'));assert(isReferenced(d,'acc','custom'));
});
const memory=new Map();let failWrites=false;
globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>{if(failWrites)throw new Error('quota');memory.set(k,String(v))},removeItem:k=>memory.delete(k)};
test('legacy migration is lossless and removes old storage only after successful save',()=>{
 memory.clear();const legacy={clients:[{...client,periods:[{key:'future',paidAmount:9}]}],settings};memory.set('BT_DATA',JSON.stringify({...defaultData,tx:[{id:'existing',amount:10,date:'2026-09-01',type:'gelir'}]}));memory.set('bt_client_tracker_v1',JSON.stringify(legacy));
 const d=storage.loadPlainData();assert.deepEqual(d.clientTracker,legacy);assert.equal(d.tx[0].id,'existing');assert(memory.has('bt_client_tracker_v1'));
 failWrites=true;assert.equal(storage.savePlainData(d),false);assert(memory.has('bt_client_tracker_v1'));failWrites=false;assert(storage.savePlainData(d));assert(!memory.has('bt_client_tracker_v1'));assert.deepEqual(storage.loadPlainData().clientTracker,legacy);
});
test('corrupt existing data is left untouched',()=>{memory.clear();memory.set('BT_DATA','{broken');assert.throws(()=>storage.loadPlainData());assert.equal(memory.get('BT_DATA'),'{broken');});
test('old backup import preserves clients, new backup includes expenses',()=>{
 const ct={clients:[{...client,expenses:[{id:'e',date:'2026-09-01',description:'Harç',amount:100}]}],settings};const old=storage.parseBackup(JSON.stringify(defaultData),ct);assert.deepEqual(old.clientTracker,ct);assert.deepEqual(storage.parseBackup(JSON.stringify({format:'bt-backup',payload:old})).clientTracker,ct);
 assert.throws(()=>storage.parseBackup('{"format":"bt-backup","payload":{}}'));
});
test('large encrypted payloads, wrong PIN and migration round trip',async()=>{
 memory.clear();const data=normalizeData({...defaultData,clientTracker:{clients:[{...client,notes:'x'.repeat(300000)}],settings}});
 const payload=await storage.encryptPayload(data,'1234');const decrypted=await storage.decryptPayload(payload,'1234');assert.equal(decrypted.clientTracker.clients[0].notes.length,300000);await assert.rejects(storage.decryptPayload(payload,'0000'));
 memory.set('bt_client_tracker_v1',JSON.stringify({clients:[client],settings}));await storage.enableSecureStorage(data,'1234');assert(!memory.has('BT_DATA'));assert(!memory.has('bt_client_tracker_v1'));assert.equal((await storage.unlockSecure('1234')).clientTracker.clients[0].notes.length,300000);
 await storage.disableSecureStorage(data);assert(!storage.hasSecureStorage());assert.equal(storage.loadPlainData().clientTracker.clients[0].notes.length,300000);
});
test('a slower earlier encrypted save cannot overwrite newer data or re-enable a disabled lock',async()=>{
 memory.clear();const a=normalizeData({...defaultData,tx:[{id:'a',amount:1,date:'2026-09-01',type:'gelir'}]}),b=normalizeData({...defaultData,tx:[{id:'b',amount:2,date:'2026-09-01',type:'gelir'}]});await Promise.all([storage.saveSecureData(a,'1234'),storage.saveSecureData(b,'1234')]);assert.equal((await storage.unlockSecure('1234')).tx[0].id,'b');
 const pending=storage.saveSecureData(a,'1234');await storage.disableSecureStorage(b);await pending;assert(!storage.hasSecureStorage());assert.equal(storage.loadPlainData().tx[0].id,'b');
});
