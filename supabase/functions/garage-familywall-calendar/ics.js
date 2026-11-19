// FamilyWall iCalendar reader (read-only). No network, no secrets, pure ESM.
const DATE=/^\d{8}$/;
const DATE_TIME=/^\d{8}T\d{6}Z?$/;
function ymd(v){
 const match=(v||"").match(/^(\d{4})(\d{2})(\d{2})/);
 if(!match)throw Error("Date iCal non reconnue");
 const s=match[1]+"-"+match[2]+"-"+match[3];
 const d=new Date(s+"T12:00:00Z");
 if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==s)throw Error("Date iCal invalide");
 return s;
}
function moveDay(s,days){const d=new Date(s+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function decode(s){return String(s||"").replace(/\\[nN]/g,"\n").replace(/\\,/g,",").replace(/\\;/g,";").replace(/\\\\/g,"\\").slice(0,400);}
function property(line){
 const n=line.indexOf(":");if(n<0)return null;
 return {key:line.slice(0,n).split(";")[0].toUpperCase(),params:line.slice(0,n),value:line.slice(n+1)};
}
const weekdays={SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6};
function expandRule(rule,start,min,max,span){
 const parts=Object.fromEntries(rule.split(";").map(part=>part.split("=")));
 const keys=Object.keys(parts);
 if(keys.some(key=>!["FREQ","INTERVAL","COUNT","UNTIL","BYDAY","BYMONTHDAY","BYMONTH","WKST"].includes(key)))
  throw Error("Récurrence iCal avancée non prise en charge");
 const freq=parts.FREQ;
 if(!["DAILY","WEEKLY","MONTHLY","YEARLY"].includes(freq))throw Error("Récurrence iCal inconnue");
 const interval=Number(parts.INTERVAL||1),count=Number(parts.COUNT||0);
 if(!Number.isInteger(interval)||interval<1||interval>366||!Number.isInteger(count)||count<0||count>100000)
  throw Error("Règle de répétition iCal invalide");
 const byday=parts.BYDAY?parts.BYDAY.split(","):[];
 if(byday.some(code=>!(code in weekdays)))throw Error("Récurrence avancée BYDAY non prise en charge");
 const daynums=parts.BYMONTHDAY?parts.BYMONTHDAY.split(",").map(Number):[];
 const months=parts.BYMONTH?parts.BYMONTH.split(",").map(Number):[];
 if(daynums.some(n=>!Number.isInteger(n)||n<1||n>31)||months.some(n=>!Number.isInteger(n)||n<1||n>12))
  throw Error("Règle de répétition iCal invalide");
 const until=parts.UNTIL?ymd(parts.UNTIL):null;
 const begin=new Date(start+"T12:00:00Z"),limit= new Date((max||moveDay(start,365*3))+"T12:00:00Z");
 const endLimit=until?Math.min(limit.getTime(),new Date(until+"T12:00:00Z").getTime()):limit.getTime();
 if(endLimit<begin.getTime())return [];
 const diffDays=Math.ceil((endLimit-begin.getTime())/86400000);
 if(diffDays>80000)throw Error("Calendrier récurrent trop ancien");
 const startMonday=moveDay(start,-((begin.getUTCDay()+6)%7));
 const startEpoch=begin.getTime(),mondayEpoch=new Date(startMonday+"T12:00:00Z").getTime();
 const originMonth=begin.getUTCMonth(),originDate=begin.getUTCDate(),originWeekday=begin.getUTCDay();
 let matched=0;
 const occurrences=[];
 for(let n=0;n<=diffDays;n++){
  const day=new Date(startEpoch+n*86400000),dayName=day.getUTCDay();
  const monthDelta=(day.getUTCFullYear()-begin.getUTCFullYear())*12+(day.getUTCMonth()-originMonth);
  const dayOfMonth=day.getUTCDate(),weekIndex=Math.floor((day.getTime()-mondayEpoch)/604800000);
  let yes=false;
  if(freq==="DAILY")yes=n%interval===0;
  if(freq==="WEEKLY")yes=weekIndex%interval===0&&(byday.length?byday.some(code=>weekdays[code]===dayName):dayName===originWeekday);
  if(freq==="MONTHLY")yes=monthDelta%interval===0&&(daynums.length?daynums.includes(dayOfMonth):byday.length?byday.some(code=>weekdays[code]===dayName):dayOfMonth===originDate);
  if(freq==="YEARLY")yes=(day.getUTCFullYear()-begin.getUTCFullYear())%interval===0
   &&(months.length?months.includes(day.getUTCMonth()+1):day.getUTCMonth()===originMonth)
   &&(daynums.length?daynums.includes(dayOfMonth):byday.length?byday.some(code=>weekdays[code]===dayName):dayOfMonth===originDate);
  if(months.length&&!months.includes(day.getUTCMonth()+1))yes=false;
  if(daynums.length&&!daynums.includes(dayOfMonth))yes=false;
  if(!yes)continue;
  matched++;
  if(count&&matched>count)break;
  const occurrence=ymd(day.getUTCFullYear().toString()+String(day.getUTCMonth()+1).padStart(2,"0")+String(dayOfMonth).padStart(2,"0"));
  const occurrenceEnd=moveDay(occurrence,span);
  if((!min||occurrenceEnd>=min)&&(!max||occurrence<=max))occurrences.push(occurrence);
  if(occurrences.length>1000)throw Error("Trop de répétitions");
 }
 return occurrences;
}
export function parseFamilyWallICS(text,{min,max,maxEvents=900}={}){
 if(typeof text!=="string"||text.length>2_000_000||!text.includes("BEGIN:VCALENDAR"))
  throw Error("Le lien ne retourne pas un calendrier iCal valide");
 const lines=text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n");
 const unfolded=[];
 for(const line of lines){
  if(/^[ \t]/.test(line)&&unfolded.length)unfolded[unfolded.length-1]+=line.slice(1);
  else unfolded.push(line);
 }
 const events=[];let current=null,unsupported=0;
 for(const line of unfolded){
  if(line==="BEGIN:VEVENT"){current={};continue;}
  if(line==="END:VEVENT"){
   if(!current)continue;
   const e=current;current=null;
   if(e.STATUS==="CANCELLED"||!e.UID||!e.DTSTART)continue;
   if(e["RECURRENCE-ID"]||e.RDATE){unsupported++;continue;}
   const start=ymd(e.DTSTART),allDay=DATE.test(e.DTSTART);
   const endValue=e.DTEND||e.DTSTART;
   let end=ymd(endValue);
   if(allDay&&e.DTEND)end=moveDay(end,-1);
   if(end<start)throw Error("Plage de dates iCal incohérente");
   const span=Math.round((new Date(end+"T12:00:00Z").getTime()-new Date(start+"T12:00:00Z").getTime())/86400000);
   const title=decode(e.SUMMARY||"Événement familial")||"Événement familial";
   const occurrences=e.RRULE?expandRule(e.RRULE,start,min,max,span):[start];
   const excluded=new Set((e.EXDATE||"").split(",").filter(Boolean).map(value=>ymd(value)));
   for(const occurrence of occurrences){
    if(excluded.has(occurrence))continue;
    const occEnd=moveDay(occurrence,span);
    if(min&&occEnd<min||max&&occurrence>max)continue;
    events.push({
     provider_event_id:(e.RRULE?e.UID+"#"+occurrence:e.UID).slice(0,512),
     event_title:title,start_date:occurrence,end_date:occEnd,all_day:allDay,
     start_at:null,end_at:null
    });
    if(events.length>maxEvents)throw Error("Calendrier trop volumineux");
   }
   continue;
  }
  if(current){
   const p=property(line);
   if(p&&["UID","SUMMARY","DTSTART","DTEND","STATUS","RRULE","RECURRENCE-ID","RDATE","EXDATE"].includes(p.key))
    current[p.key]=p.key==="EXDATE"&&current.EXDATE?current.EXDATE+","+p.value:p.value;
  }
 }
 if(unsupported)throw Error("Ce calendrier contient "+unsupported+" événement(s) récurrent(s) avancé(s). L'importation est suspendue pour ne pas en masquer.");
 return events;
}
export function validateFamilyWallUrl(raw){
 if(typeof raw!=="string"||raw.length>2048||raw.trim()!==raw)throw Error("Lien iCal invalide");
 const normalized=raw.replace(/^webcal:\/\//i,"https://");
 let url;
 try{url=new URL(normalized);}catch{throw Error("Lien iCal invalide");}
 if(url.protocol!=="https:"||url.username||url.password||url.port)
  throw Error("Le lien iCal doit être HTTPS");
 const host=url.hostname.toLowerCase();
 // Tight SSRF allowlist, can be extended only after verifying a real link's host.
 if(host!=="familywall.com"&&!host.endsWith(".familywall.com"))
  throw Error("Le lien doit provenir de FamilyWall");
 if(url.hash)throw Error("Lien iCal invalide");
 return url.toString();
}
