/** SCRIPT_JDOC:
{"summary":"Prepare separate optimised Vulkan large-tile confirmation plugin and per-shape diagnostics without changing retained builds","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = import.meta.dir, dir = root + '/vulkan-confirm-build';
mkdirSync(dir, { recursive: true });
let source = readFileSync(root + '/vulkan-large-build/ggml-vulkan.cpp', 'utf8');
const before = 'static std::atomic<unsigned> count{0};\n        if (count.fetch_add(1) < 4)';
if (source.split(before).length !== 2) throw Error('Trace anchor mismatch');
source = source.replace(before, 'static std::atomic<unsigned> count[2]{};\n        if (count[ne01 == 10240 ? 0 : 1].fetch_add(1) < 1)');
writeFileSync(dir + '/ggml-vulkan.cpp', source);
let build = readFileSync(root + '/build-vulkan-large.sh', 'utf8').replaceAll(root + '/vulkan-large-build', dir);
if (!build.includes(' -O0 -DNDEBUG ')) throw Error('Optimisation anchor');
build = build.replace(' -O0 -DNDEBUG ', ' -O1 -DNDEBUG ');
writeFileSync(root + '/build-vulkan-confirm.sh', build);
console.log('Prepared isolated O1 build with per-shape diagnostic trace. Caller and176 retained shaders unchanged; no compilation/execution.');
