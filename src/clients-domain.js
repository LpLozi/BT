export const CLIENT_KEY='bt_client_tracker_v1';
export const clientDefaults={clients:[],settings:{minimumWage:28000,vatRate:20}};
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const uid=()=>crypto.randomUUID();
export const money=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?Math.round(n*100)/100:0};
export const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00'))&&new Date(s+'T12:00:00').getDate()===Number(s.slice(8));
const moneyFormatter=new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
const dateFormatter=new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric'});
export const TL=n=>moneyFormatter.format(money(n))+' ₺';
export const trDate=s=>validDate(s)?dateFormatter.format(new Date(s+'T12:00:00')):'—';
export function normalizeClientData(raw){
  if(raw==null)return {clients:[],settings:{...clientDefaults.settings}};
  if(typeof raw!=='object'||!Array.isArray(raw.clients)||raw.clients.some(c=>!c||typeof c!=='object'||!c.id||typeof c.name!=='string'||(c.periods!=null&&(!Array.isArray(c.periods)||c.periods.some(p=>!p||typeof p.key!=='string')))||(c.expenses!=null&&(!Array.isArray(c.expenses)||c.expenses.some(e=>!e||!e.id||!validDate(e.date)||typeof e.description!=='string'||!Number.isFinite(Number(e.amount)))))))throw new Error('Müvekkil verisi okunamadı. Mevcut kayıtlar korunuyor.');
  return {...raw,settings:{...clientDefaults.settings,...raw.settings},clients:raw.clients};
}
export function addMonths(ds,m){if(!validDate(ds))return '';const[y,mo,d]=ds.split('-').map(Number),x=new Date(y,mo-1+m,1),last=new Date(x.getFullYear(),x.getMonth()+1,0).getDate();x.setDate(Math.min(d,last));return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`}
export function fee(c,settings){if(c.feeType==='fixed')return money(c.fixedAmount);const base=money(c.minimumWage??settings.minimumWage),multiplier=Number(c.multiplier??1),vat=money(c.vatRate??settings.vatRate);return money(base*(Number.isFinite(multiplier)?multiplier:1)*(1+vat/100))}
export function periodsFor(c,settings,day=today()){
  if(!validDate(c.startDate)||!validDate(c.firstDueDate)||!validDate(day))return [];
  const out=[],savedByKey=new Map(),defaultAmount=fee(c,settings);
  for(const p of c.periods||[])if(p&&!savedByKey.has(p.key))savedByKey.set(p.key,p);
  const months=(Number(day.slice(0,4))-Number(c.startDate.slice(0,4)))*12+Number(day.slice(5,7))-Number(c.startDate.slice(5,7));
  // Generate only periods which have started. Never truncate a client's older history.
  for(let i=0;i<=months;i++){
    const start=addMonths(c.startDate,i);if(start>day)break;
    const end=addMonths(c.firstDueDate,i),key=start+'_'+end,saved=savedByKey.get(key)||{};
    const amount=money(saved.amount??defaultAmount),paidAmount=money(saved.paidAmount),due=validDate(saved.due)?saved.due:end;
    const status=paidAmount>=amount&&amount>0?'paid':paidAmount>0?'partial':due<day?'late':due===day?'due':'upcoming';
    out.push({...saved,key,start,end,due,amount,paidAmount,status});
  }
  return out;
}
export function expensesFor(c,day=today(),month=''){
  return (c.expenses||[]).filter(e=>e&&validDate(e.date)&&e.date<=day&&(!month||e.date.startsWith(month))).map(e=>({...e,amount:money(e.amount),paidAmount:money(e.paidAmount)})).sort((a,b)=>b.date.localeCompare(a.date));
}
const rowCache=new WeakMap();
export function clientRow(c,settings,day){
  const cached=rowCache.get(c);
  if(cached&&cached.day===day&&cached.minimumWage===settings.minimumWage&&cached.vatRate===settings.vatRate)return cached.row;
  const ps=periodsFor(c,settings,day),expenses=expensesFor(c,day);
  let accrued=0,paid=0,late=0;
  for(const p of ps){if(p.due>day)continue;accrued+=p.amount;paid+=p.paidAmount;if(p.due<day)late+=Math.max(0,p.amount-p.paidAmount)}
  const expenseTotal=money(expenses.reduce((s,e)=>s+e.amount,0)),expensePaid=money(expenses.reduce((s,e)=>s+e.paidAmount,0));
  const row={...c,ps,accrued:money(accrued),paid:money(paid),feeBalance:money(accrued-paid),expenseTotal,expensePaid,expenseBalance:money(expenseTotal-expensePaid),balance:money(accrued-paid+expenseTotal-expensePaid),late:money(late)};
  rowCache.set(c,{day,minimumWage:settings.minimumWage,vatRate:settings.vatRate,row});return row;
}
export const statusLabel=s=>({paid:'Ödendi',partial:'Kısmi',late:'Gecikmiş',due:'Bugün',upcoming:'Dönem devam ediyor'}[s]||s);
