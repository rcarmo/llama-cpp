/** SCRIPT_JDOC:
{"summary":"Compare smallbatch flagoff/on on longer code generation from retained64K state with independent sandbox tests","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import {Trial,root,save,api} from './campaign';
import {copyFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {instruction,extractCode} from './task';
import {sandbox,prefix} from './sandbox';
const order=Number(process.argv[2]),modes=[0,1,1,0];if(!Number.isInteger(order)||order<0||order>3)throw Error('ABBA order');const mode=modes[order];
const runtime='/var/home/agent/workspace/reports/gemma-decode-smallbatch-20260910/runtime-cpu';
const t=new Trial(`coding-${order}-mode${mode}`,{maintenance:true,build:'baseline',cpuBuild:runtime,format:'f16',fa:false,full:false,cpuCtx:262144,parallel:2,cache:0,mtp:true,targetBatchThreads:16,extraEnv:mode?{LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH:'1'}:{}});let result:any={};const container=`gemma-code-check-run${order}`;
try {
 await t.begin();const cpu=await t.start('cpu');
 for(const[k,v]of[['--threads','8'],['--threads-batch','16'],['--spec-draft-threads','8'],['--spec-draft-threads-batch','16']])if(cpu.argv[cpu.argv.indexOf(k)+1]!==v)throw Error('Factor isolation');
 const env=Object.fromEntries(readFileSync(`/proc/${cpu.p.pid}/environ`,'utf8').split('\0').filter(e=>/^(LLAMA_EXPERIMENTAL_|GGML_CPU_WHOLE_TOKEN_PROFILE|GGML_SPECULATIVE_PROFILE|OMP_)/.test(e)).map(e=>{const i=e.indexOf('=');return[e.slice(0,i),e.slice(i+1)]}));
 if(Boolean(env.LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH==='1')!==Boolean(mode)||env.GGML_CPU_WHOLE_TOKEN_PROFILE||env.GGML_SPECULATIVE_PROFILE)throw Error('Runtime mode/profile');
 const maps=readFileSync(`/proc/${cpu.p.pid}/maps`,'utf8'),lib=maps.split('\n').map(l=>l.trim().split(/\s+/).slice(5).join(' ')).find(p=>p.startsWith(runtime+'/bin/libllama.so.'));
 if(!lib)throw Error('Candidate library missing');const digest=createHash('sha256').update(readFileSync(lib)).digest('hex');if(digest!=='35289adccdf6965d3d7eb7ade2271723b1169e65772bf849c8a5431288d0aec9')throw Error('Candidate library identity');save(t.dir+'/runtime.json',{pid:cpu.p.pid,library:lib,sha256:digest,env,argv:cpu.argv});
 copyFileSync('/var/home/agent/workspace/reports/gemma-context-coding-20260910/runs/compact64-aligned/slots/long64-v2.slot',t.dir+'/slots/state.slot');
 const old=JSON.parse(readFileSync('/var/home/agent/workspace/reports/gemma-context-coding-20260910/runs/compact64-aligned/fixture.json','utf8'));
 const body={...old.body,messages:[...old.body.messages,{role:'assistant',content:'CEDAR-481,MAPLE-726,BIRCH-953'},{role:'user',content:instruction}],max_tokens:640};
 const rendered=await api('http://127.0.0.1:18792/apply-template',body),tokens=(await api('http://127.0.0.1:18792/tokenize',{content:rendered.prompt,add_special:true,parse_special:true})).tokens;
 const fixtureHash=createHash('sha256').update(JSON.stringify(body)).digest('hex');save(t.dir+'/fixture.json',{body,tokens,sha256:fixtureHash});
 if(tokens.length<64663||tokens.length>65536)throw Error('Expected retained64K+coding instruction');
 await t.req('cpu','restore',{filename:'state.slot'},'/slots/0?action=restore');const r=await t.req('cpu','coding',body),content=r.choices[0].message.content;
 if(r.timings.cache_n<64600||r.timings.prompt_n>750||r.timings.cache_n+r.timings.prompt_n!==tokens.length||r.timings.predicted_n>640)throw Error('Exact cached workload coverage');
 result={ok:true,order,mode,fixture_sha256:fixtureHash,actual_tokens:tokens.length,timings:r.timings,finish_reason:r.choices[0].finish_reason,content,scope:'One matched64K code request per mode/order; task success independent of timing, no coldprefill repeated'};
 await t.stop('cpu'); // Generated code never shares the modelworker's environment or resources.
 try{const code=extractCode(content);save(t.dir+'/code-hash.json',{sha256:createHash('sha256').update(code).digest('hex')});
 const test=await sandbox(t.dir+'/sandbox',code,container,p=>t.servers.push({p,fd:-1,device:'sandbox'}));t.servers=[];save(t.dir+'/sandbox-result.json',test);result.task_pass=test.pass&&r.choices[0].finish_reason!=='length';result.test_exit=test.rc;result.test_timed_out=test.timedOut;
 }catch(e){result.task_pass=false;result.task_error=String(e);t.servers=[];}
}catch(e){t.error ||=String(e);console.error(e)}finally{await Bun.spawn([...prefix,'rm','-f',container],{stdout:'ignore',stderr:'ignore'}).exited;const r=await t.finish(result);if(!r.ok)process.exitCode=1}
