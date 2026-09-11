/** SCRIPT_JDOC:
{"summary":"Verify planning checkpoint links, archived status, baseline identities and ledger consistency without inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,existsSync}from'node:fs';import{resolve}from'node:path';
const root=import.meta.dir,read=(p:string)=>readFileSync(root+'/'+p,'utf8'),assert=(v:unknown,s:string)=>{if(!v)throw Error(s)};
const plan=read('README.md'),check=read('checklist.md'),old=read('previous-plan.md'),ledger=read('baselines.md');
for(const id of ['T01','T02','T03','D01','D02','D03','D04','D05','D06','P01','P02','P03','P04','P05','P06','I01','I02','I03','I04','I05'])assert(plan.includes('**'+id),'Detailed test '+id);
assert((old.match(/^- \[[ x]\] \d\d /gm)??[]).length===38,'Archive38items');assert((old.match(/^- \[ \]/gm)??[]).length===2,'Historical open gaps retained');
assert((check.match(/^- \[/gm)??[]).length===20,'New checklist20items');assert((check.match(/^- \[x\]/gm)??[]).length===20,'All bounded steps closed');assert(check.includes('not that every proposed gate passed')&&check.includes('no completed finite state/dual128K qualification'),'Conditional decisions and capacity limit');
for(const f of ['README.md','baselines.md'])for(const m of read(f).matchAll(/\]\(([^)]+)\)/g)){if(m[1].includes('://'))continue;assert(existsSync(resolve(root,m[1].split('#')[0])),'Link '+f+' '+m[1]);}
const b=JSON.parse(read('baselines/B0-score3.json')),events=read('baselines/events.jsonl').trim().split('\n').map(x=>JSON.parse(x));
assert(b.id==='B0-score3'&&b.status==='deployed','B0status');assert(b.maintenance_restore_target===b.release&&b.operational_rollback!==b.release,'Restore vs fallback');
assert(b.live.cpu_swap_kib===0&&b.live.libraries.length===9&&b.live.libraries.every(x=>x.mapped&&x.actual===x.expected),'Nine verified mappings');
assert(b.live.slots.length===2&&b.live.slots.every(x=>!x.is_processing&&x.n_ctx===131072),'Idle allocated slots');
assert(b.runtime.cpu_env.GGML_CPU_EXPERIMENTAL_SCORE4_3ROW==='1'&&b.runtime.cpu_env.GGML_CPU_EXPERIMENTAL_ATTN4==='1'&&b.runtime.cpu_env.LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH==='1','RetainallCPUgains');
assert(b.runtime.gpu_env.GGML_VK_EXPERIMENTAL_ATTN_MODE==='f32'&&b.runtime.speech_mode==='stopped','GPU/speechprofile');
assert(events.length>=4&&events[0].baseline===b.id&&resolve(root,'baselines',events[0].manifest)===resolve(root,'baselines/B0-score3.json'),'Event manifest');
const final=JSON.parse(read('baselines/B0-closeout.json'));assert(events.some(e=>e.event==='bounded_plan_closeout')&&final.baseline===b.id&&final.results.audit_pass&&!final.results.deployment_changed&&!final.results.near128.qualified,'Scoped closeout, no invented adoption');
assert(final.results.capacity.map(x=>x.tokens_per_slot).join(',')==='16384,32768,64663'&&final.maintenance_restore_target===b.release.split('/').at(-1),'Capacity and current restore target');
assert(plan.includes('do not change it mid-comparison')&&plan.includes('held/restricted/revoked-reference'),'Freeze and demotion');
assert(ledger.includes('No future B1/B2 baseline is marked validated yet'),'No invented gains');
console.log('PASS38archiveditems,20newsteps,alltestIDs/links,B0identity/rollback andappend-onlyledger; no inference');
