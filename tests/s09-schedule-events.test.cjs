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
test('monthly cells are viewport-responsive and keep three previews',()=>{
 assert.match(html,/\.jl-schedule-day\{height:clamp\(85px,calc\(\(100dvh - 300px\)\/6\),102px\)/);
 assert.match(js,/visibleJobs=jobs\.slice\(0,3\)/);
 assert.match(js,/visibleEvents=events\.slice\(0,Math\.max\(0,3-visibleJobs\.length\)\)/);
 assert.match(js,/visibleNotes=notes\.slice\(0,Math\.max\(0,3-visibleJobs\.length-visibleEvents\.length\)\)/);
 assert.match(js,/const extra=jobs\.length\+notes\.length\+events\.length/);
});
test('workshop and private events have distinct colors',()=>{
 assert.match(html,/\.jl-schedule-mini\.workshop\{[^}]*#daa038/);
 assert.match(html,/\.jl-schedule-mini\.private\{[^}]*#48ad7d/);
 assert.match(html,/id="jlScheduleEventVisibility"/);
 assert.match(html,/id="jlScheduleEventType"/);
});
test('event dates, optional times and validations exist',()=>{
 assert.match(html,/id="jlScheduleEventStart" type="date"/);
 assert.match(html,/id="jlScheduleEventEnd" type="date"/);
 assert.match(html,/id="jlScheduleEventAllDay" checked/);
 assert.match(js,/candidate\.end_date<candidate\.start_date/);
 assert.match(js,/candidate\.end_time<=candidate\.start_time/);
});
test('events are scoped and write only to their own table',()=>{
 assert.match(js,/from\("garage_schedule_events"\)/);
 assert.match(js,/\.eq\("garage_id",ACTIVE_GARAGE_ID\)/);
 assert.match(js,/\.insert\(row\)/);
 assert.match(js,/\.update\(row\)\.eq\("id",id\)/);
 assert.match(js,/\.delete\(\)/);
 assert.doesNotMatch(js,/saveQuoteWorkflowChanges\(/);
});
test('calendar conflict warns but does not block',()=>{
 assert.match(js,/function jlScheduleEventConflict\(\)/);
 assert.match(js,/Chevauchement possible/);
 assert.match(js,/Tu peux enregistrer quand même/);
});
test('dashboard renders events and separates private events',()=>{
 assert.match(html,/function jlCalendarLoadEvents\(\)/);
 assert.match(html,/jlCalendarEventsFor\(key\)/);
 assert.match(html,/id="jlDayAgendaEvents"/);
});
