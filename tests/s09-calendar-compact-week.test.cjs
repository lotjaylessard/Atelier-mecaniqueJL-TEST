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
 assert.match(html,/#page-dashboard \.jl-calendar-day\{[^}]*height:170px;[^}]*overflow:hidden/);
});
test('weekly calendar shows at most 2 previews and a remaining count',()=>{
 assert.match(source,/appointments\.slice\(0,2\)/);
 assert.match(source,/dayNotes\.slice\(0,Math\.max\(0,2-visibleAppointments\.length\)\)/);
 assert.match(source,/const hiddenCount=appointments\.length\+dayNotes\.length-visibleAppointments\.length-visibleNotes\.length/);
 assert.match(source,/if\(hiddenCount>0\)/);
});
test('overflow count opens full day and neither notes nor appointments are deleted',()=>{
 assert.match(source,/more\.addEventListener\("click",\(\)=>jlCalendarOpenDay\(key\)\)/);
 assert.match(html,/function jlDayAgendaRender\(\)/);
 assert.match(html,/for\(const note of jlCalendarNotesFor\(date\)\)/);
 assert.match(html,/const quotes=jlCalendarQuotes\.filter\(q=>q\.content\?\.appointment\?\.date===date\)/);
});
