import fs from 'node:fs';
const run='/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-cache-serving-20261121-1dadee62b',base='http://192.168.1.70:11434';
const identity=await(await fetch(base+'/v1/models')).json();
if(!identity.data?.some(x=>x.id==='Inkling-2-Mini'))throw Error('Expected Inkling model');
const observations=[];
for(const [file,expected] of [['vision-fixture.png','red'],['vision-fixture-swapped.png','blue']]){
  const image=fs.readFileSync(run+'/'+file).toString('base64');
  const request={model:'Inkling-2-Mini',temperature:0,messages:[{role:'user',content:[{type:'text',text:'What is the color of the rectangle on the left? Reply with one color word only.'},{type:'image_url',image_url:{url:'data:image/png;base64,'+image}}]}]};
  fs.writeFileSync(run+'/vision-'+expected+'-request.json',JSON.stringify(request,null,2)+'\n');
  const started=Date.now();
  const response=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
  const result=await response.json();fs.writeFileSync(run+'/vision-'+expected+'-response.json',JSON.stringify(result,null,2)+'\n');
  const answer=result.choices?.[0]?.message?.content?.trim()??'';
  if(!response.ok||!new RegExp('^'+expected+'[.!]?$','i').test(answer)||result.choices?.[0]?.finish_reason!=='stop')throw Error('Image colour probe failed: '+answer+' expected '+expected);
  observations.push({answer,expected,finish:'stop',wall_ms:Date.now()-started,timings:result.timings});
}
const summary={passed:true,observations,request_output_caps:false,scope:'Two counterbalanced colour images with identical text prompts; not general visual-quality qualification'};
fs.writeFileSync(run+'/vision-verification.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
