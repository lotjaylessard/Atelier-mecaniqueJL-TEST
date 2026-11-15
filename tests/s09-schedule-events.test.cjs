'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const first=html.indexOf('/* S09 — Horaire mensuel');
const last=html.indexOf('// Le calendrier conserve seulement les rendez-vous confirmés',first);
assert.ok(first>=0&&last>first);
const js=html.slice(first,last);
test('six-week month fits viewport and reserves a visible overflow indicator',()=>{
 assert.match(html,/\.jl-schedule-month-grid\[data-weeks="6"\] \.jl-schedule-day\{height:clamp\(/);
 assert.match(html,/\.jl-schedule-more\{position:absolute;bottom:3px;/);
 assert.match(js,/grid\.dataset\.weeks=String\(slots\/7\)/);
 assert.match(js,/const previewLimit=slots===42\?2:3/);
 assert.match(js,/visibleJobs=jobs\.slice\(0,previewLimit\)/);
 assert.match(js,/const extra=jobs\.length\+notes\.length\+events\.length/);
 assert.match(js,/more\.addEventListener\("click",\(\)=>jlScheduleDayOpen\(date\)\)/);
});
test('workshop and private events have distinct colors',()=>{
 assert.match(html,/\.jl-schedule-mini\.workshop\{[^}]*#daa038/);
 assert.match(html,/\.jl-schedule-mini\.private\{[^}]*#48ad7d/);
 assert.match(html,/id="jlScheduleEventVisibility"/);
 assert.match(html,/id="jlScheduleEventType"/);
});
test('multi-day event dates and optional hours are validated',()=>{
 assert.match(html,/id="jlScheduleEventStart" type="date"/);
 assert.match(html,/id="jlScheduleEventEnd" type="date"/);
 assert.match(html,/id="jlScheduleEventAllDay" checked/);
 assert.match(js,/candidate\.end_date<candidate\.start_date/);
 assert.match(js,/candidate\.end_time<=candidate\.start_time/);
});
test('event reads and writes use garage scope and owner guard',()=>{
 assert.match(js,/from\("garage_schedule_events"\)/);
 assert.match(js,/\.eq\("garage_id",ACTIVE_GARAGE_ID\)/);
 assert.match(js,/\.update\(row\)\s*\.eq\("id",id\)\.eq\("garage_id",ACTIVE_GARAGE_ID\)\.eq\("user_id",auth\.user\.id\)/);
 assert.match(js,/\.delete\(\)\s*\.eq\("id",id\)\.eq\("garage_id",ACTIVE_GARAGE_ID\)\.eq\("user_id",auth\.user\.id\)/);
 assert.doesNotMatch(js,/saveQuoteWorkflowChanges\(/);
});
test('conflicts warn rather than block',()=>{
 assert.match(js,/function jlScheduleEventConflict\(\)/);
 assert.match(js,/Chevauchement possible/);
 assert.match(js,/Tu peux enregistrer quand même/);
});
test('dashboard includes separate private and workshop events',()=>{
 assert.match(html,/function jlCalendarLoadEvents\(\)/);
 assert.match(html,/jlCalendarEventsFor\(key\)/);
 assert.match(html,/id="jlDayAgendaEvents"/);
});
