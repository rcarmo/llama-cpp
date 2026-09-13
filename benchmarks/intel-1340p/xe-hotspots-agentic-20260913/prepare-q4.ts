/** SCRIPT_JDOC:
{"summary":"Generate isolated SGEMM baseline/2x4 tile candidate for exact-shape CPU experiment without editing repository","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';const root=import.meta.dir,repo='/var/home/agent/workspace/projects/llama-cpp',source=readFileSync(repo+'/ggml/src/ggml-cpu/llamafile/sgemm.cpp','utf8');
let candidate=source;const block='#else\n        case 0x44:\n        case 0x43:\n        case 0x42:';if(candidate.split(block).length!==2)throw Error('tile pattern');candidate=candidate.replace(block,'#else\n        case 0x44:\n#if defined(__AVX2__) && defined(__F16C__)\n            if (n - n0 == 4) { mc = 2; nc = 4; gemmMx4<2>(m0, m, n0, n); break; }\n#endif\n        case 0x43:\n        case 0x42:');
mkdirSync(root+'/q4-build',{recursive:true});for(const[name,text]of[['reference',source],['candidate',candidate]])writeFileSync(root+'/q4-build/'+name+'.cpp',text.replace('bool llamafile_sgemm(',`extern "C" bool ${name}_sgemm(`));
console.log('Generated isolated reference/candidate; no repo source modified');
