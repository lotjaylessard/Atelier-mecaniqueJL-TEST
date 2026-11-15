'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const start=html.indexOf('/* S09 — Horaire mensuel');
const end=html.indexOf('// Le calendrier conserve seulement les rendez-vous confirmés',start);
assert.ok(start>=0&&end>start,'Module Horaire introuvable');
const source=html.slice(start,end);
test('navigation sidebar between Dashboard and Soumissions',()=>{
 assert.match(html,/data-page="page-dashboard">[^<]*Dashboard<\/button>\s*<button class="navBtn" data-page="page-schedule">[^<]*Horaire<\/button>\s*<button class="navBtn" data-page="page-quotes"/);
 assert.match(html,/id="page-schedule"/);
 assert.match(html,/id === "page-schedule" && typeof jlScheduleOpen/);
});
test('monthly view opens current month with day details hidden',()=>{
 assert.match(source,/jlScheduleShift=0;jlScheduleSelected=""/);
 assert.match(source,/jlScheduleDayPanel"\)\.hidden=true/);
 assert.match(source,/new Date\(d\.getFullYear\(\),d\.getMonth\(\)\+jlScheduleShift,1\)/);
});
test('three previews with work prioritized and day access',()=>{
 assert.match(source,/visibleJobs=jobs\.slice\(0,3\)/);
 assert.match(source,/visibleNotes=notes\.slice\(0,Math\.max\(0,3-visibleJobs\.length\)\)/);
 assert.match(source,/jlScheduleDayOpen\(date\)/);
 assert.match(source,/const extra=jobs\.length\+notes\.length-visibleJobs\.length-visibleNotes\.length/);
});
test('month reads same Supabase sources with current user and garage',()=>{
 assert.match(source,/from\("garage_quotes"\)/);
 assert.match(source,/from\("garage_calendar_notes"\)/);
 assert.match(source,/\.eq\("garage_id",ACTIVE_GARAGE_ID\)\.eq\("user_id",auth\.user\.id\)/);
 assert.match(source,/\.gte\("note_date",min\)\.lte\("note_date",max\)/);
});
test('new note writes after Supabase confirmation and refreshes dashboard notes',()=>{
 assert.match(source,/\.insert\(\{garage_id:ACTIVE_GARAGE_ID,user_id:auth\.user\.id,/);
 assert.match(source,/if\(error\|\|!data\)throw/);
 assert.match(source,/void jlCalendarLoadNotes\(\)/);
 assert.doesNotMatch(source,/saveQuoteWorkflowChanges\(/);
});
test('colors, today and selection, no events creation during phase 1',()=>{
 assert.match(html,/jl-schedule-mini\.work\{[^}]*#ef6161/);
 assert.match(html,/jl-schedule-mini\.note\{[^}]*#5da9ff/);
 assert.match(html,/jl-schedule-day\[data-today="true"\]/);
 assert.match(html,/jl-schedule-day\[data-selected="true"\]/);
 assert.match(html,/id="jlScheduleNewEvent"[^>]*disabled/);
});
