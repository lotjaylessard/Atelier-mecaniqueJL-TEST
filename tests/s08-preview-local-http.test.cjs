'use strict';
// S08: real HTTP smoke of the exact launcher distributed in preview ZIP.
// Uses OS-assigned 127.0.0.1 port and fictitious, unauthenticated GETs only.
// Never uses credentials, cloud writes, or physical Storage objects.
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');

test('standalone S08 preview launcher serves actual HTML and scripts over loopback',async(t)=>{
  const base=path.join(__dirname,'..');
  const python=process.env.S08_PYTHON || 'python3';
  const child=spawn(python,['-u',path.join(base,'start-s08-preview.py')],{
    cwd:base,
    env:{...process.env,S08_NO_BROWSER:'1',S08_PREVIEW_PORT:'0',PYTHONUNBUFFERED:'1'},
    stdio:['ignore','pipe','pipe']
  });
  let output='',errors='';
  t.after(()=>{if(!child.killed)child.kill('SIGTERM');});
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data',x=>output+=x);
  child.stderr.on('data',x=>errors+=x);
  let origin='';
  const deadline=Date.now()+8000;
  while(Date.now()<deadline){
    const match=output.match(/http:\/\/127\.0\.0\.1:(\d+)\/login\.html/);
    if(match){origin='http://127.0.0.1:'+match[1];break;}
    if(child.exitCode!==null)throw Error('Preview launcher exited: '+errors.slice(0,250));
    await new Promise(resolve=>setTimeout(resolve,80));
  }
  assert.ok(origin,'S08 preview did not start on loopback: '+errors.slice(0,250));
  const paths=['/login.html','/index.html',
    '/audit/s06-live-test.js','/audit/s06-wo-pilot.js',
    '/audit/s06-sidebar-persistent.js',
    '/audit/s08-physical-backup.html',
    '/audit/s08-physical-backup.js'];
  for(const pathname of paths){
    const response=await fetch(origin+pathname,{signal:AbortSignal.timeout(3500)});
    assert.equal(response.status,200,pathname+' must be present in preview ZIP');
    const text=await response.text();
    assert.ok(text.length>250,pathname+' unexpectedly empty');
    if(pathname.endsWith('.html')){
      assert.ok(text.includes('nraijzsodgojkpyigefu.supabase.co'),
        pathname+' must use TEST Supabase only');
      assert.ok(!text.includes('feeapfylfzlvgnqtglnh.supabase.co'),
        pathname+' must never point at PROD Supabase');
      assert.ok(text.includes('@supabase/supabase-js@2.119.0'),
        pathname+' must use pinned SDK');
    }
  }
  assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
});
