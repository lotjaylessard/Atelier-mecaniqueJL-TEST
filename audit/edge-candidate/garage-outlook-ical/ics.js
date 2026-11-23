import ICAL from "npm:ical.js@2.2.1";
// Private Outlook ICS parser: recurrence rules, exclusions, and exceptions.
const pad=x=>String(x).padStart(2,"0");
const stamp=v=>String(v.year).padStart(4,"0")+"-"+pad(v.month)+"-"+pad(v.day);
function shiftDay(value,n){const d=new Date(value+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
const toronto=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"});
function inToronto(date){const parts=Object.fromEntries(toronto.formatToParts(date).map(x=>[x.type,x.value]));return parts.year+"-"+parts.month+"-"+parts.day;}
function asInstant(v){
 if(v.isDate)return null;
 const d=v.toJSDate();
 if(!(d instanceof Date)||!Number.isFinite(d.getTime()))throw Error("ICAL_TIME_INVALID");
 return d.toISOString();
}
function isCanceled(component){return String(component.getFirstPropertyValue("status")||"").toUpperCase()==="CANCELLED";}

function categoriesOf(event){
 const values=[];
 for(const prop of event.component.getAllProperties("categories")||[]){
  let entries=[];
  try{
   const raw=typeof prop.getValues==="function"?prop.getValues():[prop.getFirstValue()];
   entries=Array.isArray(raw)?raw:[raw];
  }catch{entries=[];}
  for(const entry of entries){
   // iCalendar can contain a comma-separated category list.
   for(const category of String(entry||"").split(",")){
    const val=category.trim().slice(0,80);
    if(val&&values.length<12&&!values.some(v=>v.toLocaleLowerCase("en-CA")===val.toLocaleLowerCase("en-CA")))values.push(val);
   }
  }
 }
 return values;
}

export function parseOutlookICS(text,{min,max,maxEvents=900}={}){
 if(typeof text!=="string"||text.length>2_000_000||!/^BEGIN:VCALENDAR\s*$/im.test(text.replace(/^\uFEFF/,"").trimStart()))
  throw Error("ICAL_DOCUMENT_INVALID");
 const root=new ICAL.Component(ICAL.parse(text.replace(/^\uFEFF/,"")));
 if(root.name!=="vcalendar")throw Error("ICAL_DOCUMENT_INVALID");
 const list=root.getAllSubcomponents("vevent");
 const masters=new Map(),exceptions=new Map();
 for(const comp of list){
  const event=new ICAL.Event(comp),uid=String(event.uid||"");
  if(!uid||uid.length>512)continue;
  if(event.isRecurrenceException()){
   const arr=exceptions.get(uid)||[];arr.push(event);exceptions.set(uid,arr);
  }else masters.set(uid,event);
 }
 const result=[],seen=new Set();
 const minDay=min||"2000-01-01",maxDay=max||"2100-12-31";
 const floor=new Date(minDay+"T00:00:00Z").getTime()-32*86400000;
 const ceiling=new Date(maxDay+"T23:59:59Z").getTime()+32*86400000;
 function add(uid,start,end,item,token){
  if(isCanceled(item.component))return;
  const allDay=!!start.isDate,startAt=asInstant(start),endAt=asInstant(end);
  const dStart=allDay?stamp(start):inToronto(new Date(startAt));
  const dEnd=allDay?shiftDay(stamp(end),-1):inToronto(new Date(new Date(endAt).getTime()-1));
  const last=dEnd<dStart?dStart:dEnd;
  if(last<minDay||dStart>maxDay)return;
  const key=(uid+"#"+token).slice(0,512);
  if(seen.has(key))return;
  seen.add(key);
  result.push({provider_event_id:key,event_title:String(item.summary||"Événement Outlook").slice(0,400),
   start_date:dStart,end_date:last,all_day:allDay,start_at:startAt,end_at:endAt,categories:categoriesOf(item)});
  if(result.length>maxEvents)throw Error("ICAL_TOO_MANY");
 }
 for(const [uid,master] of masters){
  for(const x of exceptions.get(uid)||[])master.relateException(x);
  if(isCanceled(master.component))continue;
  if(master.isRecurring()){
   const iterator=master.iterator();let n=0,next;
   while((next=iterator.next())){
    if(++n>40000)throw Error("ICAL_ITERATION_LIMIT");
    if(next.toJSDate().getTime()>ceiling)break;
    const details=master.getOccurrenceDetails(next);
    if(details.endDate.toJSDate().getTime()<floor)continue;
    add(uid,details.startDate,details.endDate,details.item,String(next.toString()));
   }
  }else add(uid,master.startDate,master.endDate,master,master.startDate.toString());
 }
 for(const [uid,items] of exceptions){
  if(masters.has(uid))continue;
  for(const e of items){
   if(isCanceled(e.component))continue;
   add(uid,e.startDate,e.endDate,e,e.recurrenceId?.toString()||e.startDate.toString());
  }
 }
 return result;
}
export function validateOutlookUrl(raw){
 if(typeof raw!=="string"||raw.length>2048||raw.trim()!==raw)throw Error("URL_INVALID");
 const value=raw.replace(/^webcal:\/\//i,"https://");
 let u;try{u=new URL(value);}catch{throw Error("URL_INVALID")}
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash)throw Error("URL_INVALID");
 const host=u.hostname.toLowerCase();
 if(!["outlook.live.com","outlook.office365.com","outlook.office.com"].includes(host))throw Error("URL_INVALID");
 if(!u.pathname.toLowerCase().endsWith(".ics"))throw Error("URL_INVALID");
 return u.toString();
}