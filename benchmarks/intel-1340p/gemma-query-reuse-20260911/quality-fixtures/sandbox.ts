/** SCRIPT_JDOC:
{"summary":"Run code fixtures in a networkless read-only 256MiB/2second container; bounded output and owned cleanup","kind":"mixed","weight":"standard","role":"module"}
*/
import{mkdirSync,writeFileSync,readFileSync}from'node:fs';
export const prefix=['podman','--root','/var/home/agent/workspace/projects/.podman-llama-storage','--runroot','/var/home/agent/workspace/projects/.podman-llama-run','--storage-driver','vfs','--cgroup-manager=cgroupfs'];
async function bounded(stream:ReadableStream){const reader=stream.getReader();let out='',n=0;while(true){const r=await reader.read();if(r.done)break;if(n<16384){out+=new TextDecoder().decode(r.value.slice(0,16384-n));n+=r.value.length}}return out;}
export async function sandbox(dir:string,code:string,validator:string,name:string){
 if(!/^gemma-t02-[a-z0-9-]+$/.test(name))throw Error('Owned container name');mkdirSync(dir,{recursive:true});writeFileSync(dir+'/candidate.js',code);writeFileSync(dir+'/validator.js',validator);
 const args=[...prefix,'run','--rm','--name',name,'--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--security-opt=label=disable','--userns=keep-id','--memory=256m','--memory-swap=256m','--pids-limit=32','--tmpfs','/tmp:rw,nosuid,size=16m','-v',dir+':/case:ro','-v',process.execPath+':/opt/host-bun:ro','--workdir','/case','localhost/llama-intel-vulkan-validation:fedora44','/bin/bash','-c','/usr/bin/timeout --foreground -k 1s 2s /opt/host-bun /case/validator.js; exit $?'];
 const p=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});let timedOut=false;const timer=setTimeout(()=>{timedOut=true;void Bun.spawn([...prefix,'rm','-f',name],{stdout:'ignore',stderr:'ignore'}).exited;p.kill('SIGTERM')},15000);
 try{const [rc,stdout,stderr]=await Promise.all([p.exited,bounded(p.stdout),bounded(p.stderr)]);if(readFileSync(dir+'/validator.js','utf8')!==validator)throw Error('Validatorchanged');return {rc,stdout,stderr,timedOut,pass:rc===0&&!timedOut,args};}finally{clearTimeout(timer);await Bun.spawn([...prefix,'rm','-f',name],{stdout:'ignore',stderr:'ignore'}).exited}
}
