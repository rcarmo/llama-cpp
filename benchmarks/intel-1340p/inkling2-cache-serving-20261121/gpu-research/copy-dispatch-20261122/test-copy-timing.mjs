import assert from 'node:assert/strict';
import {parseCopyTiming} from './analyse-copy-timing.mjs';
const rows=[],gpu=new Set([1,3,4,6,8,9,11,13,14]);
for(let round=0;round<2;round++) {
    rows.push('REPLAY_PHASE begin tokens=128 pos=0');
    rows.push('SCHED_COPY name=blk.6.ffn_down_exps.weight src=CPU_Mapped dst=Vulkan0 bytes=191102976 path=sync_fallback total_us=5 api_us=3');
    rows.push('SCHED_PREFETCH name=result src=Vulkan0 bytes=4096 api_us=2');
    rows.push('SCHED_COPY name=result src=Vulkan0 dst=CPU bytes=4096 path=prefetched_wait total_us=7 api_us=0');
    for(let split=0;split<16;split++) {
        if(gpu.has(split)){const mat=[4,9,14].includes(split),us=mat?10:1;rows.push('Vulkan Timings:',(mat?'MUL_MAT_ID iq4_nl':'SCALE')+`: 1 x ${us} us = ${us} us`,`Total time: ${us} us.`);}
        rows.push(`SCHED_RUN backend=${gpu.has(split)?'Vulkan0':'CPU'} split=${split} nodes=1 async_cpu=0 status=0 call_us=${gpu.has(split)?10:100}`);
    }
    rows.push('REPLAY_PHASE end tokens=128 pos=0');
    for(let pos=128;pos<136;pos++)rows.push('REPLAY_PHASE begin tokens=1 pos='+pos,'SCHED_RUN backend=CPU split=0 nodes=1 async_cpu=0 status=0 call_us=11','REPLAY_PHASE end tokens=1 pos='+pos);
}
rows.push('BENCH_RESULT rep=0 prompt=128 generated=8 pp_ms=1 tg_ms=1','RESULT PASS finite replay');
const raw=rows.map(t=>'2026-11-22T12:00:00Z stderr F '+t).join('\n')+'\n';let n=0;
function test(name,fn){fn();n++;console.log('PASS '+name);}
test('actual copy API count excludes prefetched wait, clocks partition host calls',()=>{const p=parseCopyTiming(raw).prefills[1];assert.equal(p.copy_api_requested_bytes,191102976);assert.equal(p.prefetch_api_requested_bytes,4096);assert.equal(p.cpu_backend_us,700);assert.equal(p.gpu_backend_us,90);assert.equal(p.unattributed_host_us,196);});
test('reject copy API outside wrapper duration',()=>assert.throws(()=>parseCopyTiming(raw.replace('api_us=3','api_us=6')),/exceeds wrapper/));
test('reject missing split call',()=>assert.throws(()=>parseCopyTiming(raw.replace('SCHED_RUN backend=CPU split=0 nodes=1 async_cpu=0 status=0 call_us=100','missing')),/16sequential/));
test('reject unexpected CPU async worker',()=>assert.throws(()=>parseCopyTiming(raw.replace('async_cpu=0','async_cpu=1')),/worker-disabled/));
test('callback span is separate from copy API bytes',()=>{const p=parseCopyTiming(raw.replaceAll('path=sync_fallback','path=callback').replaceAll('api_us=3','api_us=0')).prefills[1];assert.equal(p.weight_callback_us,5);assert.equal(p.copy_api_requested_bytes,0);assert.equal(p.weight_copy_api_us,0);});
test('reject unsupported copy classification',()=>assert.throws(()=>parseCopyTiming(raw.replace('path=sync_fallback','path=unknown')),/Unknown copy path/));
test('reject GPU decode backend',()=>assert.throws(()=>parseCopyTiming(raw.replace('backend=CPU split=0 nodes=1 async_cpu=0 status=0 call_us=11','backend=Vulkan0 split=0 nodes=1 async_cpu=0 status=0 call_us=11')),/decode GPU/));
test('reject malformed scheduler timing',()=>assert.throws(()=>parseCopyTiming(raw.replace('SCHED_PREFETCH name=result','SCHED_UNKNOWN name=result')),/Malformed scheduler/));
console.log('PASS '+n+' copy-timing parser checks');
