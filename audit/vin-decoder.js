(()=>{"use strict";
const normalize=v=>String(v??"").trim().toUpperCase();
const valid=v=>/^[A-HJ-NPR-Z0-9]{17}$/.test(normalize(v));
const clean=v=>{const s=String(v??"").trim();return /^(?:not applicable|not available|unknown|n\/a|null|0)$/i.test(s)?"":s;};
function map(r){
 const style=clean(r.TransmissionStyle),drive=clean(r.DriveType),fuel=clean(r.FuelTypePrimary),ev=clean(r.ElectrificationLevel);
 const liters=Number(r.DisplacementL),cyl=clean(r.EngineCylinders),model=clean(r.EngineModel);
 return {year:/^\d{4}$/.test(clean(r.ModelYear))?clean(r.ModelYear):"",make:clean(r.Make),model:clean(r.Model),trim:clean(r.Trim)||clean(r.Trim2),engine:[liters>0?Number(liters.toFixed(2))+" L":"",cyl?cyl+" cyl.":"",model].filter(Boolean).join(" · "),transmission:/continuously variable|\bCVT\b/i.test(style)?"CVT":/automatic/i.test(style)?"Automatique":/manual/i.test(style)?"Manuelle":"",drivetrain:/\bAWD\b|all.wheel/i.test(drive)?"AWD":/4WD|4x4|four.wheel/i.test(drive)?"4X4":/FWD|front.wheel/i.test(drive)?"FWD":/RWD|rear.wheel/i.test(drive)?"RWD":"",fuel:/hybrid|PHEV|HEV/i.test(ev)?"Hybride":/electric/i.test(fuel)?"Électrique":/diesel/i.test(fuel)?"Diesel":/gasoline/i.test(fuel)?"Essence":""};
}
const states=new WeakMap();
function fields(input){const modern=input.matches('[data-s07-vehicle="vin"]'),legacy=input.id==="vehEditVin";const root=modern?input.closest("#s07VehicleDetailsForm"):input.closest("#addVehicleModal,#vehicleEditModal")||input.closest(".modal-panel")||input.closest("#clientModalContent");if(!root)return null;return key=>root.querySelector(modern?'[data-s07-vehicle="'+key+'"]':'[id="'+(legacy?"vehEdit":"veh")+key[0].toUpperCase()+key.slice(1)+'"]');}
async function lookup(input){
 const vin=normalize(input.value);if(!valid(vin))return;const field=fields(input);if(!field)return;
 const old=states.get(input);if(old?.vin===vin&&old.pending)return;old?.controller.abort();
 const controller=new AbortController(),state={vin,controller,pending:true};states.set(input,state);
 let status=input.parentElement.querySelector("[data-jl-vin-status]");if(!status){status=document.createElement("small");status.dataset.jlVinStatus="";status.style.cssText="display:block;margin-top:4px;color:var(--muted)";status.setAttribute("role","status");input.insertAdjacentElement("afterend",status);}
 status.textContent="Recherche NIV (NHTSA)…";
 const keys=["year","make","model","trim","engine","transmission","drivetrain","fuel"],before=Object.fromEntries(keys.map(k=>[k,field(k)?.value]));
 const timer=setTimeout(()=>controller.abort(),12000);
 try{
 const res=await fetch("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/"+encodeURIComponent(vin)+"?format=json",{signal:controller.signal,credentials:"omit",referrerPolicy:"no-referrer"});
 if(!res.ok)throw Error("HTTP "+res.status);const r=(await res.json()).Results?.[0];
 if(states.get(input)!==state||normalize(input.value)!==vin||!input.isConnected)return;
 if(!r||!clean(r.Make)||!clean(r.Model)||!String(r.ErrorCode??"").split(",").map(s=>s.trim()).includes("0"))throw Error("NIV non confirmé");
 const data=map(r);let count=0,conflicts=0;
 for(const k of keys){const el=field(k),value=data[k];if(!el||!value||el.value!==before[k])continue;if(el.value.trim()){if(el.value.toLowerCase()!==value.toLowerCase())conflicts++;continue;}if(el.tagName==="SELECT"&&![...el.options].some(o=>o.value===value))continue;el.value=value;count++;}
 status.textContent=count+" champ(s) rempli(s). "+(conflicts?"Champs existants conservés. ":"")+"Vérifier les données constructeur.";
 }catch(e){if(states.get(input)===state&&normalize(input.value)===vin)status.textContent="Décodage indisponible ou NIV non confirmé. Saisie manuelle possible.";}
 finally{clearTimeout(timer);state.pending=false;}
}
if(typeof document!=="undefined")document.addEventListener("input",e=>{const input=e.target;if(!input.matches?.('#vehVin,#vehEditVin,[data-s07-vehicle="vin"]'))return;const old=states.get(input);if(old&&old.vin!==normalize(input.value))old.controller.abort();if(valid(input.value))void lookup(input);});
if(typeof module!=="undefined")module.exports={normalize,valid,map};
})();