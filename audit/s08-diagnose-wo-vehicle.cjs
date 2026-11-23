#!/usr/bin/env node
/* Diagnostic S08 lecture seule: référence véhicule orpheline; aucune donnée nominative imprimée. */
"use strict";
const fs=require("node:fs"),path=require("node:path");
const folder=process.argv[2],workorderId=String(process.argv[3]||"");
if(!folder||!workorderId){console.error("Usage: node audit/s08-diagnose-wo-vehicle.cjs <dossier-S08> <id-BT>");process.exit(2)}
const cp=require("node:child_process");
const check=cp.spawnSync(process.execPath,[path.join(__dirname,"s08-verify-partial-export.cjs"),folder],{encoding:"utf8"});
if(check.status!==0){console.error("Export non vérifié : diagnostic refusé");process.exit(1)}
const snapshot=JSON.parse(fs.readFileSync(path.join(folder,"garage-data.json"),"utf8"));
const data=snapshot.garages[0].data,clients=data.clients||[],orders=data.workorders||[],invoices=data.invoices||[];
const wo=orders.find(x=>String(x.id)===workorderId);
if(!wo){console.error("BT introuvable dans la sauvegarde");process.exit(1)}
const vehicles=clients.flatMap(c=>(c.vehicles||[]).map(v=>({clientId:String(c.id),vehicleId:String(v.id)})));
const linkedInvoices=invoices.filter(i=>String(i.workOrderNumber)===String(wo.number));
const report={workorderId,number:wo.number??null,clientIdPresent:wo.clientId!=null,clientExists:clients.some(c=>String(c.id)===String(wo.clientId)),vehicleIdPresent:wo.vehicleId!=null,vehicleExists:vehicles.some(v=>v.vehicleId===String(wo.vehicleId)),vehicleBelongsToClient:vehicles.some(v=>v.vehicleId===String(wo.vehicleId)&&v.clientId===String(wo.clientId)),linkedInvoiceCount:linkedInvoices.length,linkedInvoiceVehicleIdMatch:linkedInvoices.map(i=>String(i.vehicleId??"")===String(wo.vehicleId??"")),hasVehicleSnapshot:!!wo.vehicle,hasVehicleLabel:!!wo.vehicleLabel,hasVehicleName:!!wo.vehicleName,hasVehicleVin:!!wo.vin,keys:Object.keys(wo).filter(k=>/^(clientId|vehicleId|vehicle|vehicleLabel|vehicleName|workOrderNumber|number|status)$/.test(k))};
console.log(JSON.stringify(report,null,2));
console.log("LECTURE_SEULE : aucune correction appliquée; vérifier avant de réassocier.");
