#include "llama-context.h"
#include "llama-model.h"
#include "llama-impl.h"
#include <cstring>
#include <stdexcept>

bool llama_context::kv_handoff_cpu(llama_context & src, bool allow_copy, llama_kv_handoff_result & result) {
    result = {};
    if (&src==this || kv_consumed || src.kv_consumed || !memory || !src.memory ||
        kv_borrowers || src.kv_borrowers || kv_borrowed_from || src.kv_borrowed_from || cparams.ctx_other || src.cparams.ctx_other ||
        model.shared_residency_enabled() || src.model.shared_residency_enabled() ||
        model.n_gpu_layers()!=0 || cparams.offload_kqv || cparams.op_offload ||
        model.has_tensor_overrides() || src.model.has_tensor_overrides() ||
        opt_ctx || src.opt_ctx || kv_cvec_modified || src.kv_cvec_modified ||
        (loras && !loras->empty()) || (src.loras && !src.loras->empty()) || !sampling.samplers.empty() || !src.sampling.samplers.empty()) return false;
    if (&model!=&src.model && (model.kv_handoff_identity.empty() || model.kv_handoff_identity!=src.model.kv_handoff_identity)) return false;
    if (model.arch!=src.model.arch || model.gguf_kv!=src.model.gguf_kv || model.tensors_by_name.size()!=src.model.tensors_by_name.size()) return false;
    // Allocation grouping differs between CPU and Vulkan loads; compare by tensor identity, not enumeration order.
    for (const auto & a : model.tensors_by_name) {
        const auto * b=src.model.get_tensor(a.first.c_str());
        if (!b || a.second->type!=b->type || !ggml_are_same_shape(a.second,b)) return false;
    }
    const auto & a=cparams; const auto & b=src.cparams;
    if (a.n_ctx!=b.n_ctx || a.n_ctx_seq!=b.n_ctx_seq || a.n_ubatch!=b.n_ubatch || a.n_seq_max!=b.n_seq_max ||
        a.kv_unified!=b.kv_unified || a.ctx_type!=b.ctx_type || a.ctx_type!=LLAMA_CONTEXT_TYPE_DEFAULT ||
        a.causal_attn!=b.causal_attn || a.flash_attn!=b.flash_attn ||
        a.rope_scaling_type!=b.rope_scaling_type || a.rope_freq_base!=b.rope_freq_base || a.rope_freq_scale!=b.rope_freq_scale ||
        a.yarn_ext_factor!=b.yarn_ext_factor || a.yarn_attn_factor!=b.yarn_attn_factor || a.yarn_beta_fast!=b.yarn_beta_fast ||
        a.yarn_beta_slow!=b.yarn_beta_slow || a.n_ctx_orig_yarn!=b.n_ctx_orig_yarn) return false;
    const auto & ah=model.hparams; const auto & bh=src.model.hparams;
    if (ah.n_embd!=bh.n_embd || ah.n_layer_all!=bh.n_layer_all || ah.n_head_arr!=bh.n_head_arr ||
        ah.n_head_kv_arr!=bh.n_head_kv_arr || ah.n_swa!=bh.n_swa || ah.is_swa_impl!=bh.is_swa_impl ||
        ah.n_embd_head_k_full!=bh.n_embd_head_k_full || ah.n_embd_head_v_full!=bh.n_embd_head_v_full ||
        ah.n_embd_head_k_swa!=bh.n_embd_head_k_swa || ah.n_embd_head_v_swa!=bh.n_embd_head_v_swa ||
        ah.f_norm_rms_eps!=bh.f_norm_rms_eps || ah.f_logit_scale!=bh.f_logit_scale) return false;
    synchronize(); src.synchronize();
    if ((abort_callback && abort_callback(abort_callback_data)) ||
        (src.abort_callback && src.abort_callback(src.abort_callback_data))) return false;
    llama_memory_view_cb view = [&](ggml_backend_buffer_t buffer, size_t offset, size_t size) -> ggml_backend_buffer_t {
        using view_fn = ggml_backend_buffer_t (*)(ggml_backend_t,ggml_backend_buffer_t,size_t,size_t);
        for (const auto & backend : src.backends) {
            if (ggml_backend_get_default_buffer_type(backend.get())!=ggml_backend_buffer_get_type(buffer)) continue;
            auto dev=ggml_backend_get_device(backend.get());
            if (!dev) continue;
            auto fn=(view_fn)ggml_backend_reg_get_proc_address(ggml_backend_dev_backend_reg(dev),"ggml_backend_vk_buffer_cpu_view");
            if (fn) return fn(backend.get(),buffer,offset,size);
        }
        return nullptr;
    };
    size_t shared=0,copied=0;
    auto transfer=memory->prepare_handoff(*src.memory,view,allow_copy,shared,copied);
    if (!transfer) return false;
    if ((abort_callback && abort_callback(abort_callback_data)) ||
        (src.abort_callback && src.abort_callback(src.abort_callback_data))) return false;
    // No allocation or fallible work after ownership changes.
    invalidate_residency_graphs(); src.invalidate_residency_graphs();
    transfer->commit();
    src.kv_consumed=true;
    src.memory.reset();
    sched_need_reserve=true;
    mem_storage.clear(); src.mem_storage.clear();
    n_outputs=0;
    result.shared_bytes=shared; result.copied_bytes=copied;
    return true;
}

bool llama_kv_handoff_cpu(llama_context * dst, llama_context * src, bool allow_copy, llama_kv_handoff_result * result) {
    if (result) *result={};
    if (!dst || !src) return false;
    try {
        llama_kv_handoff_result value {};
        if (!dst->kv_handoff_cpu(*src,allow_copy,value)) return false;
        if (result) *result=value;
        return true;
    } catch (const std::exception & e) {
        LLAMA_LOG_ERROR("%s: %s\n",__func__,e.what());
        return false;
    }
}
