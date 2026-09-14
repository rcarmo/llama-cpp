/** SCRIPT_JDOC:
{"summary":"Verify promoted Q6 trained task, implementation hashes and exact predecessor work from retained evidence","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { verifyRun } from './verify-agentic-run';
const root = import.meta.dir, id = 'q6-promoted-clamp-on', previous = 'q6-clamp-on0';
const load = (id: string, file: string) => JSON.parse(readFileSync(`${root}/agentic-runs/${id}/${file}`, 'utf8'));
const result = verifyRun(id), reference = verifyRun(previous), manifest = load(id,'manifest.json');
assert.equal(result.success,true); assert.equal(manifest.env.GGML_CPU_Q6_PAIR,'1');
assert.equal(manifest.cpu_library_hash,'6a24a46e33a5520c43ebdc086ac642e38d4e2526b906dc32d7a00ef52bf9c834');
assert.ok(readFileSync(`${root}/agentic-runs/${id}/maps.txt`,'utf8').includes('/q6-portable-build/native/bin/libggml-cpu.so.0.23.0'));
assert.deepEqual(result.rounds.map(x=>x.raw),reference.rounds.map(x=>x.raw));
for(let i=0;i<result.rounds.length;i++){
    const a=load(id,`round-${i}.json`),b=load(previous,`round-${i}.json`);
    assert.deepEqual({messages:a.messages,tools:a.tools},{messages:b.messages,tools:b.tools});
}
for(const key of ['generated_tokens','evaluated_prompt_tokens','drafted','accepted']) assert.equal(result.rounds.reduce((s,x)=>s+x[key],0),reference.rounds.reduce((s,x)=>s+x[key],0));
for(const [file,hash] of Object.entries(manifest.implementation_hashes)){
    const snapshot=root+'/q6-implementation-source/'+file;
    assert.equal(createHash('sha256').update(readFileSync(snapshot)).digest('hex'),hash);
}
console.log('PASS promoted Q6: exact predecessor prompts/raw/work, implementation snapshots, mapped library and both independent grades');
