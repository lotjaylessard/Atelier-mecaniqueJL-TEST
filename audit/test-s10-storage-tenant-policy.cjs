#!/usr/bin/env node
"use strict";
// Static regression gate only. Never connects to PROD or TEST.
const fs=require("node:fs"),assert=require("node:assert/strict");
const policy=fs.readFileSync(require("node:path").join(__dirname,"s10-storage-tenant-isolation-candidate-NOT-EXECUTED.sql"),"utf8");
const html=fs.readFileSync(require("node:path").join(__dirname,"..","index.html"),"utf8");
function requireRule(condition,message){assert.ok(condition,message)}
requireRule(/RAISE EXCEPTION 'wo-files must be private/.test(policy),"Public bucket must be rejected");
requireRule(/Unexpected storage\.objects policy/.test(policy),"Unknown permissive Storage policies must be rejected");
requireRule(/Users belonging to multiple garages/.test(policy),"Same user in multiple garages requires different path scheme");
requireRule(/original_garage\.user_id::text=storage\.objects\.owner_id/.test(policy),"Legacy owner must match actual object owner");
requireRule(/viewer\.garage_id=original_garage\.garage_id/.test(policy),"Legacy read must target the original garage, not any membership of owner");
requireRule(!/gd\.user_id=auth\.uid\(\) AND gd\.garage_id IS NOT NULL/.test(policy),"Weak arbitrary-garage legacy read detected");
requireRule(/split_part\(name,'\/',1\)=\(SELECT auth\.uid\(\)\)::text/.test(policy),"New file prefix must be caller UID");
requireRule(/owner_id=split_part\(name,'\/',1\)/.test(policy),"New object owner must match path prefix");
requireRule(!/CREATE POLICY[^;]+FOR (?:DELETE|UPDATE)/s.test(policy),"No unvalidated direct DELETE or UPDATE");
requireRule(!/getPublicUrl\s*\(/.test(html),"Application must not use public bucket links");
requireRule((html.match(/\.createSignedUrl\s*\(/g)||[]).length>=2,"Thumbnails and attachment view must use signed URLs");
requireRule(/\`\$\{SUPABASE_USER\.id\}\/clients\//.test(html),"New uploads must be user-prefixed");
console.log("S10_STORAGE_TENANT_STATIC_OK : 12 conditions; no database writes");
