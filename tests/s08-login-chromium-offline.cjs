'use strict';
// Real Chromium smoke against login.html with fake Auth, never real credentials.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
let source=fs.readFileSync(path.join(__dirname,'..','login.html'),'utf8');
const marker='import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";';
if(!source.includes(marker)) throw Error('Expected pinned SDK import missing in login');
source=source.replace(marker, [
 'function createClient(){',
 'return {auth:{',
 'getSession:async()=>({data:{session:null}}),',
 'signInWithPassword:async()=>({error:{message:"Faux identifiants refusés"}})',
 '}};}'
].join('\n'));
const injected=[
 '<output id="s08-login-result">PENDING</output>',
 '<script>',
 'window.addEventListener("load",()=>{setTimeout(async()=>{',
 'const o=document.getElementById("s08-login-result");',
 'try {',
 'document.getElementById("loginEmail").value="fake@example.invalid";',
 'document.getElementById("loginPassword").value="faux";',
 'document.getElementById("btnLogin").click();',
 'await new Promise(r=>setTimeout(r,300));',
 'if(document.getElementById("loginError").textContent!=="Faux identifiants refusés")throw Error("Error response not displayed");',
 'o.textContent="PASS";',
 '}catch(e){o.textContent="FAIL: "+String(e.message||e);}',
 '},200)});',
 '</script>'
].join('\n');
const html=source.replace('</body>',injected+'</body>');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'s08-login-chrome-'));
try{
 const file=path.join(directory,'login.html');
 fs.writeFileSync(file,html,'utf8');
 const candidates=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
 const browser=candidates.find(p=>fs.existsSync(p));
 if(!browser)throw Error('Chromium unavailable');
 const r=spawnSync(browser,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--virtual-time-budget=3000','--dump-dom','file://'+file],{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
 if(r.error)throw r.error;
 if(!/<output id="s08-login-result">PASS<\/output>/.test(r.stdout||'')){
 const observed=((r.stdout||'').match(/<output id="s08-login-result">([^<]*)<\/output>/)||[])[1]||'no result';
 throw Error('Login Chromium smoke failed: '+observed+'; exit='+r.status);
 }
 console.log('S08 PASS: real Chromium tested login error handling with fake Supabase Auth');
} finally{fs.rmSync(directory,{recursive:true,force:true});}
