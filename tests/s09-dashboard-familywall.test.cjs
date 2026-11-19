'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
test('Dashboard weekly calendar loads private FamilyWall events separately from shared garage schedule',()=>{
 assert.match(html,/async function jlCalendarLoadFamilyWall\(\)/);
 assert.match(html,/from\("garage_external_calendar_connections"\)/);
 const from=html.indexOf('async function jlCalendarLoadFamilyWall()');
 const to=html.indexOf('function jlCalendarEventsFor(date)',from);
 assert.ok(from>0&&to>from);
 const f=html.slice(from,to);
 assert.match(f,/\.eq\("user_id",auth\.user\.id\)/);
 assert.match(f,/\.eq\("provider","familywall"\)/);
 assert.match(f,/\.eq\("connection_id",connectionId\)/);
 assert.doesNotMatch(f,/\.insert\(|\.update\(|\.delete\(/);
});
test('FamilyWall is rendered in both Dashboard week and day detail with private color rules',()=>{
 assert.match(html,/const dayFamily=jlCalendarFamilyWallFor\(key\)/);
 assert.match(html,/for\(const event of visibleFamily\)/);
 assert.match(html,/jlFamilyWallStyleEvent\(item,event\.event_title\)/);
 assert.match(html,/for\(const e of jlCalendarFamilyWallFor\(date\)\)/);
 assert.match(html,/jlFamilyWallStyleEvent\(item,e\.event_title\)/);
 assert.match(html,/jlCalendarFamilyWallFor\(date\)\{[\s\S]*jlScheduleVisibility\.familywall/);
});
test('Dashboard week navigation reloads FamilyWall for previous/next/today',()=>{
 const init=html.slice(html.indexOf('function jlCalendarInit(){'),html.indexOf('async function dashboardRefreshPendingQuotes()',html.indexOf('function jlCalendarInit(){')));
 assert.equal((init.match(/void jlCalendarLoadFamilyWall\(\)/g)||[]).length,4);
});
test('Dashboard overflow includes FamilyWall events, while planned jobs remain first',()=>{
 assert.match(html,/const visibleAppointments=appointments\.slice\(0,3\)/);
 assert.match(html,/const visibleFamily=dayFamily\.slice\(0,Math\.max\(0,3-visibleAppointments\.length-visibleEvents\.length\)\)/);
 assert.match(html,/const hiddenCount=appointments\.length\+dayNotes\.length\+dayEvents\.length\+dayFamily\.length-visibleAppointments\.length-visibleNotes\.length-visibleEvents\.length-visibleFamily\.length/);
});
