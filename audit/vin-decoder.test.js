const assert=require("node:assert/strict");
const {normalize,valid,map}=require("./vin-decoder.js");
const cases=[
 ["normalize",()=>assert.equal(normalize(" 1hgcm82633a004352 "),"1HGCM82633A004352")],
 ["valid",()=>assert.equal(valid("1HGCM82633A004352"),true)],
 ["short",()=>assert.equal(valid("12345"),false)],
 ["forbidden letters",()=>assert.equal(valid("1HGCM82633I004352"),false)],
 ["gasoline AWD",()=>assert.deepEqual(map({ModelYear:"2024",Make:"VOLKSWAGEN",Model:"Tiguan",Trim:"Comfortline",DisplacementL:"2.000",EngineCylinders:"4",TransmissionStyle:"Automatic",DriveType:"AWD/All-Wheel Drive",FuelTypePrimary:"Gasoline"}),{year:"2024",make:"VOLKSWAGEN",model:"Tiguan",trim:"Comfortline",engine:"2 L · 4 cyl.",transmission:"Automatique",drivetrain:"AWD",fuel:"Essence"})],
 ["diesel manual",()=>{const v=map({FuelTypePrimary:"Diesel",TransmissionStyle:"Manual",DriveType:"4WD/4-Wheel Drive/4x4"});assert.equal(v.fuel,"Diesel");assert.equal(v.transmission,"Manuelle");assert.equal(v.drivetrain,"4X4")}],
 ["CVT hybrid",()=>{const v=map({TransmissionStyle:"Continuously Variable Transmission (CVT)",ElectrificationLevel:"Strong HEV",DriveType:"FWD/Front-Wheel Drive"});assert.equal(v.transmission,"CVT");assert.equal(v.fuel,"Hybride");assert.equal(v.drivetrain,"FWD")}],
 ["electric",()=>assert.equal(map({FuelTypePrimary:"Electric"}).fuel,"Électrique")],
 ["unknown stays blank",()=>assert.deepEqual(map({Make:"Not Applicable",Model:"Unknown",DisplacementL:"0"}),{year:"",make:"",model:"",trim:"",engine:"",transmission:"",drivetrain:"",fuel:""})]
];for(const [name,run] of cases){run();console.log("PASS "+name);}console.log(cases.length+" tests passed");
