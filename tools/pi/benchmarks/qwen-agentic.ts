import { mkdir } from 'node:fs/promises';
const base=process.env.BENCH_URL||'http://127.0.0.1:8090';
const out=process.argv[2]||'/workspace/tmp/qwen36-agentic/baseline';
await mkdir(out,{recursive:true});
const tools=[{type:'function',function:{name:'read_file',description:'Read a repository file.',parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}}}];
const messages:any[]=[{role:'system',content:'You are a repository maintenance agent. Use read_file to inspect files. Never invent file contents. Follow the requested inspection order. When finished answer concisely with the exact configuration correction. Do not modify files.'},{role:'user',content:'Inspect config.json first, then worker.ts. Determine why jobs can retry forever and state the correction.'}];
const records:any[]=[];
for(let turn=0;turn<3;turn++){
 const start=performance.now();
 const request={model:'qwen36-35b-a3b-mtp-q2',messages,tools,parallel_tool_calls:false,temperature:0,top_k:1,seed:42,max_tokens:512,cache_prompt:true,chat_template_kwargs:{enable_thinking:false}};
 await Bun.write(`${out}/request-${turn}.json`,JSON.stringify(request));
 const r=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(180000)});
 const result=await r.json() as any; await Bun.write(`${out}/response-${turn}.json`,JSON.stringify(result,null,2));
 if(!r.ok)throw Error(JSON.stringify(result));
 const msg=result.choices[0].message; const calls=msg.tool_calls||[];
 const expected=turn===0?'config.json':'worker.ts';
 const valid=turn<2 ? calls.length===1&&calls[0].function.name==='read_file'&&JSON.parse(calls[0].function.arguments).path===expected : calls.length===0&&/maxRetries/.test(msg.content||'')&&/\b3\b/.test(msg.content||'')&&/unlimited|infinite|forever|unbounded/i.test(msg.content||'');
 records.push({turn,ms:performance.now()-start,valid,usage:result.usage,timings:result.timings,content:msg.content,calls});
 console.log(JSON.stringify(records.at(-1)));
 if(!valid)break;
 messages.push(msg);
 if(turn<2){const text=turn===0?JSON.stringify({maxRetries:0,timeoutMs:30000,notes:Array.from({length:300},(_,i)=>`queue ${i}: standard delivery with idempotency key and durable acknowledgement`).join('\n')}):'export function retry(job, config) { if (config.maxRetries === 0 || job.attempts < config.maxRetries) return enqueue(job); return deadLetter(job); }\n// maxRetries=0 explicitly means unlimited retries. Set maxRetries=3 for bounded retries.';
 messages.push({role:'tool',tool_call_id:calls[0].id,content:text});}
}
await Bun.write(`${out}/summary.json`,JSON.stringify({base,records,totalMs:records.reduce((n,r)=>n+r.ms,0),passed:records.length===3&&records.every(r=>r.valid)},null,2));
