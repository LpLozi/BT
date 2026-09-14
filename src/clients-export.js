import{clientRow,expensesFor,today,trDate,TL,money,statusLabel}from'./clients-domain.js';
export const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const safeName=name=>String(name).replace(/[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ _-]/g,'').trim()||'Muvekkil';
function expenseRows(entries){return entries.map(e=>({'Tarih':trDate(e.date),'Açıklama':e.description,'Masraf':e.amount,'Müvekkilden Alınan':e.paidAmount,'Kalan':money(e.amount-e.paidAmount)}))}
export async function makeExcel(c,settings){
  const XLSX=await import('xlsx'),day=today(),row=clientRow(c,settings,day),wb=XLSX.utils.book_new();
  const rows=row.ps.map(p=>({'Hizmet Dönemi':`${trDate(p.start)} – ${trDate(p.end)}`,'Vade Tarihi':trDate(p.due),'Dönem Tutarı':p.amount,'Ödenen':p.paidAmount,'Kalan':money(p.amount-p.paidAmount),'Durum':statusLabel(p.status),'Ödeme Tarihi':trDate(p.paymentDate),'Fatura':p.invoiceIssued?'Kesildi':'Kesilmedi','Fatura Tarihi':trDate(p.invoiceDate),'Fatura No':p.invoiceNo||'—'}));
  const ws=XLSX.utils.json_to_sheet(rows);ws['!cols']=[{wch:42},{wch:22},{wch:20},{wch:18},{wch:18},{wch:26},{wch:22},{wch:18},{wch:22},{wch:20}];
  XLSX.utils.sheet_add_aoa(ws,[['Müvekkil',c.name],['Vadesi gelen hizmet tahakkuku',row.accrued],['Hizmet tahsilatı',row.paid],['Hukuki masraflar',row.expenseTotal],['Alınan masraf tutarı',row.expensePaid],['Vadesi gelen hizmet + masraf bakiyesi',row.balance]],{origin:{r:rows.length+3,c:0}});
  XLSX.utils.book_append_sheet(wb,ws,'Cari Hesap');
  const expenseSheet=XLSX.utils.json_to_sheet(expenseRows(expensesFor(c,day)));expenseSheet['!cols']=[{wch:22},{wch:65},{wch:20},{wch:24},{wch:20}];XLSX.utils.book_append_sheet(wb,expenseSheet,'Hukuki Masraflar');
  XLSX.writeFile(wb,`${safeName(c.name)}_Cari_Hesap.xlsx`);
}
export function pdfHtml(c,settings,{month='',expensesOnly=false,day=today()}={}){
  const row=clientRow(c,settings,day),expenses=expensesFor(c,day,expensesOnly?month:'');
  const total=money(expenses.reduce((s,e)=>s+e.amount,0)),paid=money(expenses.reduce((s,e)=>s+e.paidAmount,0));
  const expenseTable=`<h2>Hukuki masraflar${expensesOnly&&month?' · '+esc(month):''}</h2><table><thead><tr><th>Tarih</th><th>Açıklama</th><th>Masraf</th><th>Alınan</th><th>Kalan</th></tr></thead><tbody>${expenses.length?expenses.map(e=>`<tr><td>${trDate(e.date)}</td><td class="expenseDescription">${esc(e.description)}</td><td>${TL(e.amount)}</td><td>${TL(e.paidAmount)}</td><td>${TL(e.amount-e.paidAmount)}</td></tr>`).join(''):'<tr><td colspan="5">Kayıtlı masraf yok.</td></tr>'}</tbody></table><p>Masraf toplamı: <b>${TL(total)}</b> · Müvekkilden alınan: <b>${TL(paid)}</b> · Masraf bakiyesi: <b>${TL(total-paid)}</b></p>`;
  const serviceTable=`<h2>Başlamış hizmet dönemleri</h2><table><thead><tr><th>Hizmet dönemi</th><th>Vade</th><th>Tutar</th><th>Ödenen</th><th>Kalan</th><th>Durum</th><th>Fatura</th></tr></thead><tbody>${row.ps.map(p=>`<tr><td>${trDate(p.start)} – ${trDate(p.end)}</td><td>${trDate(p.due)}</td><td>${TL(p.amount)}</td><td>${TL(p.paidAmount)}</td><td>${TL(p.amount-p.paidAmount)}</td><td>${statusLabel(p.status)}</td><td>${p.invoiceIssued?`${esc(p.invoiceNo||'Kesildi')}<br>${trDate(p.invoiceDate)}`:'Kesilmedi'}</td></tr>`).join('')}</tbody></table>`;
  return `<div class="pdfTop"><div><b>BT · HUKUKİ DANIŞMANLIK</b><h1>${expensesOnly?'HUKUKİ MASRAF DÖKÜMÜ':'CARİ HESAP DURUMU'}</h1></div><span>${trDate(day)}</span></div><div class="pdfInfo"><p><b>Müvekkil:</b> ${esc(c.name)}</p><p><b>Hizmet:</b> ${esc(c.workType||'—')}</p><p><b>İşe başlangıç:</b> ${trDate(c.startDate)}</p></div>${expensesOnly?'':serviceTable}${expenseTable}${expensesOnly?'':`<div class="pdfSummary"><div><small>VADESİ GELEN HİZMET BAKİYESİ</small><b>${TL(row.feeBalance)}</b></div><div><small>MASRAF BAKİYESİ</small><b>${TL(row.expenseBalance)}</b></div><div><small>TOPLAM AÇIK BAKİYE</small><b>${TL(row.balance)}</b></div></div><p class="pdfNote">Devam eden ve henüz vadesi gelmemiş hizmet dönemleri bilgi amacıyla listelenir; toplam açık bakiyeye dahil edilmez.</p>`}<p class="pdfNote">Bu döküm, kayıtlı hizmet ve masraf bilgilerine göre hazırlanmıştır.</p>`;
}
export async function makePdf(c,settings,options={}){
  const{default:html2pdf}=await import('html2pdf.js');
  const host=document.createElement('div'),el=document.createElement('div');host.className='clientPdfHost';el.className='clientPdf';el.innerHTML=pdfHtml(c,settings,options);host.appendChild(el);document.body.appendChild(host);
  // Bound the raster size for long histories on mobile Safari.
  const height=Math.max(el.scrollHeight*1.3,1),scale=Math.min(1.5,Math.sqrt(12000000/(1080*height)),16000/height);
  try{await html2pdf().set({margin:8,filename:`${safeName(c.name)}_${options.expensesOnly?'Masraflar_'+options.month:'Cari_Hesap'}.pdf`,pagebreak:{mode:['css','legacy'],avoid:['tr','.pdfSummary','.pdfTop']},image:{type:'jpeg',quality:.96},html2canvas:{scale,useCORS:true},jsPDF:{unit:'mm',format:'a4',orientation:'landscape'}}).from(el).save()}finally{host.remove()}
}
