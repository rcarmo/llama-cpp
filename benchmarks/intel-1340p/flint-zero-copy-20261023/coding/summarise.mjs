import fs from 'node:fs';import path from 'node:path';
const ws='/var/home/agent/workspace',run=ws+'/tmp/llama-cpp/runs/flint-trial-20261023-be9528654612',root=run+'/coding',out=ws+'/reports/flint-coding-20261023',bench=run+'/source/benchmarks/intel-1340p/flint-zero-copy-20261023/coding';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(bench,{recursive:true});
const results=fs.readFileSync(root+'/results.jsonl','utf8').trim().split('\n').map(JSON.parse);if(results.length!==6)throw Error('suite incomplete');
const rows=results.map(r=>{const j=JSON.parse(fs.readFileSync(root+'/'+r.id+'.output.json')),cg=fs.readFileSync(run+'/coding-'+r.id+'-cgroup.txt','utf8'),receipt=fs.readFileSync(run+'/coding-'+r.id+'-after.txt','utf8').trim(),samples=fs.readFileSync(run+'/coding-'+r.id+'-monitor.csv','utf8').trim().split('\n').slice(1).map(x=>x.split(',').map(Number));if(!receipt.includes('exit=0 oom=false pid=0'))throw Error(receipt);return {...r,reference_assertions:JSON.parse(fs.readFileSync(root+'/reference-container-verification.jsonl','utf8').trim().split('\n').find(x=>JSON.parse(x).id===r.id)).assertions,tokens_s:j.generated/(j.tg_ms/1000),first_token_ms:j.first_token_ms,raw_starts_think:j.raw.startsWith('<think>'),peak_cgroup_bytes:Number(cg.match(/===memory.peak\n(\d+)/)[1]),minimum_host_available_kib:Math.min(...samples.map(x=>x[1])),maximum_cgroup_swap_bytes:Math.max(...samples.map(x=>x[3])),oom_kills:Number(cg.match(/oom_kill (\d+)/)[1]),receipt};});
const passed=rows.filter(x=>x.pass).length,finished=rows.filter(x=>x.completed).length;
if(rows.some(x=>x.maximum_cgroup_swap_bytes||x.oom_kills||!x.finite))throw Error('resource/native failure');
const cols=['id','pass','completed','generated','prompt','pp_ms','tg_ms','wall_ms','tokens_s','first_token_ms','reference_assertions','raw_starts_think','peak_cgroup_bytes','minimum_host_available_kib','maximum_cgroup_swap_bytes','oom_kills','error'];
const csv=cols.join(',')+'\n'+rows.map(r=>cols.map(c=>JSON.stringify(r[c]??'')).join(',')).join('\n')+'\n';
const table=rows.map(r=>`| ${r.id} | ${r.prompt} | ${r.generated} | ${(r.pp_ms/1000).toFixed(2)} | ${(r.tg_ms/1000).toFixed(2)} | ${r.tokens_s.toFixed(2)} | limit | fail |`).join('\n');
const report=`# Flint executable coding benchmark — 23 October 2026

## Result

**${passed}/6 passed; ${finished}/6 completed.** Every task reached the frozen 1,024-token output limit. No candidate reached the executable-assertion stage. Six finite native runs succeeded and drained; that is not a coding pass.

| Task | Prompt tokens | Generated tokens | Prefill seconds | Generation seconds | Generated tok/s | Stop | Task result |
|---|---:|---:|---:|---:|---:|---|---|
${table}

This establishes failure to complete these tasks within this output budget, not a general coding-quality score or a comparison with other models. Generated token counts include thoughts, not just JavaScript. All six raw outputs began with \`<think>\` despite \`enable_thinking=false\`; the native parser left that material in content and the separate reasoning field was empty. The false flag was a request, not an enforced thinking ban. No output was repaired, retried or truncated into an answer. The earlier incomplete 384-token thinking-on sample remains a separate failure.

## Frozen protocol

- Six JavaScript tasks: strict CSV row parsing, RFC7396 merge patch, ordered bounded async map, clipped half-open range subtraction, decimal-string half-even rounding, full UTF-16 glob matching.
- Exactly one fenced JavaScript block and a function assigned to \`module.exports\`; no dependencies/imports/filesystem/network. Incomplete output fails before code extraction.
- Prompts, references and hidden assertions were hashed before inference, and hashes verified before and after the suite. All six reference implementations passed **1,053 assertions** in the same scorer container; these are reference assertions, not successful candidate tests.
- Scorer boundary: networkless read-only container, capabilities dropped, no-new-privileges, 1CPU/256MiB/64PIDs/10s. Read-only benchmark directory and Bun binary only; no models, workspace-wide or secret mounts. Node vm is a secondary timeout aid, not the security boundary.
- One seed42 run per task; temperature1/top-k20/top-p0.95/min-p0; native model template and common_chat_session/sampler; maximum1,024 generated tokens; context2,048, F16KV, FAoff.
- Sigma CPU: 16-CPU allowance,16prompt threads,4decode P-core workers with explicit batch/decode masks, poll50, batch/microbatch512, explicit mmap and no_host. No GPU-cache arm because the throughput campaign rejected it. No other model or service restored.
- Q3_K_XL GGUF18494977472bytes, SHA256 \`91b8d85ab6ff7fb095d9a972f9afa6f3fa2b9acb642867a079f3e013ea3c350c\`. Binary/library identities are retained in \`binary.sha256\`; this benchmark predates the combined-branch build. Do not attribute its timings to that later build.

## Timing and resources

Generation timing includes sampling, finite-logit scans and per-token decode. It excludes model loading and prefill; native wall is prefill plus generation, not end-to-end request latency. Loading was not separately instrumented. Supervisor timestamps and resource samples retain the wider process envelope, sampled every2s.

Each native run had a 300s timeout,20GiB memory limit and zero container swap. Minimum host MemAvailable was ${(Math.min(...rows.map(r=>r.minimum_host_available_kib))/1048576).toFixed(2)}GiB, above the6GiB guard. Maximum observed cgroup swap was0, all cgroup oom_kill counts0, and all post-exit receipts report exit0/oomfalse/PID0. Peak incremental cgroup charge was ${(Math.max(...rows.map(r=>r.peak_cgroup_bytes))/1073741824).toFixed(3)}GiB; this is **not total model residency** because mmap-backed file-cache pages may be charged elsewhere. GGUF backing alone is17.22GiB.

## Retained files

\`results.jsonl\` contains original scoring outcomes; \`results.json\` and \`results.csv\` add timing/resource summaries. Case prompts, hidden tests/references, frozen hashes, raw and parsed outputs, native logs, cgroup/resource receipts, reference verification, scorer and runner are retained. Hidden tests were hidden from the model during generation; they are public here for audit. Reproduction scripts encode Sigma's original workspace/run paths; recreate that layout or adjust only paths and freeze a new series before generating anything. Do not overwrite this series.

No deployment, broad quality qualification, cross-model quality ranking or BF16 comparison is claimed.
`;
for(const dir of [out,bench]){fs.writeFileSync(dir+'/README.md',report);fs.writeFileSync(dir+'/results.csv',csv);fs.writeFileSync(dir+'/results.json',JSON.stringify(rows,null,2)+'\n');for(const f of fs.readdirSync(root)){if(f.endsWith('.output.json')||f.endsWith('.case.json')||f.endsWith('.score.json')||['results.jsonl','cases.mjs','verify.mjs','plan.md','FROZEN-SHA256SUMS','reference-verification.jsonl','reference-container-verification.jsonl','binary.sha256','run-suite.sh','run-coding-trial.sh','score-container.sh','status.txt','frozen-before.log','frozen-after.log','summarise.mjs'].includes(f))fs.copyFileSync(root+'/'+f,dir+'/'+f);}for(const r of rows)for(const suffix of ['.log','-cgroup.txt','-monitor.csv','-after.txt','-container-config.json','.exit'])fs.copyFileSync(run+'/coding-'+r.id+suffix,dir+'/coding-'+r.id+suffix);}
console.log(JSON.stringify({passed,finished,tasks:rows.length,references:1053,out},null,2));
