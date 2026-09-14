/** SCRIPT_JDOC:
{"summary":"Capture live trial worker mapped libraries, allowlisted flags and exact argv","kind":"read-only","weight":"lightweight","role":"module"}
*/
import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
export function capture(dir:string,pid:number){const maps=readFileSync(`/proc/${pid}/maps`,'utf8'),paths=[...new Set(maps.split('\n').map(l=>l.trim().split(/\s+/).slice(5).join(' ')).filter(p=>/libllama|libggml|libomp|llama-server/.test(p)))];const value={at:new Date().toISOString(),pid,argv:readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean),flags:readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(x=>/^(GGML_|LLAMA_)/.test(x)),files:paths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}))};writeFileSync(dir+'/runtime-provenance.json',JSON.stringify(value,null,2)+'\n');return value;}
