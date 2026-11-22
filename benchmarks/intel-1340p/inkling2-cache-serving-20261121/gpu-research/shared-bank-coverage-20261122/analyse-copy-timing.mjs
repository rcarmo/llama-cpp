import fs from 'node:fs';
import {records,check,digest} from './audit-dispatch.mjs';
import {parseProfile} from './analyse-profile.mjs';
export function parseCopyTiming(text) {
    const parsed=parseProfile(text),rows=records(text);let current=null,index=0;
    for(const call of parsed.calls){call.copies=[];call.prefetches=[];call.backend_calls=[];}
    for(const row of rows) {
        const l=row.text;let m;
        if(l.startsWith('REPLAY_PHASE begin ')){current=parsed.calls[index++];continue;}
        if(l.startsWith('REPLAY_PHASE end ')){current=null;continue;}
        if(!l.startsWith('SCHED_'))continue;
        check(current,'Scheduler timing outside phase');
        m=l.match(/^SCHED_COPY name=(.*?) src=(\S+) dst=(\S+) bytes=(\d+) path=(\S+) total_us=(\d+) api_us=(\d+)$/);
        if(m) {
            const c={name:m[1],src:m[2],dst:m[3],bytes:Number(m[4]),path:m[5],total_us:Number(m[6]),api_us:Number(m[7])};
            check([c.bytes,c.total_us,c.api_us].every(n=>Number.isSafeInteger(n)&&n>=0),'Unsafe copy numeric value');
            check(['async_api','sync_input','sync_fallback','prefetched_wait','callback'].includes(c.path),'Unknown copy path');
            check(c.api_us<=c.total_us,'Copy API exceeds wrapper time');
            if(['prefetched_wait','callback'].includes(c.path))check(c.api_us===0,'Wait/callback falsely counts copy API');
            current.copies.push(c);continue;
        }
        m=l.match(/^SCHED_PREFETCH name=(.*?) src=(\S+) bytes=(\d+) api_us=(\d+)$/);
        if(m){current.prefetches.push({name:m[1],src:m[2],bytes:Number(m[3]),api_us:Number(m[4])});continue;}
        m=l.match(/^SCHED_RUN backend=(\S+) split=(\d+) nodes=(\d+) async_cpu=(\d+) status=(-?\d+) call_us=(\d+)$/);
        if(m){check(m[4]==='0'&&m[5]==='0','Only successful synchronous CPU-worker-disabled calls supported');current.backend_calls.push({backend:m[1],split:Number(m[2]),nodes:Number(m[3]),call_us:Number(m[6])});continue;}
        throw Error('Malformed scheduler timing: '+l);
    }
    for(const c of parsed.calls) {
        check(c.backend_calls.length>0,'Missing backend calls');
        c.cpu_backend_us=c.backend_calls.filter(r=>r.backend==='CPU').reduce((n,r)=>n+r.call_us,0);
        c.gpu_backend_us=c.backend_calls.filter(r=>r.backend.startsWith('Vulkan')).reduce((n,r)=>n+r.call_us,0);
        c.copy_wrapper_us=c.copies.reduce((n,r)=>n+r.total_us,0);
        c.prefetch_api_us=c.prefetches.reduce((n,r)=>n+r.api_us,0);
        c.copy_api_requested_bytes=c.copies.filter(r=>!['prefetched_wait','callback'].includes(r.path)).reduce((n,r)=>n+r.bytes,0);
        c.prefetch_api_requested_bytes=c.prefetches.reduce((n,r)=>n+r.bytes,0);
        c.weight_copies=c.copies.filter(r=>r.name==='blk.6.ffn_down_exps.weight');
        c.weight_copy_api_us=c.weight_copies.reduce((n,r)=>n+r.api_us,0);
        c.weight_callback_us=c.weight_copies.filter(r=>r.path==='callback').reduce((n,r)=>n+r.total_us,0);
        c.gpu_call_outside_operator_us=c.gpu_backend_us-c.total_gpu_operator_us;
        if(c.tokens>1){check(c.backend_calls.length===16&&c.backend_calls.every((r,i)=>r.split===i),'Expected16sequential split calls');check(c.backend_calls.filter(r=>r.backend.startsWith('Vulkan')).length===c.groups.length,'GPU call/timing count mismatch');check(c.weight_copies.length===1&&c.weight_copies[0].bytes===191102976&&['sync_fallback','callback'].includes(c.weight_copies[0].path),'Expected one physical-bank callback or synchronous input span');}
        else check(c.backend_calls.every(r=>r.backend==='CPU'),'Unexpected decode GPU backend call');
    }
    const result=rows.find(r=>/^BENCH_RESULT rep=0 prompt=128 generated=8 pp_ms=/.test(r.text));check(result,'Missing benchmark bound');
    const pp_ms=Number(result.text.match(/ pp_ms=([\d.]+)/)?.[1]);check(Number.isFinite(pp_ms)&&pp_ms>0,'Invalid prefill duration');
    const p=parsed.prefills[1];p.instrumented_prefill_us=pp_ms*1000;
    p.unattributed_host_us=p.instrumented_prefill_us-p.cpu_backend_us-p.gpu_backend_us-p.copy_wrapper_us-p.prefetch_api_us;
    check(p.unattributed_host_us>=-1000,'Overlapping/double-counted host intervals');
    return parsed;
}
if(import.meta.main) {
    const root='/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-copy-dispatch-20261122-2d079cf5b',run=root+'/profile-timed',label='g768-copy128-timed-d1';
    for(const file of ['operator-profile128-timed.complete.exit','operator-profile128-timed.restoration.exit',label+'.exit',label+'-native.exit'])check(fs.readFileSync(run+'/'+file,'utf8').trim()==='0',file);
    const raw=fs.readFileSync(run+'/'+label+'.native.log'),parsed=parseCopyTiming(raw.toString());
    const before=fs.readFileSync(root+'/profile-phased/g768-copy128-phased-d1.logits.f32'),after=fs.readFileSync(run+'/'+label+'.logits.f32');
    check(before.length>0&&after.length===before.length,'Logit dump lengths differ');
    const result={diagnostic_only:true,parent_commit:fs.readFileSync(root+'/logger-fix/source.commit','utf8').trim(),temporary_patch_sha256:digest(fs.readFileSync(root+'/copy-timing/instrumentation.patch')),raw_path:run+'/'+label+'.native.log',raw_sha256:digest(raw),logits:{bytes:after.length,operator_only_sha256:digest(before),copy_timed_sha256:digest(after),exact:before.equals(after)},...parsed,caveat:'One intrusive serial-profiler observation. Copy bytes count API requests, not DMA or physical DRAM traffic. Async API time is enqueue cost. Prefetched-wait rows are not another copy. GPU backend time includes input drain, host dispatch, waits and query/logging costs. No speedup/quality claim or profiler-off comparison.'};
    fs.writeFileSync(root+'/copy-timing.json',JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({logits:result.logits,prefills:result.prefills.map(p=>({sample:p.sample,cpu_backend_us:p.cpu_backend_us,gpu_backend_us:p.gpu_backend_us,total_gpu_operator_us:p.total_gpu_operator_us,copy_wrapper_us:p.copy_wrapper_us,prefetch_api_us:p.prefetch_api_us,copy_api_requested_bytes:p.copy_api_requested_bytes,prefetch_api_requested_bytes:p.prefetch_api_requested_bytes,weight_copy_api_us:p.weight_copy_api_us,weight_callback_us:p.weight_callback_us,weight_copies:p.weight_copies,instrumented_prefill_us:p.instrumented_prefill_us,unattributed_host_us:p.unattributed_host_us}))},null,2));
}
