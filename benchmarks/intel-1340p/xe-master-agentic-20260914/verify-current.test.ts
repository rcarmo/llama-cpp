import{test,expect}from'bun:test';
import{mkdtempSync,cpSync,copyFileSync,readFileSync,writeFileSync,mkdirSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';
import{verifyCurrent}from'./verify-current';
const id='master-clamp-on-pilot',root=import.meta.dir;
function mutated(file:string,change:(x:any)=>any,json=true){
 const dir=mkdtempSync(tmpdir()+'/xe-current-verify-');
 try{
  copyFileSync(root+'/agentic-freeze.json',dir+'/agentic-freeze.json');mkdirSync(dir+'/agentic-runs');
  cpSync(root+'/agentic-runs/'+id,dir+'/agentic-runs/'+id,{recursive:true});
  const path=dir+'/agentic-runs/'+id+'/'+file,s=readFileSync(path,'utf8');writeFileSync(path,json?JSON.stringify(change(JSON.parse(s))):change(s));
  expect(()=>verifyCurrent(id,dir)).toThrow();
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('actual current pilot passes immutable runtime/grade/state/cgroup verification',()=>{expect(verifyCurrent(id).success).toBe(true);});
test('wrong runtime identity and missing GPU mapping fail closed',()=>{
 mutated('manifest.json',x=>({...x,vulkan_library_hash:'0'.repeat(64)}));
 mutated('gpu-maps.txt',()=>'',false);
});
test('missing or nonzero cgroup swap and memory events fail closed',()=>{
 mutated('cgroup-final.json',x=>({...x,'memory.swap.peak':'1\n'}));
 mutated('cgroup-final.json',x=>({...x,'memory.swap.max':''}));
 mutated('cgroup-final.json',x=>({...x,'memory.events':x['memory.events'].replace('oom_kill 0','oom_kill 1')}));
});
