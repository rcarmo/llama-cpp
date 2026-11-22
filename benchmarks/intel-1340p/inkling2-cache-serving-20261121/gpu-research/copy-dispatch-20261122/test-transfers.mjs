import assert from 'node:assert/strict';
import {parseTransfers} from './analyse-transfers.mjs';
const rows=[],gpu=new Set([1,3,4,6,8,9,11,13,14]);
const upload='SCHED_SET backend=Vulkan0 name=Vulkan0#blk.6.ffn_down_exps.weight#0 offset=0 bytes=191102976 api_us=3 native_async=1';
for(let round=0;round<2;round++) {
    rows.push('REPLAY_PHASE begin tokens=128 pos=0',upload,'SCHED_COPY name=blk.6.ffn_down_exps.weight src=CPU_Mapped dst=Vulkan0 bytes=191102976 path=callback total_us=5 api_us=0');
    for(let split=0;split<16;split++) {
        if(gpu.has(split)){const mat=[4,9,14].includes(split),us=mat?10:1;rows.push('Vulkan Timings:',(mat?'MUL_MAT_ID iq4_nl':'SCALE')+`: 1 x ${us} us = ${us} us`,`Total time: ${us} us.`);}
        rows.push(`SCHED_RUN backend=${gpu.has(split)?'Vulkan0':'CPU'} split=${split} nodes=1 async_cpu=0 status=0 call_us=${gpu.has(split)?10:100}`);
    }
    rows.push('REPLAY_PHASE end tokens=128 pos=0');
    for(let pos=128;pos<136;pos++)rows.push('REPLAY_PHASE begin tokens=1 pos='+pos,'SCHED_RUN backend=CPU split=0 nodes=1 async_cpu=0 status=0 call_us=11','REPLAY_PHASE end tokens=1 pos='+pos);
}
rows.push('BENCH_RESULT rep=0 prompt=128 generated=8 pp_ms=1 tg_ms=1','RESULT PASS finite replay');
const raw=lines=>lines.map(l=>'2026-11-22T12:00:00Z stderr F '+l).join('\n')+'\n';const valid=raw(rows);let n=0;
function test(name,fn){fn();n++;console.log('PASS '+name);}
test('full-bank request coverage with backend-prefixed tensor names',()=>{const p=parseTransfers(valid).prefills[1];assert(p.weight_full_bank);assert.equal(p.weight_fully_covered_experts.length,128);assert.equal(p.weight_requested_bytes,191102976);assert.equal(p.weight_set_api_us,3);});
test('partial expert ranges and padding stay distinct from complete coverage',()=>{const part=upload.replace('191102976','4479488');const p=parseTransfers(raw(rows.map(r=>r===upload?part:r))).prefills[1];assert(!p.weight_full_bank);assert.equal(p.weight_fully_covered_experts.length,3);assert.equal(p.weight_unique_range_bytes,4479488);});
test('reject weight range beyond bank',()=>assert.throws(()=>parseTransfers(valid.replace('bytes=191102976 api_us=3','bytes=191102977 api_us=3')),/range invalid/));
test('reject missing uploads',()=>assert.throws(()=>parseTransfers(raw(rows.filter(r=>r!==upload))),/Missing actual weight/));
test('reject nested API duration exceeding callback',()=>assert.throws(()=>parseTransfers(valid.replace('api_us=3 native_async','api_us=106 native_async')),/exceed callback/));
test('decode cannot upload weights',()=>assert.throws(()=>parseTransfers(raw(rows.flatMap(r=>r==='REPLAY_PHASE begin tokens=1 pos=128'?[r,upload]:[r]))),/decode weight/));
test('initialisation/teardown API events are separate',()=>{const p=parseTransfers(raw(['SCHED_SYNC backend=Vulkan0 call_us=9',...rows]));assert.equal(p.outside_api_events.length,1);assert.equal(p.prefills[1].generic_sync_api_us,0);});
test('reject unsafe numeric API value',()=>assert.throws(()=>parseTransfers(valid.replace('api_us=3 native_async','api_us=9007199254740992 native_async')),/Unsafe API numeric/));
console.log('PASS '+n+' transfer-range/parser checks');
