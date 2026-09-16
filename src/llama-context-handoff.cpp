#include "llama-context.h"
#include "llama-model.h"
#include "llama-impl.h"
#include <cstring>
#include <stdexcept>

bool llama_context::kv_handoff_cpu(llama_context & src, bool allow_copy, llama_kv_handoff_result & result) {
    result = {};
    if (kv_handoff_strict != src.kv_handoff_strict || (kv_handoff_strict && (allow_copy || !kv_handoff_pending || src.kv_handoff_pending ||
        hidden_state_peer_count || src.hidden_state_peer_count || hidden_state_peer_owner || src.hidden_state_peer_owner))) return false;
    if (&src==this || kv_consumed || src.kv_consumed || !memory || !src.memory ||
        kv_borrowers || src.kv_borrowers || kv_borrowed_from || src.kv_borrowed_from || cparams.ctx_other || src.cparams.ctx_other ||
        model.shared_residency_enabled() || src.model.shared_residency_enabled() ||
        model.n_gpu_layers()!=0 || cparams.offload_kqv || cparams.op_offload ||
        (kv_handoff_strict && (src.model.n_gpu_layers()==0 || !src.cparams.offload_kqv || !src.cparams.op_offload)) ||
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
    if (a.n_rs_seq!=b.n_rs_seq || a.n_ctx!=b.n_ctx || a.n_ctx_seq!=b.n_ctx_seq || a.n_ubatch!=b.n_ubatch || a.n_seq_max!=b.n_seq_max ||
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
    std::unique_ptr<llama_hidden_state_transfer> hidden_transfer;
    if (kv_handoff_strict) {
        hidden_transfer = llama_hidden_state_prepare(hidden_state_write, src.hidden_state_write, view);
        if (!hidden_transfer) return false;
        shared += hidden_transfer->shared_bytes;
    }
    if ((abort_callback && abort_callback(abort_callback_data)) ||
        (src.abort_callback && src.abort_callback(src.abort_callback_data))) return false;
    // No allocation or fallible work after ownership changes.
    invalidate_residency_graphs(); src.invalidate_residency_graphs();
    transfer->commit();
    if (hidden_transfer) hidden_transfer->commit();
    kv_handoff_pending = false;
    sched_need_reserve = true;
    src.kv_consumed=true;
    src.memory.reset();
    mem_storage.clear(); src.mem_storage.clear();
    n_outputs=0;
    result.shared_bytes=shared; result.copied_bytes=copied;
    return true;
}

bool llama_context::kv_handoff_cpu_mtp(
        llama_context & dst_mtp, llama_context & src_tgt, llama_context & src_mtp,
        llama_kv_handoff_result & result) {
    result = {};
    auto is_target = [](const llama_context & c) { return c.cparams.ctx_type == LLAMA_CONTEXT_TYPE_DEFAULT; };
    auto is_mtp = [](const llama_context & c) { return c.cparams.ctx_type == LLAMA_CONTEXT_TYPE_MTP; };
    auto empty_samplers = [](const llama_context & c) { return c.sampling.samplers.empty(); };
    if (&src_tgt == this || &dst_mtp == this || &src_mtp == this || &src_tgt == &src_mtp || &dst_mtp == &src_tgt || &dst_mtp == &src_mtp ||
        !kv_handoff_strict || !dst_mtp.kv_handoff_strict || !src_tgt.kv_handoff_strict || !src_mtp.kv_handoff_strict ||
        !kv_handoff_pending || !dst_mtp.kv_handoff_pending || src_tgt.kv_handoff_pending || src_mtp.kv_handoff_pending ||
        !is_target(*this) || !is_target(src_tgt) || !is_mtp(dst_mtp) || !is_mtp(src_mtp) ||
        kv_consumed || dst_mtp.kv_consumed || src_tgt.kv_consumed || src_mtp.kv_consumed ||
        !memory || !dst_mtp.memory || !src_tgt.memory || !src_mtp.memory ||
        hidden_state_peer_count != 0 || dst_mtp.hidden_state_peer_owner || dst_mtp.hidden_state_peer_count != 0 ||
        src_tgt.hidden_state_peer_count != 1 || src_mtp.hidden_state_peer_owner != &src_tgt || src_mtp.hidden_state_peer_count != 0 ||
        !empty_samplers(*this) || !empty_samplers(dst_mtp) || !empty_samplers(src_tgt) || !empty_samplers(src_mtp) ||
        kv_borrowers || dst_mtp.kv_borrowers || src_tgt.kv_borrowers || src_mtp.kv_borrowers ||
        kv_borrowed_from || dst_mtp.kv_borrowed_from || src_tgt.kv_borrowed_from || src_mtp.kv_borrowed_from ||
        model.shared_residency_enabled() || dst_mtp.model.shared_residency_enabled() ||
        src_tgt.model.shared_residency_enabled() || src_mtp.model.shared_residency_enabled() ||
        model.n_gpu_layers() != 0 || dst_mtp.model.n_gpu_layers() != 0 ||
        src_tgt.model.n_gpu_layers() == 0 || src_mtp.model.n_gpu_layers() == 0 ||
        cparams.offload_kqv || cparams.op_offload || dst_mtp.cparams.offload_kqv || dst_mtp.cparams.op_offload ||
        !src_tgt.cparams.offload_kqv || !src_tgt.cparams.op_offload || !src_mtp.cparams.offload_kqv || !src_mtp.cparams.op_offload ||
        src_tgt.memory->seq_pos_max(0) != src_mtp.memory->seq_pos_max(0)) return false;

    auto compatible = [](const llama_context & dst, const llama_context & src) {
        if (dst.model.arch != src.model.arch || dst.model.gguf_kv != src.model.gguf_kv ||
            dst.model.tensors_by_name.size() != src.model.tensors_by_name.size()) return false;
        if (&dst.model != &src.model && (dst.model.kv_handoff_identity.empty() ||
            dst.model.kv_handoff_identity != src.model.kv_handoff_identity)) return false;
        const auto & a = dst.cparams; const auto & b = src.cparams;
        return a.n_ctx == b.n_ctx && a.n_ctx_seq == b.n_ctx_seq && a.n_ubatch == b.n_ubatch &&
            a.n_seq_max == b.n_seq_max && a.n_rs_seq == b.n_rs_seq && a.kv_unified == b.kv_unified &&
            a.ctx_type == b.ctx_type && a.causal_attn == b.causal_attn && a.flash_attn == b.flash_attn;
    };
    if (!compatible(*this, src_tgt) || !compatible(dst_mtp, src_mtp)) return false;
    for (const auto & a : model.tensors_by_name) {
        auto * b = src_tgt.model.get_tensor(a.first.c_str());
        if (!b || a.second->type != b->type || !ggml_are_same_shape(a.second, b)) return false;
    }

    synchronize(); dst_mtp.synchronize(); src_tgt.synchronize(); src_mtp.synchronize();
    auto aborted = [](const llama_context & c) { return c.abort_callback && c.abort_callback(c.abort_callback_data); };
    if (aborted(*this) || aborted(dst_mtp) || aborted(src_tgt) || aborted(src_mtp)) return false;

    auto view_for = [](llama_context & src) {
        return [&src](ggml_backend_buffer_t buffer, size_t offset, size_t size) -> ggml_backend_buffer_t {
            using view_fn = ggml_backend_buffer_t (*)(ggml_backend_t, ggml_backend_buffer_t, size_t, size_t);
            for (const auto & backend : src.backends) {
                if (ggml_backend_get_default_buffer_type(backend.get()) != ggml_backend_buffer_get_type(buffer)) continue;
                auto * dev = ggml_backend_get_device(backend.get());
                if (!dev) continue;
                auto fn = (view_fn) ggml_backend_reg_get_proc_address(
                        ggml_backend_dev_backend_reg(dev), "ggml_backend_vk_buffer_cpu_view");
                if (fn) return fn(backend.get(), buffer, offset, size);
            }
            return nullptr;
        };
    };
    auto view_tgt = view_for(src_tgt);
    auto view_mtp = view_for(src_mtp);
    size_t shared_tgt = 0, shared_mtp = 0, copied_tgt = 0, copied_mtp = 0;
    auto transfer_tgt = memory->prepare_handoff(*src_tgt.memory, view_tgt, false, shared_tgt, copied_tgt);
    if (!transfer_tgt || copied_tgt) return false;
    auto transfer_mtp = dst_mtp.memory->prepare_handoff(*src_mtp.memory, view_mtp, false, shared_mtp, copied_mtp);
    if (!transfer_mtp || copied_mtp) return false;

    auto hidden_tgt = llama_hidden_state_prepare(hidden_state_write, src_tgt.hidden_state_write, view_tgt);
    auto hidden_mtp = llama_hidden_state_prepare(dst_mtp.hidden_state_write, src_mtp.hidden_state_write, view_mtp);
    if (!hidden_tgt || !hidden_mtp) return false;
    shared_tgt += hidden_tgt->shared_bytes;
    shared_mtp += hidden_mtp->shared_bytes;
    if (aborted(*this) || aborted(dst_mtp) || aborted(src_tgt) || aborted(src_mtp)) return false;

    invalidate_residency_graphs(); dst_mtp.invalidate_residency_graphs();
    src_tgt.invalidate_residency_graphs(); src_mtp.invalidate_residency_graphs();
    transfer_tgt->commit(); transfer_mtp->commit();
    hidden_tgt->commit(); hidden_mtp->commit();
    kv_handoff_pending = false; dst_mtp.kv_handoff_pending = false;
    sched_need_reserve = true; dst_mtp.sched_need_reserve = true;
    hidden_state_peer_count = 1;
    dst_mtp.hidden_state_peer_owner = this;
    dst_mtp.hidden_state_peer = hidden_state_write;
    dst_mtp.cparams.hidden_state_read = hidden_state_write;
    src_tgt.hidden_state_peer_count = 0;
    src_mtp.hidden_state_peer_owner = nullptr;
    src_mtp.hidden_state_peer.reset();
    src_mtp.cparams.hidden_state_read.reset();
    src_tgt.kv_consumed = true; src_mtp.kv_consumed = true;
    src_tgt.memory.reset(); src_mtp.memory.reset();
    mem_storage.clear(); dst_mtp.mem_storage.clear(); src_tgt.mem_storage.clear(); src_mtp.mem_storage.clear();
    n_outputs = 0; dst_mtp.n_outputs = 0;
    result.shared_bytes = shared_tgt + shared_mtp;
    result.copied_bytes = 0;
    return true;
}

bool llama_kv_handoff_cpu_mtp(
        llama_context * dst_tgt, llama_context * dst_mtp,
        llama_context * src_tgt, llama_context * src_mtp,
        llama_kv_handoff_result * result) {
    if (result) *result = {};
    if (!dst_tgt || !dst_mtp || !src_tgt || !src_mtp) return false;
    try {
        llama_kv_handoff_result value {};
        if (!dst_tgt->kv_handoff_cpu_mtp(*dst_mtp, *src_tgt, *src_mtp, value)) return false;
        if (result) *result = value;
        return true;
    } catch (const std::exception & e) {
        LLAMA_LOG_ERROR("%s: %s\n", __func__, e.what());
        return false;
    }
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
