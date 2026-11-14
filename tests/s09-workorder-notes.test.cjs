'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function section(start,end){
  const i=html.indexOf(start),j=html.indexOf(end,i+start.length);
  assert.ok(i>=0 && j>i,'Missing source section: '+start);
  return html.slice(i,j);
}
const notes=section('function jlWoNoteAuthor(){','let woTechnicalNotesSyncTimer = null;');

test('BT notes use independent entries while retaining legacy note text',()=>{
  assert.match(notes,/technicalNoteEntries/);
  assert.match(notes,/String\(wo\.notes\|\|""\)\.trim\(\)/);
  assert.match(notes,/escapeHTML\(wo\.notes\)/);
});
test('entries contain immutable author IDs and original creation dates',()=>{
  assert.match(notes,/authorId:actor\.id/);
  assert.match(notes,/createdAt:now/);
  assert.match(notes,/String\(entry\.authorId\)!==actor\.id/);
});
test('edits keep a revision of the previous text',()=>{
  assert.match(notes,/entry\.revisions\.push\(\{text:entry\.text,changedAt:now\}\)/);
  assert.match(notes,/entry\.text=value;entry\.updatedAt=now/);
});
test('new note input is above history and Enter saves while Shift Enter makes newline',()=>{
  const form=section('<!-- NOTES TECHNIQUES S09 :','<!-- PHOTOS & FICHIERS -->');
  assert.ok(form.indexOf('id="jlWoNewNote"') < form.indexOf('id="jlWoNotesHistory"'));
  assert.match(notes,/field\.onkeydown=e=>/);
  assert.match(notes,/e\.key!=="Enter"\|\|e\.shiftKey\|\|e\.isComposing/);
});
test('note list is newest first and profile rename does not change ownership',()=>{
  assert.match(notes,/String\(b\.createdAt\|\|""\)\.localeCompare\(String\(a\.createdAt\|\|""\)\)/);
  assert.match(notes,/String\(note\.authorId\)===actor\.id/);
  assert.match(notes,/own\?actor\.name:\(note\.authorName\|\|"Employé"\)/);
});
test('note submission requests cloud sync and does not falsely confirm cloud persistence',()=>{
  assert.match(notes,/localStorage\.setItem\(STORAGE\.workorders,JSON\.stringify\(WORKORDERS\)\)/);
  assert.match(notes,/scheduleCloudSync\(\)/);
  assert.match(notes,/Vérifie l’indicateur cloud/);
});
