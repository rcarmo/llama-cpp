/** SCRIPT_JDOC:
{"summary":"Prepare a trained verification runner using the implementation-branch Q6 library without changing the completed ABBA harness","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync } from 'node:fs';
const root = import.meta.dir;
let source = readFileSync(root + '/agentic-runner-q6.ts', 'utf8');
for (const [before, after] of [
    ["['q6off','q6on','q6trace']", "['q6off','q6on']"],
    ['q6-dispatch-build/bin', 'q6-portable-build/native/bin'],
    ["GGML_XE_Q6_PAIR:arm==='q6off'?'0':'1',GGML_XE_Q6_TRACE:arm==='q6trace'?'1':'0'", "GGML_CPU_Q6_PAIR:arm==='q6off'?'0':'1'"],
    ['agentic-runner-q6.ts', 'agentic-runner-promoted-q6.ts'],
    ['launch-agentic-q6.sh', 'launch-agentic-promoted-q6.sh'],
]) {
    if (!source.includes(before)) throw Error('Missing anchor ' + before);
    source = source.replaceAll(before, after);
}
// Include the implementation sources with the manifest; built native library has separately retained recipe/object hashes.
source = source.replace('test_hash:box.testHash,', "implementation_hashes:Object.fromEntries(['ggml/src/ggml-cpu/q6-pair.h','ggml/src/ggml-cpu/q6-pair.cpp','ggml/src/ggml-cpu/ggml-cpu.c'].map(f=>[f,hash('/var/home/agent/workspace/projects/llama-cpp/'+f)])),test_hash:box.testHash,");
writeFileSync(root + '/agentic-runner-promoted-q6.ts', source);
writeFileSync(root + '/launch-agentic-promoted-q6.sh', readFileSync(root + '/launch-agentic-q6.sh', 'utf8').replaceAll('agentic-runner-q6.ts', 'agentic-runner-promoted-q6.ts'));
console.log('Prepared promoted Q6 runner: same fixture/tools/limits/native owner; branch native CPU helper+dispatcher library; no model execution');
