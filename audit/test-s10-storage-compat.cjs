"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),cp=require("node:child_process");
const folder=fs.mkdtempSync(path.join(os.tmpdir(),"s10-storage-"));
const script=path.join(__dirname,"s10-check-storage-compat.cjs");
const keys=["invoices_v2","settings_v1","invoice_counter_v1","clients_v1","parts_inventory_v1","services_v1","notes_v1","links_v1","workorders_v1"].join(" ");
function check(src){fs.writeFileSync(path.join(folder,"index.html"),src);return cp.spawnSync(process.execPath,[script,folder],{encoding:"utf8"})}
try{
 let r=check("const TEST_STORAGE_PREFIX = 'ar_test_x'; "+keys);assert.equal(r.status,1);assert.match(r.stdout,/TEST_STORAGE_PREFIX/);
 r=check("/* MIGRATION DES ANCIENNES CLES DESACTIVEE EN TEST */ "+keys);assert.equal(r.status,1);
 r=check("const GARAGE_STORAGE_PREFIX = 'ar'; "+keys);assert.equal(r.status,0,r.stdout);
 console.log("S10_STORAGE_TESTS_OK : 3 scénarios.");
}finally{fs.rmSync(folder,{recursive:true,force:true})}
