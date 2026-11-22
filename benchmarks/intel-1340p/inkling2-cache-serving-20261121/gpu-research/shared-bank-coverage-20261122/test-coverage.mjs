import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyCoverage,parseCoverage} from './analyse-coverage.mjs';
const root='/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-copy-dispatch-20261122-2d079cf5b';
const p=JSON.parse(fs.readFileSync(root+'/transfer-profile.json','utf8')).prefills[1],uploaded=p.weight_fully_covered_experts;
const absent=Array.from({length:128},(_,i)=>i).find(i=>!uploaded.includes(i));
function fixture(){return {tokens:128,weight_sets:[{name:'Vulkan0#blk.6.ffn_down_exps.weight#0'}],weight_fully_covered_experts:[...uploaded],backend_calls:[4,9,14].map(split=>({split,backend:'Vulkan0'})),routes:[6,24,36].map(layer=>({layer,experts:[...uploaded]})),banks:[6,24,36].map((layer,i)=>({split:[4,9,14][i],weight:'Vulkan0#blk.6.ffn_down_exps.weight#0',ids:'Vulkan0#ffn_moe_topk-'+layer+'#0',buffer:'0x111',data:'0x222',bytes:191102976}))};}
let n=0;function test(name,fn){fn();console.log('PASS '+name);n++;}
test('all later routes covered',()=>assert(classifyCoverage(fixture()).every(r=>r.missing_from_retained_uploads.length===0)));
test('detect later unuploaded expert',()=>{const c=fixture();c.routes[1].experts.push(absent);assert.deepEqual(classifyCoverage(c)[1].missing_from_retained_uploads,[absent]);});
test('same allocation can retain earlier uploaded expert',()=>{const h=new Map([['0x111:0x222',new Set([absent])]]),c=fixture();c.routes[1].experts.push(absent);const r=classifyCoverage(c,h)[1];assert.deepEqual(r.missing_this_prefill,[absent]);assert.deepEqual(r.missing_from_retained_uploads,[]);});
test('different allocation cannot inherit old coverage',()=>{const c=fixture();c.banks[1].data='0x333';const r=classifyCoverage(c)[1];assert(!r.same_bank_as_first);assert.deepEqual(r.missing_from_retained_uploads,uploaded);});
test('reject first route/upload mismatch',()=>{const c=fixture();c.routes[0].experts.pop();assert.throws(()=>classifyCoverage(c),/does not equal/);});
test('reject missing bank',()=>{const c=fixture();c.banks.pop();assert.throws(()=>classifyCoverage(c),/three routed banks/);});
test('reject wrong route identity',()=>{const c=fixture();c.banks[1].ids='Vulkan0#ffn_moe_topk-25#0';assert.throws(()=>classifyCoverage(c),/identity mismatch/);});
const base=fs.readFileSync(root+'/profile-transfers/g768-copy128-transfers-d1.native.log','utf8');
const mask=Array.from({length:128},(_,i)=>uploaded.includes(i)?'1':'0').join('');
const synthetic=base.replaceAll(/([^\n]*?)SCHED_RUN backend=Vulkan0 split=4 /g,(_,prefix)=>[...[6,24,36].flatMap((layer,i)=>[prefix+'SCHED_ROUTE name=ffn_moe_topk-'+layer+' n0=8 n1=128 nb0=4 nb1=512 mask='+mask,prefix+'SCHED_BANK split='+[4,9,14][i]+' weight=Vulkan0#blk.6.ffn_down_exps.weight#0 ids=Vulkan0#ffn_moe_topk-'+layer+'#0 buffer=0x111 data=0x222 bytes=191102976']),prefix+'SCHED_RUN backend=Vulkan0 split=4 '].join('\n'));
test('integrated phase parser preserves base transfer evidence',()=>{const r=parseCoverage(synthetic);assert.equal(r.prefills[1].weight_requested_bytes,146324992);assert(r.prefills.every(c=>c.expert_coverage.every(r=>r.missing_this_prefill.length===0)));});
test('reject malformed route bitmap',()=>assert.throws(()=>parseCoverage(synthetic.replace('mask='+mask,'mask=X'+mask.slice(1))),/Malformed coverage/));
test('reject wrong logical stride',()=>assert.throws(()=>parseCoverage(synthetic.replace('nb1=512','nb1=32')),/logical route layout/));
console.log('PASS '+n+' route-coverage parser checks');
