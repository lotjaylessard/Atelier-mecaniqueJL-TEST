'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function section(a,b){const i=html.indexOf(a),j=html.indexOf(b,i);assert.ok(i>=0&&j>i,'Source anchor '+a);return html.slice(i,j);}
const eventFns=section('function jlScheduleEventsFor(date){','function jlScheduleNotesFor(date){');
function withEvents(events){return vm.runInNewContext(eventFns+';({jlScheduleEventsFor,jlScheduleEventLabel})',{jlScheduleEvents:events});}
test('multi-day event includes first/intermediate/last day, excludes boundaries',()=>{
 const e={start_date:'2026-11-11',end_date:'2026-11-13',all_day:true,title:'Absence'};
 const f=withEvents([e]);
 for(const d of ['2026-11-11','2026-11-12','2026-11-13'])assert.equal(f.jlScheduleEventsFor(d).length,1,d);
 for(const d of ['2026-11-10','2026-11-14'])assert.equal(f.jlScheduleEventsFor(d).length,0,d);
});
test('timed multi-day event labels start and end without inventing intermediate hours',()=>{
 const e={start_date:'2026-11-11',end_date:'2026-11-13',all_day:false,start_time:'09:15:00',end_time:'17:30:00',title:'Réservation'};
 const f=withEvents([e]);
 assert.match(f.jlScheduleEventLabel(e,'2026-11-11'),/^Dès 09:15/);
 assert.match(f.jlScheduleEventLabel(e,'2026-11-13'),/^Jusqu'à 17:30/);
 assert.match(f.jlScheduleEventLabel(e,'2026-11-12'),/Réservation/);
});
test('all-day events appear before timed events',()=>{
 const timed={start_date:'2026-11-13',end_date:'2026-11-13',all_day:false,start_time:'08:30'};
 const full={start_date:'2026-11-13',end_date:'2026-11-13',all_day:true};
 assert.equal(withEvents([timed,full]).jlScheduleEventsFor('2026-11-13')[0].all_day,true);
});
const conflictFn=section('function jlScheduleEventConflict(){','async function jlScheduleSaveEvent(event){');
function conflict(candidate,events=[],jobs=[],editId=''){
 const box={hidden:true,textContent:''},elements={
  jlScheduleEventConflict:box,jlScheduleEventId:{value:editId}
 };
 const context={document:{getElementById:id=>elements[id]},jlScheduleCandidate:()=>candidate,jlScheduleEvents:events,jlScheduleQuotes:jobs};
 vm.runInNewContext(conflictFn+';jlScheduleEventConflict()',context);
 return box;
}
const base={start_date:'2026-11-13',end_date:'2026-11-13',all_day:false,start_time:'09:00',end_time:'10:00'};
test('adjacent hours 10:00-11:00 do not count as overlap',()=>{
 const e={id:'e1',...base,start_time:'10:00',end_time:'11:00'};
 assert.equal(conflict(base,[e]).hidden,true);
});
test('overlapping workshop event warns but allows saving',()=>{
 const e={id:'e1',...base,start_time:'09:30',end_time:'11:00'};
 const result=conflict(base,[e]);
 assert.equal(result.hidden,false);
 assert.match(result.textContent,/Chevauchement possible/);
 assert.match(result.textContent,/Tu peux enregistrer quand même/);
});
test('edited event is excluded from its own overlap check',()=>{
 const e={id:'e1',...base};
 assert.equal(conflict(base,[e],[],'e1').hidden,true);
});
test('all-day absence detects overlapping jobs on included day',()=>{
 const candidate={...base,all_day:true,start_date:'2026-11-12',end_date:'2026-11-14'};
 const jobs=[{content:{appointment:{date:'2026-11-13',time:'09:30',durationMinutes:60}}}];
 const result=conflict(candidate,[],jobs);
 assert.equal(result.hidden,false);
 assert.match(result.textContent,/1 travail/);
});
test('unrelated day produces no conflict',()=>{
 const candidate={...base,start_date:'2026-11-18',end_date:'2026-11-18'};
 const job={content:{appointment:{date:'2026-11-13',time:'09:30',durationMinutes:60}}};
 assert.equal(conflict(candidate,[],[job]).hidden,true);
});
