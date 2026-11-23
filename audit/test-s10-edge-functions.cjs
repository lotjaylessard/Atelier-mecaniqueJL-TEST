"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),cp=require("node:child_process");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"s10-functions-"));
const script=path.join(__dirname,"s10-check-edge-functions.cjs");
function check(){return cp.spawnSync(process.execPath,[script,root],{encoding:"utf8"})}
try{
 fs.writeFileSync(path.join(root,"index.html"),'const endpoint="https://example.supabase.co/functions/v1/garage-outlook-ical";');
 let r=check();assert.equal(r.status,1);assert.match(r.stdout,/garage-outlook-ical/);
 const p=path.join(root,"supabase","functions","garage-outlook-ical");fs.mkdirSync(p,{recursive:true});fs.writeFileSync(path.join(p,"index.ts"),"export {}");
 r=check();assert.equal(r.status,0,r.stdout);
 console.log("S10_EDGE_FUNCTION_TESTS_OK : 2 scénarios.");
}finally{fs.rmSync(root,{recursive:true,force:true})}
