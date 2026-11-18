'use strict';
const endpoint='https://nraijzsodgojkpyigefu.supabase.co/functions/v1/garage-calendar-oauth';
(async()=>{
 const timeout=AbortSignal.timeout(12000);
 const response=await fetch(endpoint,{method:'GET',signal:timeout});
 if(!response.ok)throw Error('Endpoint GET returned '+response.status);
 const metadata=await response.json();
 if(typeof metadata.google_available!=='boolean'||metadata.phase!=='test'||metadata.read_only!==true)
  throw Error('Unexpected public status response');
 console.log('Google OAuth TEST endpoint reachable; configured='+metadata.google_available);
 if(!metadata.google_available){
  const noClient=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({garage_id:'00000000-0000-4000-8000-000000000000'}),signal:AbortSignal.timeout(12000)});
  if(noClient.status!==503)throw Error('Missing OAuth config must fail closed with 503: '+noClient.status);
  console.log('OAuth unconfigured: POST fails closed (503)');
 }
})().catch(e=>{console.error(e);process.exitCode=1});
