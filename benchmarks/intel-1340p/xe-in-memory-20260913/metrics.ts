/** SCRIPT_JDOC:
{"summary":"Validate and summarise stage-level handoff performance metrics","kind":"read-only","weight":"lightweight","role":"module"}
*/
export type Event={name:string,begin:number,end:number,tokens:number};
export type Metrics={rc:number,arm:string,wall_s:number,first_token_s:number,last_token_s:number,emitted:number,source_tokens:number,target_evaluated_tokens:number,shared_bytes:number,copied_bytes:number,events:Event[]};
export function summarize(m:Metrics){
 if(m.rc!==0||!['share','copy'].includes(m.arm)||m.emitted<2||!Number.isFinite(m.wall_s)||m.wall_s<=0)throw Error('Invalid run');
 if(!(m.first_token_s>0&&m.last_token_s>m.first_token_s&&m.wall_s>=m.last_token_s))throw Error('Invalid output timestamps');
 for(const e of m.events)if(!Number.isFinite(e.begin)||!Number.isFinite(e.end)||e.end<e.begin||e.begin<0||e.end>m.wall_s||!Number.isInteger(e.tokens)||e.tokens<0)throw Error('Invalid event');
 const one=(name:string)=>{const es=m.events.filter(e=>e.name===name);if(es.length!==1)throw Error('Missing/duplicate '+name);return es[0];};
 const duration=(e:Event)=>{if(!e)throw Error('Missing event');return e.end-e.begin;};
 const sum=(name:string)=>m.events.filter(e=>e.name===name).reduce((s,e)=>s+duration(e),0);
 const prefill=m.events.filter(e=>e.name==='decode_0');if(!prefill.length||prefill.reduce((n,e)=>n+e.tokens,0)!==m.source_tokens)throw Error('Prefill count');
 const handoff=one('handoff');if(handoff.end>m.first_token_s)throw Error('Handoff ordering');
 const decode=m.events.filter(e=>e.name==='decode_1');if(!decode.length||decode.reduce((s,e)=>s+e.tokens,0)!==m.target_evaluated_tokens)throw Error('Decode count');
 const lastPrefill=Math.max(...prefill.map(e=>e.end));
 if(lastPrefill>handoff.begin)throw Error('Prefill ordering');
 if(m.arm==='share'&&(!(m.shared_bytes>0)||m.copied_bytes!==0))throw Error('Share dispatch');
 if(m.arm==='copy'&&(!(m.copied_bytes>0)||m.shared_bytes!==0))throw Error('Copy dispatch');
 const gen=m.last_token_s-m.first_token_s;
 return {arm:m.arm,prompt_tokens:m.source_tokens,output_tokens:m.emitted,target_evaluated_tokens:m.target_evaluated_tokens,kv_bytes:m.shared_bytes+m.copied_bytes,wall_s:m.wall_s,
 source_load_s:duration(one('load_0')),cpu_load_s:duration(one('load_1')),assistant_load_s:m.events.some(e=>e.name==='load_2')?duration(one('load_2')):0,
 source_context_s:duration(one('context_0')),cpu_context_s:duration(one('context_1')),assistant_context_s:m.events.some(e=>e.name==='context_2')?duration(one('context_2')):0,
 gpu_prefill_s:sum('decode_0'),gpu_prefill_tps:m.source_tokens/sum('decode_0'),handoff_ms:duration(handoff)*1000,
 ttft_process_s:m.first_token_s,ttft_post_prefill_s:m.first_token_s-lastPrefill,
 source_release_s:sum('free_context_0')+duration(one('free_model_0')),
 first_reeval_s:duration(decode[0]),warm_decode_s:gen,warm_decode_tps:(m.emitted-1)/gen,decode_to_last_s:m.last_token_s-decode[0].begin,
 generation_tps:m.emitted/(m.last_token_s-decode[0].begin),cpu_target_decode_calls_s:sum('decode_1')};
}
export function median(xs:number[]){if(!xs.length||xs.some(x=>!Number.isFinite(x)))throw Error('Invalid median');const s=[...xs].sort((a,b)=>a-b);return(s[(s.length-1)>>1]+s[s.length>>1])/2;}
export function guards(s:{available_kib:number,workers:{swap_kib:number}[],competing:number}){if(!Number.isFinite(s.available_kib)||s.available_kib<6*1048576)throw Error('Host memory reserve');if(s.workers.some(w=>!Number.isFinite(w.swap_kib)||w.swap_kib>16384))throw Error('Worker swap');if(s.competing)throw Error('Competing process');}
