/** SCRIPT_JDOC:
{"summary":"Export safe, checksummed longcoding experiment sources and raw evidence to the authorised fork workspace","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const root = import.meta.dir;
const destination = '/var/home/agent/workspace/projects/llama-cpp/benchmarks/intel-1340p/gemma-long-coding-20260910';
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
if (existsSync(destination)) throw Error('Refuse to overwrite retained export');
const files: { path: string; bytes: number; sha256: string }[] = [];
function visit(relative = '') {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
        const path = join(relative, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
            if (entry.name.startsWith('runtime') || ['slots', '.syntax', 'baseline'].includes(entry.name)) continue;
            visit(path); continue;
        }
        if (!entry.isFile() || /\.(o|so(\..*)?|slot.*|tar\.gz)$/.test(path) || ['campaign.lock', 'patch/ggml-vulkan.cpp', 'build/link.d'].includes(path)) continue;
        if (!/\.(ts|json|md|txt|log|sh|patch)$/.test(path)) continue;
        const source = join(root, path), data = readFileSync(source);
        if (data.length > 12 * 1024 * 1024) throw Error('Unexpected large export: ' + path);
        const text = data.toString('utf8');
        if (/-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|\bBearer\s+[A-Za-z0-9_-]{20,}/.test(text)) throw Error('Potential secret in ' + path);
        mkdirSync(dirname(join(destination, path)), { recursive: true });
        copyFileSync(source, join(destination, path));
        files.push({ path, bytes: data.length, sha256: sha(source) });
    }
}
visit();
const readme = `# Long-context coding selector evidence, 10 September 2026

One ABBA block at38666 initialtokens:FP32 selection reduces median GPU prefill2.09% and summed request-route latency1.99%; allfour tasks pass with213 outputtokens/fourrounds. WarmCPUchange0.56% faster, not a decode claim. Original service restored unchanged; no deployment.

Read [report.md](report.md) for timing boundaries, source identity, review and resource evidence. Run \`bash verify-offline.sh\` with Bun installed to check hashes, six audit tests and allfour rawresults/restoration checks without inference. The native runner depends on retainedCPU/model/runtime, the sibling gemma-context-coding-20260910 converter, and the selector/runtime from gemma-gpu-attention-20260910 checkpoint0bdd7cd8b. No newkernelbuild was made.

Model-generated median source is synthetic test evidence. Do not treat generated code as trusted infrastructure. Runtimebinaries, models, slotstates, baselineenvironmentfiles, secrets and privateuser/speechdata are excluded. Configcomparison and live mapped-file hashes are retained in restoration-identity.json and runtime-provenance.json.
`;
writeFileSync(join(destination, 'README.md'), readme);
writeFileSync(join(destination, '.gitattributes'), '# Preserve historical patch context and native ANSI logs.\n*.patch whitespace=-blank-at-eol\n*.log -whitespace\n');
for (const path of ['README.md', '.gitattributes']) files.push({ path, bytes: statSync(join(destination, path)).size, sha256: sha(join(destination, path)) });
files.sort((a, b) => a.path.localeCompare(b.path));
writeFileSync(join(destination, 'manifest.json'), JSON.stringify({ exported_at: new Date().toISOString(), status: 'Experimental; no deployment', origin: root, selector_checkpoint: '0bdd7cd8b', source_revision: '4e9740248', exclusions: ['full source reconstructed from patch', 'runtime/build binaries', 'models', 'KV states', 'service environment/config files'], files }, null, 2) + '\n');
writeFileSync(join(destination, 'checksums.sha256'), [...files.map(f => `${f.sha256}  ${f.path}`), `${sha(join(destination, 'manifest.json'))}  manifest.json`].join('\n') + '\n');
console.log(JSON.stringify({ destination, files: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0) }));
