export const APP_VERSION='2.0.0';
export const defaultCategories=[
['market','Market','🛒'],['kira','Kira','🏠'],['elektrik','Elektrik','💡'],['su','Su','🚰'],['dogalgaz','Doğalgaz','🔥'],['internet','İnternet','🌐'],['telefon','Telefon','☎️'],['aidat','Aidat','🏢'],['diger_fatura','Diğer Fatura','📄'],['ulasim','Ulaşım','🚗'],['akaryakit','Akaryakıt','⛽'],['saglik','Sağlık','💊'],['eglence','Eğlence','🎬'],['giyim','Giyim','👕'],['restoran','Restoran/Kafe','🍽️'],['egitim','Eğitim','📚'],['abonelik','Abonelik','📱'],['ev_esyasi','Ev Eşyası','🛋️'],['kisisel_bakim','Kişisel Bakım','💇'],['evcil_hayvan','Evcil Hayvan','🐾'],['hediye','Hediye','🎁'],['seyahat','Seyahat','✈️'],['spor','Spor','🏋️'],['vergi_borc','Vergi/Borç','🧾'],['bagis','Bağış','❤️'],['diger_gider','Diğer','➖']
].map(([id,label,icon])=>({id,label,icon,type:'gider'})).concat([
['maas','Maaş','💰'],['ek_gelir','Ek Gelir','💵'],['yatirim','Yatırım','📈'],['diger_gelir','Diğer','➕']
].map(([id,label,icon])=>({id,label,icon,type:'gelir'})));

export const defaultData={
 schemaVersion:2,
 tx:[],
 cats:defaultCategories,
 accounts:[{id:'nakit',name:'Nakit',icon:'💵',kind:'cash'},{id:'kart',name:'Kredi Kartı',icon:'💳',kind:'card'}],
 settings:{periodDay:25,overrides:{}},
 installments:[],recurring:[],budgets:{},trash:[],
 prefs:{lastAcc:'nakit',lastExpenseCat:'market',lastIncomeCat:'maas'}
};

export const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
export const isoLocal=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const today=()=>isoLocal(new Date());
export const TL=n=>(Number(n)||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
export const validAmount=v=>Number.isFinite(Number(v))&&Number(v)>0;
export const clampDay=n=>Math.max(1,Math.min(28,Number(n)||25));

export function addMonths(ds,m){
 const [y,mo,d]=String(ds).split('-').map(Number); if(!y||!mo||!d)return ds;
 const base=new Date(y,mo-1+m,1); const last=new Date(base.getFullYear(),base.getMonth()+1,0).getDate();
 base.setDate(Math.min(d,last)); return isoLocal(base);
}
export function addDays(ds,n){const [y,m,d]=String(ds).split('-').map(Number);const x=new Date(y,m-1,d);x.setDate(x.getDate()+n);return isoLocal(x)}
export function periodOf(ds,day){const [y0,m0,d0]=String(ds).split('-').map(Number);let y=y0,m=m0-1;day=clampDay(day);if(d0<day){m--;if(m<0){m=11;y--}}return{y,m,key:`${y}-${m}`}}
export function pRange(y,m,day){day=clampDay(day);const s=new Date(y,m,day),e=new Date(y,m+1,day-1);return[isoLocal(s),isoLocal(e)]}
export function periodLabel(y,m){return new Date(y,m,1).toLocaleDateString('tr-TR',{month:'long',year:'numeric'})}
export function sum(list,type){return list.filter(x=>!type||x.type===type).reduce((s,x)=>s+Number(x.amount||0),0)}
export function cat(data,id){return data.cats.find(c=>c.id===id)||{id:'unknown',label:'Bilinmeyen',icon:'❓',type:'gider'}}
export function acc(data,id){return data.accounts.find(a=>a.id===id)||{id:'unknown',name:'Bilinmeyen Hesap',icon:'💼'}}
export function inCurrentWeek(ds){const now=new Date(),day=(now.getDay()+6)%7,s=new Date(now);s.setDate(now.getDate()-day);const e=new Date(s);e.setDate(s.getDate()+6);return ds>=isoLocal(s)&&ds<=isoLocal(e)}

export function expandInst(inst){
 const out=[]; (inst||[]).forEach(i=>{const cutoff=i.status==='active'?null:(i.completedAt||today());(i.items||[]).forEach((it,k)=>{if(cutoff&&it.date>cutoff)return;out.push({id:`${i.id}-${k}`,parent:i.id,type:i.type,cat:i.cat,acc:i.acc,amount:Number(it.amount),date:it.date,note:`${i.note||'Taksit'} · ${k+1}/${i.items.length}`,auto:true,inst:true})})});return out
}
export function expandRec(rec){
 const out=[];(rec||[]).filter(r=>r.active!==false).forEach(r=>{let d=r.start;for(let c=0;c<Math.max(0,Number(r.count)||24);c++,d=addMonths(d,1)){out.push({id:`${r.id}-${c}`,parent:r.id,type:r.type,cat:r.cat,acc:r.acc,amount:Number(r.amount),date:d,note:`${r.note||'Tekrarlayan'} · otomatik`,auto:true,rec:true})}});return out
}
export function allTransactions(data){return [...(data.tx||[]),...expandInst(data.installments),...expandRec(data.recurring)].sort((a,b)=>b.date.localeCompare(a.date))}
export function carryCalc(tx,y,m,data){
 let min=periodOf(today(),data.settings.periodDay); tx.forEach(t=>{const p=periodOf(t.date,data.settings.periodDay);if(p.y*12+p.m<min.y*12+min.m)min=p});let c=0;
 for(let yy=min.y,mm=min.m;yy*12+mm<y*12+m;mm++){if(mm>11){mm=0;yy++}const [s,e]=pRange(yy,mm,data.settings.overrides?.[`${yy}-${mm}`]||data.settings.periodDay),l=tx.filter(t=>t.date>=s&&t.date<=e);c=Math.max(0,c+sum(l,'gelir')-sum(l,'gider'))}return c
}
export function categorySpend(list){return Object.entries(list.filter(t=>t.type==='gider').reduce((a,t)=>(a[t.cat]=(a[t.cat]||0)+Number(t.amount||0),a),{})).sort((a,b)=>b[1]-a[1])}
export function accountStats(data,list){return data.accounts.map(a=>{const rows=list.filter(t=>t.acc===a.id),income=sum(rows,'gelir'),expense=sum(rows,'gider');return{...a,income,expense,net:income-expense}})}
export function makeInstallment(form){
 const total=Number(form.amount),count=Math.max(2,Math.floor(Number(form.count)||2));const cents=Math.round(total*100),base=Math.floor(cents/count),items=[];let used=0;
 for(let i=0;i<count;i++){const part=i===count-1?cents-used:base;used+=part;items.push({date:addMonths(form.date,i),amount:part/100})}
 return{id:uid(),type:form.type,cat:form.cat,acc:form.acc,amount:total,date:form.date,note:form.note||'',count,items,status:'active'}
}
export function next30DaysObligations(data){const start=today(),end=addDays(start,30);return [...expandInst(data.installments),...expandRec(data.recurring)].filter(t=>t.type==='gider'&&t.date>=start&&t.date<=end).sort((a,b)=>a.date.localeCompare(b.date))}
export function isReferenced(data,kind,id){
 if(kind==='cat')return [...data.tx,...data.installments,...data.recurring].some(x=>x.cat===id);
 if(kind==='acc')return [...data.tx,...data.installments,...data.recurring].some(x=>x.acc===id);return false
}
export function purgeExpiredTrash(trash,days=30){const cutoff=Date.now()-days*86400000;return (trash||[]).filter(x=>new Date(x.deletedAt).getTime()>=cutoff)}
export function normalizeData(raw){
 const d=raw&&typeof raw==='object'?raw:{};const cats=Array.isArray(d.cats)&&d.cats.length?d.cats:defaultCategories;const accounts=Array.isArray(d.accounts)&&d.accounts.length?d.accounts:defaultData.accounts;
 return{schemaVersion:2,tx:Array.isArray(d.tx)?d.tx:[],cats,accounts,settings:{periodDay:clampDay(d.settings?.periodDay),overrides:{...(d.settings?.overrides||{})}},installments:Array.isArray(d.installments)?d.installments.map(i=>({...i,status:i.status||'active',items:Array.isArray(i.items)?i.items:[]})):[],recurring:Array.isArray(d.recurring)?d.recurring.map(r=>({...r,active:r.active!==false})):[],budgets:d.budgets&&typeof d.budgets==='object'?d.budgets:{},trash:purgeExpiredTrash(Array.isArray(d.trash)?d.trash:[]),prefs:{...defaultData.prefs,...(d.prefs||{})}}
}