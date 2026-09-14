/** SCRIPT_JDOC:
{"summary":"Prepare O1 per-shape dispatch checks followed by untraced OFF/ON/ON/OFF synthetic confirmation using identical retained shader/caller binaries","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync } from 'node:fs';
const root = import.meta.dir;
let validator = readFileSync(root + '/vulkan-control-output.ts', 'utf8');
validator = validator.replace("arm: 'off' | 'on')", "arm: 'off' | 'on', traced: boolean)");
const start = validator.indexOf('    // The retained plugin'), end = validator.indexOf('    return { arm, results', start);
if (start < 0 || end < 0) throw Error('Validator anchors');
validator = validator.slice(0, start) + `    const traces = stderr.split('\\n').filter(x => x.startsWith('XE_FFN_DISPATCH '));
    assert.equal(traces.length, traced ? 2 : 0);
    const tile = arm === 'on' ? 'l' : 'm', size = arm === 'on' ? 128 : 64;
    for (let i = 0; i < traces.length; i++) {
        const [m,n,k] = shapes[i].split(' ');
        assert.ok(traces[i].includes('m='+m+' n='+n+' k='+k+' '));
        assert.ok(traces[i].includes('pipeline=matmul_q4_0_q8_1_'+tile+' '));
        assert.ok(traces[i].includes('wg_m='+size+' wg_n='+size+' split_k=1'));
    }
` + validator.slice(end);
validator = validator.replace('timing_qualified: false', 'timing_qualified: !traced').replace('O0 plugin and dispatch trace: diagnostic samples only; trace cap covers first shape only.', 'O1 same-plugin synthetic confirmation; no trained end-to-end claim.');
writeFileSync(root + '/vulkan-screen-output.ts', validator);
let runner = readFileSync(root + '/run-vulkan-control.ts', 'utf8');
const replacements = [
    ['./vulkan-control-output', './vulkan-screen-output'], ['vulkan-large-offon', 'vulkan-o1-screen'],
    ['vulkan-control-admission.json', 'vulkan-screen-admission.json'], ['vulkan-large-build', 'vulkan-confirm-build'],
    ['run-vulkan-control.ts', 'run-vulkan-screen.ts'], ['vulkan-control-output.ts', 'vulkan-screen-output.ts'], ['launch-vulkan-control.sh', 'launch-vulkan-screen.sh'],
    ["for (const arm of ['off', 'on'] as const)", "for (const arm of ['diagoff', 'diagon', 'off0', 'on0', 'on1', 'off1'] as const)"],
    ["GGML_XE_Q4_LARGE: arm === 'on' ? '1' : '0'", "GGML_XE_Q4_LARGE: arm.includes('off') ? '0' : '1', GGML_XE_VK_TRACE: arm.startsWith('diag') ? '1' : undefined"],
    ["verifyControl(stdout, text(dir + '/' + arm + '-stderr.log'), arm)", "verifyControl(stdout, text(dir + '/' + arm + '-stderr.log'), arm.includes('off') ? 'off' : 'on', arm.startsWith('diag'))"],
    ['results.length === 2', 'results.length === 6'], ['results.length !== 2', 'results.length !== 6'],
    // Keep unique run arm in each record rather than the validator's on/off mode.
    ['Object.assign(results.at(-1), verifyControl', 'Object.assign(results.at(-1), { mode: arm }, verifyControl'],
];
for (const [before, after] of replacements) { if (!runner.includes(before)) throw Error('Runner anchor '+before); runner = runner.replaceAll(before, after); }
writeFileSync(root + '/run-vulkan-screen.ts', runner);
writeFileSync(root + '/launch-vulkan-screen.sh', readFileSync(root + '/launch-vulkan-control.sh', 'utf8').replaceAll('vulkan-large-offon', 'vulkan-o1-screen').replaceAll('run-vulkan-control.ts', 'run-vulkan-screen.ts'));
console.log('Prepared O1 diagnostic OFF/ON then untraced ABBA;90s guard unchanged; no native execution');
