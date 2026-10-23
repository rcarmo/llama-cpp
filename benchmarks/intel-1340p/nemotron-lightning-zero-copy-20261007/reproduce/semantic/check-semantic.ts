// SCRIPT_JDOC: {"summary":"Verify retained Nemotron semantic responses and bounded resources without rerunning inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
import fs from 'node:fs';
const o=process.argv[2];const rows:any[]=[];
for(const mode of ['cpu','handoff'])for(const [fixture,suffix] of [['arithmetic-warm','-final'],['code-nonthinking',''],['recall',''],['tool-roundtrip',''],['thinking-arithmetic','']]){
 const tag='semantic-'+mode+'-'+fixture+suffix,r=JSON.parse(fs.readFileSync(o+'/'+tag+'-response.json','utf8'));
 if(!r.passed_native||r.turns.some((t:any)=>t.finish!=='eog'))throw Error(tag);
 const content=(i:number)=>r.turns[i].parsed.content.trim();
 if(fixture==='arithmetic-warm'&&(content(0)!=='42'||content(1)!=='40'||r.turns[1].cached_tokens<=0))throw Error(tag);
 if(fixture==='recall'&&content(0)!=='marker_5dbe6')throw Error(tag);
 if(fixture==='thinking-arithmetic'&&(content(0)!=='42'||!r.turns[0].parsed.reasoning_content))throw Error(tag);
 if(fixture==='tool-roundtrip'&&(r.turns[0].parsed.tool_calls[0].function.name!=='get_weather'||JSON.parse(r.turns[0].parsed.tool_calls[0].function.arguments).city!=='Lisbon'||content(1)!=='21'||r.turns[1].cached_tokens<=0))throw Error(tag);
 if(mode==='handoff'&&(!r.source_gpu_owner_destroyed||r.shared_bytes<=0||r.copied_bytes!==0))throw Error(tag);
 const events=Object.fromEntries(fs.readFileSync(o+'/'+tag+'-memory.events','utf8').trim().split('\n').map(l=>l.split(' ').map((v,i)=>i?+v:v)));
 let peak=0,min=Infinity,swap=0;
 for(const line of fs.readFileSync(o+'/'+tag+'-resources.tsv','utf8').trim().split('\n').slice(1)){
  let[t,a,c,p,s]=line.split(' ');peak=Math.max(peak,+p);min=Math.min(min,+a);swap=Math.max(swap,+s);
 }
 if(swap||events.oom||events.oom_kill||min<6291456)throw Error('resource '+tag);
 rows.push({tag,passed:true,total_ms:r.total_ms,shared_bytes:r.shared_bytes,copied_bytes:r.copied_bytes,prompt_tokens:r.turns.map((t:any)=>t.prompt_tokens.length),generated_tokens:r.turns.map((t:any)=>t.generated_tokens.length),cached_tokens:r.turns.map((t:any)=>t.cached_tokens),memory_peak:peak,min_available_kib:min,swap,memory_events:events});
}
fs.writeFileSync(o+'/semantic-results.json',JSON.stringify(rows,null,2)+'\n');
console.log('SEMANTIC_ASSERTIONS_PASS',rows.length);
console.log('RESOURCE',Math.max(...rows.map(r=>r.memory_peak)),Math.min(...rows.map(r=>r.min_available_kib)),Math.max(...rows.map(r=>r.swap)));
