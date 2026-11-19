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
   if(e.RRULE||e["RECURRENCE-ID"]||e.RDATE){unsupported++;continue;}
   const start=ymd(e.DTSTART),allDay=DATE.test(e.DTSTART);
   const endValue=e.DTEND||e.DTSTART;
   let end=ymd(endValue);
   if(allDay&&e.DTEND)end=moveDay(end,-1);
   if(end<start)throw Error("Plage de dates iCal incohérente");
   if(min&&end<min||max&&start>max)continue;
   const title=decode(e.SUMMARY||"Événement familial");
   events.push({
    provider_event_id:e.UID.slice(0,512),event_title:title||"Événement familial",
    start_date:start,end_date:end,all_day:allDay,
    start_at:null,end_at:null
   });
   if(events.length>maxEvents)throw Error("Calendrier trop volumineux");
   continue;
  }
  if(current){
   const p=property(line);
   if(p&&["UID","SUMMARY","DTSTART","DTEND","STATUS","RRULE","RECURRENCE-ID","RDATE"].includes(p.key))
    current[p.key]=p.value;
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
