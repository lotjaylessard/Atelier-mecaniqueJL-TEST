'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const start=html.indexOf('const jlScheduleVisibility={');
const end=html.indexOf('function jlScheduleMonthStart(){',start);
assert.ok(start>0&&end>start,'Calendar filter controller not found');
const code=html.slice(start,end);
test('Horaire has 4 active category checkboxes and future provider filters disabled',()=>{
 for(const category of ['work','note','workshop','private'])
   assert.match(html,new RegExp('data-jl-schedule-filter="'+category+'" checked'));
 for(const provider of ['google','microsoft'])
   assert.match(html,new RegExp('data-jl-schedule-filter="'+provider+'" disabled'));
 assert.doesNotMatch(html,/id="jlScheduleCalendarsToggle"/);
});
test('Filters are account- and garage-specific, never shared through garage DB',()=>{
 assert.match(code,/jl-schedule-visibility:"\+ACTIVE_GARAGE_ID\+":"\+userId/);
 assert.match(code,/localStorage\.getItem\(key\)/);
 assert.match(code,/localStorage\.setItem\(jlScheduleVisibilityOwnerKey/);
 assert.doesNotMatch(code,/from\("garage_|\.insert\(/);
});
test('Unchecking filters hides events from month previews and selected-day detail without changing stored data',()=>{
 assert.match(html,/const jobs=jlScheduleVisibility\.work\?jlScheduleJobsFor\(date\):\[\]/);
 assert.match(html,/const notes=jlScheduleVisibility\.note\?jlScheduleNotesFor\(date\):\[\]/);
 assert.match(html,/jlScheduleEventsFor\(date\)\.filter\(e=>jlScheduleVisibility\[e\.visibility==="private"\?"private":"workshop"\]\)/);
 assert.match(html,/jlScheduleRender\(\)/);
});
test('Filters default to on, can be saved and restored independently',()=>{
 let stored={};
 const checkboxes=['work','note','workshop','private'].map(k=>({dataset:{jlScheduleFilter:k},checked:true,disabled:false,addEventListener(event,cb){this.callback=cb;}}));
 const context={ACTIVE_GARAGE_ID:'g1',localStorage:{getItem(k){return stored[k]||null;},setItem(k,v){stored[k]=v;}},document:{querySelectorAll(){return checkboxes;}},jlScheduleRender(){context.rendered=(context.rendered||0)+1;}};
 vm.createContext(context);
 vm.runInContext(code,context);
 context.jlScheduleInitFilters();
 context.jlScheduleLoadVisibility('u1');
 checkboxes[0].checked=false;checkboxes[0].callback();
 assert.equal(checkboxes[0].checked,false);
 assert.equal(context.rendered,1);
 const record=JSON.parse(stored['jl-schedule-visibility:g1:u1']);
 assert.equal(record.work,false);
 context.jlScheduleLoadVisibility('u2');
 assert.equal(checkboxes[0].checked,true,'second owner must not inherit hidden work');
 context.jlScheduleLoadVisibility('u1');
 assert.equal(checkboxes[0].checked,false,'original owner preference restored');
});
