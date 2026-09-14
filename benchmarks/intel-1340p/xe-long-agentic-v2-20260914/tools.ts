/** SCRIPT_JDOC:
{"summary":"Multi-file long-task sandbox with fixed isolated tests and private cumulative grading","kind":"mixed","weight":"standard","role":"module"}
*/
import{readFileSync,writeFileSync,mkdirSync,copyFileSync,lstatSync,realpathSync,mkdtempSync,rmSync}from'node:fs';import{join,dirname,resolve,isAbsolute}from'node:path';import{createHash}from'node:crypto';
import{containerTests,type Executor}from'./container-tests';
export const sources=['src/normalise.ts','src/aggregate.ts','src/report.ts','src/main.ts'];
export const phases=JSON.parse(readFileSync(import.meta.dir+'/fixtures/phases.json','utf8'));
const digest=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
export function createFixture(root:string,reference=false){mkdirSync(root+'/src',{recursive:true});for(const p of sources)copyFileSync(import.meta.dir+'/fixtures/'+(reference?'reference/':'')+p,root+'/'+p);copyFileSync(import.meta.dir+'/fixtures/SPEC.md',root+'/SPEC.md');copyFileSync(import.meta.dir+'/fixtures/phase-0.test.ts',root+'/visible.test.ts');}
export class Sandbox{
 root:string;phase=0;seen=new Set<string>();calls:any[]=[];private specHash:string;private testHash:string;
 constructor(root:string,readonly execute:Executor=containerTests){this.root=realpathSync(root);this.specHash=digest(this.root+'/SPEC.md');this.testHash=digest(this.root+'/visible.test.ts');}
 check(){if(digest(this.root+'/SPEC.md')!==this.specHash||digest(this.root+'/visible.test.ts')!==this.testHash)throw Error('Immutable task contract changed');for(const p of sources)this.path(p);}
 path(p:string){if(typeof p!=='string'||!sources.concat(['SPEC.md','visible.test.ts']).includes(p)||isAbsolute(p))throw Error('Path is not an allowed fixture file');let cur=this.root;for(const part of p.split('/')){cur=join(cur,part);if(lstatSync(cur).isSymbolicLink())throw Error('Symlink rejected');}if(!lstatSync(cur).isFile()||lstatSync(cur).size>16384)throw Error('File bound');return cur;}
 next(){this.check();if(this.phase>=3)throw Error('All phases complete');this.phase++;writeFileSync(this.root+'/visible.test.ts',readFileSync(import.meta.dir+`/fixtures/phase-${this.phase}.test.ts`));this.testHash=digest(this.root+'/visible.test.ts');this.seen.delete('visible.test.ts');}
 async call(name:string,args:any){let result:any;try{this.check();if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Arguments object required');
 if(name==='read_file'){result={content:readFileSync(this.path(args.path),'utf8')};this.seen.add(args.path);}
 else if(name==='list_files'){if(Object.keys(args).length)throw Error('No arguments');result={files:['SPEC.md','visible.test.ts',...sources]};}
 else if(name==='search_files'){if(typeof args.text!=='string'||!args.text||args.text.length>256)throw Error('Search bound');result={matches:sources.flatMap(path=>readFileSync(this.path(path),'utf8').split('\n').flatMap((line,index)=>line.includes(args.text)?[{path,line:index+1,text:line.slice(0,512)}]:[]))};}
 else if(name==='write_file'){if(!sources.includes(args.path)||!this.seen.has(args.path)||!this.seen.has('visible.test.ts'))throw Error('Read designated source and current visible tests before writing');if(typeof args.content!=='string'||!args.content||Buffer.byteLength(args.content)>16384)throw Error('Write size');const p=this.path(args.path);if(readFileSync(p,'utf8')===args.content)throw Error('No-op write');writeFileSync(p,args.content);result={ok:true};}
 else if(name==='run_tests'){if(Object.keys(args).length)throw Error('No test command arguments');result=await this.execute(this.root);}
 else throw Error('Tool not offered');this.check();
 }catch(e){result={ok:false,error:String(e)};}this.calls.push({phase:this.phase,name,args,result});return result;}
 async grade(){this.check();const tmp=mkdtempSync(join(dirname(this.root),'.grade-'));try{mkdirSync(tmp+'/src');for(const p of sources)copyFileSync(this.path(p),tmp+'/'+p);writeFileSync(tmp+'/visible.test.ts',readFileSync(import.meta.dir+`/fixtures/hidden-${this.phase}.test.ts`));return await this.execute(tmp);}finally{rmSync(tmp,{recursive:true,force:true});}}
 snapshot(){return Object.fromEntries(sources.map(p=>[p,readFileSync(this.path(p),'utf8')]));}
}
export function stable(result:any){if(!result||typeof result!=='object')return result;const out={...result};for(const field of ['stdout','stderr'])if(typeof out[field]==='string')out[field]=out[field].replace(/(\[(?:\d+(?:\.\d+)?)(?:ms|s)\])/g,'[elapsed]');return out;}
