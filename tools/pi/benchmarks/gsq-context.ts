// Actual long-context retrieval, over-limit rejection, then recovery.
const base=process.env.BASE_URL||'http://127.0.0.1:19450';
const out=process.argv[2]; if(!out)throw Error('output file required');
const post=async(path:string,body:any)=>{const start=performance.now();const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(600000)});return {status:r.status,ms:performance.now()-start,data:await r.json() as any}};
let n=1000;let prompt='';let count=0;
for(let i=0;i<8;i++){
 prompt='Remember the secret code: ORCHID-7391.\n'+ 'This is unrelated background material about routine maintenance and storage systems.\n'.repeat(n)+'\nWhat is the secret code at the beginning? Return only the code.';
 const t=await post('/tokenize',{content:prompt});count=t.data.tokens.length;
 if(count>=59000&&count<=62000)break;n=Math.floor(n*60500/count);
}
if(count<59000||count>62000)throw Error('failed to size prompt: '+count);
const request={prompt,n_predict:32,temperature:0,top_k:1,seed:42,cache_prompt:false};
const long=await post('/completion',request);
const over=await post('/completion',{...request,prompt:prompt+prompt});
const recovery=await post('/completion',{prompt:'Reply with OK.',n_predict:16,temperature:0,top_k:1,cache_prompt:false});
await Bun.write(out,JSON.stringify({count,long,over,recovery,retrievalPassed:long.status===200&&long.data.content?.includes('ORCHID-7391'),overLimitRejected:over.status>=400,recovered:recovery.status===200},null,2));
console.log(JSON.stringify({count,longStatus:long.status,longMs:long.ms,content:long.data.content,overStatus:over.status,recoveryStatus:recovery.status}));
