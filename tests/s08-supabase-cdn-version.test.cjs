'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('Supabase JS ESM and UMD use the same exact pinned stable version',()=>{
 const expected='2.119.0';
 const esm=html.match(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@([\d.]+)\/\+esm/g)||[];
 const umd=html.match(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@([\d.]+)(?=["'])/g)||[];
 assert.equal(esm.length,1);
 assert.equal(umd.length,1);
 assert.ok(esm[0].includes('@'+expected+'/+esm'));
 assert.ok(umd[0].endsWith('@'+expected));
 assert.doesNotMatch(html,/\/npm\/@supabase\/supabase-js\/+esm/);
 assert.doesNotMatch(html,/\/npm\/@supabase\/supabase-js@2["']/);
});

test('login page Supabase SDK is pinned to the same version',()=>{
 const login=fs.readFileSync(path.join(__dirname,'..','login.html'),'utf8');
 assert.match(login,/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.119\.0\/\+esm/);
 assert.doesNotMatch(login,/\/npm\/@supabase\/supabase-js\/\+esm/);
});
