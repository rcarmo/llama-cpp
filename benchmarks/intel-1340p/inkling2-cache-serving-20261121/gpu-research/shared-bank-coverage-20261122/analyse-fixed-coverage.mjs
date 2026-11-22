import fs from 'node:fs';
import {records,check,digest} from './audit-dispatch.mjs';
import {parseTransfers} from './analyse-fixed-transfers.mjs';
const routeLayers=[6,24,36];
export function classifyCoverage(c,history=new Map()) {
    const banks=c.banks.filter(b=>c.backend_calls.find(r=>r.split===b.split)?.backend.startsWith('Vulkan'));
    if(c.tokens===1){check(banks.length===0&&c.routes.length===0,'Unexpected decode GPU routes');return [];}
    check(banks.length===3&&c.routes.length===3,'Expected three routed banks and masks');
    check(banks.every((b,i)=>b.split===[4,9,14][i]),'Unexpected bank split order');
    check(c.routes.every((r,i)=>r.layer===routeLayers[i]),'Unexpected route layer order');
    const first=banks[0],key=b=>b.buffer+':'+b.data;
    check(banks.every(b=>b.bytes===191102976),'Unexpected bank span');
    check(c.weight_sets.every(e=>e.name===first.weight),'SET and bank tensor names differ');
    const selected=c.routes[0].experts,uploaded=c.weight_fully_covered_experts;
    if (c.weight_full_bank) check(selected.every(e=>uploaded.includes(e)), 'First route lacks full-bank coverage');
    else check(JSON.stringify(selected)===JSON.stringify(uploaded),'First route mask does not equal uploaded expert coverage');
    const valid=history.get(key(first))??new Set();for(const e of uploaded)valid.add(e);history.set(key(first),valid);
    return banks.map((b,i)=>{
        check(b.ids.includes('ffn_moe_topk-'+routeLayers[i]+'#'),'Bank route identity mismatch');
        const route=c.routes[i],known=history.get(key(b))??new Set();
        return {layer:route.layer,split:b.split,bank_key:key(b),same_bank_as_first:key(b)===key(first),required_experts:route.experts,uploaded_this_prefill:uploaded.length,known_uploaded_experts:[...known].sort((a,b)=>a-b),missing_this_prefill:route.experts.filter(e=>!uploaded.includes(e)),missing_from_retained_uploads:route.experts.filter(e=>!known.has(e))};
    });
}
export function parseCoverage(text) {
    const rows=records(text),extra=l=>/^SCHED_(ROUTE|BANK)(?: |$)/.test(l);
    const filtered=rows.filter(r=>!extra(r.text)).map(r=>r.timestamp+' '+r.stream+' F '+r.text).join('\n')+'\n';
    const parsed=parseTransfers(filtered);let current=null,index=0;
    for(const c of parsed.calls){c.routes=[];c.banks=[];}
    for(const row of rows) {
        const l=row.text;let m;
        if(l.startsWith('REPLAY_PHASE begin ')){current=parsed.calls[index++];continue;}
        if(l.startsWith('REPLAY_PHASE end ')){current=null;continue;}
        if(!extra(l))continue;
        check(current,'Coverage metadata outside phase');
        m=l.match(/^SCHED_ROUTE name=ffn_moe_topk-(\d+) n0=(\d+) n1=(\d+) nb0=(\d+) nb1=(\d+) mask=([01]{128})$/);
        if(m){const r={layer:Number(m[1]),n0:Number(m[2]),n1:Number(m[3]),nb0:Number(m[4]),nb1:Number(m[5]),mask:m[6],experts:[...m[6]].flatMap((v,i)=>v==='1'?[i]:[])};check(r.n0===8&&r.n1===128&&r.nb0===4&&r.nb1===512,'Unexpected logical route layout');current.routes.push(r);continue;}
        m=l.match(/^SCHED_BANK split=(\d+) weight=(\S+) ids=(\S+) buffer=(0x[0-9a-f]+) data=(0x[0-9a-f]+) bytes=(\d+)$/);
        check(m,'Malformed coverage metadata: '+l);current.banks.push({split:Number(m[1]),weight:m[2],ids:m[3],buffer:m[4],data:m[5],bytes:Number(m[6])});
    }
    const history=new Map();
    for(const c of parsed.calls)c.expert_coverage=classifyCoverage(c,history);
    parsed.raw_lines=text.trimEnd().split('\n').length;parsed.cri_records=rows.length;
    return parsed;
}
if(import.meta.main) {
    const root='/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-copy-dispatch-20261122-2d079cf5b',run=root+'/profile-coverage-fixed',label='g768-copy128-coverage-fixed-d1';
    for(const f of ['operator-profile128-coverage-fixed.complete.exit','operator-profile128-coverage-fixed.restoration.exit',label+'.exit',label+'-native.exit'])check(fs.readFileSync(run+'/'+f,'utf8').trim()==='0',f);
    const raw=fs.readFileSync(run+'/'+label+'.native.log'),parsed=parseCoverage(raw.toString());
    const before=fs.readFileSync(root+'/profile-transfers/g768-copy128-transfers-d1.logits.f32'),after=fs.readFileSync(run+'/'+label+'.logits.f32');check(before.length===after.length&&after.length>0,'Logit lengths differ');
    const result={diagnostic_only:true,source_commit:fs.readFileSync(root+'/route-coverage/source.commit','utf8').trim(),temporary_patch_sha256:digest(fs.readFileSync(root+'/shared-expert-fix/instrumentation.patch')),raw_path:run+'/'+label+'.native.log',raw_sha256:digest(raw),logits:{bytes:after.length,transfer_profile_sha256:digest(before),coverage_profile_sha256:digest(after),exact:before.equals(after)},...parsed,caveat:'Logical host-route masks matched first callback uploads. Coverage accounts for observed uploads to the same buffer/data identity only. No physical-transfer counters, performance comparison or model-quality qualification.'};
    fs.writeFileSync(root+'/fixed-route-coverage.json',JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({logits:result.logits,prefills:result.prefills.map(c=>({sample:c.sample,uploaded_experts:c.weight_fully_covered_experts.length,requested_bytes:c.weight_requested_bytes,coverage:c.expert_coverage.map(r=>({layer:r.layer,bank_key:r.bank_key,same_bank_as_first:r.same_bank_as_first,required:r.required_experts.length,missing_this_prefill:r.missing_this_prefill,missing_from_retained_uploads:r.missing_from_retained_uploads}))}))},null,2));
}
