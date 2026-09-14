/** SCRIPT_JDOC:
{"summary":"Publish both failed first protocol and frozen three-arm long-task diagnostic without compiled artifacts or mutable admissions","kind":"mutating","weight":"standard","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,copyFileSync,cpSync,mkdirSync,readdirSync,statSync}from'node:fs';import{createHash}from'node:crypto';
const root=import.meta.dir,old=root+'/../xe-long-agentic-20260914',repo='/var/home/agent/workspace/projects/llama-cpp';
function walk(d:string,p=''):string[]{return readdirSync(d).sort().flatMap(f=>statSync(d+'/'+f).isDirectory()?walk(d+'/'+f,p+f+'/'):[p+f]);}
for(const [src,name]of [[old,'xe-long-agentic-20260914'],[root,'xe-long-agentic-v2-20260914']]){
 const dest=repo+'/benchmarks/intel-1340p/'+name;mkdirSync(dest,{recursive:true});
 for(const f of readdirSync(src)){if(['bin'].includes(f)||f==='admission.json')continue;const path=src+'/'+f;if(statSync(path).isDirectory()){if(['evidence','fixtures','runs','charts'].includes(f))cpSync(path,dest+'/'+f,{recursive:true});}else if(/\.(ts|sh|md|json|csv)$/.test(f))copyFileSync(path,dest+'/'+f);}
 writeFileSync(dest+'/.gitattributes','**/*.log -whitespace\n**/*-maps.txt -whitespace\n**/maps.txt -whitespace\nruns/*/fixture/src/*.ts -whitespace\n');
 const all=walk(dest).filter(f=>f!=='SHA256SUMS');
 for(const f of all)if(/\.(gguf|so|o|spv)$/.test(f))throw Error('Unexpected binary '+f);
 writeFileSync(dest+'/SHA256SUMS',all.map(f=>createHash('sha256').update(readFileSync(dest+'/'+f)).digest('hex')+'  '+f).join('\n')+'\n');
 console.log(name+': '+all.length+' publication hashes');
}
