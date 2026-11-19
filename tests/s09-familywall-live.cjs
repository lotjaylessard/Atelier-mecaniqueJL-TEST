'use strict';
(async()=>{
 const endpoint='https://nraijzsodgojkpyigefu.supabase.co/functions/v1/garage-familywall-calendar';
 const r=await fetch(endpoint,{method:'GET',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('FamilyWall endpoint unavailable: '+r.status);
 const status=await r.json();
 if(status.available!==true||status.provider!=='familywall'||status.mode!=='read_only'||status.phase!=='TEST')
  throw Error('Unexpected FamilyWall availability response');
 const denied=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sync',garage_id:'00000000-0000-4000-8000-000000000000'}),signal:AbortSignal.timeout(12000)});
 if(denied.status!==403)throw Error('Anonymous FamilyWall requests must be denied, got '+denied.status);
 console.log('FamilyWall TEST endpoint verified: read only, no token, anonymous rejected');
})().catch(e=>{console.error(e);process.exitCode=1;});
