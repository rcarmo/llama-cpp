// SCRIPT_JDOC: {"summary":"Validate and aggregate speculative phase logs without double-counting nested timers","kind":"read-only","weight":"lightweight","role":"entrypoint"}
import { readFileSync } from 'node:fs';

export interface Phase {
    calls: number;
    us: number;
    rows: number;
    prompt: number;
    lead: number;
    draft: number;
    generation: number;
    prepare_us: number;
    update_us: number;
    select_us: number;
    drafted: number;
    accepted: number;
    accepted_new: number;
    rejected: number;
    replay_calls: number;
}

// Sum each phase independently. target_decode/draft/process are enclosing timers.
export function analyse(text: string): Record<string, Phase> {
    const phases: Record<string, Phase> = {};
    for (const line of text.split('\n')) {
        if (!line.includes('GGML_SPECULATIVE_PROFILE')) continue;
        const kv = Object.fromEntries([...line.matchAll(/([a-z_]+)=([^ ]+)/g)].map(x => [x[1], x[2]]));
        if (!kv.phase) continue;
        let name = kv.phase;
        if (name === 'target_model') {
            const count = ['prompt', 'lead', 'draft', 'generation'].map(k => Number(kv[k]));
            if (count.some(x => !Number.isInteger(x) || x < 0) || count.reduce((a,b) => a+b,0) !== Number(kv.rows)) {
                throw new Error(`invalid target row composition: ${line}`);
            }
            if (Number(kv.ret) !== 0) throw new Error(`target decode failed: ${line}`);
            name = Number(kv.prompt) > 0 && count.slice(1).some(x => x > 0) ? 'mixed_model' :
                Number(kv.prompt) > 0 ? 'prefill_model' : Number(kv.draft) > 0 ? 'verification_model' : 'generation_model';
        }
        if (name === 'sample_accept') {
            const proposed = Number(kv.drafted), accepted = Number(kv.accepted), rejected = Number(kv.rejected);
            if (![proposed,accepted,rejected].every(x => Number.isInteger(x) && x >= 0) || accepted+rejected !== proposed || Number(kv.accepted_new) > accepted) {
                throw new Error(`invalid acceptance accounting: ${line}`);
            }
        }
        if (name === 'ngram_lookup' && Number(kv.prepare_us)+Number(kv.update_us)+Number(kv.select_us) > Number(kv.us)) {
            throw new Error(`nested lookup time exceeds total: ${line}`);
        }
        const phase = phases[name] ??= {
            calls:0,us:0,rows:0,prompt:0,lead:0,draft:0,generation:0,
            prepare_us:0,update_us:0,select_us:0,drafted:0,accepted:0,accepted_new:0,rejected:0,replay_calls:0,
        };
        phase.calls++;
        for (const key of Object.keys(phase) as (keyof Phase)[]) {
            if (key === 'calls' || key === 'replay_calls') continue;
            if (kv[key] === undefined) continue;
            const value = Number(kv[key]);
            if (!Number.isFinite(value) || value < 0) throw new Error(`invalid numeric field ${key}: ${line}`);
            phase[key] += value;
        }
        phase.replay_calls += kv.replay === '1' ? 1 : 0;
    }
    return phases;
}

if (import.meta.main) {
    const files = process.argv.slice(2);
    if (!files.length) throw new Error('usage: bun analyse.ts SERVER-LOG [SERVER-LOG ...]');
    console.log(JSON.stringify(files.map(file => ({file, phases: analyse(readFileSync(file,'utf8'))})),null,2));
}
