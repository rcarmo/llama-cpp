import hashlib,json,pathlib,sys,time,urllib.request
root=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); fixture=sys.argv[3]; base='http://127.0.0.1:18081'
def ordinary(req):
 r=urllib.request.Request(base+'/completion',data=json.dumps(req).encode(),headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(r,timeout=120) as res:return json.load(res)
warm=json.load(open(root/'requests/warmup.json')); (out/'warmup.json').write_text(json.dumps(ordinary(warm)))
def stream(name,req):
 req=dict(req,stream=True,return_tokens=True,ignore_eos=True); (out/(name+'-request.json')).write_text(json.dumps(req))
 start=time.monotonic(); r=urllib.request.Request(base+'/completion',data=json.dumps(req).encode(),headers={'Content-Type':'application/json'})
 events=[]; raw=[]; first=None; content='';tokens=[]; final=None
 with urllib.request.urlopen(r,timeout=300) as res:
  for line in res:
   line=line.decode();raw.append(line)
   if not line.startswith('data: '):continue
   text=line[6:].strip()
   if text=='[DONE]':continue
   x=json.loads(text);events.append(x)
   if x.get('content'):
    if first is None:first=(time.monotonic()-start)*1000
    content+=x['content']
   if x.get('stop'):
    final=x
   else:
    tokens+=x.get('tokens',[])

 wall=(time.monotonic()-start)*1000
 assert final and final['tokens_predicted']==req['n_predict'] and final['timings']['predicted_n']==req['n_predict'],(name,final)
 # Streamed token arrays can be empty depending serializer; validate content and final counts either way.
 summary={'ttft_ms':first,'wall_ms':wall,'timings':final['timings'],'content':content,'stream_token_count':len(tokens),'token_hash':hashlib.sha256(json.dumps(tokens,separators=(',',':')).encode()).hexdigest(),'content_hash':hashlib.sha256(content.encode()).hexdigest()}
 (out/(name+'.sse')).write_text(''.join(raw)); (out/(name+'-events.json')).write_text(json.dumps(events));(out/(name+'.json')).write_text(json.dumps(summary,indent=2))
 return summary,tokens
req=json.load(open(root/('requests/'+fixture+'.json')))
a,tokens=stream('fresh',req)
assert a['timings']['cache_n']==0 and a['timings']['prompt_n']==len(req['prompt']),a
assert len(tokens)==req['n_predict'],('stream token list absent',len(tokens))
follow=dict(req,prompt=req['prompt']+tokens,cache_prompt=True,n_predict=32)
b,_=stream('follow',follow)
assert b['timings']['cache_n']==len(req['prompt'])+63 and b['timings']['prompt_n']==1,b
print(json.dumps({'fresh':a,'follow':b}))
