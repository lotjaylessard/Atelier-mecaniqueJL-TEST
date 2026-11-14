'use strict';
// S08: no live cloud or customer bytes. Exercise real physical backup module.
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
const script=readFileSync(join(__dirname,'..','audit','s08-physical-backup.js'),'utf8');

function makeDirectory(){
 const folders=new Map(),files=new Map();
 function folder(prefix=''){
  return {
    async getDirectoryHandle(name){
      assert.ok(name && !name.includes('/'));
      const key=prefix+name+'/';
      if(!folders.has(key))folders.set(key,folder(key));
      return folders.get(key);
    },
    async getFileHandle(name){
      assert.ok(name && !name.includes('/'));
      const key=prefix+name;
      return {
        async createWritable(){return {
          async write(data){
            if(typeof data==='string')files.set(key,new TextEncoder().encode(data));
            else if(data instanceof ArrayBuffer)files.set(key,new Uint8Array(data));
            else if(data?.arrayBuffer)files.set(key,new Uint8Array(await data.arrayBuffer()));
            else throw Error('Invalid fake file bytes');
          },
          async close(){},async abort(){}
        }},
        async getFile(){return {
          async arrayBuffer(){
            const bytes=files.get(key);
            return bytes.slice().buffer;
          }
        }}
      };
    }
  };
 }
 return {root:folder(),files};
}
function setup({downloadFails=false,versionChanges=false}={}){
 const windows={};
 const sandbox={window:windows,crypto,TextEncoder,Uint8Array,ArrayBuffer,Set,Map,Date,JSON};
 vm.runInNewContext(script,sandbox);
 const backup=windows.S08PhysicalBackup;
 const garage={user_id:'u1',garage_id:'g1',version:5,
  data:{clients:[{id:'c1'}],notes:[{id:'note1',body:'Fictif'}],
    workorders:[{number:'BT-1',attachments:[
      {path:'u1/clients/example/a.txt'},
      {path:'legacy-other/clients/old.pdf'}
    ]}],invoices:[],links:[],parts:[],services:[],settings:{},invoiceCounter:1}};
 const quotes=[{user_id:'u1',garage_id:'g1',id:'q1',quote_number:'S-1',version:1}];
 const downloaded=[],calls=[];
 const client={
   auth:{getUser:async()=>({data:{user:{id:'u1'}},error:null})},
   from(table){
    const opts={table};
    return {
      select(){return this;},
      eq(){return this;},
      order(){return this;},
      async range(){
       if(table==='garage_data'){calls.push('garage_data');
         if(calls.filter(x=>x==='garage_data').length>1)
           return {data:[{user_id:'u1',garage_id:'g1',version:versionChanges?6:5}]};
         return {data:[garage]};
       }
       if(table==='garage_quotes')return {data:quotes};
       throw Error('Unexpected table');
      }
    };
   },
   storage:{
    from(bucket){
      assert.equal(bucket,'wo-files');
      return {
       async list(prefix){
        if(prefix==='u1')return {data:[{name:'clients',id:null,metadata:null}]};
        if(prefix==='u1/clients')return {data:[{name:'example',id:null,metadata:null}]};
        if(prefix==='u1/clients/example')return {data:[{name:'a.txt',id:'file1',metadata:{size:5}}]};
        return {data:[]};
       },
       async download(path){
         downloaded.push(path);
         if(downloadFails && path==='legacy-other/clients/old.pdf')
           return {error:{message:'Not authorized'}};
         return {data:new Blob([path.includes('a.txt')?'hello':'legacy-file'])};
       }
      };
    }
   }
 };
 return {client,backup,downloaded,makeDirectory};
}
test('path validator rejects traversal and backslashes',()=>{
 const {backup}=setup();
 assert.equal(backup.validPath('u1/clients/doc.pdf'),true);
 for(const p of ['../bad','a/../bad','a//bad','/root','a\\b','a/.',''])
   assert.equal(backup.validPath(p),false,p);
});
test('real helper writes garage notes, quotes and BOTH physical files with SHA256',async()=>{
 const {backup,client,downloaded}=setup();
 const {root,files}=makeDirectory();
 const result=await backup.backup(client,root);
 assert.equal(result.status,'COMPLETE');
 assert.equal(result.fileCount,2);
 assert.equal(result.failed.length,0);
 assert.equal(result.unresolvedReferences.length,0);
 assert.deepEqual(downloaded.sort(),['legacy-other/clients/old.pdf','u1/clients/example/a.txt']);
 const paths=[...files.keys()];
 assert.ok(paths.some(p=>p.endsWith('garage-data.json')));
 assert.ok(paths.some(p=>p.endsWith('manifest.json')));
 assert.ok(paths.some(p=>p.endsWith('files/u1/clients/example/a.txt')));
 assert.ok(paths.some(p=>p.endsWith('files/legacy-other/clients/old.pdf')));
 const snapshotPath=paths.find(p=>p.endsWith('garage-data.json'));
 const parsed=JSON.parse(new TextDecoder().decode(files.get(snapshotPath)));
 assert.equal(parsed.garages[0].data.notes[0].id,'note1');
 assert.equal(parsed.quotes.length,1);
 for(const file of result.files)assert.match(file.sha256,/^[a-f0-9]{64}$/);
});
test('failed legacy file download marks backup INCOMPLETE without deletion',async()=>{
 const {backup,client}=setup({downloadFails:true});
 const {root}=makeDirectory();
 const result=await backup.backup(client,root);
 assert.equal(result.status,'INCOMPLETE');
 assert.equal(result.fileCount,1);
 assert.equal(result.unresolvedReferences.length,1);
 assert.equal(result.failed.length,1);
});
test('version changed during physical export blocks COMPLETE verdict',async()=>{
 const {backup,client}=setup({versionChanges:true});
 const {root}=makeDirectory();
 const result=await backup.backup(client,root);
 assert.equal(result.status,'INCOMPLETE');
 assert.ok(result.failed.some(e=>e.path==='garage_data'));
});
test('module never includes Storage write/delete APIs',()=>{
 assert.doesNotMatch(script,/\.upload\s*\(|\.remove\s*\(|\.update\s*\(|\.move\s*\(/);
});
test('standalone page requires active TEST session and folder permission',()=>{
 const html=readFileSync(join(__dirname,'..','audit','s08-physical-backup.html'),'utf8');
 assert.match(html,/auth\.getUser/);
 assert.match(html,/showDirectoryPicker/);
 assert.match(html,/nraijzsodgojkpyigefu\.supabase\.co/);
 assert.doesNotMatch(html,/feeapfylfzlvgnqtglnh\.supabase\.co/);
 assert.match(html,/@supabase\/supabase-js@2\.119\.0/);
});
