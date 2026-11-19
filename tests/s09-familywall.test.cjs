'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const moduleText=fs.readFileSync(path.join(__dirname,'..','supabase','functions','garage-familywall-calendar','ics.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','supabase','functions','garage-familywall-calendar','index.ts'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let lib;
test('load pure FamilyWall parser module',async()=>{
 lib=await import('data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64'));
 assert.equal(typeof lib.parseFamilyWallICS,'function');
});
test('single all-day and two-day events use exclusive end correctly',()=>{
 const feed=[
 'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:one@example',
 'SUMMARY:École','DTSTART;VALUE=DATE:20261119','DTEND;VALUE=DATE:20261120','END:VEVENT',
 'BEGIN:VEVENT','UID:two@example','SUMMARY:Voyage','DTSTART;VALUE=DATE:20261120',
 'DTEND;VALUE=DATE:20261123','END:VEVENT','END:VCALENDAR'].join('\r\n');
 const events=lib.parseFamilyWallICS(feed,{min:'2026-11-01',max:'2026-11-30'});
 assert.equal(events.length,2);
 assert.equal(events[0].start_date,'2026-11-19');
 assert.equal(events[0].end_date,'2026-11-19');
 assert.equal(events[1].end_date,'2026-11-22');
 assert.equal(events[0].start_at,null);
});
test('unfolds ICS multiline summaries without executing markup',()=>{
 const f='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:3\nSUMMARY:Visite à\n  la famille\nDTSTART:20261119T100000\nDTEND:20261119T110000\nEND:VEVENT\nEND:VCALENDAR';
 assert.equal(lib.parseFamilyWallICS(f)[0].event_title,'Visite à la famille');
});
test('rejects malformed and unsupported recurring feeds without deleting cache',()=>{
 assert.throws(()=>lib.parseFamilyWallICS('not calendar'));
 assert.throws(()=>lib.parseFamilyWallICS('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:3\nDTSTART:20261119T100000\nRRULE:FREQ=WEEKLY\nEND:VEVENT\nEND:VCALENDAR'),/récurrent/);
 assert.match(server,/parseFamilyWallICS\(text/);
 assert.ok(server.indexOf('parseFamilyWallICS(text')<server.indexOf('garage_external_calendar_events","DELETE'),'parse before delete');
});
test('FamilyWall URL SSRF guard only permits HTTPS familywall hosts',()=>{
 assert.equal(lib.validateFamilyWallUrl('webcal://calendar.familywall.com/example.ics'),'https://calendar.familywall.com/example.ics');
 assert.throws(()=>lib.validateFamilyWallUrl('http://familywall.com/a.ics'));
 assert.throws(()=>lib.validateFamilyWallUrl('https://familywall.com.evil.com/a.ics'));
 assert.throws(()=>lib.validateFamilyWallUrl('https://127.0.0.1/a.ics'));
 assert.throws(()=>lib.validateFamilyWallUrl('https://user:pass@familywall.com/a.ics'));
 assert.throws(()=>lib.validateFamilyWallUrl('https://familywall.com:8443/a.ics'));
 assert.match(server,/redirect:"error"/);
});
test('feed URL is encrypted and never returned to client',()=>{
 assert.match(server,/AES-GCM/);
 assert.match(server,/garage_familywall_feed_secrets/);
 assert.match(server,/url_ciphertext/);
 assert.doesNotMatch(server,/console\.log\(/);
 assert.match(server,/getCaller|authenticated\(req,garageId\)/);
});
test('FamilyWall is fully separate in Settings and Horaire filters',()=>{
 assert.match(html,/id="jlScheduleExternalFamilyWall"/);
 assert.match(html,/id="jlScheduleFamilyWallUrl"/);
 assert.match(html,/data-jl-schedule-filter="familywall" disabled/);
 assert.match(html,/jlScheduleFamilyWallFor\(date\)/);
 assert.match(html,/jlScheduleVisibility=\{work:true,note:true,workshop:true,private:true,familywall:true\}/);
 assert.match(html,/id="jlScheduleFamilyWallConnect"/);
 assert.match(html,/id="jlScheduleFamilyWallSync"/);
});
test('server enforces owner bound reads, deletes and sync throttle',()=>{
 assert.match(server,/user_id:"eq\."\+userId,garage_id:"eq\."\+garageId/);
 assert.match(server,/user_id:"eq\."\+userId,provider:"eq\.familywall"/);
 assert.match(server,/15\*60\*1000/);
 assert.match(server,/grant|\/\/ Never leak the iCal URL/);
});
