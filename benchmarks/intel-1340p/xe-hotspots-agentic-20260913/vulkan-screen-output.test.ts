import { test, expect } from 'bun:test';
import { verifyControl } from './vulkan-screen-output';
const shapes = ['10240 256 2560', '2560 256 10240'];
function fixture(arm: 'off' | 'on') {
    const stdout = shapes.flatMap(shape => [`GATE ${shape} 2.2e-7`, ...Array.from({length:8},(_,i)=>`TIMING ${shape} ${i} 1.25`), `RESULT ${shape} 2.2e-7 0.01`]).concat('OWNERS_DRAINED').join('\n')+'\n';
    const size = arm === 'on' ? 128 : 64, tile = arm === 'on' ? 'l' : 'm';
    const stderr = shapes.map(shape => {const [m,n,k]=shape.split(' ');return `XE_FFN_DISPATCH m=${m} n=${n} k=${k} pipeline=matmul_q4_0_q8_1_${tile} query_type=q8_1 wg_m=${size} wg_n=${size} split_k=1`;}).join('\n');
    return {stdout,stderr};
}
test('both-shape diagnostics and untraced timing have distinct acceptance',()=>{
    for(const arm of ['off','on'] as const){const f=fixture(arm);
        expect(verifyControl(f.stdout,f.stderr,arm,true).timing_qualified).toBe(false);
        expect(verifyControl(f.stdout,'',arm,false).timing_qualified).toBe(true);
        expect(()=>verifyControl(f.stdout,f.stderr,arm,false)).toThrow();
        expect(()=>verifyControl(f.stdout,'',arm,true)).toThrow();
        expect(()=>verifyControl(f.stdout,f.stderr.split('\n')[0],arm,true)).toThrow();
        expect(()=>verifyControl(f.stdout.replace('2.2e-7','NaN'),'',arm,false)).toThrow();
        expect(()=>verifyControl(f.stdout.replace('OWNERS_DRAINED',''),'',arm,false)).toThrow();
    }
});
