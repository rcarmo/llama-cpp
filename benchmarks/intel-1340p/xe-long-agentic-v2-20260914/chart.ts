/** SCRIPT_JDOC:
{"summary":"Render three-arm long-task failure diagnostic with throughput,cold latency,handoff and task-progress caveats","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{strict as assert}from'node:assert';
const root=import.meta.dir,s=JSON.parse(readFileSync(root+'/summary.json','utf8')),cold=JSON.parse(readFileSync(root+'/cold-diagnostic.json','utf8'));
assert.equal(s.rows.length,3);assert.ok(cold.identical_first_prompt);assert.ok(s.rows.every(r=>!r.success));
mkdirSync(root+'/charts',{recursive:true});
const rows=['cpu','copy','share'].map(a=>s.rows.find(r=>r.arm===a)),names=['CPU-only','GPU → CPU · copy','GPU → CPU · zero-copy'],colors=['#60748b','#b77928','#147b67'],ink='#18334a',muted='#526879',red='#aa4035';
const esc=(x:unknown)=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1410" viewBox="0 0 1200 1410" role="img"><title>Long coding task: CPU versus copied and zero-copy KV</title><desc>All three runs failed the four-milestone task. CPU reached two milestones; GPU arms reached none. Throughput is descriptive on unequal partial work. Identical initial prompt supports cold-start and handoff diagnostics only.</desc><rect width="1200" height="1410" fill="#f5f8fb"/><g font-family="DejaVu Sans,Arial,sans-serif">`];
const text=(x:number,y:number,t:string,size=17,c=ink,w=400)=>out.push(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${w}" fill="${c}">${esc(t)}</text>`);
const rect=(x:number,y:number,w:number,h:number,c:string,r=4)=>out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" rx="${r}"/>`);
text(42,54,'Long coding task: CPU / copy / zero-copy',30,ink,700);
text(42,88,'Gemma E4B · MTP3 · Q6 ON · identical four-milestone repository and task protocol',17,muted);
rect(32,111,1136,94,'#fbeae5',8);text(52,146,'No arm completed the task. This is not a successful-task speedup result.',23,red,700);
text(52,179,'One run per arm; reverse repeats cancelled. CPU and GPU trajectories differ after the initial prompt.',16,red);
rect(32,226,1136,249,'#fff',9);text(52,263,'Independent task progress and work',23,ink,700);
text(52,299,'Arm',15,muted);text(442,299,'Milestones',15,muted);text(612,299,'Turns / tools',15,muted);text(822,299,'Generated tokens',15,muted);
rows.forEach((r,i)=>{const y=336+i*40;text(52,y,names[i],19,colors[i],700);text(465,y,`${r.completed_phases} / 4`,19,red,700);text(637,y,`${r.rounds} / ${r.tool_calls}`,18);text(861,y,String(r.generated),18);});
text(52,458,'CPU: response cap during report edit. Both GPU arms: missing export; identical failed artifact.',15,muted);
rect(32,496,1136,291,'#fff',9);text(52,534,'Decode throughput on executed responses',23,ink,700);
text(52,564,'tok/s · first token of each response and tool time excluded · different work, no speedup ranking',15,red);
const x0=401,ts=23;for(let n=0;n<=25;n+=5){out.push(`<line x1="${x0+n*ts}" y1="581" x2="${x0+n*ts}" y2="735" stroke="#e1e8ef"/>`);text(x0+n*ts-6,767,String(n),13,muted);}
rows.forEach((r,i)=>{const y=606+i*48;text(52,y,names[i],18);rect(x0,y-20,r.decode_tps*ts,26,colors[i]);text(1010,y,r.decode_tps.toFixed(2)+' tok/s',18,colors[i],700);});
rect(32,808,1136,300,'#fff',9);text(52,846,'Cold start: same 2,212-token initial prompt',23,ink,700);
text(52,875,'One observation per arm · lower latency is better · not whole-task completion time',15,muted);
text(52,913,'Arm',15,muted);text(420,913,'First token',15,muted);text(650,913,'Prefill',15,muted);text(860,913,'KV handoff',15,muted);
rows.forEach((r,i)=>{const y=951+i*43;text(52,y,names[i],18,colors[i],700);text(420,y,r.first_token_s.toFixed(2)+' s',20);text(650,y,r.cold_prefill_s.toFixed(2)+' s',20);text(860,y,r.arm==='cpu'?'None':r.handoff_ms.toFixed(2)+' ms',20);});
text(52,1090,`Zero-copy shares ${(rows[2].shared_bytes/1048576).toFixed(0)} MiB; transfer saves ${cold.transfer_only.saved_ms.toFixed(2)} ms versus copied KV.`,17,colors[2],700);
rect(32,1129,1136,229,'#fff',9);text(52,1168,'Elapsed time to failure — not time to completion',23,red,700);
rows.forEach((r,i)=>{const x=52+i*372;text(x,1203,names[i],16,colors[i],700);text(x,1236,r.whole_s.toFixed(2)+' s',24);text(x,1266,(r.memory_peak_bytes/1073741824).toFixed(2)+' GiB peak',16,muted);});
text(52,1306,'Copy / zero-copy have identical output and work; zero-copy did not improve full-run time or tok/s.',15,muted);
text(52,1336,'CPU completed more work. Treating its longer elapsed time as a loss would be misleading.',15,muted);
text(42,1388,'All runs: zero swap; guards and owner cleanup passed. No deployment. Raw traces and first failed protocol retained.',14,muted);
writeFileSync(root+'/charts/long-task-three-arm.svg',out.join('\n')+'\n</g></svg>\n');
console.log('Wrote three-arm diagnostic SVG; no successful-task performance claim');
