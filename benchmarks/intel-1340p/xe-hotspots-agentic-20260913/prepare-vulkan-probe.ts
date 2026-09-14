/** SCRIPT_JDOC:
{"summary":"Prepare isolated Vulkan Q4 FFN dispatch diagnostic and retained-shader build recipe without changing production source","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';const root=import.meta.dir,repo='/var/home/agent/workspace/projects/llama-cpp';
let source=readFileSync(repo+'/ggml/src/ggml-vulkan/ggml-vulkan.cpp','utf8');
const needle='    const uint32_t split_k = ggml_vk_guess_split_k(ctx, ne01, ne11, ne10, disable_split_k, pipeline);';if(source.split(needle).length!==2)throw Error('Ambiguous insertion');
source=source.replace(needle,needle+`
    if (src0->type == GGML_TYPE_Q4_0 && ne11 == 256 &&
        ((ne01 == 10240 && ne10 == 2560) || (ne01 == 2560 && ne10 == 10240))) {
        static std::atomic<unsigned> probe_count{0};
        if (probe_count.fetch_add(1) < 4) {
            std::cerr << "XE_FFN_DISPATCH m=" << ne01 << " n=" << ne11 << " k=" << ne10
                      << " pipeline=" << pipeline->name << " query_type=" << ggml_type_name(effective_src1_type)
                      << " quantize=" << quantize_y << " aligned=" << aligned
                      << " wg_m=" << pipeline->wg_denoms[0] << " wg_n=" << pipeline->wg_denoms[1]
                      << " split_k=" << split_k << " cores=" << ctx->device->shader_core_count << std::endl;
        }
    }
`);
const dir=root+'/vulkan-probe-build';mkdirSync(dir,{recursive:true});writeFileSync(dir+'/ggml-vulkan.cpp',source);
let recipe=readFileSync('/var/home/agent/workspace/reports/xe-in-memory-perf-20260913/vulkan-o3.sh','utf8');
recipe=recipe.replaceAll('/var/home/agent/workspace/reports/xe-in-memory-perf-20260913/vulkan',dir).replace('-c '+repo+'/ggml/src/ggml-vulkan/ggml-vulkan.cpp','-I'+repo+'/ggml/src/ggml-vulkan -c '+dir+'/ggml-vulkan.cpp');
recipe+=`\n/usr/sbin/clang++ -O2 -std=c++17 -I${repo}/ggml/include -I${repo}/ggml/src ${root}/vulkan-ffn-probe.cpp -L/var/home/agent/workspace/reports/xe-in-memory-perf-20260913/release/bin -Wl,-rpath,/var/home/agent/workspace/reports/xe-in-memory-perf-20260913/release/bin -lggml-base -lggml-cpu -lggml -o ${dir}/test-vulkan-ffn\n`;
writeFileSync(root+'/build-vulkan-probe.sh',recipe);console.log('Prepared isolated plugin TU and recipe; no compilation/source-tree changes');
