/** SCRIPT_JDOC:
{"summary":"Compare independent score/Q4 SIMD flags on frozen saved64K decode; probe traces are diagnostic","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import { Trial, root } from './campaign';
import { capture } from './capture';
import { copyFileSync, readFileSync } from 'node:fs';
const target = process.argv[2], order = Number(process.argv[3]), probe = target === 'probe';
if (!['score','q4','probe'].includes(target) || !Number.isInteger(order) || order < 0 || order > 3) throw Error('Target/order');
const mode = probe ? 1 : [0,1,1,0][order];
const t = new Trial(`packed-${target}-${order}-mode${mode}`, { maintenance:true, build:'baseline', format:'f16', fa:false, full:false, cpuCtx:262144, parallel:2, cache:0, mtp:true, targetBatchThreads:16, cpuBuild:root+'/runtime-packed', extraEnv:{ LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH:'1', GGML_CPU_EXPERIMENTAL_ATTN4:'1', GGML_CPU_EXPERIMENTAL_SCORE4_3ROW:'1', GGML_CPU_EXPERIMENTAL_SCORE3_NOUNROLL:target==='score'||probe?String(mode):'0', GGML_CPU_EXPERIMENTAL_Q4_PACK_STREAM:target==='q4'||probe?String(mode):'0', ...(probe?{GGML_CPU_SCORE3_NOUNROLL_TRACE:'1',GGML_CPU_Q4_PACK_TRACE:'1'}:{}) }});
let result:any = {};
try {
 await t.begin(); const cpu = await t.start('cpu'); capture(t.dir,cpu.p.pid);
 for (const [key,value] of [['--threads','8'],['--threads-batch','16'],['--spec-draft-threads','8'],['--spec-draft-threads-batch','16']]) if(cpu.argv[cpu.argv.indexOf(key)+1]!==value) throw Error('Factor isolation');
 copyFileSync('/var/home/agent/workspace/reports/gemma-context-coding-20260910/runs/compact64-aligned/slots/long64-v2.slot',t.dir+'/slots/state.slot');
 const f=JSON.parse(readFileSync('/var/home/agent/workspace/reports/gemma-hybrid-perf-20260910/runs/decode64-base/fixture.json','utf8'));
 await t.req('cpu','restore',{filename:'state.slot'},'/slots/0?action=restore');
 const r=await t.req('cpu','decode',{prompt:f.prompt,n_predict:128,temperature:0,top_k:1,seed:42,cache_prompt:true,id_slot:0,return_tokens:true});
 result={ok:true,target,order,mode,diagnostic:probe,timings:r.timings,answer:r.content,pass:['CEDAR-481','MAPLE-726','BIRCH-953'].every(k=>r.content.includes(k)),scope:probe?'Both overrides traced on real model, no throughput claim':'One SIMD flag on/off versus B0; other flag0; exact128token64Kscreen,traceoff'};
 if(!result.pass||r.timings.cache_n!==64658||r.timings.prompt_n!==25||r.timings.predicted_n!==128) throw Error('Exact quality/work coverage');
 if(probe){const log=readFileSync(t.dir+'/cpu.log','utf8');if(!log.includes('Q4_PACK_STREAM '))throw Error('Real model dispatch missing');}
} catch(e) { t.error ||= String(e); console.error(e); }
finally { const r=await t.finish(result); if(!r.ok)process.exitCode=1; }
