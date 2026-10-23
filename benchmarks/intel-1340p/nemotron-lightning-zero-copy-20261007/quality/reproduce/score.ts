// SCRIPT_JDOC: {"summary":"Score frozen Nemotron task-quality outputs and prepare isolated generated-code checks","kind":"mutating","weight":"lightweight","role":"entrypoint"}
import fs from 'node:fs';
const o=process.argv[2];const suite=JSON.parse(fs.readFileSync(o+'/suite.json','utf8'));const rows:any[]=[];
function clean(s:string){return s.trim().replace(/^```(?:javascript|js|json)?\s*/,'').replace(/```\s*$/,'').trim();}
function equal(a:any,b:any):boolean{if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]));if(a&&b&&typeof a==='object'&&typeof b==='object'){const x=Object.keys(a).sort(),y=Object.keys(b).sort();return equal(x,y)&&x.every(k=>equal(a[k],b[k]));}return a===b;}
const prelude=`import {isDeepStrictEqual} from 'node:util';let assertions=0;function eq(a,b){assertions++;if(!isDeepStrictEqual(a,b))throw Error('assertion '+assertions+' actual='+JSON.stringify(a)+' expected='+JSON.stringify(b));}
function referenceMerge(arr){const sorted=arr.map(x=>x.slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),out=[];for(const[a,b]of sorted){if(out.length&&a<=out[out.length-1][1])out[out.length-1][1]=Math.max(out[out.length-1][1],b);else out.push([a,b]);}return out;}
function referenceTopo(nodes,edges){const adj=new Map(nodes.map(n=>[n,new Set()])),degree=new Map(nodes.map(n=>[n,0]));for(const[a,b]of edges)if(!adj.get(a).has(b)){adj.get(a).add(b);degree.set(b,degree.get(b)+1);}let todo=nodes.filter(n=>degree.get(n)===0),out=[];while(todo.length){todo.sort();let n=todo.shift();out.push(n);for(const v of adj.get(n)){degree.set(v,degree.get(v)-1);if(degree.get(v)===0)todo.push(v);}}return out.length===nodes.length?out:null;}
`;
for(const task of suite.tasks)for(const mode of ['cpu','handoff']){
 const tag='semantic-'+mode+'-'+task.id,r=JSON.parse(fs.readFileSync(o+'/'+tag+'-response.json','utf8'));let pass=!!r.passed_native,error=r.error??null;
 if(task.kind==='code'){
  const content=clean(r.turns[0]?.parsed?.content??'');fs.writeFileSync(o+'/check-'+mode+'-'+task.id+'.js',prelude+'\n'+content+'\n'+suite.tests[task.id]+`\nconsole.log(JSON.stringify({passed:true,assertions}));\n`);
  const check=o+'/check-'+mode+'-'+task.id+'-result.json';if(fs.existsSync(check)){const c=JSON.parse(fs.readFileSync(check,'utf8'));pass&&=c.passed;error=c.error??error;}else{pass=false;error='awaiting_code_execution';}
 }else if(task.kind==='json'){
  try{const answer=JSON.parse(clean(r.turns[0]?.parsed?.content??''));if(!equal(answer,task.expected)){pass=false;error??='structured_answer_mismatch';}}catch(e){pass=false;error??='invalid_or_empty_json';}
 }else{
  try{for(let i=0;i<task.expected.calls.length;i++){const calls=r.turns[i].parsed.tool_calls;if(calls.length!==1||calls[0].function.name!==task.expected.calls[i].name||!equal(JSON.parse(calls[0].function.arguments),task.expected.calls[i].arguments)){pass=false;error??='tool_arguments_mismatch';}}
   const final=r.turns.at(-1).parsed;if(final.tool_calls?.length||!equal(JSON.parse(clean(final.content)),task.expected.final)){pass=false;error??='final_tool_answer_mismatch';}
  }catch(e){pass=false;error??='tool_or_content_parse_failure';}
 }
 const events=Object.fromEntries(fs.readFileSync(o+'/'+tag+'-memory.events','utf8').trim().split('\n').map(l=>l.split(' ').map((v,i)=>i?+v:v)));let peak=0,min=Infinity,swap=0;for(const l of fs.readFileSync(o+'/'+tag+'-resources.tsv','utf8').trim().split('\n').slice(1)){const[t,a,c,p,s]=l.split(' ');peak=Math.max(peak,+p);min=Math.min(min,+a);swap=Math.max(swap,+s);}if(swap||events.oom||events.oom_kill||min<6291456)throw Error('resource '+tag);
 if(mode==='handoff'&&(!r.source_gpu_owner_destroyed||r.shared_bytes<=0||r.copied_bytes!==0))throw Error('ownership '+tag);
 rows.push({task:task.id,kind:task.kind,profile:mode,passed:pass,native_completed:!!r.passed_native,error,total_ms:r.total_ms,prompt_tokens:r.turns.map((t:any)=>t.prompt_tokens.length),generated_tokens:r.turns.map((t:any)=>t.generated_tokens.length),cached_tokens:r.turns.map((t:any)=>t.cached_tokens),sampling:r.turns[0]?.sampling,shared_bytes:r.shared_bytes,copied_bytes:r.copied_bytes,memory_peak:peak,min_available_kib:min,swap,memory_events:events});
}
fs.writeFileSync(o+'/results.json',JSON.stringify(rows,null,2)+'\n');for(const mode of ['cpu','handoff'])console.log(mode,rows.filter(r=>r.profile===mode&&r.passed).length+'/8');for(const r of rows)console.log(r.profile,r.task,r.passed?'PASS':'FAIL',r.error??'');
