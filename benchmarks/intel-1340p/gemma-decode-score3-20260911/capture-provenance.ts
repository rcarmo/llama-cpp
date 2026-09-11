/** SCRIPT_JDOC:
{"summary":"Capture actual score3 timing worker maps, flags and source hashes without inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,readdirSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';const root=import.meta.dir,sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
let found=false;
for(let attempt=0;attempt<60&&!found;attempt++){
 for(const pid of readdirSync('/proc').filter(x=>/^\d+$/.test(x))){try{
  const argv=readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean);if(argv[0]!==root+'/runtime-cpu/bin/llama-server')continue;
  const env=Object.fromEntries(readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(x=>/^(LLAMA_EXPERIMENTAL_|GGML_CPU_EXPERIMENTAL_|GGML_CPU_.*TRACE)/.test(x)).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)]}));if(env.GGML_CPU_EXPERIMENTAL_SCORE4_3ROW!=='1')continue;
  const paths=[...new Set(readFileSync(`/proc/${pid}/maps`,'utf8').split('\n').map(l=>l.trim().split(/\s+/).slice(5).join(' ')).filter(x=>/libllama|libggml|libomp|llama-server/.test(x)))];
  writeFileSync(root+'/runtime-provenance.json',JSON.stringify({captured:new Date().toISOString(),scope:'Live candidate confirmation worker',pid:+pid,argv,env,mapped_files:paths.map(path=>({path,sha256:sha(path)})),source_sha256:sha(root+'/patch/sgemm.cpp')},null,2)+'\n');console.log('Captured candidate',pid);found=true;break;
 }catch(e){if(e.code!=='ENOENT'&&e.code!=='ESRCH')throw e}}
 if(!found)await Bun.sleep(500);
}if(!found)throw Error('No candidate capture');
