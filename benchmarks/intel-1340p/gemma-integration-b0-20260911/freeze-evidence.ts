/** SCRIPT_JDOC:
{"summary":"Freeze integration code and retained state identities for offline closeout; no inference","kind":"mixed","weight":"standard","role":"entrypoint"}
*/
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
const root = import.meta.dir, sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const release = '/var/home/agent/.local/share/llama-gemma-hybrid/releases/20260911-score3-stopped';
const codes = readdirSync(root + '/code').filter(x => x.endsWith('.ts') && !x.endsWith('.test.ts')).map(file => {
 const a = readFileSync(root + '/code/' + file), b = readFileSync(release + '/code/' + file);
 if (sha(a) !== sha(b)) throw Error('Deployed code mismatch ' + file);
 return { file, sha256: sha(a), deployed_sha256: sha(b) };
});
const paths = ['runs/dual-slot-capacity/slots/prefix-16384-v2.slot', 'runs/dual-slot-capacity/slots/prefix-32768-v2.slot', 'runs/dual-slot-capacity/slots/prefix-64663-v2.slot', 'runs/near128-real-prefix/slots/prefix.slot'];
const states = [];
for (const path of paths) {
 const h = createHash('sha256'); for await (const b of Bun.file(root + '/' + path).stream()) h.update(b);
 states.push({ path, bytes: statSync(root + '/' + path).size, sha256: h.digest('hex') });
}
const fixture = JSON.parse(readFileSync(root + '/runs/near128-real-prefix/fixture.json', 'utf8'));
const original = JSON.parse(readFileSync('/var/home/agent/workspace/reports/gemma-context-coding-20260910/runs/compact64-aligned/fixture.json', 'utf8'));
if (JSON.stringify(fixture.prompt.slice(0, original.tokens.length)) !== JSON.stringify(original.tokens)) throw Error('Prefix changed');
const out = { captured_at: new Date().toISOString(), release, code: codes, states, fixture: { target: fixture.target, prompt_tokens: fixture.prompt.length, base_tokens: original.tokens.length, prefix_identical: true, prefix_tokens_sha256: sha(JSON.stringify(original.tokens)), prompt_tokens_sha256: sha(JSON.stringify(fixture.prompt)) }, near128_saved: existsSync(root + '/runs/near128-real-prefix/slots/near128.slot'), limits: ['State bytes stay local; hashes bind retained inputs, not an offline regeneration claim', 'Model hashes inherited from support/frozen-inputs.json; models were not replaced or rehashed at closeout'] };
writeFileSync(root + '/input-identities.json', JSON.stringify(out, null, 2) + '\n');
console.log('PASS exact deployed code, retained state hashes and near128 input prefix');
