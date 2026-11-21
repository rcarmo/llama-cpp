import fs from 'node:fs';
const run='/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-cache-serving-20261121-1dadee62b';
const r=await fetch('http://192.168.1.70:11434/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'Inkling-2-Mini',temperature:0,messages:[{role:'user',content:'Return only the word READY, without punctuation.'}]})});
const j=await r.json();fs.writeFileSync(run+'/post-restart-ready.json',JSON.stringify(j,null,2)+'\n');
if(!r.ok||j.choices?.[0]?.message?.content?.trim()!=='READY'||j.choices?.[0]?.finish_reason!=='stop')throw Error('Uncapped READY/EOG after retained-container restart failed');
console.log('PASS uncapped READY/EOG after retained-container restart');
