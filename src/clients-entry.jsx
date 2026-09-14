import React,{memo,useCallback,useEffect,useMemo,useState}from'react';
import{createRoot}from'react-dom/client';
import'./clients.css';

const KEY='bt_client_tracker_v1';
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const moneyFormatter=new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
const dateFormatter=new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric'});
const TL=n=>moneyFormatter.format(Number(n)||0)+' ₺';
const trDate=s=>s?dateFormatter.format(new Date(s+'T12:00:00')):'—';
const EMPTY_CLIENTS=[];
const PAGE_SIZE=24;
// Refresh memoized balances at local midnight and when returning to the app.
function useToday(){
  const [day,setDay]=useState(today);
  useEffect(()=>{
    let timer;
    function refresh(){
      setDay(today());
      clearTimeout(timer);
      const now=new Date();
      timer=setTimeout(refresh,new Date(now.getFullYear(),now.getMonth(),now.getDate()+1)-now+100);
    }
    refresh();
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',refresh);
    return()=>{clearTimeout(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)};
  },[]);
  return day;
}
function addMonths(ds,m){const[y,mo,d]=ds.split('-').map(Number),x=new Date(y,mo-1+m,1),last=new Date(x.getFullYear(),x.getMonth()+1,0).getDate();x.setDate(Math.min(d,last));return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`}
function load(){try{return JSON.parse(localStorage.getItem(KEY))||{clients:[],settings:{minimumWage:28000,vatRate:20}}}catch{return{clients:[],settings:{minimumWage:28000,vatRate:20}}}}
function fee(c,settings){if(c.feeType==='fixed')return Number(c.fixedAmount)||0;const base=Number(c.minimumWage||settings.minimumWage)||0,m=Number(c.multiplier)||1,vat=Number(c.vatRate??settings.vatRate)||0;return base*m*(1+vat/100)}
function periodsFor(c,settings,day=today()){
  if(!c.startDate||!c.firstDueDate)return[];
  const out=[],limit=addMonths(day,3),savedByKey=new Map(),defaultAmount=fee(c,settings);
  // Match the original first-entry-wins behavior without scanning on every month.
  for(const p of c.periods||[])if(!savedByKey.has(p.key))savedByKey.set(p.key,p);
  // Keep the existing horizon and keys so balances and saved history are unchanged.
  for(let i=0;i<120;i++){
    const start=addMonths(c.startDate,i);
    if(start>limit)break;
    const end=addMonths(c.firstDueDate,i),due=end,key=start+'_'+end;
    const saved=savedByKey.get(key)||{},amount=saved.amount??defaultAmount,paid=Number(saved.paidAmount)||0;
    let status='upcoming';
    if(paid>=amount&&amount>0)status='paid';
    else if(paid>0)status='partial';
    else if(due<day)status='late';
    else if(due===day)status='due';
    out.push({key,start,end,due,amount,...saved,paidAmount:paid,status});
  }
  return out;
}
// Entries are reclaimed with their source client; editing one client reuses the others.
const rowCache=new WeakMap();
function clientRow(c,settings,day){
  const cached=rowCache.get(c);
  if(cached&&cached.day===day&&cached.minimumWage===settings.minimumWage&&cached.vatRate===settings.vatRate)return cached.row;
  const ps=periodsFor(c,settings,day);
  let accrued=0,paid=0,late=0;
  for(const p of ps){
    if(p.due>day)continue;
    accrued+=Number(p.amount||0);
    paid+=Number(p.paidAmount||0);
    if(p.status==='late'||p.status==='partial')late+=Math.max(0,p.amount-p.paidAmount);
  }
  const row={...c,ps,accrued,paid,balance:accrued-paid,late};
  rowCache.set(c,{day,minimumWage:settings.minimumWage,vatRate:settings.vatRate,row});
  return row;
}
function statusLabel(s){return{paid:'Ödendi',partial:'Kısmi',late:'Gecikmiş',due:'Bugün',upcoming:'Vadesi Gelmedi'}[s]||s}

function ClientTracker(){const[open,setOpen]=useState(false),[state,setState]=useState(load),[selected,setSelected]=useState(null),[edit,setEdit]=useState(null),[periodEdit,setPeriodEdit]=useState(null),[query,setQuery]=useState('');useEffect(()=>localStorage.setItem(KEY,JSON.stringify(state)),[state]);const day=useToday();
const clients=state.clients||EMPTY_CLIENTS;
const rows=useMemo(()=>open?clients.map(c=>clientRow(c,state.settings,day)):[],[open,clients,state.settings,day]);
const filtered=useMemo(()=>{
  const search=query.toLocaleLowerCase('tr-TR');
  return search?rows.filter(c=>`${c.name} ${c.workType||''}`.toLocaleLowerCase('tr-TR').includes(search)):rows;
},[rows,query]);
const totals=useMemo(()=>rows.reduce((a,c)=>(a.accrued+=c.accrued,a.paid+=c.paid,a.balance+=c.balance,a.late+=c.late,a),{accrued:0,paid:0,balance:0,late:0}),[rows]);
const back=useCallback(()=>setSelected(null),[]);
const select=useCallback(c=>setSelected(c.id),[]);
const add=useCallback(()=>setEdit({}),[]);
const editCurrent=useCallback(()=>setEdit(clients.find(c=>c.id===selected)),[clients,selected]);
const setSettings=useCallback(v=>setState(s=>({...s,settings:{...s.settings,...v}})),[]);
function saveClient(c){setState(s=>({...s,clients:c.id?s.clients.map(x=>x.id===c.id?{...x,...c}:x):[{...c,id:uid(),periods:[],createdAt:new Date().toISOString()},...s.clients]}));setEdit(null)}function updatePeriod(client,key,patch){setState(s=>({...s,clients:s.clients.map(c=>c.id!==client.id?c:{...c,periods:[...(c.periods||[]).filter(p=>p.key!==key),{...(c.periods||[]).find(p=>p.key===key),key,...patch}]})}));setPeriodEdit(null)}if(!open)return <button className="clientLauncher" onClick={()=>setOpen(true)}>⚖ Müvekkiller</button>;const current=selected?rows.find(c=>c.id===selected):null;return <div className="clientOverlay"><div className="clientApp"><header className="clientHeader"><div><small>BT · AVUKATLIK</small><b>Müvekkil & Tahsilat Takibi</b></div><button onClick={()=>{setOpen(false);setSelected(null)}}>✕</button></header>{current?<ClientDetail c={current} settings={state.settings} key={current.id} back={back} edit={editCurrent} periodEdit={setPeriodEdit}/>:<ClientHome rows={filtered} totals={totals} query={query} setQuery={setQuery} select={select} add={add} settings={state.settings} setSettings={setSettings}/>} {edit&&<ClientForm initial={edit} settings={state.settings} close={()=>setEdit(null)} save={saveClient}/>} {periodEdit&&<PeriodForm data={periodEdit} close={()=>setPeriodEdit(null)} save={patch=>updatePeriod(periodEdit.client,periodEdit.period.key,patch)}/>}</div></div>}
const ClientHome=memo(function ClientHome({rows,totals,query,setQuery,select,add,settings,setSettings}){return <main className="clientMain"><div className="clientPageTitle"><div><small>CARİ TAKİP</small><h1>Müvekkiller</h1></div><button className="clientPrimary" onClick={add}>＋ Müvekkil</button></div><div className="clientKpis"><K label="Toplam Tahakkuk" value={TL(totals.accrued)}/><K label="Tahsil Edilen" value={TL(totals.paid)} tone="good"/><K label="Açık Bakiye" value={TL(totals.balance)} tone="bad"/><K label="Gecikmiş" value={TL(totals.late)} tone="bad"/></div><section className="clientSettings"><b>Ücret Hesabı</b><label>Asgari ücret baz tutarı<input type="number" value={settings.minimumWage} onChange={e=>setSettings({minimumWage:Number(e.target.value)||0})}/></label><label>Varsayılan KDV %<input type="number" value={settings.vatRate} onChange={e=>setSettings({vatRate:Number(e.target.value)||0})}/></label></section><div className="clientSearch"><input placeholder="Müvekkil veya iş ara" value={query} onChange={e=>setQuery(e.target.value)}/></div><section className="clientList">{!rows.length&&<div className="clientEmpty">Henüz müvekkil kaydı yok.</div>}{rows.map(c=><button className="clientCard" key={c.id} onClick={()=>select(c)}><div><b>{c.name}</b><small>{c.workType||'Hukuki hizmet'} · {c.active===false?'Pasif':'Aktif'}</small><span>{trDate(c.startDate)} başlangıç</span></div><div><strong className={c.balance>0?'bad':'good'}>{TL(c.balance)}</strong><small>Açık bakiye</small><span>{c.late>0?`${TL(c.late)} gecikmiş`:'Gecikme yok'}</span></div></button>)}</section></main>});
function K({label,value,tone=''}){return <div className="clientKpi"><small>{label}</small><b className={tone}>{value}</b></div>}
const ClientDetail=memo(function ClientDetail({c,settings,back,edit,periodEdit}){const {accrued,paid,balance}=c;const [visibleCount,setVisibleCount]=useState(PAGE_SIZE);const visiblePeriods=useMemo(()=>c.ps.slice(0,visibleCount),[c.ps,visibleCount]);
const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
async function exportDocument(make){
  setExporting(true);setExportError('');
  try{await make(c,settings)}catch{setExportError('Belge oluşturulamadı. Lütfen tekrar deneyin.')}finally{setExporting(false)}
}return <main className="clientMain"><div className="clientPageTitle"><button className="clientBack" onClick={back}>‹</button><div><small>MÜVEKKİL</small><h1>{c.name}</h1></div><button onClick={edit}>Düzenle</button></div><section className="clientHero"><div><small>Açık bakiye</small><h2 className={balance>0?'bad':'good'}>{TL(balance)}</h2></div><div className="clientMiniGrid"><K label="Tahakkuk" value={TL(accrued)}/><K label="Tahsil" value={TL(paid)} tone="good"/></div></section><section className="clientInfo"><p><b>İş:</b> {c.workType||'—'}</p><p><b>Başlangıç:</b> {trDate(c.startDate)}</p><p><b>İlk ödeme:</b> {trDate(c.firstDueDate)}</p><p><b>Ücret:</b> {c.feeType==='fixed'?TL(c.fixedAmount):`${c.multiplier||1} × asgari ücret + %${c.vatRate??settings.vatRate} KDV`} · <strong>{TL(fee(c,settings))}</strong></p>{c.notes&&<p><b>Dahili not:</b> {c.notes}</p>}</section><div className="clientDocActions"><button className="clientPrimary" disabled={exporting} onClick={()=>exportDocument(makePdf)}>PDF Cari Hesap</button><button disabled={exporting} onClick={()=>exportDocument(makeExcel)}>Excel Cari Hesap</button></div>{exporting&&<p role="status">Belge hazırlanıyor…</p>}{exportError&&<p role="alert">{exportError}</p>}<section><div className="clientSectionHead"><h2>Ödeme Dönemleri</h2><span>{c.ps.length} dönem</span></div>{visiblePeriods.map(p=><button className="periodRow" key={p.key} onClick={()=>periodEdit({client:c,period:p})}><div><b>{trDate(p.start)} – {trDate(p.end)}</b><small>Vade: {trDate(p.due)}{p.invoiceDate?` · Fatura: ${trDate(p.invoiceDate)}`:''}</small></div><div><strong>{TL(p.amount)}</strong><span className={'status '+p.status}>{statusLabel(p.status)}</span>{p.paidAmount>0&&<small>{TL(p.paidAmount)} ödendi{p.paymentDate?` · ${trDate(p.paymentDate)}`:''}</small>}</div></button>)}{visibleCount<c.ps.length&&<button className="clientLoadMore wide" onClick={()=>setVisibleCount(n=>n+PAGE_SIZE)}>Daha fazla dönem göster ({c.ps.length-visibleCount} kalan)</button>}</section></main>});
function ClientForm({initial,settings,close,save}){const[f,setF]=useState({id:initial.id||'',name:initial.name||'',workType:initial.workType||'Aylık Hukuki Danışmanlık',startDate:initial.startDate||today(),firstDueDate:initial.firstDueDate||addMonths(today(),1),feeType:initial.feeType||'minimum',multiplier:initial.multiplier??1.5,minimumWage:initial.minimumWage??settings.minimumWage,vatRate:initial.vatRate??settings.vatRate,fixedAmount:initial.fixedAmount||'',active:initial.active!==false,notes:initial.notes||''});return <Modal title={initial.id?'Müvekkili Düzenle':'Yeni Müvekkil'} close={close}><label>Müvekkil adı<input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label><label>İş / hizmet<input value={f.workType} onChange={e=>setF({...f,workType:e.target.value})}/></label><div className="clientTwo"><label>İşe başlangıç<input type="date" value={f.startDate} onChange={e=>setF({...f,startDate:e.target.value})}/></label><label>İlk ödeme<input type="date" value={f.firstDueDate} onChange={e=>setF({...f,firstDueDate:e.target.value})}/></label></div><label>Ücret modeli<select value={f.feeType} onChange={e=>setF({...f,feeType:e.target.value})}><option value="minimum">Asgari ücret katsayısı + KDV</option><option value="fixed">Sabit TL</option></select></label>{f.feeType==='minimum'?<><div className="clientTwo"><label>Katsayı<input type="number" step="0.1" value={f.multiplier} onChange={e=>setF({...f,multiplier:e.target.value})}/></label><label>KDV %<input type="number" value={f.vatRate} onChange={e=>setF({...f,vatRate:e.target.value})}/></label></div><label>Asgari ücret baz tutarı<input type="number" value={f.minimumWage} onChange={e=>setF({...f,minimumWage:e.target.value})}/></label></>:<label>Aylık sabit tutar<input type="number" value={f.fixedAmount} onChange={e=>setF({...f,fixedAmount:e.target.value})}/></label>}<label>Dahili not<textarea value={f.notes} onChange={e=>setF({...f,notes:e.target.value})}/></label><label className="clientCheck"><input type="checkbox" checked={f.active} onChange={e=>setF({...f,active:e.target.checked})}/> Aktif müvekkil</label><button className="clientPrimary wide" disabled={!f.name||!f.startDate||!f.firstDueDate} onClick={()=>save(f)}>Kaydet</button></Modal>}
function PeriodForm({data,close,save}){const p=data.period,[f,setF]=useState({amount:p.amount,paidAmount:p.paidAmount||'',paymentDate:p.paymentDate||'',invoiceIssued:!!p.invoiceIssued,invoiceDate:p.invoiceDate||'',invoiceNo:p.invoiceNo||'',note:p.note||''});return <Modal title={`${trDate(p.start)} – ${trDate(p.end)}`} close={close}><label>Dönem tutarı<input type="number" value={f.amount} onChange={e=>setF({...f,amount:Number(e.target.value)||0})}/></label><label>Ödenen tutar<input type="number" value={f.paidAmount} onChange={e=>setF({...f,paidAmount:Number(e.target.value)||0})}/></label><label>Ödeme tarihi<input type="date" value={f.paymentDate} onChange={e=>setF({...f,paymentDate:e.target.value})}/></label><label className="clientCheck"><input type="checkbox" checked={f.invoiceIssued} onChange={e=>setF({...f,invoiceIssued:e.target.checked})}/> Fatura kesildi</label>{f.invoiceIssued&&<div className="clientTwo"><label>Fatura tarihi<input type="date" value={f.invoiceDate} onChange={e=>setF({...f,invoiceDate:e.target.value})}/></label><label>Fatura no<input value={f.invoiceNo} onChange={e=>setF({...f,invoiceNo:e.target.value})}/></label></div>}<label>Dahili dönem notu<textarea value={f.note} onChange={e=>setF({...f,note:e.target.value})}/></label><button className="clientPrimary wide" onClick={()=>save(f)}>Kaydet</button></Modal>}
function Modal({title,close,children}){return <div className="clientModalBg" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="clientModal"><div className="clientModalHead"><h2>{title}</h2><button onClick={close}>✕</button></div>{children}</div></div>}
function docRows(due){return due.map(p=>({'Hizmet Dönemi':`${trDate(p.start)} – ${trDate(p.end)}`,'Vade Tarihi':trDate(p.due),'Tahakkuk':p.amount,'Ödenen':p.paidAmount||0,'Kalan':Math.max(0,p.amount-(p.paidAmount||0)),'Ödeme Tarihi':p.paymentDate?trDate(p.paymentDate):'—','Fatura':p.invoiceIssued?'Kesildi':'Kesilmedi','Fatura Tarihi':p.invoiceDate?trDate(p.invoiceDate):'—','Fatura No':p.invoiceNo||'—'}))}
async function makeExcel(c,settings){const XLSX=await import('xlsx'),day=today(),due=periodsFor(c,settings,day).filter(p=>p.due<=day),rows=docRows(due),ws=XLSX.utils.json_to_sheet(rows),summary=[[],['Müvekkil',c.name],['Hizmet',c.workType||''],['İşe Başlangıç',trDate(c.startDate)],['Toplam Tahakkuk',due.reduce((s,p)=>s+p.amount,0)],['Toplam Tahsilat',due.reduce((s,p)=>s+p.paidAmount,0)],['Açık Bakiye',due.reduce((s,p)=>s+p.amount-p.paidAmount,0)]];XLSX.utils.sheet_add_aoa(ws,summary,{origin:{r:rows.length+3,c:0}});ws['!cols']=[{wch:32},{wch:18},{wch:16},{wch:16},{wch:16},{wch:20},{wch:14},{wch:20},{wch:18}];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Cari Hesap');XLSX.writeFile(wb,`${c.name.replace(/[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ ]/g,'').trim()}_Cari_Hesap.xlsx`)}
async function makePdf(c,settings){const {default:html2pdf}=await import('html2pdf.js'),day=today(),due=periodsFor(c,settings,day).filter(p=>p.due<=day),rows=docRows(due),accrued=due.reduce((s,p)=>s+p.amount,0),paid=due.reduce((s,p)=>s+p.paidAmount,0),balance=accrued-paid,el=document.createElement('div');el.className='clientPdf';el.innerHTML=`<div class="pdfTop"><div><b>BT · HUKUKİ DANIŞMANLIK</b><h1>CARİ HESAP DURUMU</h1></div><span>${trDate(today())}</span></div><div class="pdfInfo"><p><b>Müvekkil:</b> ${esc(c.name)}</p><p><b>Hizmet:</b> ${esc(c.workType||'—')}</p><p><b>İşe Başlangıç:</b> ${trDate(c.startDate)}</p></div><table><thead><tr><th>Hizmet Dönemi</th><th>Tahakkuk</th><th>Ödenen</th><th>Kalan</th><th>Ödeme</th><th>Fatura</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r['Hizmet Dönemi']}</td><td>${TL(r.Tahakkuk)}</td><td>${TL(r.Ödenen)}</td><td>${TL(r.Kalan)}</td><td>${r['Ödeme Tarihi']}</td><td>${r.Fatura}</td></tr>`).join('')}</tbody></table><div class="pdfSummary"><div><small>TOPLAM TAHAKKUK</small><b>${TL(accrued)}</b></div><div><small>TAHSİL EDİLEN</small><b>${TL(paid)}</b></div><div><small>AÇIK BAKİYE</small><b>${TL(balance)}</b></div></div><p class="pdfNote">Bu belge, kayıtlı hukuki hizmet ücretleri ve tahsilat bilgileri esas alınarak bilgilendirme amacıyla düzenlenmiştir.</p>`;document.body.appendChild(el);try{await html2pdf().set({margin:8,filename:`${c.name}_Cari_Hesap.pdf`,image:{type:'jpeg',quality:.98},html2canvas:{scale:2,useCORS:true},jsPDF:{unit:'mm',format:'a4',orientation:'landscape'}}).from(el).save()}finally{el.remove()}}
function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
const mount=document.createElement('div');mount.id='client-tracker-root';document.body.appendChild(mount);createRoot(mount).render(<ClientTracker/>);
