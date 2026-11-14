'use strict';
// Real offline Chromium smoke for physical-backup UI, fake Auth and fake disk.
// This test NEVER downloads actual Supabase files or writes to a customer folder.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

let html=fs.readFileSync(path.join(__dirname,'..','audit','s08-physical-backup.html'),'utf8');
const importLine='import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";';
if(!html.includes(importLine))throw Error('Expected import missing');
html=html.replace(importLine,
 'function createClient(){return {auth:{getUser:async()=>({data:{user:{id:"fixture-user"}},error:null})}}}');
html=html.replace('<script src="./s08-physical-backup.js"></script>',[
 '<script>',
 'Object.defineProperty(window,"showDirectoryPicker",{configurable:true,value:async()=>({fake:true})});',
 'window.S08PhysicalBackup={backup:async()=>({status:"COMPLETE",fileCount:2,totalBytes:11,failed:[]})};',
 '</script>'
].join('\n'));
const runner=[
 '<output id="s08-physical-result">PENDING</output>',
 '<script>',
 'window.addEventListener("load",()=>{setTimeout(async()=>{',
 'const result=document.getElementById("s08-physical-result");',
 'try{',
 'const btn=document.getElementById("start");',
 'if(btn.disabled)throw Error("Backup action disabled after fake login");',
 'btn.click();',
 'await new Promise(r=>setTimeout(r,250));',
 'if(!document.getElementById("status").textContent.includes("Sauvegarde complète"))',
 ' throw Error("Successful fake backup status not shown");',
 'result.textContent="PASS";',
 '}catch(e){result.textContent="FAIL: "+String(e.message||e)}',
 '},300)});',
 '</script>'
].join('\n');
html=html.replace('</body>',runner+'</body>');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s08-backup-page-'));
try{
 const file=path.join(dir,'backup.html');
 fs.writeFileSync(file,html);
 const browsers=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
 const browser=browsers.find(b=>fs.existsSync(b));
 if(!browser)throw Error('Chrome/Chromium unavailable');
 const run=spawnSync(browser,[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--disable-background-networking','--virtual-time-budget=4000','--dump-dom',
  'file://'+file
 ],{encoding:'utf8',timeout:30000,maxBuffer:3*1024*1024});
 if(run.error)throw run.error;
 const match=(run.stdout||'').match(/<output id="s08-physical-result">([^<]*)<\/output>/);
 if(!match||match[1]!=='PASS')
  throw Error('Physical backup UI smoke failed: '+(match?.[1]||'no output')+', exit '+run.status);
 console.log('S08 PASS: real Chromium exercised opt-in physical backup page with fake Auth and fake directory');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
