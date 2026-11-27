(()=>{"use strict";
const cents=v=>{const s=String(v??"").trim().replace(",",".");return /^\d{1,7}(?:\.\d{1,2})?$/.test(s)?Math.round(Number(s)*100):null;};
const key=(supplier,number)=>JSON.stringify([String(supplier).trim().toLowerCase(),String(number).trim().toUpperCase()]);
function candidate(raw,entries=[]){
 const supplier=String(raw.supplier||"").trim(),number=String(raw.number||"").trim(),date=String(raw.date||""),wo=String(raw.wo||"").trim();
 const sub=cents(raw.sub),gst=cents(raw.gst),qst=cents(raw.qst);
 if(!supplier||supplier.length>80||!number||number.length>80||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||sub===null||sub<=0||gst===null||qst===null||wo.length>80)return {error:"Vérifie les champs et les montants."};
 if(entries.some(e=>e.id!==raw.id&&key(e.supplier,e.number)===key(supplier,number)))return {error:"Cette facture existe déjà pour ce fournisseur."};
 return {value:{id:raw.id||crypto.randomUUID(),supplier,number,date,wo,sub,gst,qst,total:sub+gst+qst}};
}
if(typeof module!=="undefined")module.exports={cents,key,candidate};
if(typeof document==="undefined")return;
const get=id=>document.getElementById(id), ids=["supplier","number","date","wo","sub","gst","qst"];
const field=k=>get("jlBill_"+k);
let editing=null,owner=null;
const context=()=>CLOUD_DATA_READY&&ACTIVE_GARAGE_ID&&SUPABASE_USER?.id?String(ACTIVE_GARAGE_ID)+":"+SUPABASE_USER.id:null;
const entries=()=>Array.isArray(SETTINGS?.supplierBills)?SETTINGS.supplierBills:[];
const fmt=c=>money(c/100)+" $";
const status=s=>{get("jlBillStatus").textContent=s;};
function reset(){editing=null;owner=context();for(const k of ids)field(k).value="";field("date").value=new Date().toLocaleDateString("fr-CA");field("gst").value="0.00";field("qst").value="0.00";get("jlBillSave").textContent="Enregistrer";total();}
function total(){const a=["sub","gst","qst"].map(k=>cents(field(k).value));get("jlBillTotal").textContent=a.every(x=>x!==null)?fmt(a.reduce((x,y)=>x+y,0)):"—";}
function persist(next){if(!context()||owner!==context()||CLOUD_SYNC_FAILED)throw Error("Synchronisation ou garage non confirmé.");const prev=SETTINGS.supplierBills;SETTINGS.supplierBills=next;try{localStorage.setItem(STORAGE.settings,JSON.stringify(SETTINGS));scheduleCloudSync();}catch(e){SETTINGS.supplierBills=prev;throw e;}}
function render(){if(!get("jlBillList"))return;if(owner!==context()){reset();status("");}const list=get("jlBillList");list.replaceChildren();const query=get("jlBillSearch").value.trim().toLowerCase(),month=get("jlBillMonth").value;
 const visible=context()?entries().filter(e=>(!month||e.date.startsWith(month))&&[e.supplier,e.number,e.wo].some(v=>String(v||"").toLowerCase().includes(query))).sort((a,b)=>b.date.localeCompare(a.date)):[];
 get("jlBillCount").textContent=visible.length+" facture(s) · "+fmt(visible.reduce((n,e)=>n+e.total,0));
 for(const e of visible){const tr=document.createElement("tr");for(const v of [e.date,e.supplier,e.number,e.wo||"—",fmt(e.sub),fmt(e.gst),fmt(e.qst),fmt(e.total)]){const td=document.createElement("td");td.textContent=v;tr.append(td);}const td=document.createElement("td");for(const [label,fn] of [["Modifier",()=>{editing=e.id;owner=context();for(const k of ids)field(k).value=["sub","gst","qst"].includes(k)?(e[k]/100).toFixed(2):e[k]||"";get("jlBillSave").textContent="Enregistrer la modification";total();field("supplier").focus();}],["Retirer",()=>{if(!confirm("Retirer cette facture fournisseur ?"))return;try{persist(entries().filter(x=>x.id!==e.id));reset();render();status("Retirée localement; synchronisation demandée.");}catch(err){status(err.message);}}]]){const b=document.createElement("button");b.type="button";b.className="ghost";b.textContent=label;b.onclick=fn;td.append(b);}tr.append(td);list.append(tr);}
}
function init(){if(!get("jlBillForm"))return;reset();get("jlBillForm").addEventListener("submit",e=>{e.preventDefault();const result=candidate({...Object.fromEntries(ids.map(k=>[k,field(k).value])),id:editing},entries());if(result.error){status(result.error);return;}try{const v=result.value;persist(editing?entries().map(x=>x.id===editing?v:x):[...entries(),v]);const supplier=v.supplier;reset();field("supplier").value=supplier;render();status("Enregistrée localement; vérifier « Synchronisé ».");field("number").focus();}catch(err){status(err.message);}});
 get("jlBillCancel").onclick=()=>{reset();status("");};for(const k of ["sub","gst","qst"])field(k).addEventListener("input",total);
 get("jlBillTaxes").onclick=()=>{const n=cents(field("sub").value);if(n===null)return;field("gst").value=(Math.round(n*Number(SETTINGS.gst||0)/100)/100).toFixed(2);field("qst").value=(Math.round(n*Number(SETTINGS.qst||0)/100)/100).toFixed(2);total();};
 for(const id of ["jlBillSearch","jlBillMonth"])get(id).addEventListener("input",render);
 document.querySelector('[data-page="page-suppliers"]')?.addEventListener("click",render);render();}
 document.addEventListener("DOMContentLoaded",init,{once:true});
})();