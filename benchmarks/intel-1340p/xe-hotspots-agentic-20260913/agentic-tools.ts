/** SCRIPT_JDOC:
{"summary":"Bounded agentic code-edit fixtures, safe file tools and fixed isolated test execution","kind":"mixed","weight":"standard","role":"module"}
*/
import{mkdirSync,writeFileSync,readFileSync,readdirSync,lstatSync,realpathSync,existsSync,rmSync,mkdtempSync,copyFileSync,appendFileSync}from'node:fs';
import{join,resolve,relative,isAbsolute,dirname}from'node:path';import{createHash}from'node:crypto';
const MAX=16384,sha=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
export const fixtures={
 clamp:{prompt:'Fix clamp so it clamps values correctly even when the two bounds are reversed. Read the implementation and tests, edit the source, run tests, then report what changed.',followup:'Now reject any NaN argument with a RangeError, while preserving the previous reversed-bound behaviour.',source:'export function clamp(value:number,lo:number,hi:number){return Math.min(lo,Math.max(hi,value));}\n',tests:'expect(clamp(5,1,10)).toBe(5);expect(clamp(-2,1,10)).toBe(1);expect(clamp(15,1,10)).toBe(10);expect(clamp(5,10,1)).toBe(5);',hidden:'expect(clamp(0,-3,3)).toBe(0);expect(clamp(9,4,-2)).toBe(4);expect(clamp(-8,4,-2)).toBe(-2);',later:'for(const v of [[NaN,1,2],[1,NaN,2],[1,2,NaN]])expect(()=>clamp(...v as [number,number,number])).toThrow(RangeError);'},
 median:{prompt:'Fix median for unsorted numeric input, including even lengths and empty input. It must not mutate the input array. Read code/tests, edit source, and run tests before reporting.',followup:'Now reject arrays containing NaN or either infinity with a RangeError, preserving all previously tested behaviour.',source:'export function median(xs:number[]){if(!xs.length)return 0;xs.sort();return xs[Math.floor(xs.length/2)];}\n',tests:'expect(median([8,1,3])).toBe(3);expect(median([9,3,1,7])).toBe(5);expect(median([])).toBeNull();const x=[4,1,3];median(x);expect(x).toEqual([4,1,3]);',hidden:'expect(median([100,2,10])).toBe(10);expect(median([-4,-2])).toBe(-3);expect(median([1])).toBe(1);',later:'for(const x of [[NaN],[1,Infinity],[1,-Infinity]])expect(()=>median(x)).toThrow(RangeError);'},
 defaults:{prompt:'Fix normalize so defaults apply only to absent fields: retries defaults to 3, label to "job", enabled to true. Preserve explicit 0, empty string and false. Read implementation/tests, edit source and run tests.',followup:'Now reject retries values that are negative, fractional or nonfinite with a RangeError, preserving prior default semantics.',source:'export function normalize(x:{retries?:number,label?:string,enabled?:boolean}){return {retries:x.retries||3,label:x.label||"job",enabled:x.enabled||true};}\n',tests:'expect(normalize({})).toEqual({retries:3,label:"job",enabled:true});expect(normalize({retries:0,label:"",enabled:false})).toEqual({retries:0,label:"",enabled:false});',hidden:'expect(normalize({retries:2,enabled:false})).toEqual({retries:2,label:"job",enabled:false});const x={label:""};normalize(x);expect(x).toEqual({label:""});',later:'for(const retries of [-1,1.5,NaN,Infinity,-Infinity])expect(()=>normalize({retries})).toThrow(RangeError);'},
};
export type Kind=keyof typeof fixtures;
const symbol=(k:Kind)=>k==='defaults'?'normalize':k;
const testSource=(k:Kind,body:string)=>`import{test,expect}from'bun:test';import{${symbol(k)}}from'./src/main';test('contract',()=>{${body}});\n`;
export function createFixture(kind:Kind,root:string){if(!fixtures[kind])throw Error('Unknown fixture');if(existsSync(root)&&readdirSync(root).length)throw Error('Fixture not empty');mkdirSync(join(root,'src'),{recursive:true});writeFileSync(join(root,'src/main.ts'),fixtures[kind].source);writeFileSync(join(root,'visible.test.ts'),testSource(kind,fixtures[kind].tests));return fixtures[kind];}
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
export class ToolSandbox{
 readonly root:string;readonly testHash:string;private seen=new Set<string>();calls:{name:string,args:unknown,result:unknown}[]=[];
 constructor(root:string,readonly execute:Executor=containerTests){this.root=realpathSync(root);this.testHash=sha(readFileSync(join(root,'visible.test.ts')));}
 private path(p:string){if(typeof p!=='string'||!p||isAbsolute(p)||p.includes('\\')||p.split('/').some(x=>x==='..'||x===''||x==='.'))throw Error('Unsafe path');const target=resolve(this.root,p);if(relative(this.root,target).startsWith('..'))throw Error('Path escape');let cur=this.root;for(const part of p.split('/')){cur=join(cur,part);if(lstatSync(cur).isSymbolicLink())throw Error('Symlink rejected');}if(!lstatSync(target).isFile()||lstatSync(target).size>MAX)throw Error('File limit');return target;}
 private unchanged(){if(sha(readFileSync(join(this.root,'visible.test.ts')))!==this.testHash)throw Error('Tests modified');}
 async call(name:string,args:any){let result:any;try{this.unchanged();if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Arguments must be object');
 if(name==='read_file'){const p=this.path(args.path);result={content:readFileSync(p,'utf8')};this.seen.add(args.path);}
 else if(name==='search_files'){if(typeof args.text!=='string'||!args.text||args.text.length>256)throw Error('Search limit');const files=['src/main.ts','visible.test.ts'];result={matches:files.flatMap(path=>readFileSync(this.path(path),'utf8').split('\n').flatMap((line,index)=>line.includes(args.text)?[{path,line:index+1,text:line.slice(0,512)}]:[]))};}
 else if(name==='edit_file'){if(args.path!=='src/main.ts'||!this.seen.has(args.path))throw Error('Read designated source before edit');if(typeof args.before!=='string'||!args.before||typeof args.after!=='string')throw Error('Invalid edit');if(args.before===args.after)throw Error('Edit makes no change; read current source and supply a real replacement');const p=this.path(args.path),s=readFileSync(p,'utf8');if(s.split(args.before).length!==2)throw Error('Replacement must match exactly once');const out=s.replace(args.before,args.after);if(Buffer.byteLength(out)>MAX)throw Error('Edit size');writeFileSync(p,out);result={ok:true};}
 else if(name==='run_tests'){if(Object.keys(args).length)throw Error('run_tests takes no arguments');result=await this.execute(this.root);}
 else throw Error('Unknown tool');this.unchanged();
 }catch(e){result={ok:false,error:String(e)};}this.calls.push({name,args,result});return result;}
}
export async function grade(kind:Kind,root:string,followup:boolean,execute:Executor=containerTests){const tmp=mkdtempSync(join(dirname(root),'.grade-'));try{mkdirSync(join(tmp,'src'));copyFileSync(join(root,'src/main.ts'),join(tmp,'src/main.ts'));writeFileSync(join(tmp,'visible.test.ts'),testSource(kind,fixtures[kind].tests+fixtures[kind].hidden+(followup?fixtures[kind].later:'')));return await execute(tmp);}finally{rmSync(tmp,{recursive:true,force:true});}}
