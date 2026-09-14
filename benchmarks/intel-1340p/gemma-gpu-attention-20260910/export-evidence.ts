/** SCRIPT_JDOC:
{"summary":"Export safe, checksummed attention experiment sources and raw evidence to the authorised fork workspace","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const root = import.meta.dir;
const destination = '/var/home/agent/workspace/projects/llama-cpp/benchmarks/intel-1340p/gemma-gpu-attention-20260910';
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
const readme = `# Iris Xe attention selector evidence, 10 September 2026\n\nExperimental only. FP32 selection reduced confirmed 64K-tail prefill by 8.10%; one fresh64K hybrid request took691.385s versus746.817s (-7.42%, temporal comparison). Native controls pass6/6 versus4/6 baseline. Smaller tiles were slower. Production CPU service was restored unchanged; no deployment.\n\nRead [report.md](report.md) for exact scope, failures, resources and remaining qualification. Run \`bash verify-offline.sh\` from this directory inside the fork checkout. Requires Bun and Git, but no model or inference. It reconstructs excluded Vulkan host source from4e9740248, applies the isolated patch and checks its measured source hash, then runs tests and the raw-evidence audit.\n\nThe build scripts are historical machine-local commands and require the retained Vulkan build/shader objects. Reconstructing the host selector does not recreate the complete measured runtime. Earlier softmax and compact-SWA dependencies are retained in the sibling gemma-hybrid-perf-20260910 and gemma-context-coding-20260910 exports. Runtime, model and KV files are excluded; mapped runtime hashes are in runtime-provenance.json. Baseline service files are excluded; restoration-identity.json retains comparison hashes and safe argv.\n\nModel-generated code, where present, is synthetic benchmark evidence. Do not treat it as trusted executable infrastructure. Slot fixtures, speech media, transcripts, secrets and private user data are not exported.\n`;
writeFileSync(join(destination, 'README.md'), readme);
writeFileSync(join(destination, '.gitattributes'), '# Preserve historical patch context and native ANSI logs.\n*.patch whitespace=-blank-at-eol\n*.log -whitespace\n');
for (const path of ['README.md', '.gitattributes']) files.push({ path, bytes: statSync(join(destination, path)).size, sha256: sha(join(destination, path)) });
files.sort((a, b) => a.path.localeCompare(b.path));
writeFileSync(join(destination, 'manifest.json'), JSON.stringify({ exported_at: new Date().toISOString(), status: 'Experimental; no deployment', origin: root, source_revision: '4e9740248', exclusions: ['full source reconstructed from patch', 'runtime/build binaries', 'models', 'KV states', 'service environment/config files'], files }, null, 2) + '\n');
writeFileSync(join(destination, 'checksums.sha256'), [...files.map(f => `${f.sha256}  ${f.path}`), `${sha(join(destination, 'manifest.json'))}  manifest.json`].join('\n') + '\n');
console.log(JSON.stringify({ destination, files: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0) }));
