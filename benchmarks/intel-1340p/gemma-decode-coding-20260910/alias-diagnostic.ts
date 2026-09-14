/** SCRIPT_JDOC:
{"summary":"Diagnose one unique returned function via importalias only; NOT originaltask acceptance in a time/memory-bound networkless read-only container","kind":"mixed","weight":"standard","role":"module"}
*/
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tests as originalTests} from './repair-task';
const tests=originalTests.replace('mergeIntervals as merge','mergeIntervalInterval as merge');
const reference=readFileSync(import.meta.dir+'/runs/repair-0-mode0/sandbox/candidate.ts','utf8');
export const prefix=['podman','--root','/var/home/agent/workspace/projects/.podman-llama-storage','--runroot','/var/home/agent/workspace/projects/.podman-llama-run','--storage-driver','vfs','--cgroup-manager=cgroupfs'];
export async function sandbox(dir:string,code:string,name:string,track?:(process:any)=>void) {
 if(!/^gemma-code-check-[a-z0-9-]+$/.test(name))throw Error('Container name');
 mkdirSync(dir,{recursive:true});writeFileSync(dir+'/candidate.ts',code);writeFileSync(dir+'/independent.test.ts',tests);
 const args=[...prefix,'run','--rm','--name',name,'--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--security-opt=label=disable','--userns=keep-id','--memory=512m','--memory-swap=512m','--pids-limit=64','--tmpfs','/tmp:rw,nosuid,size=32m','-v',dir+':/case:ro','-v',process.execPath+':/tmp/host-bun:ro','--workdir','/case','localhost/llama-intel-vulkan-validation:fedora44','/tmp/host-bun','test','independent.test.ts'];
 const p=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});track?.(p);let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;p.kill('SIGTERM');void Bun.spawn([...prefix,'rm','-f',name],{stdout:'ignore',stderr:'ignore'}).exited},20000);
 const [rc,stdout,stderr]=await Promise.all([p.exited,new Response(p.stdout).text(),new Response(p.stderr).text()]);clearTimeout(timer);
 await Bun.spawn([...prefix,'rm','-f',name],{stdout:'ignore',stderr:'ignore'}).exited;
 if(readFileSync(dir+'/independent.test.ts','utf8')!==tests)throw Error('Test changed');
 return {rc,timedOut,stdout,stderr,args,pass:rc===0&&!timedOut};
}
if(import.meta.main){const root=import.meta.dir+'/alias-diagnostic',r=await sandbox(root,reference,'gemma-code-check-alias');await Bun.write(import.meta.dir+'/alias-diagnostic.json',JSON.stringify(r,null,2)+'\n');console.log(r);if(!r.pass)process.exitCode=1;}
