import assert from 'node:assert/strict';
import { parseProfile } from './analyse-profile.mjs';
const rows=[];
const timing=['Vulkan Timings:','MUL_MAT_ID iq4_nl m=2304 n=8 k=1152 n_expert=128 batch=128: 3 x 10 us = 30 us (1 GFLOPS/s)','Total time: 30 us.'];
for(let round=0;round<2;round++) {
    rows.push('REPLAY_PHASE begin tokens=128 pos=0',...timing,'REPLAY_PHASE end tokens=128 pos=0');
    for(let pos=128;pos<136;pos++)rows.push('REPLAY_PHASE begin tokens=1 pos='+pos,'REPLAY_PHASE end tokens=1 pos='+pos);
}
rows.push('RESULT PASS finite replay');
const cri=lines=>lines.map(t=>'2026-11-22T12:00:00Z stderr F '+t).join('\n')+'\n';
const valid=cri(rows);let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
test('warmup/profiled phases and full8-step decode sequence',()=>{const p=parseProfile(valid);assert.equal(p.calls.length,18);assert.equal(p.prefills[1].routed_matmul_count,3);assert.equal(p.prefills[1].total_gpu_operator_us,30);});
test('reject wrong aggregate total',()=>assert.throws(()=>parseProfile(valid.replace('Total time: 30','Total time: 31')),/Group sum mismatch/));
test('reject wrong count/average',()=>assert.throws(()=>parseProfile(valid.replace('3 x 10','3 x 20')),/Average\/count mismatch/));
test('reject truncated phase',()=>assert.throws(()=>parseProfile(valid.replace('REPLAY_PHASE end tokens=128 pos=0','bad')),/Nested phase/));
test('reject unexpected GPU decode',()=>assert.throws(()=>parseProfile(cri(rows.flatMap(t=>t==='REPLAY_PHASE begin tokens=1 pos=128'?[t,...timing]:[t]))),/Unexpected decode GPU timing/));
test('reject incomplete finite workload',()=>assert.throws(()=>parseProfile(valid.replace('RESULT PASS finite replay','no pass')),/Missing finite completion/));
test('reject malformed numeric row',()=>assert.throws(()=>parseProfile(valid.replace('3 x 10','3 x NaN')),/Malformed timing row/));
console.log('PASS '+count+' profile parser checks');
