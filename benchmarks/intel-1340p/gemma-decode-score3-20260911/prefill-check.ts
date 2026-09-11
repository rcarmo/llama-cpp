/** SCRIPT_JDOC:
{"summary":"Check unchanged large CPU prefill with the ATTN4 tile enabled/disabled; temporal pair only","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{Trial,root,fixture}from'./campaign';
const mode=process.argv[2];if(!['0','1'].includes(mode))throw Error('mode');
const t=new Trial('prefill4k-mode'+mode,{maintenance:true,build:'baseline',cpuBuild:root+'/runtime-cpu',format:'f16',fa:false,cpuCtx:262144,parallel:2,cache:0,mtp:false,ubatch:256,batch:1024,extraEnv:{LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH:'1',GGML_CPU_EXPERIMENTAL_ATTN4:'1',...(mode==='1'?{GGML_CPU_EXPERIMENTAL_SCORE4_3ROW:'1'}:{})}});let result:any={};
try{await t.begin();await t.start('cpu');const f=fixture(4096);const r=await t.req('cpu','prefill',{...f,n_predict:1,id_slot:0,cache_prompt:false,return_tokens:true});result={ok:true,mode,timings:r.timings,tokens:r.tokens,scope:'One unprofiledlargeprefill control/candidate pair,targetonly,nogenerationthroughputclaim;4096tokens/256microbatchunchanged16threadsourcepath'};if(r.timings.prompt_n!==4096||r.timings.predicted_n!==1)throw Error('Largeprefillcoverage');}catch(e){t.error ||=String(e);console.error(e)}finally{const r=await t.finish(result);if(!r.ok)process.exitCode=1}
