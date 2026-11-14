'use strict';
// S08: public, unauthenticated GitHub Pages deployment comparison.
// Never logs in, uploads, or reads customer data.
const fs=require('node:fs');
const path=require('node:path');
const https=require('node:https');
const crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const url='https://lotjaylessard.github.io/Atelier-mecaniqueJL-TEST/';
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
function get(address,redirects=0){
 return new Promise((resolve,reject)=>{
   if(redirects>3)return reject(Error('Too many redirects'));
   const req=https.get(address,{headers:{'user-agent':'S08-audit-deployment-readonly','accept':'text/html'},timeout:12000},res=>{
     const status=res.statusCode||0;
     if(status>=300&&status<400&&res.headers.location){
       res.resume();return resolve(get(new URL(res.headers.location,address).href,redirects+1));
     }
     let text='',size=0;
     res.setEncoding('utf8');
     res.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>5*1024*1024){req.destroy(Error('Page exceeds 5 MB'));return;}text+=chunk;});
     res.on('end',()=>resolve({status,html:text,address}));
     res.on('error',reject);
   });
   req.on('timeout',()=>req.destroy(Error('Timeout')));
   req.on('error',reject);
 });
}
(async()=>{
 const output={
   checked_url:url,
   checked_at:new Date().toISOString(),
   source_branch:'s08/soumissions',
   source_sha256:digest(source),
   result:'UNKNOWN',
   reason:'Not checked',
   scope:'Public static HTML only. No login, cloud data, or physical files.'
 };
 try{
   const r=await get(url);
   output.http_status=r.status;
   if(r.status!==200){output.result='NOT_PUBLISHED';output.reason='GitHub Pages returned HTTP '+r.status;}
   else{
     output.live_sha256=digest(r.html);
     output.same_as_s08=output.source_sha256===output.live_sha256;
     output.s08_recovery_marker_present=r.html.includes('function showUnlinkedAttachmentRecoveryNotice(){');
     output.test_supabase_project_present=r.html.includes('nraijzsodgojkpyigefu.supabase.co');
     output.result=output.same_as_s08?'MATCH':'MISMATCH';
     output.reason=output.same_as_s08?'Page matches S08 index.html bytes':'Page differs from S08 index.html; publication source needs verification';
   }
 }catch(e){output.result='UNREACHABLE';output.reason=String(e.message||e).slice(0,200);}
 fs.mkdirSync(path.join(__dirname,'..','audit'),{recursive:true});
 fs.writeFileSync(path.join(__dirname,'..','audit','s08-pages-deployment.json'),JSON.stringify(output,null,2)+'\n');
 console.log('S08 GitHub Pages public static deployment check:',output.result,output.reason);
})().catch(e=>{console.error(e);process.exitCode=1;});
