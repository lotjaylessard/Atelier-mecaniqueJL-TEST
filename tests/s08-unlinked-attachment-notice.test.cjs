'use strict';
// S08: read-only recovery inventory tests against the real site helper.
// No customer files, network calls, Supabase writes or Storage deletes.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const start=html.indexOf('function showUnlinkedAttachmentRecoveryNotice(){');
const end=html.indexOf('function showCloudRecoveryBanner(key) {',start);
assert.ok(start>=0 && end>start,'S08 recovery notice source missing');
const helper=html.slice(start,end);

function makeScenario({user='u1',garage='g1'}={}){
  const sample={
    format:'atelier-test-unlinked-attachment-v1',userId:'u1',garageId:'g1',
    storageBucket:'wo-files',storagePath:'u1/clients/fixture/BT-01/test.pdf',
    fileName:'test.pdf',createdAt:'2026-11-13T00:00:00Z'
  };
  const store={'TEST_g1_unlinked_attachment_001':JSON.stringify(sample)};
  const dom={};
  const events={downloads:0,alerts:[],blobs:0};
  function node(tag){
    const el={
      tag,style:{},children:[],id:null,
      appendChild(child){this.children.push(child);},
      replaceChildren(){this.children=[];},
      remove(){if(this.id)delete dom[this.id];},
      click(){events.downloads++;},
      set textContent(v){this._text=v;},
      get textContent(){return this._text;}
    };
    return el;
  }
  const sandbox={
    SUPABASE_USER:{id:user},ACTIVE_GARAGE_ID:garage,TEST_STORAGE_PREFIX:'TEST',
    localStorage:{length:1,key:i=>Object.keys(store)[i]||null,getItem:k=>store[k]||null},
    document:{
      getElementById:id=>dom[id]||null,createElement:node,
      body:{appendChild(el){if(el.id)dom[el.id]=el;}}
    },
    console:{warn:()=>{}},alert:message=>events.alerts.push(message),
    Blob:class FakeBlob{constructor(parts,options){events.blobs++;this.parts=parts;this.options=options;}},
    URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}},
    setTimeout:()=>{}
  };
  vm.runInNewContext(helper+'\nthis.show=showUnlinkedAttachmentRecoveryNotice;',sandbox);
  return {sandbox,dom,events};
}
test('original account sees its own orphan record notice',()=>{
 const x=makeScenario();x.sandbox.show();
 const notice=x.dom.s08UnlinkedAttachmentNotice;
 assert.ok(notice);
 assert.match(notice.children[0].textContent,/1 fichier/);
 assert.equal(notice.children[1].textContent,'Exporter les références JSON');
});
test('other account cannot view an unlinked reference',()=>{
 const x=makeScenario({user:'u2'});x.sandbox.show();
 assert.equal(x.dom.s08UnlinkedAttachmentNotice,undefined);
});
test('other garage cannot view an unlinked reference',()=>{
 const x=makeScenario({garage:'g2'});x.sandbox.show();
 assert.equal(x.dom.s08UnlinkedAttachmentNotice,undefined);
});
test('session change after notice opens blocks the export',()=>{
 const x=makeScenario();x.sandbox.show();
 const button=x.dom.s08UnlinkedAttachmentNotice.children[1];
 x.sandbox.SUPABASE_USER.id='u2';
 button.onclick();
 assert.equal(x.events.downloads,0);
 assert.equal(x.events.blobs,0);
 assert.equal(x.events.alerts.length,1);
});
test('normal export is a JSON manifest, never automatic Storage restore',()=>{
 const x=makeScenario();x.sandbox.show();
 const button=x.dom.s08UnlinkedAttachmentNotice.children[1];
 button.onclick();
 assert.equal(x.events.blobs,1);
 assert.equal(x.events.downloads,1);
 assert.doesNotMatch(helper,/\.storage\s*\.|\.update\s*\(|\.delete\s*\(/);
 assert.match(helper,/containsFileBytes:false/);
});
