'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {fromGoogle,fromMicrosoft,permittedToRead}=require('../integrations/calendar-adapters.cjs');
test('Google multi-day all-day event converts exclusive end to final visible day',()=>{
 const e=fromGoogle({id:'g1',summary:'Congé',start:{date:'2027-01-24'},end:{date:'2027-02-01'}},'primary');
 assert.equal(e.startDate,'2027-01-24');
 assert.equal(e.endDate,'2027-01-31');
 assert.equal(e.privacy,'owner_only');
 assert.equal(e.editableInGarage,false);
 assert.equal(e.provider,'google');
});
test('Google event with clock times remains timed and retains named timezone',()=>{
 const e=fromGoogle({id:'g2',summary:'Entretien',start:{dateTime:'2027-01-24T09:30:00-05:00',timeZone:'America/Toronto'},end:{dateTime:'2027-01-24T10:15:00-05:00'}},'primary');
 assert.equal(e.allDay,false);assert.equal(e.startTime,'09:30');
 assert.equal(e.endTime,'10:15');assert.equal(e.timezone,'America/Toronto');
});
test('Microsoft personal-account all-day event uses exclusive end',()=>{
 const e=fromMicrosoft({id:'m1',subject:'Absence',isAllDay:true,start:{dateTime:'2027-02-01T00:00:00',timeZone:'Eastern Standard Time'},end:{dateTime:'2027-02-03T00:00:00',timeZone:'Eastern Standard Time'}},'calendar-A');
 assert.equal(e.startDate,'2027-02-01');assert.equal(e.endDate,'2027-02-02');
 assert.equal(e.privacy,'owner_only');assert.equal(e.source,'external');
});
test('Microsoft timed event is not treated as all-day',()=>{
 const e=fromMicrosoft({id:'m2',subject:'Agenda',isAllDay:false,start:{dateTime:'2027-02-01T13:00:00',timeZone:'Eastern Standard Time'},end:{dateTime:'2027-02-01T14:30:00',timeZone:'Eastern Standard Time'}},'calendar-A');
 assert.equal(e.startTime,'13:00');assert.equal(e.endTime,'14:30');
});
test('cancelled Google events and deleted Microsoft events become deletion markers',()=>{
 assert.equal(fromGoogle({id:'gone',status:'cancelled'},'primary').deleted,true);
 assert.equal(fromMicrosoft({id:'gone','@removed':{reason:'deleted'}},'cal').deleted,true);
});
test('provider identities are distinct despite identical external event IDs',()=>{
 const a=fromGoogle({id:'same',start:{date:'2027-01-24'},end:{date:'2027-01-25'}},'primary');
 const b=fromMicrosoft({id:'same',isAllDay:true,start:{dateTime:'2027-01-24T00:00:00'},end:{dateTime:'2027-01-25T00:00:00'}},'primary');
 assert.notEqual(a.id,b.id);
});
test('invalid dates and missing provider IDs fail closed',()=>{
 assert.throws(()=>fromGoogle({id:'x',start:{date:'2027-02-30'},end:{date:'2027-03-01'}},'primary'));
 assert.throws(()=>fromGoogle({id:'x',start:{date:'2027-01-24'},end:{date:'2027-01-24'}},'primary'));
 assert.throws(()=>fromMicrosoft({id:'x',isAllDay:true,start:{dateTime:'2027-01-24T00:00:00'},end:{dateTime:'2027-01-24T00:00:00'}},'cal'));
 assert.throws(()=>fromGoogle({start:{date:'2027-01-24'},end:{date:'2027-01-25'}},'primary'));
});
test('private record belongs only to authenticated owner, not colleague or anonymous user',()=>{
 const row={ownerUserId:'owner-a',title:'Private appointment'};
 assert.equal(permittedToRead(row,'owner-a'),true);
 assert.equal(permittedToRead(row,'owner-b'),false);
 assert.equal(permittedToRead(row,null),false);
 assert.equal(permittedToRead({title:'Missing owner'},'owner-a'),false);
});
test('normalized event is immutable and never gains a workshop visibility',()=>{
 const e=fromGoogle({id:'g1',start:{date:'2027-01-24'},end:{date:'2027-01-25'}},'primary');
 assert.equal(Object.isFrozen(e),true);
 assert.equal('visibility' in e,false);
});
