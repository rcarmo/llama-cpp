/** SCRIPT_JDOC:
{"summary":"Guard compact-SWA build/probe stages and restore original service via systemd ExecStopPost","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{Trial,root,save,sleep}from'./campaign';import{openSync,closeSync}from'node:fs';
const stage=process.argv[2]??'probe';if(stage!=='probe')throw Error('Unknown stage');
const t=new Trial('build-gpu-scorelarge-enabled',{maintenance:true});let failure='';
try{
 await t.begin();
 const args=['podman','--root','/var/home/agent/workspace/projects/.podman-llama-storage','--runroot','/var/home/agent/workspace/projects/.podman-llama-run','--storage-driver','vfs','--cgroup-manager=cgroupfs','run','--rm','--name','gemma-gpu-scorelarge-build','--network=none','--security-opt','label=disable','--userns=keep-id','-v','/var/home/agent/workspace:/var/home/agent/workspace','-v',process.execPath+':/tmp/host-bun:ro','localhost/llama-intel-vulkan-validation:fedora44','/tmp/host-bun',root+'/build/prepare.ts'];
 const fd=openSync(root+'/build/build.log','a');
 const p=Bun.spawn(args,{stdout:fd,stderr:fd});t.servers.push({p,fd,device:'build'});
 const rc=await p.exited;t.servers=[];closeSync(fd);
 const cleanup=Bun.spawn(args.slice(0,args.indexOf('run')).concat(['rm','-f','gemma-gpu-scorelarge-build']),{stdout:'ignore',stderr:'ignore'});await cleanup.exited;
 if(rc!==0||t.error)throw Error(t.error||'Build exit'+rc);
}catch(e){failure=String(e);t.error ||= failure;console.error(e)}finally{await t.finish({ok:!failure})}
if(failure)process.exit(1);
console.log('Split-K build completed; numerical/task screen is a separate stage.');
