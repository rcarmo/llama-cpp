import fs from 'node:fs';import vm from 'node:vm';import {cases} from './cases.mjs';
const mode=process.argv[2],id=process.argv[3];
async function check(task,code){
 const sandbox={module:{exports:{}},setTimeout,clearTimeout};
 const ctx=vm.createContext(sandbox,{codeGeneration:{strings:false,wasm:false}});
 const setup=`let assertions=0;const ok=(x)=>{assertions++;if(!x)throw Error('assertion '+assertions)};const eq=(a,b)=>{assertions++;if(JSON.stringify(a)!==JSON.stringify(b))throw Error('assertion '+assertions+' mismatch '+JSON.stringify(a)+' != '+JSON.stringify(b));};const throws=(fn)=>{let e;try{fn()}catch(x){e=x}ok(!!e);};`;
 vm.runInContext(setup+'\n'+code+'\nconst f=module.exports;if(typeof f!=="function")throw Error("missing function export");',ctx,{timeout:1000});
 await vm.runInContext('(async()=>{'+task.tests+';return assertions;})()',ctx,{timeout:2000});
 return vm.runInContext('assertions',ctx,{timeout:100});
}
if(mode==='references'){
 for(const c of cases){const assertions=await check(c,c.reference);console.log(JSON.stringify({id:c.id,reference:true,assertions,pass:true}));}
}else if(mode==='score'){
 const c=cases.find(x=>x.id===id);if(!c)throw Error('case');
 const result=JSON.parse(fs.readFileSync(process.argv[4],'utf8'));
 const text=result.content||'';
 const match=text.match(/^\s*```(?:javascript|js)?\s*\n([\s\S]*?)\n```\s*$/i);
 const base={id,completed:result.stop==='eog',generated:result.generated,prompt:result.prompt,pp_ms:result.pp_ms,tg_ms:result.tg_ms,wall_ms:result.wall_ms,finite:result.finite};
 try{
  if(!base.completed)throw Error('output token limit');if(!match)throw Error('expected exactly one fenced code block');
  const assertions=await check(c,match[1]);console.log(JSON.stringify({...base,pass:true,assertions}));
 }catch(e){console.log(JSON.stringify({...base,pass:false,error:String(e.message||e)}));}
}else throw Error('mode');
