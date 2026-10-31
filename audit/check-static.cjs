// Audit automatisé non destructif — aucune connexion Supabase.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const html = fs.readFileSync('index.html','utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .filter(m => !/\bsrc\s*=/.test(m[0].split('>')[0]));
assert.ok(scripts.length,'scripts inline absents');
for (const [index, m] of scripts.entries()) {
  const opening = m[0].split('>')[0];
  const code = m[1];
  if (!code.trim()) continue;
  const isModule = /\btype\s*=\s*["']module["']/i.test(opening);
  if (!isModule) new vm.Script(code,{filename:'inline-script-'+index+'.js'});
}
const start=html.indexOf('async function commitSafeWORemoval(');
const end=html.indexOf('async function openWOAttachment(',start);
assert.ok(start>=0 && end>start,'A01 manquante');
const section=html.slice(start,end);
assert.ok(/\.eq\('garage_id',garageId\)\.eq\('version',expectedVersion\)/.test(section),'CAS de version absent');
assert.ok(!/\.remove\s*\(/.test(section),'Suppression Storage dans A01');
assert.ok(/CLOUD_CHANGE_REVISION !== revision/.test(section),'Protection de révision absente');
assert.ok(/hydrateLocalFromCloud\(next\)/.test(section),'Hydratation après succès absente');
assert.ok(/async function deleteWorkOrder\(id\)/.test(html),'Handler de suppression non async');
assert.ok(html.includes('tryAutoMergeAddedWOAttachments'),'Fusion fichiers #385 absente');
console.log('AUDIT A01 : syntaxe des scripts classiques et invariants statiques OK.');
console.log('IMPORTANT : ne vérifie ni la sécurité RLS, ni la base réelle, ni les interactions navigateur.');
