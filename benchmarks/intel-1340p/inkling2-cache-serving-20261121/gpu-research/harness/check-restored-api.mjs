import fs from 'node:fs';
const run=process.argv[2];
const base='http://192.168.1.70:11434';
const save=(name,value)=>fs.writeFileSync(`${run}/${name}.json`,JSON.stringify(value,null,2)+'\n');
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
async function post(body){const r=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'Inkling-2-Mini',temperature:0,cache_prompt:true,...body})});const j=await r.json();assert(r.ok,JSON.stringify(j));return j;}
const identity=await (await fetch(base+'/v1/models')).json();assert(identity.data?.some(x=>x.id==='Inkling-2-Mini'),'Inkling is not the active model; inspect rollback before testing');save('api-model-identity',identity);
const slots=await (await fetch(base+'/slots')).json();assert(slots.every(s=>!s.is_processing),'Server busy; do not interrupt another request');
const tools=[{type:'function',function:{name:'add',description:'Add two integers.',parameters:{type:'object',properties:{a:{type:'integer'},b:{type:'integer'}},required:['a','b'],additionalProperties:false}}}];
const messages=[{role:'user',content:'Use the add tool to calculate 19 plus 23. After receiving its result, reply with only the resulting number.'}];
const first=await post({messages,tools,tool_choice:'required'});save('api-tool-call',first);
const m=first.choices[0].message,c=m.tool_calls?.[0];assert(c?.function.name==='add','Expected add tool call');const args=JSON.parse(c.function.arguments);assert(args.a===19&&args.b===23,'Wrong tool arguments');
messages.push(m,{role:'tool',tool_call_id:c.id,content:'42'});
const second=await post({messages,tools,tool_choice:'none'});save('api-tool-result',second);
assert(second.choices[0].message.content.trim()==='42','Tool result continuation failed');
assert(second.choices[0].finish_reason==='stop','Tool continuation did not reach EOG');
assert(second.timings.cache_n>0,'No exact-prefix cache reuse observed');
const ctl=new AbortController();
const r=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctl.signal,body:JSON.stringify({model:'Inkling-2-Mini',stream:true,messages:[{role:'user',content:'Explain how to build a compiler in extensive detail, including parsing, type inference, optimisation and code generation.'}]})});
assert(r.ok,'Cancellation stream failed to start');const reader=r.body.getReader();let text='',seen=false;
while(!seen){const item=await reader.read();assert(!item.done,'Stream ended before cancellation boundary');text+=new TextDecoder().decode(item.value);for(const line of text.split('\n')){if(!line.startsWith('data: ')||line==='data: [DONE]')continue;try{const d=JSON.parse(line.slice(6)).choices?.[0]?.delta;seen=!!(d?.content||d?.reasoning_content)||seen;}catch{}}}
ctl.abort();save('api-cancellation',{at:new Date().toISOString(),cancelled_after_actual_delta:true,received:text});
let idle=false;for(let i=0;i<60;i++){const s=await (await fetch(base+'/slots')).json();if(s.every(x=>!x.is_processing)){idle=true;break;}await Bun.sleep(500);}assert(idle,'Cancelled slot did not drain');
const recovery=await post({messages:[{role:'user',content:'Return only the word READY, without punctuation.'}]});save('api-recovery',recovery);
assert(recovery.choices[0].finish_reason==='stop'&&recovery.choices[0].message.content.trim()==='READY','Post-cancellation recovery failed');
const result={tool_call:true,tool_result:'42',prefix_reused_tokens:second.timings.cache_n,cancellation_after_real_delta:true,idle_after_cancellation:true,recovery:'READY',natural_EOG:true,request_output_caps:false};save('api-verification',result);console.log(JSON.stringify(result,null,2));
