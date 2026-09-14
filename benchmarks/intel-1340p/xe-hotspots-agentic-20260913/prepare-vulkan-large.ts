/** SCRIPT_JDOC:
{"summary":"Prepare isolated Intel Q4 integer large-tile opt-in plugin using retained shaders and explicit dispatch diagnostics","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';const root=import.meta.dir,repo='/var/home/agent/workspace/projects/llama-cpp';let s=readFileSync(repo+'/ggml/src/ggml-vulkan/ggml-vulkan.cpp','utf8');
const needle='            device->mul_mat_l_int[i]    = device->mul_mat_l[i];';if(s.split(needle).length!==2)throw Error('policy anchor');s=s.replace(needle,needle+`
            const char * xe_q4_large = getenv("GGML_XE_Q4_LARGE");
            if (device->vendor_id == VK_VENDOR_ID_INTEL && device->properties.deviceID == 0xa7a0 &&
                !device->coopmat_support && device->integer_dot_product && i == GGML_TYPE_Q4_0 &&
                xe_q4_large && atoi(xe_q4_large) == 1) {
                device->mul_mat_l_int[i] = true;
            }
`);
const point='    const uint32_t split_k = ggml_vk_guess_split_k(ctx, ne01, ne11, ne10, disable_split_k, pipeline);';if(s.split(point).length!==2)throw Error('trace anchor');s=s.replace(point,point+`
    if (getenv("GGML_XE_VK_TRACE") && src0->type == GGML_TYPE_Q4_0 && ne11 == 256 &&
        ((ne01 == 10240 && ne10 == 2560) || (ne01 == 2560 && ne10 == 10240))) {
        static std::atomic<unsigned> count{0};
        if (count.fetch_add(1) < 4) std::cerr << "XE_FFN_DISPATCH m=" << ne01 << " n=" << ne11 << " k=" << ne10
            << " pipeline=" << pipeline->name << " query_type=" << ggml_type_name(effective_src1_type)
            << " wg_m=" << pipeline->wg_denoms[0] << " wg_n=" << pipeline->wg_denoms[1]
            << " split_k=" << split_k << std::endl;
    }
`);
const dir=root+'/vulkan-large-build';mkdirSync(dir,{recursive:true});writeFileSync(dir+'/ggml-vulkan.cpp',s);
let recipe=readFileSync(root+'/build-vulkan-probe-o0.sh','utf8').replaceAll(root+'/vulkan-probe-build',dir).replaceAll(root+'/vulkan-ffn-probe.cpp',root+'/vulkan-ffn-control.cpp').replaceAll('/test-vulkan-ffn','/test-vulkan-control');writeFileSync(root+'/build-vulkan-large.sh',recipe);console.log('Prepared opt-in large integerQ4 only; ordinary shmem checks retained, no source-tree change');
