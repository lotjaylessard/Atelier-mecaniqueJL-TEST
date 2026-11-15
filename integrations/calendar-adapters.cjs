'use strict';
// S09 / phase 3 foundation — pure data adapters, no network, auth, writes or secrets.
// Calendar provider events are private to their authenticated owner at storage/API layer.
// DO NOT import these records into workshop-shared schedule tables.
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
function dateOnly(s){
 if(typeof s!=='string'||!DAY.test(s))throw Error('Invalid calendar day');
 const d=new Date(s+'T12:00:00Z');
 if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==s)throw Error('Invalid calendar date');
 return s;
}
function previousDay(exclusiveEnd){
 const day=dateOnly(exclusiveEnd),d=new Date(day+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()-1);
 return d.toISOString().slice(0,10);
}
function ensureString(s,limit=2048){return typeof s==='string'?s.slice(0,limit):'';}
function sourceIdentity(provider,calendarId,eventId){
 if(!['google','microsoft'].includes(provider))throw Error('Unknown provider');
 if(!calendarId||!eventId)throw Error('Missing event identity');
 return [provider,ensureString(calendarId,512),ensureString(eventId,512)].join(':');
}
function result(base,dates){
 return Object.freeze({...base,...dates,privacy:'owner_only',source:'external',editableInGarage:false});
}
function fromGoogle(event,calendarId){
 if(!event||typeof event!=='object')throw Error('Invalid Google event');
 const id=sourceIdentity('google',calendarId,event.id);
 if(event.status==='cancelled')return result({id,provider:'google',calendarId,eventId:event.id,deleted:true},{});
 const start=event.start||{},end=event.end||{};
 const allDay=typeof start.date==='string';
 if(allDay){
  const begin=dateOnly(start.date),last=previousDay(end.date);
  if(last<begin)throw Error('Invalid exclusive end date');
  return result({id,provider:'google',calendarId,eventId:event.id,deleted:false,title:ensureString(event.summary)||'(Sans titre)',allDay:true},{startDate:begin,endDate:last,startTime:null,endTime:null,timezone:ensureString(start.timeZone||end.timeZone,128)});
 }
 if(!ISO.test(start.dateTime||'')||!ISO.test(end.dateTime||''))throw Error('Invalid Google timed event');
 return result({id,provider:'google',calendarId,eventId:event.id,deleted:false,title:ensureString(event.summary)||'(Sans titre)',allDay:false},{
  startDate:start.dateTime.slice(0,10),endDate:end.dateTime.slice(0,10),
  startTime:start.dateTime.slice(11,16),endTime:end.dateTime.slice(11,16),
  timezone:ensureString(start.timeZone||end.timeZone,128)
 });
}
function fromMicrosoft(event,calendarId){
 if(!event||typeof event!=='object')throw Error('Invalid Microsoft event');
 const id=sourceIdentity('microsoft',calendarId,event.id);
 if(event['@removed'])return result({id,provider:'microsoft',calendarId,eventId:event.id,deleted:true},{});
 const start=event.start||{},end=event.end||{};
 if(!ISO.test(start.dateTime||'')||!ISO.test(end.dateTime||''))throw Error('Invalid Microsoft timed fields');
 const allDay=event.isAllDay===true;
 let endDate=end.dateTime.slice(0,10);
 if(allDay){
  // Microsoft Graph all-day end is exclusive in calendarView.
  endDate=previousDay(endDate);
  if(endDate<start.dateTime.slice(0,10))throw Error('Invalid exclusive end date');
 }
 return result({id,provider:'microsoft',calendarId,eventId:event.id,deleted:false,title:ensureString(event.subject)||'(Sans titre)',allDay},{
  startDate:start.dateTime.slice(0,10),endDate,
  startTime:allDay?null:start.dateTime.slice(11,16),
  endTime:allDay?null:end.dateTime.slice(11,16),
  timezone:ensureString(start.timeZone||end.timeZone,128)
 });
}
function permittedToRead(record,requestingUserId){
 // Additional defense; DB RLS and server authorization remain mandatory.
 return Boolean(record&&record.ownerUserId&&requestingUserId&&record.ownerUserId===requestingUserId);
}
module.exports={fromGoogle,fromMicrosoft,permittedToRead};
