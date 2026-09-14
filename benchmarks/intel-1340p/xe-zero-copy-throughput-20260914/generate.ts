/** SCRIPT_JDOC:
{"summary":"Verify retained copied/shared KV runs and draw zero-copy decode throughput and handoff charts without rerunning inference","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
const root=import.meta.dir,workspace=root+'/inputs';
const experiments=[
 {name:'Short prompt',prompt:309,output:128,kv_mib:38,source:'reports/xe-in-memory-perf-20260913',ids:['r0','r1','r2','r3','r4','r5','r6','r7'],summaryKey:null},
 {name:'1K prompt',prompt:1021,output:512,kv_mib:69,source:'reports/xe-scale-profile-20260913',ids:['s0','s1','s2','s3'],summaryKey:'1k'},
 {name:'4K prompt',prompt:4003,output:512,kv_mib:117,source:'reports/xe-scale-profile-20260913',ids:['l0','l1','l2','l3'],summaryKey:'4k'},
];
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const inputs=new Map<string,string>();
function load(p:string){const b=readFileSync(workspace+'/'+p);inputs.set(p,sha(b));return JSON.parse(b.toString());}
const med=(xs:number[])=>{const x=[...xs].sort((a,b)=>a-b);return(x[(x.length-1)>>1]+x[x.length>>1])/2;};
const close=(a:number,b:number)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8,`${a} != ${b}`);
const observations:any[]=[];
const summaries=experiments.map(e=>{
 const prior=load(e.source+'/summary.json');
 const runs=e.ids.map(id=>{
  const dir=e.source+'/runs/'+id,m=load(dir+'/metrics.json'),s=load(dir+'/summary.json'),r=load(dir+'/result.json'),manifest=load(dir+'/manifest.json');
  assert.equal(r.rc,0);assert.equal(m.rc,0);assert.equal(r.abort,'');assert.equal(r.services_unchanged,true);
  assert.ok(!s.profile&&!manifest.profile,'Profiled run must not enter throughput chart');
  assert.equal(s.prompt_tokens,e.prompt);assert.equal(s.output_tokens,e.output);assert.equal(m.source_tokens,e.prompt);assert.equal(m.emitted,e.output);assert.equal(r.mtp.output,e.output);
  assert.ok(s.arm==='share'||s.arm==='copy');assert.equal(m.arm,s.arm);
  assert.equal(m.shared_bytes+m.copied_bytes,e.kv_mib*1048576);assert.equal(s.kv_bytes,e.kv_mib*1048576);
  assert.equal(s.arm==='share'?m.copied_bytes:m.shared_bytes,0);
  assert.ok(m.last_token_s>m.first_token_s);
  const tps=(e.output-1)/(m.last_token_s-m.first_token_s);
  const handoff=m.events.filter(x=>x.name==='handoff');assert.equal(handoff.length,1);
  const handoff_ms=1000*(handoff[0].end-handoff[0].begin);
  close(tps,s.warm_decode_tps);close(handoff_ms,s.handoff_ms);
  assert.ok(r.samples.length>0);for(const x of r.samples){assert.ok(x.available_kib>=6*1048576);assert.equal(x.competing,0);for(const w of x.workers??[])assert.equal(w.swap_kib,0);}
  const out={id,scenario:e.name,prompt_tokens:e.prompt,output_tokens:e.output,arm:s.arm,kv_mib:e.kv_mib,decode_tps:tps,handoff_ms,first_token_s:m.first_token_s,whole_process_s:m.wall_s,effective_output_tps:e.output/m.wall_s,output_hash:r.output_sha256??r.output_hash,drafted:r.mtp.drafted,accepted:r.mtp.accepted,evaluated:s.target_evaluated_tokens,prompt_hash:manifest.prompt_sha256??manifest.prompt_hash};
  assert.equal(typeof out.output_hash,'string');assert.equal(typeof out.prompt_hash,'string');observations.push(out);return out;
 });
 for(const r of runs)for(const k of ['output_hash','drafted','accepted','evaluated','prompt_hash'])assert.equal(r[k],runs[0][k],e.name+': '+k);
 function arm(name:string){const list=runs.filter(x=>x.arm===name);assert.equal(list.length,e.ids.length/2);const stats=(key:string)=>({median:med(list.map(x=>x[key])),min:Math.min(...list.map(x=>x[key])),max:Math.max(...list.map(x=>x[key])),values:list.map(x=>x[key])});return{n:list.length,decode_tps:stats('decode_tps'),handoff_ms:stats('handoff_ms'),effective_output_tps:stats('effective_output_tps')};}
 const copy=arm('copy'),share=arm('share'),old=e.summaryKey?prior.groups[e.summaryKey]:prior.groups;
 for(const [name,values]of [['copy',copy],['share',share]] as const){close(values.decode_tps.median,old[name].warm_decode_tps.median);close(values.handoff_ms.median,old[name].handoff_ms.median);}
 return{...e,n_per_arm:e.ids.length/2,copy,share,decode_delta_tps:share.decode_tps.median-copy.decode_tps.median,decode_change_percent:100*(share.decode_tps.median/copy.decode_tps.median-1),handoff_change_percent:100*(share.handoff_ms.median/copy.handoff_ms.median-1),handoff_saved_ms:copy.handoff_ms.median-share.handoff_ms.median};
});
writeFileSync(root+'/data.json',JSON.stringify({generated_at:"2026-09-14T06:59:52.656Z",measurement_date:'2026-09-13',metric:'(output_tokens - 1) / (last_emission_seconds - first_emission_seconds)',summaries,observations,exclusions:['r4-aborted-contention','p0','p1'],limitations:['Retained historical zero-copy/copy runs, not latest-master throughput','Predictable numeric-sequence workload favourable to MTP; not agentic coding throughput','Same cached/coherent GPU allocation and GPU prefill, only synchronous KV sharing/copy control differs','Ranges and individual samples are shown; they are not confidence intervals','No inference rerun; batching/Q6 changes are separate and not credited here']},null,2)+'\n');
const fields=['scenario','prompt_tokens','output_tokens','n_per_arm','copied_decode_tps','zero_copy_decode_tps','delta_decode_tps','decode_change_percent','copied_handoff_ms','zero_copy_handoff_ms','handoff_saved_ms'];
const csvrows=summaries.map(s=>[s.name,s.prompt,s.output,s.n_per_arm,s.copy.decode_tps.median,s.share.decode_tps.median,s.decode_delta_tps,s.decode_change_percent,s.copy.handoff_ms.median,s.share.handoff_ms.median,s.handoff_saved_ms]);
const quote=(x:unknown)=>'"'+String(x).replaceAll('"','""')+'"';
writeFileSync(root+'/throughput-summary.csv',fields.join(',')+'\n'+csvrows.map(r=>r.map(quote).join(',')).join('\n')+'\n');
const rf=['scenario','id','arm','prompt_tokens','output_tokens','kv_mib','decode_tps','handoff_ms','whole_process_s','effective_output_tps'];
writeFileSync(root+'/throughput-runs.csv',rf.join(',')+'\n'+observations.map(r=>rf.map(k=>quote(r[k])).join(',')).join('\n')+'\n');
writeFileSync(root+'/source-checksums.sha256',[...inputs].map(([p,h])=>h+'  '+p).join('\n')+'\n');
// Tablet-readable zero-based common axes; bars are medians, thin ranges and dots are raw observations.
const W=1200,H=1460,blue='#587791',green='#13795b',red='#b04434',ink='#173047',muted='#526878';
const esc=(s:unknown)=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const p=[`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"><title>Zero-copy versus copied KV: decode throughput and transfer latency</title><desc>Copied versus zero-copy medians across three retained workloads. Short decode22.48 versus20.49 tokens per second; longer runs show no sustained gain. Individual observations and ranges shown.</desc><rect width="100%" height="100%" fill="#f5f8fb"/><g font-family="DejaVu Sans,Arial,sans-serif">`];
const text=(x:number,y:number,s:string,size=18,color=ink,weight=400)=>p.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${esc(s)}</text>`);
const rect=(x:number,y:number,w:number,h:number,c:string,r=4)=>p.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c}"/>`);
const line=(x:number,y:number,x2:number,y2:number,c:string,width=1)=>p.push(`<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${width}"/>`);
const signed=(x:number,d=2)=>(x>=0?'+':'')+x.toFixed(d);
text(42,56,'Zero-copy: what changed in tok/s?',34,ink,700);
text(42,92,'Copied KV → shared (zero-copy) KV · Intel i5-1340P / Iris Xe · Gemma E4B Q4 + MTP3',17,muted);
rect(42,116,1120,85,'#e5f1ec',8);text(62,149,'Short run: +1.99 tok/s (+9.72%). Longer runs: no decode gain.',23,green,700);
text(62,180,'At 4K, zero-copy saves 63.85 ms in handoff while decode remains about 20.7 tok/s.',18,ink);
rect(32,220,1136,587,'#ffffff',10);
text(52,259,'Decode after first token',25,ink,700);text(52,289,'tok/s · higher is better · bars = medians · dots = runs · whiskers = observed range',16,muted);
rect(64,310,22,14,blue);text(97,323,'Copied KV',16);rect(265,310,22,14,green);text(298,323,'Zero-copy KV',16);
const x0=390,scale=23;
for(let t=0;t<=25;t+=5){const x=x0+t*scale;line(x,343,x,753,'#e4ebf1');text(x-8,784,String(t),14,muted);}
text(1060,784,'tok/s',14,muted);
function bar(values:any,y:number,color:string,scale:number,x:number){rect(x,y-17,values.median*scale,23,color,3);line(x+values.min*scale,y-5,x+values.max*scale,y-5,ink,2);line(x+values.min*scale,y-11,x+values.min*scale,y+1,ink,2);line(x+values.max*scale,y-11,x+values.max*scale,y+1,ink,2);for(const v of values.values)p.push(`<circle cx="${x+v*scale}" cy="${y-5}" r="4" fill="#fff" stroke="${ink}" stroke-width="1.5"/>`);}
summaries.forEach((s,i)=>{const y=378+i*132;text(54,y,s.name,22,ink,700);text(54,y+29,`${s.prompt.toLocaleString('en-US')} prompt / ${s.output} output`,16,muted);text(54,y+55,`${s.n_per_arm} runs/arm · ${s.kv_mib} MiB KV`,15,muted);bar(s.copy.decode_tps,y,blue,scale,x0);bar(s.share.decode_tps,y+37,green,scale,x0);text(1013,y,s.copy.decode_tps.median.toFixed(2),23,blue,700);text(1013,y+37,s.share.decode_tps.median.toFixed(2),23,green,700);text(390,y+77,`${signed(s.decode_delta_tps)} tok/s  (${signed(s.decode_change_percent)}%)`,21,s.decode_delta_tps>=0?green:red,700);});
rect(32,830,1136,345,'#ffffff',10);text(52,868,'Handoff latency — the direct zero-copy benefit',24,ink,700);text(52,898,'ms · lower is better · same copied / zero-copy colours; no payload bytes copied in shared arm',15,muted);
const hs=2.5,hx=390;for(let t=0;t<=200;t+=50){line(hx+t*hs,920,hx+t*hs,1124,'#e4ebf1');text(hx+t*hs-10,1157,String(t),13,muted);}text(933,1157,'ms',14,muted);
summaries.forEach((s,i)=>{const y=953+i*75;text(54,y,s.name,20,ink,700);text(54,y+27,`${s.handoff_saved_ms.toFixed(2)} ms saved`,16,green);bar(s.copy.handoff_ms,y,blue,hs,hx);bar(s.share.handoff_ms,y+29,green,hs,hx);text(944,y,s.copy.handoff_ms.median.toFixed(2)+' ms',18,blue,600);text(944,y+29,s.share.handoff_ms.median.toFixed(2)+' ms',18,green,600);});
rect(32,1197,1136,209,'#ffffff',10);text(52,1234,'How to read this',23,ink,700);
text(52,1264,'Decode rate = (outputs − 1) / (last token time − first token time); startup/prefill excluded.',16);
text(52,1294,'Output and MTP work match within each workload. Numeric-sequence task favours MTP;',16);
text(52,1320,'these are not coding-agent tok/s results. Ranges overlap; the short-run gain did not persist.',16);
text(52,1350,'Retained 13 Sep measurements, before later batching/Q6 changes. No latest-master claim.',16,muted);
text(52,1380,'Copied control is RAM handoff, not file I/O. One contended run and both profiles excluded.',16,muted);
text(42,1438,'Verified from 16 raw runs; no benchmark reruns · source hashes and per-run CSV included',14,muted);
writeFileSync(root+'/zero-copy-throughput.svg',p.join('\n')+'\n</g></svg>\n');
console.log(JSON.stringify(summaries.map(s=>({prompt:s.prompt,output:s.output,n:s.n_per_arm,copied_tps:s.copy.decode_tps.median,zero_copy_tps:s.share.decode_tps.median,delta_tps:s.decode_delta_tps,change_percent:s.decode_change_percent,handoff_saved_ms:s.handoff_saved_ms})),null,2));
