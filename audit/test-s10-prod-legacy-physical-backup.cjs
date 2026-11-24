#!/usr/bin/env node
"use strict";
/* Unit exercise of the exact PRODUCTION LEGACY backup helper using only in-memory
 * synthetic data. Zero network calls, customer information, or live file access.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");
const src=fs.readFileSync(path.join(__dirname,"s10-prod-legacy-physical-backup-browser.js"),"utf8");
class FileHandle {
 constructor(name){this.name=name;this.bytes=new Uint8Array()}
 async createWritable(){return {write:async b=>{this.bytes=new Uint8Array(await new Blob([b]).arrayBuffer())},
 close:async()=>{},abort:async()=>{}}}
 async getFile(){return new Blob([this.bytes])}
}
class Directory {
 constructor(name){this.name=name;this.files=new Map();this.children=new Map()}
 async getDirectoryHandle(n,{create=false}={}){
  if(!this.children.has(n)&&create)this.children.set(n,new Directory(n));
  if(!this.children.has(n))throw Error("Folder missing "+n);
  return this.children.get(n)
 }
 async getFileHandle(n,{create=false}={}){
  if(!this.files.has(n)&&create)this.files.set(n,new FileHandle(n));
  if(!this.files.has(n))throw Error("File missing "+n);
  return this.files.get(n)
 }
}
function makeClient({missing=false,changed=false}={}){
 const userId="11111111-1111-4111-8111-111111111111";
 let loads=0;
 const data={clients:[],workorders: Array.from({length:49},(_,i)=>({
  id:"BT-"+i,attachments:[{path:"clients/fixture-"+String(i+1).padStart(3,"0")}]
 }))};
 const paths=Array.from({length:55},(_,i)=>"clients/fixture-"+String(i+1).padStart(3,"0"));
 const obj=path=>new Blob([new Uint8Array([Number(path.slice(-3))])]);
 const store={list:async(folder,{limit,offset})=>{
   assert.equal(folder,"clients");
   return {data:paths.slice(offset,offset+limit).map(path=>({
    name:path.split("/").at(-1),id:"file",metadata:{size:1}
   })),error:null};
 },download:async path=>missing&&path===paths[22]?{error:{message:"missing"},data:null}:
   {data:obj(path),error:null}};
 return {supabaseUrl:"https://feeapfylfzlvgnqtglnh.supabase.co",
 auth:{getUser:async()=>({data:{user:{id:userId}},error:null})},
 from:()=>({select:()=>({eq:()=>({single:async()=>{
   loads++;return {data:{user_id:userId,data,updated_at:changed&&loads>1?"changed":"fixed"},error:null};
 }})})}),
 storage:{from:()=>store}};
}
async function main(){
 const sandbox={window:{isSecureContext:true},crypto:webcrypto,URL,Blob,Uint8Array,ArrayBuffer,TextEncoder,Date,console};
 vm.createContext(sandbox);
 vm.runInContext(src,sandbox);
 const helper=sandbox.window.S10LegacyProdBackup;
 assert.ok(helper&&typeof helper.backup==="function");
 assert.equal(helper.pathValid("clients/a.pdf"),true);
 assert.equal(helper.pathValid("../credentials"),false);
 assert.equal(helper.pathValid("clients/../data"),false);
 const parent=new Directory("root");
 const result=await helper.backup(makeClient(),parent);
 assert.equal(result.status,"COMPLETE");
 assert.equal(result.fileCount,55);
 assert.equal(result.totalBytes,55);
 const backupFolder=parent.children.get(result.folderName);
 const manifest=JSON.parse(await (await backupFolder.getFileHandle("manifest.json")).getFile().then(f=>f.text()));
 assert.equal(manifest.status,"COMPLETE");
 assert.equal(manifest.files.length,55);
 assert.equal(manifest.files.filter(f=>f.referenced).length,49);
 assert.equal(manifest.files.filter(f=>!f.referenced).length,6);
 assert.ok(manifest.files.every(f=>f.sha256.length===64));
 const broken=await helper.backup(makeClient({missing:true}),new Directory("root2"));
 assert.equal(broken.status,"INCOMPLETE");
 assert.ok(broken.failures>=1,"Partial or corrupted export must record failures");
 const modified=await helper.backup(makeClient({changed:true}),new Directory("root3"));
 assert.equal(modified.status,"INCOMPLETE");
 assert.equal(modified.failures,1);
 const other=makeClient();
 other.supabaseUrl="https://nraijzsodgojkpyigefu.supabase.co";
 await assert.rejects(()=>helper.backup(other,new Directory("root4")),/only original production/);
 console.log("S10_LEGACY_PROD_PHYSICAL_BACKUP_TEST_OK: 55 physical bytes, SHA-256, 49 linked, 6 orphans, fail-closed, test-project refusal");
}
main().catch(e=>{console.error(e);process.exitCode=1});
