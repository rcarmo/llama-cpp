/** SCRIPT_JDOC:
{"summary":"Snapshot committed ggml for a fresh Vulkan build, constrain only generator scheduling and preserve source/patch hashes","kind":"mutating","weight":"standard","role":"entrypoint"}
*/
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
const root=import.meta.dir,repo='/var/home/agent/workspace/projects/llama-cpp',snapshot=root+'/vulkan-source';
assert.equal(existsSync(snapshot),false,'Retained source snapshot exists');
const rev=Bun.spawnSync(['git','-C',repo,'rev-parse','HEAD']);assert.equal(rev.exitCode,0);const commit=rev.stdout.toString().trim();
const clean=Bun.spawnSync(['git','-C',repo,'diff','--exit-code','HEAD','--','ggml']);assert.equal(clean.exitCode,0);
const archive=Bun.spawnSync(['git','-C',repo,'archive','--format=tar',commit,'ggml']);assert.equal(archive.exitCode,0);
mkdirSync(snapshot);
const unpack=Bun.spawn(['tar','-xf','-','-C',snapshot],{stdin:'pipe',stdout:'ignore',stderr:'pipe'});unpack.stdin.write(archive.stdout);unpack.stdin.end();assert.equal(await unpack.exited,0,await new Response(unpack.stderr).text());
const p='ggml/src/ggml-vulkan/vulkan-shaders/vulkan-shaders-gen.cpp',file=snapshot+'/'+p;
const before=readFileSync(file,'utf8'),needle='std::max(1u, std::min(16u, std::thread::hardware_concurrency()))';assert.equal(before.split(needle).length,2);
const after=before.replace(needle,'1');writeFileSync(file,after);
const hash=(x:string|Uint8Array)=>createHash('sha256').update(x).digest('hex');
writeFileSync(root+'/evidence/vulkan-source.json',JSON.stringify({commit,archive_sha256:hash(archive.stdout),generator_path:p,before_sha256:hash(before),after_sha256:hash(after),scheduling_only_change:'compile concurrency min(16,hardware_concurrency)→1; all shader source unchanged',snapshot,compiled:false},null,2)+'\n');
writeFileSync(root+'/evidence/vulkan-generator.patch',`--- a/${p}\n+++ b/${p}\n@@ scheduling only @@\n-static const unsigned N = ${needle};\n+static const unsigned N = 1;\n`);
console.log('Pinned ggml snapshot '+commit+'; one generator compile slot; no compile/GPU execution');
