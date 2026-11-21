import fs from 'node:fs';
const root='/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-gpu-cache768-20261121-1dadee62b';
const baseline=root+'/v2/g768-512-a2',paths=[root+'/v2/g768-512-b2',root+'/dense/g768-512-c1'];
function load(prefix){
 if(fs.readFileSync(prefix+'.exit','utf8').trim()!=='0')throw Error('Failed '+prefix);
 const log=fs.readFileSync(prefix+'.native.log','utf8'),vocab=Number(log.match(/MODEL_ID layers=\d+ vocab=(\d+)/)?.[1]),hash=log.match(/TOKEN_STREAM_HASH hash=(\d+) tokens=(\d+)/);
 const bytes=fs.readFileSync(prefix+'.logits.f32');if(!vocab||!hash||bytes.length!==vocab*8*4)throw Error('Incomplete frames');
 const data=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);if(!data.every(Number.isFinite))throw Error('Nonfinite dump');
 return {prefix,vocab,token_hash:hash[1],tokens:Number(hash[2]),data};
}
const a=load(baseline),comparisons=[];
for(const prefix of paths){
 const b=load(prefix);if(a.vocab!==b.vocab||a.tokens!==b.tokens||a.token_hash!==b.token_hash)throw Error('Unmatched');
 const frames=[];
 for(let frame=0;frame<8;frame++){
  const off=frame*a.vocab,n=a.vocab;let ma=-Infinity,mb=-Infinity,aa=0,ab=0,max_abs=0,sum_sq=0;
  for(let i=0;i<n;i++){const x=a.data[off+i],y=b.data[off+i];if(x>ma){ma=x;aa=i;}if(y>mb){mb=y;ab=i;}const d=x-y;max_abs=Math.max(max_abs,Math.abs(d));sum_sq+=d*d;}
  let za=0,zb=0;for(let i=0;i<n;i++){za+=Math.exp(a.data[off+i]-ma);zb+=Math.exp(b.data[off+i]-mb);}const lza=ma+Math.log(za),lzb=mb+Math.log(zb);let kl=0,js=0,tv=0;
  for(let i=0;i<n;i++){const lp=a.data[off+i]-lza,lq=b.data[off+i]-lzb,p=Math.exp(lp),q=Math.exp(lq),m=(p+q)/2;kl+=p*(lp-lq);if(p>0)js+=p*(lp-Math.log(m))/2;if(q>0)js+=q*(lq-Math.log(m))/2;tv+=Math.abs(p-q)/2;}
  frames.push({frame,baseline_argmax:aa,candidate_argmax:ab,argmax_equal:aa===ab,max_abs_logit_delta:max_abs,rms_logit_delta:Math.sqrt(sum_sq/n),kl_baseline_to_candidate:kl,js_nats:js,total_variation:tv});
 }
 comparisons.push({baseline:baseline.split('/').at(-1),candidate:prefix.split('/').at(-1),token_stream_hash:a.token_hash,tokens:a.tokens,vocab:a.vocab,finite_frames:8,argmax_equal_frames:frames.filter(f=>f.argmax_equal).length,max_abs_logit_delta:Math.max(...frames.map(f=>f.max_abs_logit_delta)),max_js_nats:Math.max(...frames.map(f=>f.js_nats)),max_total_variation:Math.max(...frames.map(f=>f.total_variation)),frames});
}
const result={generated:new Date().toISOString(),diagnostic_only:true,promotion_qualified:false,teacher_forced:true,warning:'Eight matched full-vocabulary frames per candidate. Cross-backend argmax equality is diagnostic, not a quality gate. No independent coding/serving quality or broad probability noninferiority bound.',comparisons};
fs.writeFileSync(root+'/screen-numerics.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(comparisons.map(({frames,...x})=>x),null,2));
