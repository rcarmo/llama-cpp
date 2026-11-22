import fs from 'node:fs';
import { records, check, digest } from './audit-dispatch.mjs';
export function parseProfile(text) {
    const rows=records(text), calls=[];let current=null, group=null, round=-1;
    for(const row of rows) {
        const line=row.text;let m=line.match(/^REPLAY_PHASE (begin|end) tokens=(\d+) pos=(\d+)$/);
        if(m) {
            const tokens=Number(m[2]),pos=Number(m[3]);
            if(m[1]==='begin') {
                check(!current&&!group,'Nested phase');if(tokens>1&&pos===0)round++;
                current={round,sample:round===0?'warmup':'profiled',tokens,pos,groups:[],sync_markers:0};calls.push(current);
            } else {check(current&&current.tokens===tokens&&current.pos===pos&&!group,'Phase end mismatch');current=null;}
            continue;
        }
        if(line==='sync') {check(current,'Sync outside phase');current.sync_markers++;continue;}
        if(line==='Vulkan Timings:') {check(current&&!group,'Timing header outside phase or nested');group={operators:[]};continue;}
        if(group) {
            m=line.match(/^(.+): (\d+) x ([\d.eE+-]+) us = ([\d.eE+-]+) us(?: \(.*\))?$/);
            if(m) {
                const count=Number(m[2]),average_us=Number(m[3]),total_us=Number(m[4]);
                check(count>0&&Number.isSafeInteger(count)&&[average_us,total_us].every(n=>Number.isFinite(n)&&n>=0),'Invalid timing value');
                check(Math.abs(average_us*count-total_us)<=Math.max(0.02,count*0.001,total_us*0.00003),'Average/count mismatch');
                group.operators.push({name:m[1],count,average_us,total_us});continue;
            }
            m=line.match(/^Total time: ([\d.eE+-]+) us\.$/);
            if(m) {
                const total_us=Number(m[1]),sum=group.operators.reduce((n,o)=>n+o.total_us,0);
                check(group.operators.length>0&&Number.isFinite(total_us)&&total_us>=0,'Invalid group total');
                check(Math.abs(sum-total_us)<=Math.max(0.02,total_us*0.00003),'Group sum mismatch');
                group.total_us=total_us;current.groups.push(group);group=null;continue;
            }
            check(line===''||line==='----------------','Malformed timing row: '+line);
        }
    }
    check(!current&&!group,'Truncated profile');
    const prefills=calls.filter(c=>c.tokens>1);check(prefills.length===2&&prefills.every(c=>c.tokens===128&&c.pos===0),'Expected warmup and profiled128-token prefill');
    for(let r=0;r<2;r++) {
        const phase=calls.filter(c=>c.round===r);check(phase.length===9,'Expected prefill plus8decode calls');
        for(let i=1;i<phase.length;i++)check(phase[i].tokens===1&&phase[i].pos===127+i,'Decode sequence mismatch');
    }
    for(const c of calls) {
        c.total_gpu_operator_us=c.groups.reduce((n,g)=>n+g.total_us,0);
        c.logged_operator_count=c.groups.reduce((n,g)=>n+g.operators.reduce((s,o)=>s+o.count,0),0);
        c.routed_matmul_us=c.groups.reduce((n,g)=>n+g.operators.filter(o=>/(?:^| )MUL_MAT_ID(?: |$)/.test(o.name)).reduce((s,o)=>s+o.total_us,0),0);
        c.routed_matmul_count=c.groups.reduce((n,g)=>n+g.operators.filter(o=>/(?:^| )MUL_MAT_ID(?: |$)/.test(o.name)).reduce((s,o)=>s+o.count,0),0);
        check(c.tokens>1||c.groups.length===0,'Unexpected decode GPU timing');
    }
    check(rows.some(r=>r.text==='RESULT PASS finite replay'),'Missing finite completion');
    return {calls,prefills,raw_lines:text.trimEnd().split('\n').length,cri_records:rows.length};
}
if(import.meta.main) {
    const root='/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-copy-dispatch-20261122-2d079cf5b',run=root+'/profile-phased',label='g768-copy128-phased-d1';
    for(const file of ['operator-profile128-phased.complete.exit','operator-profile128-phased.restoration.exit',label+'.exit',label+'-native.exit'])check(fs.readFileSync(run+'/'+file,'utf8').trim()==='0',file);
    const raw=fs.readFileSync(run+'/'+label+'.native.log'),parsed=parseProfile(raw.toString());
    for(const phase of parsed.prefills)check(phase.groups.length===9&&phase.routed_matmul_count===3,'Unexpected selected down6 execution');
    const result={diagnostic_only:true,source_commit:fs.readFileSync(root+'/logger-fix/source.commit','utf8').trim(),runtime_parent:'1dadee62b291391d7b6c230fa81f04a2358c6bf2',raw_path:run+'/'+label+'.native.log',raw_sha256:digest(raw),...parsed,caveat:'Timestamp sums are serial-profiler GPU operator intervals. Input drain is outside these timestamps; CPU copies, transfer traffic, CPU wait, host scheduling and power effects are not decomposed. Counts are logged operators/barrier markers, not hardware dispatch/fence counters. No comparison against profiler-off screens.'};
    fs.writeFileSync(root+'/operator-profile.json',JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result.prefills.map(p=>({sample:p.sample,groups:p.groups.length,logged_operator_count:p.logged_operator_count,sync_markers:p.sync_markers,total_gpu_operator_us:p.total_gpu_operator_us,routed_matmul_count:p.routed_matmul_count,routed_matmul_us:p.routed_matmul_us})),null,2));
}
