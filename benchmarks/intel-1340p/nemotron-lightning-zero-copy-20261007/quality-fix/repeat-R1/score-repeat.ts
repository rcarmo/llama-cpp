// Re-score one intact repeat against the unchanged frozen task oracles.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir=process.argv[2];
const suite=JSON.parse(fs.readFileSync(dir+'/suite.json','utf8'));
function clean(s:string){return s.trim().replace(/^```(?:javascript|js|json)?\s*/,'').replace(/```\s*$/,'').trim();}
function equal(a:any,b:any):boolean{if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]));if(a&&b&&typeof a==='object'&&typeof b==='object'){const x=Object.keys(a).sort(),y=Object.keys(b).sort();return equal(x,y)&&x.every(k=>equal(a[k],b[k]));}return a===b;}
const rows:any[]=[];
for(const task of suite.tasks)for(const profile of ['cpu','handoff']){
 const name=`semantic-${profile}-${task.id}-R1`,r=JSON.parse(fs.readFileSync(`${dir}/${name}-response.json`,'utf8'));
 let passed=!!r.passed_native,error=r.error??null;
 if(task.kind==='json'){
  try{if(!equal(JSON.parse(clean(r.turns[0]?.parsed?.content??'')),task.expected)){passed=false;error??='structured_answer_mismatch';}}catch{passed=false;error??='invalid_or_empty_json';}
 }else if(task.kind==='tools'){
  try{for(let i=0;i<task.expected.calls.length;i++){const calls=r.turns[i].parsed.tool_calls;if(calls.length!==1||calls[0].function.name!==task.expected.calls[i].name||!equal(JSON.parse(calls[0].function.arguments),task.expected.calls[i].arguments)){passed=false;error??='tool_arguments_mismatch';}}
   const final=r.turns.at(-1).parsed;if(final.tool_calls?.length||!equal(JSON.parse(clean(final.content)),task.expected.final)){passed=false;error??='final_tool_answer_mismatch';}
  }catch{passed=false;error??='tool_or_content_parse_failure';}
 }else{
  const content=clean(r.turns[0]?.parsed?.content??'');
  fs.writeFileSync(`${dir}/check-R1-${profile}-${task.id}.js`,`import {isDeepStrictEqual} from 'node:util';let assertions=0;function eq(a,b){assertions++;if(!isDeepStrictEqual(a,b))throw Error('assertion '+assertions+' actual='+JSON.stringify(a)+' expected='+JSON.stringify(b));}\nfunction referenceMerge(arr){const sorted=arr.map(x=>x.slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),out=[];for(const[a,b]of sorted){if(out.length&&a<=out[out.length-1][1])out[out.length-1][1]=Math.max(out[out.length-1][1],b);else out.push([a,b]);}return out;}\nfunction referenceTopo(nodes,edges){const adj=new Map(nodes.map(n=>[n,new Set()])),degree=new Map(nodes.map(n=>[n,0]));for(const[a,b]of edges)if(!adj.get(a).has(b)){adj.get(a).add(b);degree.set(b,degree.get(b)+1);}let todo=nodes.filter(n=>degree.get(n)===0),out=[];while(todo.length){todo.sort();let n=todo.shift();out.push(n);for(const v of adj.get(n)){degree.set(v,degree.get(v)-1);if(degree.get(v)===0)todo.push(v);}}return out.length===nodes.length?out:null;}\n${content}\n${suite.tests[task.id]}\nconsole.log(JSON.stringify({passed:true,assertions}));\n`);
  const p=`${dir}/check-R1-${profile}-${task.id}-result.json`;
  if(fs.existsSync(p)){const c=JSON.parse(fs.readFileSync(p,'utf8'));passed=passed&&c.passed;error=c.error??error;}else{passed=false;error??='code_assertions_not_run';}
 }
 rows.push({task:task.id,kind:task.kind,profile,passed,native_completed:!!r.passed_native,error,finish:r.turns.at(-1)?.finish??null,generated_tokens:r.turns.map((t:any)=>t.generated_tokens.length),prompt_tokens:r.turns.map((t:any)=>t.prompt_tokens.length),sampling:r.turns[0]?.sampling,shared_bytes:r.shared_bytes,copied_bytes:r.copied_bytes});
}
for(const p of ['cpu','handoff']){const xs=rows.filter(x=>x.profile===p);console.log(`${p}: ${xs.filter(x=>x.passed).length}/${xs.length}`);}
for(const x of rows)console.log(x.profile,x.task,x.passed?'PASS':'FAIL',x.error??'');
fs.writeFileSync(dir+'/results-R1.json',JSON.stringify(rows,null,2)+'\n');
