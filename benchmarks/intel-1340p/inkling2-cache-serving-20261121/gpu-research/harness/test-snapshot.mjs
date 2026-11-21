import fs from 'node:fs';
const run='/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-gpu-cache768-20261121-1dadee62b/v2',dir=run+'/tmp/snapshot-test';
fs.mkdirSync(dir+'/bin',{recursive:true});
fs.writeFileSync(dir+'/bin/awk',`#!/bin/bash\nset -eu\nn=0;test ! -f "$SNAPSHOT_TEST_COUNT" || n=$(cat "$SNAPSHOT_TEST_COUNT");n=$((n+1));echo "$n" > "$SNAPSHOT_TEST_COUNT"\ncase "$SNAPSHOT_TEST_CASE" in\n transient) ((n>=3)) || exit 2;;\n error-output) if ((n<3));then echo '1 1 1 1';exit 2;fi;;\n malformed) if ((n<2));then echo unknown;exit 0;fi;;\n failure) exit 2;;\n unsupported) echo '100 9 2 1';exit 0;;\nesac\necho '100 9 2 2'\n`,{mode:0o755});
for(const [name,expected,attempts,exit]of [['valid','100 9 2 2',1,0],['transient','100 9 2 2',3,0],['error-output','100 9 2 2',3,0],['malformed','100 9 2 2',2,0],['failure','',3,1],['unsupported','100 9 2 1',1,0]]){
 const count=dir+'/'+name+'.count';if(fs.existsSync(count))fs.unlinkSync(count);
 const p=Bun.spawnSync(['bash',run+'/drm-snapshot.sh',String(process.pid),run+'/drm-account.awk'],{env:{...process.env,PATH:dir+'/bin:'+process.env.PATH,SNAPSHOT_TEST_CASE:name,SNAPSHOT_TEST_COUNT:count},stdout:'pipe',stderr:'pipe'});
 if(p.exitCode!==exit||p.stdout.toString().trim()!==expected||Number(fs.readFileSync(count))!==attempts)throw Error(name+': '+JSON.stringify({exit:p.exitCode,out:p.stdout.toString(),err:p.stderr.toString()}));
 console.log('PASS '+name+' attempts='+attempts+' exit='+exit);
}
const real=Bun.spawnSync(['bash',run+'/drm-snapshot.sh',String(process.pid),run+'/drm-account.awk'],{stdout:'pipe',stderr:'pipe'});
if(real.exitCode!==0||real.stdout.toString().trim()!=='0 0 0 0')throw Error('Real CPU-only process snapshot');
console.log('PASS real CPU-only fdinfo snapshot; unsupported client tuple preserved for fail-closed guard');
