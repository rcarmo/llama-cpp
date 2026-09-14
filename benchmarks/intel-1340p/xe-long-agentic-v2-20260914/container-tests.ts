import{realpathSync,appendFileSync}from'node:fs';
const MAX=16384;
export type TestResult={ok:boolean,code:number,stdout:string,stderr:string};
export type Executor=(root:string)=>Promise<TestResult>;
// Only this fixed command can execute model-edited source. The container receives no network,
// capabilities, secrets, devices or host mounts other than the read-only fixture and Bun binary.
export async function containerTests(root:string):Promise<TestResult>{
 const name='xe-agentic-test-'+crypto.randomUUID().slice(0,12),env={PATH:'/usr/bin:/bin',HOME:process.env.HOME!,XDG_RUNTIME_DIR:'/run/user/1001'};
 const bun=realpathSync(process.execPath);
 if(process.env.AGENTIC_CONTAINER_LEDGER)appendFileSync(process.env.AGENTIC_CONTAINER_LEDGER,name+'\n');
 const args=['run','--rm','--name',name,'--network','none','--memory','256m','--memory-swap','256m','--pids-limit','32','--cpus','1','--cap-drop','ALL','--security-opt','no-new-privileges','--security-opt','label=disable','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=16m','--userns','keep-id','-v',`${root}:/fixture:ro`,'-v',`${bun}:/runner/bun:ro`,'-w','/fixture','localhost/llama-intel-build:fedora44','/runner/bun','test','visible.test.ts'];
 const child=Bun.spawn(['podman',...args],{env,stdout:'pipe',stderr:'pipe'});let forced=false;
 const cleanup=async()=>{const c=Bun.spawn(['podman','rm','-f','--ignore',name],{env,stdout:'ignore',stderr:'ignore'});await c.exited;};
 const limit=async(stream:ReadableStream<Uint8Array>)=>{let s='';for await(const part of stream){s+=new TextDecoder().decode(part);if(s.length>MAX){forced=true;void cleanup();return s.slice(0,MAX)+'\n[output limit]';}}return s;};
 const timer=setTimeout(()=>{forced=true;void cleanup();},10000);
 try{const [stdout,stderr,code]=await Promise.all([limit(child.stdout),limit(child.stderr),child.exited]);const report=stdout+'\n'+stderr;const completed=/\b[1-9]\d* pass\b/.test(report)&&/\b0 fail\b/.test(report)&&/Ran [1-9]\d* tests?/.test(report);return{ok:code===0&&!forced&&completed,code:forced?124:code,stdout,stderr};}finally{clearTimeout(timer);await cleanup();}
}
