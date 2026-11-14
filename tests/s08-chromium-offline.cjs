'use strict';
// S08 TEST: real headless Chromium smoke test, with local fake cloud only.
// Does NOT log in to Supabase and does NOT verify physical Storage bytes.
const { spawnSync }=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function section(from,to){
 const a=html.indexOf(from),b=html.indexOf(to,a);
 if(a<0||b<=a)throw Error('Missing source anchor: '+from);
 return html.slice(a,b);
}
const upload=section('function initWorkOrderAttachments(wo){','function renderWorkOrderAttachments(wo){');
const recovery=section('function showUnlinkedAttachmentRecoveryNotice(){','function showCloudRecoveryBanner(key) {');

const runner=[
 '(async function(){',
 'const output=document.getElementById("s08-smoke");',
 'try {',
 'window.SUPABASE_USER={id:"user-fixture"};',
 'window.ACTIVE_GARAGE_ID="garage-fixture";',
 'window.TEST_STORAGE_PREFIX="S08_CHROME_FIXTURE";',
 'window.CLOUD_DATA_READY=true;',
 'window.CLOUD_SYNC_FAILED=false;',
 'window.CLOUD_SYNC_IN_PROGRESS=false;',
 'window.CLOUD_SYNC_PENDING=false;',
 'window.CLOUD_SYNC_DIRTY=false;',
 'window.cloudSyncTimer=null;',
 'window.CLOUD_DATA_VERSION=3;',
 'window.CLOUD_CHANGE_REVISION=1;',
 'const snapshot={clients:[],invoices:[],workorders:[],notes:[],links:[],parts:[],services:[],settings:{},invoiceCounter:0};',
 'window.CLOUD_LAST_CONFIRMED_SNAPSHOT=snapshot;',
 'window.captureLocalGarageSnapshot=()=>snapshot;',
 'window.garageSnapshotsEquivalent=(a,b)=>JSON.stringify(a)===JSON.stringify(b);',
 'window.isWorkOrderLocked=()=>false;',
 'window.renderWorkOrderAttachments=()=>{};',
 'window.sanitize=v=>String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"-");',
 'window.__saves=0;',
 'window.saveWorkOrders=()=>{window.__saves++;};',
 'window.alert=()=>{};',
 'window.sb={',
 'from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{version:3},error:null})})})}),',
 'storage:{from:()=>({upload:async()=>({error:null})})}',
 '};',
 'const wo={id:"w-fixture",number:"BT-FIXTURE",clientName:"Client fictif",vehicleLabel:"Auto fictive",attachments:[]};',
 'const file=new File(["fictional file data"],"fixture.pdf",{type:"application/pdf"});',
 'const dt=new DataTransfer();dt.items.add(file);',
 'const input=document.getElementById("woFileInput");input.files=dt.files;',
 'initWorkOrderAttachments(wo);',
 'if(typeof input.onchange!=="function")throw Error("Upload handler missing");',
 'await input.onchange.call(input);',
 'if(wo.attachments.length!==1||window.__saves!==1)throw Error("Upload/mock did not add a single BT reference");',
 'const record={format:"atelier-test-unlinked-attachment-v1",userId:"user-fixture",garageId:"garage-fixture",storageBucket:"wo-files",storagePath:"user-fixture/clients/test/BT-1/fixture.pdf",fileName:"fixture.pdf"};',
 'localStorage.setItem("S08_CHROME_FIXTURE_garage-fixture_unlinked_attachment_1",JSON.stringify(record));',
 'showUnlinkedAttachmentRecoveryNotice();',
 'if(!document.getElementById("s08UnlinkedAttachmentNotice"))throw Error("Recovery notice absent for owner");',
 'window.SUPABASE_USER.id="other-user";',
 'showUnlinkedAttachmentRecoveryNotice();',
 'if(document.getElementById("s08UnlinkedAttachmentNotice"))throw Error("Foreign user can see recovery notice");',
 'output.textContent="PASS";',
 '} catch(e) {output.textContent="FAIL: "+String(e&&e.message||e);}',
 '})();'
].join('\n');
const page='<!doctype html><meta charset="utf-8"><body>'+
  '<input type="file" multiple id="woFileInput"><div id="woAttachmentsList"></div>'+
  '<output id="s08-smoke">PENDING</output>'+
  '<script>'+recovery+'\n'+upload+'\n'+runner+'</script></body>';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s08-chromium-'));
try{
 const filename=path.join(dir,'test.html');
 fs.writeFileSync(filename,page,'utf8');
 const candidates=[
   process.env.CHROME_BIN,
   '/usr/bin/google-chrome',
   '/usr/bin/google-chrome-stable',
   '/usr/bin/chromium',
   '/usr/bin/chromium-browser'
 ].filter(Boolean);
 const browser=candidates.find(p=>fs.existsSync(p));
 if(!browser)throw Error('Chromium/Google Chrome executable unavailable; real browser check not run');
 const result=spawnSync(browser,[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--disable-background-networking','--virtual-time-budget=2000',
   '--dump-dom','file://'+filename
 ],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024*5});
 if(result.error)throw result.error;
 const output=result.stdout||'';
 if(!/<output id="s08-smoke">PASS<\/output>/.test(output)){
   const actual=(output.match(/<output id="s08-smoke">([^<]*)<\/output>/)||[])[1]||'no result';
   throw Error('Chromium failed: '+actual+'; exit='+result.status);
 }
 console.log('S08 PASS: actual headless Chromium executed BT upload + account-scoped recovery UI against current index.html functions');
} finally{
 fs.rmSync(dir,{recursive:true,force:true});
}
