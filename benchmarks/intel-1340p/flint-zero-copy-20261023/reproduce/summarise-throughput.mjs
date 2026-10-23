import fs from 'node:fs';import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname),rows=[];
for(const name of fs.readdirSync(root).filter(x=>/^bench-.*\.log$/.test(x)&&!x.endsWith('supervisor.log'))){
 const label=name.slice(0,-4),text=fs.readFileSync(path.join(root,name),'utf8');
 const config=text.match(/^BENCH_CONFIG (.*)$/m);if(!config)continue;
 const fields=s=>Object.fromEntries(s.trim().split(/\s+/).map(x=>{const [k,v]=x.split('=');return[k,Number.isNaN(Number(v))?v:Number(v)]}));
 const cfg=fields(config[1]);
 let peak=0,oom=null,minAvailable=null,swap=0;
 const cg=path.join(root,label+'-cgroup.txt');if(fs.existsSync(cg)){const t=fs.readFileSync(cg,'utf8');peak=Number(t.match(/===memory.peak\n(\d+)/)?.[1]||0);oom=Number(t.match(/^oom_kill (\d+)/m)?.[1]||0)}
 const mon=path.join(root,label+'-monitor.csv');if(fs.existsSync(mon)){const r=fs.readFileSync(mon,'utf8').trim().split('\n').slice(1).map(x=>x.split(',').map(Number));if(r.length){minAvailable=Math.min(...r.map(x=>x[1]));swap=Math.max(...r.map(x=>x[3]||0))}}
 const exitFile=path.join(root,label+'.exit'),afterFile=path.join(root,label+'-after.txt');
 const successfulExit=fs.existsSync(exitFile)&&fs.readFileSync(exitFile,'utf8').trim()==='0'&&fs.existsSync(afterFile)&&/exit=0 oom=false/.test(fs.readFileSync(afterFile,'utf8'));
 const excluded_reason=label==='bench-smoke'?'Synthetic fixture, not trained throughput':label==='bench-pinned-split'?'Batch workers inherited narrowed affinity on second repetition; corrected in reset arm':'';
 for(const match of text.matchAll(/^BENCH_RESULT (.*)$/gm))rows.push({label,...cfg,...fields(match[1]),peak_bytes:peak,min_host_available_kb:minAvailable,swap_bytes:swap,oom_kill:oom,passed:/RESULT PASS benchmark/.test(text)&&successfulExit,excluded_reason});
}
rows.sort((a,b)=>a.label.localeCompare(b.label)||a.rep-b.rep);
const keys=[...new Set(rows.flatMap(Object.keys))];fs.writeFileSync(path.join(root,'throughput-results.json'),JSON.stringify(rows,null,2)+'\n');fs.writeFileSync(path.join(root,'throughput-results.csv'),keys.join(',')+'\n'+rows.map(r=>keys.map(k=>r[k]??'').join(',')).join('\n')+'\n');
const median=x=>{x=x.toSorted((a,b)=>a-b);return x.length%2?x[(x.length-1)/2]:(x[x.length/2-1]+x[x.length/2])/2};
for(const label of [...new Set(rows.map(x=>x.label))]){const rs=rows.filter(x=>x.label===label);console.log(`${label}: n=${rs.length} pp=${median(rs.map(x=>x.pp_tps)).toFixed(3)} tg=${median(rs.map(x=>x.tg_tps)).toFixed(3)} peakGiB=${(Math.max(...rs.map(x=>x.peak_bytes))/2**30).toFixed(3)} pass=${rs.every(x=>x.passed)}`)}
