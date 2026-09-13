/** SCRIPT_JDOC:
{"summary":"Generate Q4-only isolated tile variants with unique template identities and a diagnostic dispatch counter","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
const root=import.meta.dir,repo='/var/home/agent/workspace/projects/llama-cpp',source=readFileSync(repo+'/ggml/src/ggml-cpu/llamafile/sgemm.cpp','utf8');
const block='#else\n        case 0x44:\n        case 0x43:\n        case 0x42:';
if(source.split(block).length!==2)throw Error('Dispatch pattern ambiguous');
const dir=root+'/q4-confirm-build';mkdirSync(dir,{recursive:true});
for(const arm of ['reference','candidate','diagnostic']){
 let text=source;
 if(arm!=='reference')text=text.replace(block,`#else
        case 0x44:
#if defined(__AVX2__) && defined(__F16C__)
            if (std::is_same<TA, block_q4_0>::value && n - n0 == 4) {
                ${arm==='diagnostic'?'q4_tile_hits.fetch_add(1, std::memory_order_relaxed);':''}
                mc = 2; nc = 4; gemmMx4<2>(m0, m, n0, n); break;
            }
#endif
        case 0x43:
        case 0x42:`);
 // Avoid weak-template ODR coalescing across the reference and candidate objects.
 text=text.replaceAll('tinyBLAS_Q0_AVX',arm+'_tinyBLAS_Q0_AVX').replace('bool llamafile_sgemm(',`extern "C" bool ${arm}_sgemm(`);
 const prefix='#include <type_traits>\n'+(arm==='diagnostic'?'#include <atomic>\nstatic std::atomic<unsigned long long> q4_tile_hits{0};\nextern "C" unsigned long long diagnostic_hits(){return q4_tile_hits.load(std::memory_order_relaxed);}\n':'');
 writeFileSync(dir+'/'+arm+'.cpp',prefix+text);
}
console.log('Generated Q4-only variants with distinct template names; diagnostic counter excluded from timing candidate');
