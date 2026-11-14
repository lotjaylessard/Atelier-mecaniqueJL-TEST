'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function section(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Section manquante: '+start);
 return html.slice(a,b);
}
const agenda=section('let jlCalendarNotes=[],','async function dashboardRefreshPendingQuotes(){');
test('agenda détaillé affiché uniquement à la demande',()=>{
 assert.match(html,/id="jlDayAgenda"[^>]*hidden/);
 assert.match(html,/id="jlDayAgendaAppointments"/);
 assert.match(html,/id="jlDayAgendaNotes"/);
 assert.match(html,/jlCalendarOpenDay\(key\)/);
 assert.match(agenda,/jlDayAgendaRender\(\)/);
});
test('la vue hebdomadaire conserve les rendez-vous SO et montre les notes',()=>{
 assert.match(agenda,/jlCalendarQuotes\.filter\(q=>q\.content\?\.appointment\?\.date===key\)/);
 assert.match(agenda,/jlCalendarNotesFor\(key\)/);
 assert.match(agenda,/jl-calendar-day-note/);
});
test('les notes sont lues uniquement pour le bon utilisateur et garage',()=>{
 assert.match(agenda,/from\("garage_calendar_notes"\)/);
 assert.match(agenda,/\.eq\("garage_id",ACTIVE_GARAGE_ID\)\.eq\("user_id",auth\.user\.id\)/);
 assert.match(agenda,/\.gte\("note_date",min\)\.lte\("note_date",max\)/);
});
test('une note est confirmée seulement après écriture serveur',()=>{
 assert.match(agenda,/\.insert\(\{garage_id:ACTIVE_GARAGE_ID,user_id:auth\.user\.id,note_date:date,note_text:value\}\)/);
 assert.match(agenda,/\.select\("id,note_date,note_text,created_at"\)\.single\(\)/);
 assert.match(agenda,/if\(error\|\|!data\)throw/);
 assert.match(agenda,/Note enregistrée sur Supabase/);
});
test('l agenda n écrit ni dans les BT ni les soumissions',()=>{
 assert.doesNotMatch(agenda,/persistActiveWO\(/);
 assert.doesNotMatch(agenda,/saveQuoteWorkflowChanges\(/);
 assert.match(agenda,/jlDashboardOpenQuote\(q\.id\)/);
});
