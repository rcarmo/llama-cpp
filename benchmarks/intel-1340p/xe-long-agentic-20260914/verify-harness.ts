/** SCRIPT_JDOC:
{"summary":"Qualify long-task seed/reference and cumulative hidden tests in fixed networkless containers; model-free","kind":"mixed","weight":"standard","role":"entrypoint"}
*/
import{mkdtempSync,mkdirSync,rmSync,copyFileSync,readFileSync,writeFileSync,symlinkSync,unlinkSync}from'node:fs';import{tmpdir}from'node:os';import{strict as assert}from'node:assert';import{Sandbox,createFixture,sources,stable}from'./tools';import{containerTests}from'./container-tests';
const root=import.meta.dir,temp=mkdtempSync(root+'/evidence/harness-');process.env.AGENTIC_CONTAINER_LEDGER=root+'/evidence/harness-containers.txt';
const results:any[]=[];
try{
 const seed=temp+'/seed';createFixture(seed);const broken=await containerTests(seed);assert.equal(broken.ok,false);results.push({case:'seed rejects phase0',...broken});
 const reference=temp+'/reference';createFixture(reference,true);const box=new Sandbox(reference);
 for(let phase=0;phase<4;phase++){
  const visible=await containerTests(reference);assert.equal(visible.ok,true,'reference visible '+phase+' '+visible.stderr);results.push({case:'reference visible'+phase,...visible});
  const hidden=await box.grade();assert.equal(hidden.ok,true,'reference hidden '+phase+' '+hidden.stderr);results.push({case:'reference hidden'+phase,...hidden});if(phase<3)box.next();
 }
 const isolated=temp+'/guards';createFixture(isolated);const mock=new Sandbox(isolated,async()=>({ok:true,code:0,stdout:'1 pass\n0 fail\nRan 1 test.',stderr:''}));
 for(const path of ['../fixtures/reference/src/normalise.ts','/etc/passwd','hidden-0.test.ts','reference/src/main.ts','src/../SPEC.md'])assert.equal((await mock.call('read_file',{path})).ok,false);
 assert.equal((await mock.call('write_file',{path:'src/main.ts',content:'bad'})).ok,false);await mock.call('read_file',{path:'src/main.ts'});await mock.call('read_file',{path:'visible.test.ts'});
 assert.equal((await mock.call('write_file',{path:'visible.test.ts',content:'bad'})).ok,false);assert.equal((await mock.call('write_file',{path:'src/main.ts',content:'x'.repeat(16385)})).ok,false);
 unlinkSync(isolated+'/src/main.ts');symlinkSync(reference+'/src/main.ts',isolated+'/src/main.ts');assert.equal((await mock.call('read_file',{path:'src/main.ts'})).ok,false);
 assert.ok(!JSON.stringify(stable({stderr:'(pass) named test [3.1ms]\nRan 4 tests. [1.4s]'})).includes('3.1ms'));
 writeFileSync(root+'/evidence/harness-results.json',JSON.stringify({pass:true,results,guards:9},null,2)+'\n');console.log('PASS seed rejection,4 cumulative visible+4 independent hidden reference suites,path/write/symlink guards;no model execution');
}finally{rmSync(temp,{recursive:true,force:true});}
