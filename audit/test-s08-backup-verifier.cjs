/* Regression S08: verification du manifeste, sans Supabase ni production.
 * node audit/test-s08-backup-verifier.cjs
 */
"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"s08-verify-physical-backup.js"),"utf8");
const context={crypto:crypto.webcrypto,TextDecoder,Uint8Array,ArrayBuffer,Set,JSON,Error};
context.globalThis=context;
vm.runInNewContext(source,context,{filename:"s08-verify-physical-backup.js"});
const verify=context.S08BackupVerifier.verify;
const bytes=x=>Buffer.from(x);
const digest=x=>crypto.createHash("sha256").update(x).digest("hex");
const owner="owner-A",garage="garage-A",filePath="owner-A/attachment.pdf";
const payload=bytes("sample attachment");
const snapshot={format:"atelier-test-full-garage-snapshot-v1",accountId:owner,
 garages:[{garage_id:garage,user_id:owner,data:{workorders:[{attachments:[{path:filePath}]}]}}],
 quotes:[{id:"q1",garage_id:garage}]};
const json=bytes(JSON.stringify(snapshot));
const base={format:"atelier-test-physical-backup-v1",source:"Supabase TEST",
 bucket:"wo-files",status:"COMPLETE",accountId:owner,garageId:garage,
 memberIds:[owner,"employee-A"],garageCount:1,quoteCount:1,
 snapshotSha256:digest(json),snapshotBytes:json.length,
 referencedPaths:1,ownedPaths:1,fileCount:1,totalBytes:payload.length,
 failed:[],unresolvedReferences:[],
 files:[{path:filePath,bytes:payload.length,sha256:digest(payload),referenced:true}]};
function folder(manifest){
 const files={"manifest.json":bytes(JSON.stringify(manifest)),
 "garage-data.json":json,"files/"+filePath:payload};
 function directory(prefix=""){
  return {async getDirectoryHandle(name){return directory(prefix+name+"/")},
   async getFileHandle(name){
    const value=files[prefix+name];
    if(!value)throw Error("Missing file "+prefix+name);
    return {async getFile(){return {async text(){return value.toString("utf8")},
     async arrayBuffer(){return value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength)}}}};
   }};
 }
 return directory();
}
async function check(label,patch,expected){
 const result=await verify(folder({...base,...patch}));
 assert.equal(result.ok,expected,label+" : "+result.failures.join("; "));
}
(async()=>{
 await check("valid",{},true);
 await check("missing owned inventory",{ownedPaths:2},false);
 await check("wrong referenced flag",{files:[{...base.files[0],referenced:false}]},false);
 await check("duplicate members",{memberIds:[owner,owner]},false);
 await check("wrong source",{source:"Supabase PROD"},false);
 await check("wrong format",{format:"unknown"},false);
 await check("incomplete",{status:"INCOMPLETE"},false);
 await check("bad hash",{snapshotSha256:"0".repeat(64)},false);
 console.log("S08 verifier: 8 scenarios OK");
})().catch(error=>{console.error(error);process.exitCode=1});
