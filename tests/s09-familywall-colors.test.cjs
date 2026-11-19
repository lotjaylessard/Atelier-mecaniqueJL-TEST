'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const from=html.indexOf('const jlFamilyWallDefaultColor=');
const to=html.indexOf('function jlScheduleFamilyWallFor(date){',from);
assert.ok(from>0&&to>from,'FamilyWall color controller must exist');
const controller=html.slice(from,to);
function instance(storage={}){
 const nodes={jlFamilyWallColorRules:{replaceChildren(){},append(){},},jlFamilyWallAddColorRule:{disabled:false},
 jlFamilyWallColorsStatus:{textContent:''}};
 const context={localStorage:{getItem(k){return storage[k]??null;},setItem(k,v){storage[k]=v;}},ACTIVE_GARAGE_ID:'g1',
 document:{getElementById(k){return nodes[k]},createElement(t){return {style:{},children:[],append(...a){this.children.push(...a)},setAttribute(){},addEventListener(){}}}},
 jlScheduleRender(){context.renderCount=(context.renderCount||0)+1;}};
 vm.createContext(context);vm.runInContext(controller,context);
 return {context,nodes,storage};
}
test('the sample palette maps visible FamilyWall screenshot categories',()=>{
 const {context}=instance();
 assert.equal(context.jlFamilyWallColorFor('Cours de piscine'),'#4d85e7');
 assert.equal(context.jlFamilyWallColorFor('Sophia training'),'#ff8c24');
 assert.equal(context.jlFamilyWallColorFor('Freins - Spike RAV4 PRIME'),'#182923');
 assert.equal(context.jlFamilyWallColorFor('Chalet'),'#4d85e7');
 assert.equal(context.jlFamilyWallColorFor('RACKING LEVIS'),'#8055a9');
 assert.equal(context.jlFamilyWallColorFor('MÉCANIQUE - Smart PA'),'#182923');
});
test('per-user rule color saves, loads, and stays isolated',()=>{
 const storage={}, {context}=instance(storage);
 context.jlFamilyWallLoadColors('owner-a');
 vm.runInContext("jlFamilyWallColorRules.unshift({keyword:'dentiste',color:'#c040a0'});jlFamilyWallSaveColors();",context);
 assert.equal(context.jlFamilyWallColorFor('Dentiste JAY'),'#c040a0');
 assert.equal(context.renderCount,1);
 context.jlFamilyWallLoadColors('owner-b');
 assert.equal(context.jlFamilyWallColorFor('Dentiste JAY'),'#8055a9');
 context.jlFamilyWallLoadColors('owner-a');
 assert.equal(context.jlFamilyWallColorFor('Dentiste JAY'),'#c040a0');
 assert.equal(JSON.parse(storage['jl-familywall-colors:g1:owner-a'])[0].keyword,'dentiste');
});
test('invalid custom colors are rejected and saved rules have maximum size',()=>{
 const storage={'jl-familywall-colors:g1:u1':JSON.stringify([
 {keyword:'test',color:'url(javascript:evil)'},{keyword:'ok',color:'#123456'},
 ...Array(90).fill({keyword:'extra',color:'#654321'})])};
 const {context}=instance(storage);
 context.jlFamilyWallLoadColors('u1');
 assert.equal(context.jlFamilyWallColorFor('test'),'#8055a9');
 assert.equal(context.jlFamilyWallColorFor('ok'),'#123456');
 assert.ok(vm.runInContext("jlFamilyWallColorRules.length",context)<=30);
});
test('month cell and selected day both apply the same FamilyWall color resolver',()=>{
 assert.match(html,/jlFamilyWallStyleEvent\(el,item\.event_title\)/);
 assert.match(html,/jlFamilyWallStyleEvent\(row,item\.event_title\)/);
 assert.match(html,/id="jlFamilyWallColorRules"/);
 assert.match(html,/id="jlFamilyWallAddColorRule"/);
 assert.match(html,/id="jlFamilyWallResetColors"/);
 assert.match(html,/jlFamilyWallInitColorSettings\(\)/);
 assert.doesNotMatch(controller,/\.from\(["']garage_|fetch\(/);
});
