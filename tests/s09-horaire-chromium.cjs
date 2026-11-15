'use strict';
// S09: headless Chromium smoke, fake local data; no network or real garage records.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function extract(from,to){const i=html.indexOf(from),j=html.indexOf(to,i);if(i<0||j<=i)throw Error('Missing anchor: '+from);return html.slice(i,j);}
const css=extract('/* S09 : Agenda mensuel TEST','/* TEST — ouverture des BT');
const render=extract('function jlScheduleRender(){','async function jlScheduleLoad(){');
const helpers=extract('function jlScheduleJobsFor(date){','function jlScheduleText(container,content,className){');
const fixture=[
"const jlScheduleShift=0,jlScheduleSelected='';",
"const jlScheduleQuotes=[{id:'so1',content:{appointment:{date:'2026-11-13',time:'09:00'},clientName:'A'}},{id:'so2',content:{appointment:{date:'2026-11-13',time:'10:15'},clientName:'B'}}];",
"const jlScheduleNotes=[1,2,3,4].map(n=>({note_date:'2026-11-13',note_text:'note '+n,created_at:'2026-11-13T00:00:0'+n+'Z'}));",
"const jlScheduleEvents=[];let opened='';",
"function jlScheduleMonthStart(){return new Date(2026,10,1);}",
"function jlCalendarISO(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}",
"function jlScheduleISO(d){return jlCalendarISO(d);}",
"function jlScheduleDayRender(){}",
"function jlScheduleDayOpen(d){opened=d;}",
"function jlDashboardOpenQuote(){}"
].join('\n');
const check=[
"try {",
"jlScheduleRender();",
"const cells=[...document.querySelectorAll('.jl-schedule-day')];",
"if(cells.length!==42)throw Error('Expected 42 cells; found '+cells.length);",
"const day=cells.find(x=>x.querySelector('.jl-schedule-day-button')?.textContent==='13');",
"if(!day)throw Error('Nov 13 missing');",
"if(day.querySelectorAll('.jl-schedule-mini').length!==2)throw Error('Expected two previews');",
"const more=day.querySelector('.jl-schedule-more');",
"if(more?.textContent!=='+4 autres')throw Error('Expected +4 autres, got '+more?.textContent);",
"const box=day.getBoundingClientRect(),button=more.getBoundingClientRect();",
"if(button.bottom>box.bottom||button.top<box.top)throw Error('Indicator outside cell');",
"more.click();if(opened!=='2026-11-13')throw Error('Day click failed');",
"if(cells.at(-1).getBoundingClientRect().bottom>window.innerHeight)throw Error('Bottom row offscreen');",
"document.getElementById('result').textContent='PASS';",
"}catch(e){document.getElementById('result').textContent='FAIL: '+String(e.message||e);}"
].join('\n');
const page='<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#171717;color:white;font:14px Arial}#page-schedule{margin:0 25px;padding:10px}'+css+'</style></head><body><div id="page-schedule"><div style="height:130px"></div><div id="jlScheduleMonth"></div><div id="jlScheduleMonthGrid" class="jl-schedule-month-grid"></div></div><output id="result">PENDING</output><script>'+fixture+'\n'+helpers+'\n'+render+'\n'+check+'</script></body></html>';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s09-calendar-'));
try{
 const file=path.join(dir,'test.html');fs.writeFileSync(file,page);
 const chrome=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p));
 if(!chrome)throw Error('Chromium unavailable');
 const res=spawnSync(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--window-size=1800,1000','--virtual-time-budget=1000','--dump-dom','file://'+file],{encoding:'utf8',timeout:30000,maxBuffer:3e6});
 const match=(res.stdout||'').match(/<output id="result">([^<]*)<\/output>/);
 if(match?.[1]!=='PASS')throw Error('Chromium S09 failed: '+(match?.[1]||'no output')+' '+(res.stderr||'').slice(-200));
 console.log('S09 PASS: 42 cells, +4 autres, clickable indicator, complete last row');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
