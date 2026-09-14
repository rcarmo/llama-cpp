/** SCRIPT_JDOC:
{"summary":"Generate benchmark progress SVG and source CSV from verified frozen agentic and kernel results, including regressions and scope limits","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const root=import.meta.dir,load=(f:string)=>JSON.parse(readFileSync(root+'/'+f,'utf8'));
const combined=load('combined-summary.json'),q6=load('q6-agentic-summary.json'),matrix=load('write-v2-matrix-summary.json'),q4=load('q4-confirm-summary.json'),vk=load('vulkan-o1-screen/result.json');
assert.ok(combined.complete&&combined.qualified&&combined.same_work);assert.ok(q6.qualified);assert.ok(matrix.complete);assert.ok(vk.pass);
const median=(x:number[])=>{x=[...x].sort((a,b)=>a-b);return(x[(x.length-1)>>1]+x[x.length>>1])/2;};
const vkRows=vk.results.filter(x=>!x.mode.startsWith('diag'));
const vkData=vkRows[0].results.map((s,i)=>{const off=vkRows.filter(x=>x.arm==='off').map(x=>median(x.results[i].diagnostic_ms)),on=vkRows.filter(x=>x.arm==='on').map(x=>median(x.results[i].diagnostic_ms));return{label:s.shape,baseline:median(off),candidate:median(on),change:100*(median(on)/median(off)-1)};});
const dir=root+'/charts';mkdirSync(dir,{recursive:true});
const escape=(s:unknown)=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const green='#147d64',red='#b54738',blue='#537ca5',text='#172d40',muted='#526778';
const pct=(n:number)=>(n>0?'+':'')+n.toFixed(2)+'%';
let parts:string[]=[];
const label=(x:number,y:number,s:string,size=16,color=text,weight=400)=>parts.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${escape(s)}</text>`);
const rect=(x:number,y:number,w:number,h:number,color:string,r=4)=>parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${color}"/>`);
function start(title:string,desc:string,w:number,h:number){parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${escape(title)}</title><desc>${escape(desc)}</desc><rect width="100%" height="100%" fill="#f6f8fb"/><g font-family="DejaVu Sans,Arial,sans-serif">`];}
function save(name:string){writeFileSync(dir+'/'+name,parts.join('\n')+'\n</g></svg>\n');}
start('Xe optimisation: measured agentic progress','Separate matched comparisons, not cumulative stage speedups; default Vulkan retained.',1200,1090);
label(48,54,'Xe optimisation: measured agentic progress',30,text,700);
label(48,85,'Intel i5-1340P / Iris Xe · Gemma E4B Q4 + Q8 MTP3 · persistent repair + follow-up',16,muted);
label(48,113,'Lower time is better. Comparisons have different controls; percentages cannot be added.',16,muted);
rect(38,139,1124,448,'#ffffff',10);
label(60,172,'Whole-workflow time',23,text,700);label(60,199,'Seconds, zero-based axis · filled bars = arm medians · dots = individual runs',14,muted);
for(const t of [0,10,20,30,40,50,60]){const x=390+t*10;parts.push(`<line x1="${x}" x2="${x}" y1="217" y2="559" stroke="#e2e8ef"/>`);label(x-7,576,String(t),12,muted);}
const groups=[
 {title:'Allocation batching: clamp',note:'Original matrix · one pair',off:matrix.rows.filter(x=>x.id==='w2-clamp-b0').map(x=>x.wall_ms/1000),on:matrix.rows.filter(x=>x.id==='w2-clamp-c0').map(x=>x.wall_ms/1000)},
 {title:'Q6 pair: predecessor',note:'Batched control · ABBA, n=2/arm',off:q6.rows.filter(x=>x.arm==='q6off').map(x=>x.wall_ms/1000),on:q6.rows.filter(x=>x.arm==='q6on').map(x=>x.wall_ms/1000)},
 {title:'Final batching + Q6',note:'Pre-batching/Q6 OFF · ABBA, n=2/arm',off:combined.rows.filter(x=>x.arm==='baseline').map(x=>x.wall_ms/1000),on:combined.rows.filter(x=>x.arm==='combined').map(x=>x.wall_ms/1000)},
];
groups.forEach((g,i)=>{const y=242+i*108,b=median(g.off),c=median(g.on),change=100*(c/b-1),colour=change<=0?green:red;label(60,y,g.title,17,text,700);label(60,y+24,g.note,13,muted);for(const [values,dy,color]of [[g.off,0,blue],[g.on,30,colour]] as [number[],number,string][]){rect(390,y-17+dy,median(values)*10,20,color,3);for(const v of values)parts.push(`<circle cx="${390+v*10}" cy="${y-7+dy}" r="4" fill="#fff" stroke="${text}" stroke-width="1.5"/>`);label(1030,y-2+dy,median(values).toFixed(3)+' s',14,color,600);}label(60,y+49,pct(change)+' total time',17,colour,700);});
rect(38,608,1124,195,'#ffffff',10);label(60,642,'Final combined stages',23,text,700);label(60,667,'Same four workflows · medians, baseline → combined · absolute units differ',14,muted);
const stageKeys=[['warm_native_s','Warm native','s'],['handoff_ms','Cold handoff','ms'],['cold_ttft_s','Cold first token','s']] as const;
stageKeys.forEach(([k,name,unit],i)=>{const c=combined.comparisons[k],x=65+i*365;label(x,707,name,17,text,700);label(x,739,c.baseline_median.toFixed(3)+' → '+c.combined_median.toFixed(3)+' '+unit,22);label(x,774,pct(c.change_percent),18,c.change_percent<=0?green:red,700);});
rect(38,824,1124,217,'#ffffff',10);label(60,858,'Task completion and limits',23,text,700);
const passed=matrix.rows.filter(x=>x.success).length,artifacts=matrix.rows.filter(x=>x.final_artifact_ok).length;
label(60,892,`Original matrix: ${passed}/6 workflows; ${artifacts}/6 final artifacts. Defaults hit the round cap in both arms.`,16);
label(60,921,'Q6 predecessor: 4/4 workflows. Promoted check: 1/1. Final combined: 4/4.',16);
label(60,950,'Final pairs: identical prompts, raw output, 572 generated / 900 evaluated / 549 drafted / 389 accepted.',15);
label(60,982,'Two observations per arm on one task do not establish broad speedup or a confidence interval.',15,muted);
label(60,1011,'Opt-in Q6 and shared KV; default Vulkan unchanged. No serving deployment or capacity qualification.',15,muted);
label(48,1071,'Source: frozen raw runs and compare-combined.ts · 2026-09-14',13,muted);save('agentic-progress.svg');
start('Hotspot experiments: retained gains and rejected defaults','CPU and Vulkan kernels have separate axes; synthetic gains are not model speedups.',1200,850);
label(48,54,'Hotspot experiments: gains and rejected defaults',29,text,700);
label(48,87,'Synthetic operator time changes versus matched controls · lower is better',16,muted);
rect(38,113,1124,325,'#fff',10);label(60,149,'CPU: Q4 alternatives and Q6 paired projection',22,text,700);
label(60,176,'Q4: 8-thread confirmation, 18 correctness cases. Q6: full 262144 × 4 × 2560 shape.',14,muted);
const cpu=q4.groups.map(g=>({name:`Q4 family ${g.family} · ${g.m} × ${g.n} × ${g.k}`,change:g.change_percent}));
cpu.push({name:'Q6 paired projection · full shape',change:load('q6-full-summary.json').change_percent});
for(const t of [-15,-10,-5,0,5,10,15]){const x=810+t*16;parts.push(`<line x1="${x}" x2="${x}" y1="190" y2="414" stroke="${t===0?'#9caab8':'#e2e8ef'}"/>`);label(x-12,430,String(t)+'%',12,muted);}
cpu.forEach((v,i)=>{const y=215+i*42;label(60,y,v.name,16);rect(Math.min(810,810+v.change*16),y-16,Math.abs(v.change)*16,21,v.change<=0?green:red,3);label(1090,y,pct(v.change),14,v.change<=0?green:red,600);});
rect(38,460,1124,244,'#fff',10);label(60,496,'Vulkan: 128 × 128 large tile rejected',22,text,700);label(60,523,'Same O1 plugin, untraced ABBA; two processes per arm. Default medium 64 × 64 retained.',14,muted);
vkData.forEach((v,i)=>{const y=563+i*59;label(60,y,v.label.replaceAll(' ',' × '),17);rect(470,y-18,v.change*1.8,23,red,3);label(955,y,pct(v.change),18,red,700);label(470,y+20,`${v.baseline.toFixed(3)} → ${v.candidate.toFixed(3)} ms`,14,muted);});
label(60,686,'Both shapes pass finite/NMSE ≈ 2.2e-7. Shared-memory fit alone did not improve throughput.',14,muted);
label(48,751,'Q4 loses in 3/4 groups: no default change; smaller two-thread opportunity retained.',16);
label(48,780,'Q6 remains opt-in. Kernel percentages are separate from measured whole-workflow results.',16);
label(48,817,'All failures retained. Zero swap and worker cleanup verified in admitted runs. No deployment.',14,muted);save('hotspot-decisions.svg');
const records=[...groups.map(g=>({scope:'trained_whole_seconds',comparison:g.title,baseline:median(g.off),candidate:median(g.on),change_percent:100*(median(g.on)/median(g.off)-1)})),...cpu.map(x=>({scope:'synthetic_cpu_percent',comparison:x.name,baseline:'',candidate:'',change_percent:x.change})),...vkData.map(x=>({scope:'synthetic_vulkan_ms',comparison:x.label,baseline:x.baseline,candidate:x.candidate,change_percent:x.change}))];
writeFileSync(dir+'/chart-data.json',JSON.stringify({records,combined:combined.comparisons,task_counts:{original_workflows:passed,original_artifacts:artifacts,original_total:6,combined_passed:4,combined_total:4}},null,2)+'\n');
writeFileSync(dir+'/chart-data.csv','scope,comparison,baseline,candidate,change_percent\n'+records.map(r=>[r.scope,r.comparison,r.baseline,r.candidate,r.change_percent].map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\n')+'\n');
console.log('Generated two evidence-backed SVG charts plus JSON/CSV sources');
