'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const begin=html.indexOf('function jlCalendarRender(){');
const end=html.indexOf('function jlCalendarInit(){',begin);
assert.ok(begin>=0&&end>begin);
const source=html.slice(begin,end);
test('calendar days have consistent fixed height and clip long content',()=>{
 assert.match(html,/#page-dashboard \.jl-calendar-day\{[^}]*height:195px;[^}]*overflow:hidden/);
});
test('weekly calendar shows at most 3 previews and a remaining count',()=>{
 assert.match(source,/appointments\.slice\(0,3\)/);
 assert.match(source,/dayNotes\.slice\(0,Math\.max\(0,3-visibleAppointments\.length\)\)/);
 assert.match(source,/const hiddenCount=appointments\.length\+dayNotes\.length-visibleAppointments\.length-visibleNotes\.length/);
 assert.match(source,/if\(hiddenCount>0\)/);
});
test('overflow count opens full day and neither notes nor appointments are deleted',()=>{
 assert.match(source,/more\.addEventListener\("click",\(\)=>jlCalendarOpenDay\(key\)\)/);
 assert.match(html,/function jlDayAgendaRender\(\)/);
 assert.match(html,/for\(const note of jlCalendarNotesFor\(date\)\)/);
 assert.match(html,/const quotes=jlCalendarQuotes\.filter\(q=>q\.content\?\.appointment\?\.date===date\)/);
});

test('jobs have priority over notes within the three visible slots',()=>{
 const jobs=source.indexOf('for(const q of visibleAppointments)');
 const notes=source.indexOf('for(const n of visibleNotes)');
 assert.ok(jobs>=0&&notes>jobs);
 assert.match(source,/visibleAppointments=appointments\.slice\(0,3\)/);
 assert.match(source,/visibleNotes=dayNotes\.slice\(0,Math\.max\(0,3-visibleAppointments\.length\)\)/);
});
