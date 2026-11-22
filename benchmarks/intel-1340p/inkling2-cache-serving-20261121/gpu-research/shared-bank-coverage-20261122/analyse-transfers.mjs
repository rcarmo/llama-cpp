import fs from 'node:fs';
import {records,check,digest} from './audit-dispatch.mjs';
import {parseCopyTiming} from './analyse-copy-timing.mjs';
export function parseTransfers(text) {
    const rows=records(text), isApi=l=>/^SCHED_(SET|GET|SYNC)(?: |$)/.test(l);
    const filtered=rows.filter(r=>!isApi(r.text)).map(r=>r.timestamp+' '+r.stream+' F '+r.text).join('\n')+'\n';
    const parsed=parseCopyTiming(filtered);let current=null,index=0;
    parsed.outside_api_events=[];
    for(const call of parsed.calls)call.api_events=[];
    for(const row of rows) {
        const l=row.text;let m;
        if(l.startsWith('REPLAY_PHASE begin ')){current=parsed.calls[index++];continue;}
        if(l.startsWith('REPLAY_PHASE end ')){current=null;continue;}
        if(!isApi(l))continue;
        let event;
        m=l.match(/^SCHED_(SET|GET) backend=(\S+) name=(.*?) offset=(\d+) bytes=(\d+) api_us=(\d+) native_async=([01])$/);
        if(m)event={kind:m[1],backend:m[2],name:m[3],offset:Number(m[4]),bytes:Number(m[5]),api_us:Number(m[6]),native_async:m[7]==='1'};
        else {m=l.match(/^SCHED_SYNC backend=(\S+) call_us=(\d+)$/);check(m,'Malformed nested API event: '+l);event={kind:'SYNC',backend:m[1],api_us:Number(m[2])};}
        check([event.api_us,...(event.kind==='SYNC'?[]:[event.offset,event.bytes])].every(n=>Number.isSafeInteger(n)&&n>=0),'Unsafe API numeric value');
        (current?current.api_events:parsed.outside_api_events).push(event);
    }
    const span=191102976,expertSize=span/128;
    for(const c of parsed.calls) {
        c.weight_sets=c.api_events.filter(e=>e.kind==='SET'&&/(?:^|#)blk\.6\.ffn_down_exps\.weight(?:#|$)/.test(e.name));
        c.weight_requested_bytes=c.weight_sets.reduce((n,e)=>n+e.bytes,0);
        c.weight_set_api_us=c.weight_sets.reduce((n,e)=>n+e.api_us,0);
        c.generic_sync_api_us=c.api_events.filter(e=>e.kind==='SYNC').reduce((n,e)=>n+e.api_us,0);
        const merged=[];
        for(const e of [...c.weight_sets].sort((a,b)=>a.offset-b.offset)) {
            check(e.backend.startsWith('Vulkan')&&e.offset+e.bytes<=span&&e.offset%expertSize===0,'Weight upload range invalid');
            const last=merged.at(-1),end=e.offset+e.bytes;
            if(last&&e.offset<=last[1])last[1]=Math.max(last[1],end);else merged.push([e.offset,end]);
        }
        c.weight_unique_range_bytes=merged.reduce((n,[a,b])=>n+b-a,0);
        c.weight_fully_covered_experts=Array.from({length:128},(_,e)=>e).filter(e=>merged.some(([a,b])=>a<=e*expertSize&&b>=(e+1)*expertSize));
        c.weight_full_bank=merged.length===1&&merged[0][0]===0&&merged[0][1]===span;
        c.weight_ranges=merged;
        if(c.tokens>1){check(c.weight_sets.length>0,'Missing actual weight API uploads');check(c.weight_set_api_us<=c.weight_callback_us+100,'Nested set APIs exceed callback wrapper');}
        else check(c.weight_sets.length===0,'Unexpected decode weight upload');
    }
    parsed.raw_lines=text.trimEnd().split('\n').length;parsed.cri_records=rows.length;
    return parsed;
}
if(import.meta.main) {
    const root='/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-copy-dispatch-20261122-2d079cf5b',run=root+'/profile-transfers',label='g768-copy128-transfers-d1';
    for(const file of ['operator-profile128-transfers.complete.exit','operator-profile128-transfers.restoration.exit',label+'.exit',label+'-native.exit'])check(fs.readFileSync(run+'/'+file,'utf8').trim()==='0',file);
    const raw=fs.readFileSync(run+'/'+label+'.native.log'),parsed=parseTransfers(raw.toString());
    const before=fs.readFileSync(root+'/profile-phased/g768-copy128-phased-d1.logits.f32'),after=fs.readFileSync(run+'/'+label+'.logits.f32');check(before.length===after.length&&after.length>0,'Logit lengths differ');
    const result={diagnostic_only:true,parent_commit:fs.readFileSync(root+'/logger-fix/source.commit','utf8').trim(),temporary_patch_sha256:digest(fs.readFileSync(root+'/copy-timing-v2/instrumentation.patch')),raw_path:run+'/'+label+'.native.log',raw_sha256:digest(raw),logits:{bytes:after.length,operator_only_sha256:digest(before),transfer_profile_sha256:digest(after),exact:before.equals(after)},...parsed,caveat:'One intrusive serial-profiler observation. Requested API ranges are software payload counts, not measured DMA/DRAM traffic. Callback tensor span is separate. SET/GET/SYNC API intervals nest inside copy/backend-call wrappers; do not add them again. Async API durations may cover enqueue only. No speedup/quality comparison.'};
    fs.writeFileSync(root+'/transfer-profile.json',JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({logits:result.logits,prefills:result.prefills.map(p=>({sample:p.sample,instrumented_prefill_us:p.instrumented_prefill_us,cpu_backend_us:p.cpu_backend_us,gpu_backend_us:p.gpu_backend_us,total_gpu_operator_us:p.total_gpu_operator_us,copy_wrapper_us:p.copy_wrapper_us,weight_callback_us:p.weight_callback_us,weight_requested_bytes:p.weight_requested_bytes,weight_unique_range_bytes:p.weight_unique_range_bytes,weight_set_api_us:p.weight_set_api_us,weight_full_bank:p.weight_full_bank,fully_covered_experts:p.weight_fully_covered_experts.length,weight_sets:p.weight_sets,generic_sync_api_us:p.generic_sync_api_us,unattributed_host_us:p.unattributed_host_us}))},null,2));
}
