/** SCRIPT_JDOC:
{"summary":"Plot current-master task outcomes and only valid within-runtime Q6 timing pairs, keeping old-runtime noncomparability explicit","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{strict as assert}from'node:assert';
const root=import.meta.dir,r=JSON.parse(readFileSync(root+'/task-summary.json','utf8')),pilot=JSON.parse(readFileSync(root+'/agentic-runs/master-clamp-on-pilot/result.json','utf8'));
assert.ok(r.complete);mkdirSync(root+'/charts',{recursive:true});
const esc=(x:unknown)=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1020" viewBox="0 0 1200 1020" role="img"><title>Fresh master: task qualification and matched Q6 results</title><desc>Current runtime task outcomes, matched pair times and explicit cross-version comparison limits.</desc><rect width="1200" height="1020" fill="#f6f8fb"/><g font-family="DejaVu Sans,Arial,sans-serif">`];
const text=(x:number,y:number,s:string,size=16,color='#173148',weight=400)=>parts.push(`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}">${esc(s)}</text>`);
const box=(x:number,y:number,w:number,h:number,c:string)=>parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${c}"/>`);
const green='#147d64',red='#b54738',blue='#537ca5',muted='#526778';
text(45,55,'Fresh master: agentic qualification',31,'#173148',700);text(45,89,'Current CPU/common + current O3 Vulkan · same frozen tools and task contracts',17,muted);
box(32,115,1136,285,'#fff');text(52,151,'Task outcomes',23,'#173148',700);
text(52,185,'Run',14,muted);text(390,185,'Rounds',14,muted);text(530,185,'Workflow',14,muted);text(765,185,'Final artifact',14,muted);
const all=[{id:'master-clamp-on-pilot',rounds:pilot.rounds.length,success:pilot.success,final_artifact_ok:pilot.success},...r.rows];
all.forEach((x,i)=>{const y=221+i*35;text(52,y,x.id,16);text(410,y,String(x.rounds));text(530,y,x.success?'PASS (both grades)':'BUDGET / TASK FAIL',16,x.success?green:red,600);text(765,y,x.final_artifact_ok?'PASS':'FAIL',16,x.final_artifact_ok?green:red,600);});
box(32,420,1136,300,'#fff');text(52,456,'Within-runtime Q6 OFF → ON',23,'#173148',700);text(52,485,'One pair per task; bars share a 0–90 s scale. Timing requires identical prompts/output/work.',15,muted);
r.pairs.forEach((p,i)=>{const y=530+i*93,off=r.rows.find(x=>x.kind===p.kind&&x.arm==='q6off'),on=r.rows.find(x=>x.kind===p.kind&&x.arm==='q6on');text(52,y,p.kind,19,'#173148',700);if(p.comparable){const max=90;box(285,y-18,off.whole_ms/1000/max*650,22,blue);box(285,y+12,on.whole_ms/1000/max*650,22,on.whole_ms<=off.whole_ms?green:red);text(950,y-1,(off.whole_ms/1000).toFixed(3)+' s',16,blue);text(950,y+29,(on.whole_ms/1000).toFixed(3)+' s',16,on.whole_ms<=off.whole_ms?green:red);text(52,y+31,(p.whole_change_percent>0?'+':'')+p.whole_change_percent.toFixed(2)+'% whole',17,p.whole_change_percent<=0?green:red,600);text(52,y+56,(p.warm_change_percent>0?'+':'')+p.warm_change_percent.toFixed(2)+'% warm',14,muted);}else{text(285,y,'Not a qualified timing pair',19,red,600);text(285,y+29,p.same_work?'Work matches, but workflow completion failed.':'Prompts/output/work differ between arms.',15,muted);}});
box(32,740,1136,230,'#fff');text(52,778,'What this establishes — and what it does not',22,'#173148',700);
text(52,814,'Fresh CPU: 4 CTests + 21 prefix transitions + 12 mutation guards. Fresh GPU: 2 handoff checks.',15);
text(52,844,'Clamp pilot: 559 generated / 791 evaluated / 522 drafted / 385 accepted; both grades pass.',15);
text(52,874,'Old clamp: 572 / 900 / 549 / 389. Different output/work: no cross-version speedup claim.',15,red);
text(52,904,'One pair per extension task is exploratory; no confidence interval or broad reliability guarantee.',15,muted);
text(52,934,'Zero swap and owned-worker cleanup verified. Q6 stays opt-in; no deployment or service changes.',15,muted);
text(45,1000,'Source: task-summary.json, frozen per-run manifests and verify-current.ts · 2026-09-14',13,muted);
writeFileSync(root+'/charts/current-master-tasks.svg',parts.join('\n')+'\n</g></svg>\n');
const fields=['id','kind','arm','rounds','success','final_artifact_ok','whole_ms','warm_s','handoff_ms'];writeFileSync(root+'/charts/current-master-data.csv',fields.join(',')+'\n'+r.rows.map(x=>fields.map(f=>JSON.stringify(x[f])).join(',')).join('\n')+'\n');
console.log('Current-runtime chart andCSVgenerated; completed oldcampaign charts unchanged');
