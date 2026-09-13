// Run with Bun. BASE_URL and output directory identify an already running server.
import {mkdir} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:19450';
const out=process.argv[2]; if(!out) throw Error('Usage: bun gsq-evaluate.ts OUTPUT_DIR');
await mkdir(out,{recursive:true});
const results:any[]=[];
const cases=[
 {id:'logic',prompt:'All glips are blue. No blue objects are square. Can a glip be square? Reply only yes or no.',check:(s:string)=>s.trim().toLowerCase()==='no'},
 {id:'unicode',prompt:'Copy this identifier exactly, with no other text: ação-東京-42',check:(s:string)=>s.trim()==='ação-東京-42'},
 {id:'missing-data',prompt:'Record: name=Jo; age=31. What is the email address? Reply only UNKNOWN if absent.',check:(s:string)=>s.trim()==='UNKNOWN'},
 {id:'unit-conversion',prompt:'Convert 2.5 hours to minutes. Return only the integer.',check:(s:string)=>s.trim()==='150'},
 {id:'code-loop',prompt:'What does Python print? Return only the integer.\ns=0\nfor i in range(4): s+=i\nprint(s)',check:(s:string)=>s.trim()==='6'},
 {id:'arithmetic',prompt:'Return only the integer: 137 * 29.',check:(s:string)=>s.trim()==='3973'},
 {id:'sorting',prompt:'Sort these integers ascending. Output only the comma-separated list without spaces: 8,-3,12,0,8,-11.',check:(s:string)=>s.trim()==='-11,-3,0,8,8,12'},
 {id:'code-trace',prompt:'What does this Python print? Return only the integer.\nx=[2,4,6]\nprint(sum(v*v for v in x if v>2))',check:(s:string)=>s.trim()==='52'},
 {id:'extraction',prompt:'Record: owner=Ana; ticket=ZX-417; status=open. Return only the ticket identifier.',check:(s:string)=>s.trim()==='ZX-417'},
 {id:'json',prompt:'Return JSON with name Ada and count 7. No extra keys.',schema:{type:'object',properties:{name:{type:'string'},count:{type:'integer'}},required:['name','count'],additionalProperties:false},check:(s:string)=>{try{let x=JSON.parse(s);return x.name==='Ada'&&x.count===7&&Object.keys(x).length===2}catch{return false}}}
];
for(const c of cases){
 const body:any={model:'qwen38-gsq',messages:[{role:'user',content:c.prompt}],temperature:0,top_k:1,seed:42,max_tokens:128,cache_prompt:false,chat_template_kwargs:{enable_thinking:false}};
 if(c.schema) body.response_format={type:'json_schema',json_schema:{name:'record',strict:true,schema:c.schema}};
 const start=performance.now();let r:any;
 try {const response=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});r=await response.json();const text=r.choices?.[0]?.message?.content||'';results.push({id:c.id,passed:response.ok&&c.check(text),text,ms:performance.now()-start,timings:r.timings,usage:r.usage});}
 catch(e){results.push({id:c.id,passed:false,error:String(e)})}
 await Bun.write(`${out}/${c.id}.json`,JSON.stringify({request:body,response:r},null,2));
}
// Fixed token-count throughput workload; do not interpret as a quality score.
for(let i=0;i<3;i++){
 const body={prompt:'Write a detailed technical explanation of how a hash table handles collisions, resizing, and memory ownership.',n_predict:256,ignore_eos:true,temperature:0,top_k:1,seed:42,cache_prompt:false};
 const start=performance.now();const r=await fetch(base+'/completion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});const data:any=await r.json();
 results.push({id:`decode-${i}`,passed:r.ok&&data.tokens_predicted===256,ms:performance.now()-start,timings:data.timings});await Bun.write(`${out}/decode-${i}.json`,JSON.stringify(data,null,2));
}
await Bun.write(`${out}/summary.json`,JSON.stringify({base,results,passed:results.every(x=>x.passed)},null,2));console.log(JSON.stringify(results,null,2));
