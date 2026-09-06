#include "models.h"

void llama_model_maple::load_arch_hparams(llama_model_loader & ml) {
    hparams.swa_type = LLAMA_SWA_TYPE_STANDARD;

    ml.get_key(LLM_KV_ATTENTION_LAYERNORM_RMS_EPS, hparams.f_norm_rms_eps);
    ml.get_key_or_arr(LLM_KV_EXPERT_FEED_FORWARD_LENGTH, hparams.n_ff_exp_arr, hparams.n_layer_all);
    ml.get_key(LLM_KV_ATTENTION_SLIDING_WINDOW,    hparams.n_swa);
    ml.get_key_or_arr(LLM_KV_ATTENTION_SLIDING_WINDOW_PATTERN, hparams.is_swa_impl, hparams.n_layer());
    ml.get_key_or_arr(LLM_KV_SWIGLU_CLAMP_EXP, hparams.swiglu_clamp_exp, hparams.n_layer());

    if (hparams.n_rot_full != 0) {
        throw std::runtime_error("Maple full-attention layers require NoPE");
    }
    if (hparams.n_rot_swa != 64) {
        throw std::runtime_error("Maple sliding-attention layers require 64 rotary dimensions");
    }
    if (hparams.n_expert != 256 || hparams.n_expert_used() != 8) {
        throw std::runtime_error("Maple requires 256 experts with 8 active experts");
    }

    type = LLM_TYPE_20B;
}

void llama_model_maple::load_arch_tensors(llama_model_loader &) {
    LLAMA_LOAD_LOCALS;

    tok_embd    = create_tensor(tn(LLM_TENSOR_TOKEN_EMBD,   "weight"), {n_embd, n_vocab}, 0);
    output_norm = create_tensor(tn(LLM_TENSOR_OUTPUT_NORM,  "weight"), {n_embd}, 0);
    output      = create_tensor(tn(LLM_TENSOR_OUTPUT,       "weight"), {n_embd, n_vocab}, 0);

    for (int il = 0; il < n_layer; ++il) {
        auto & layer = layers[il];
        layer.attn_norm      = create_tensor(tn(LLM_TENSOR_ATTN_NORM,      "weight", il), {n_embd}, 0);
        layer.attn_post_norm = create_tensor(tn(LLM_TENSOR_ATTN_POST_NORM, "weight", il), {n_embd}, 0);
        layer.wq             = create_tensor(tn(LLM_TENSOR_ATTN_Q,         "weight", il), {n_embd, n_embd_head_k * n_head}, 0);
        layer.wk             = create_tensor(tn(LLM_TENSOR_ATTN_K,         "weight", il), {n_embd, n_embd_k_gqa}, 0);
        layer.wv             = create_tensor(tn(LLM_TENSOR_ATTN_V,         "weight", il), {n_embd, n_embd_v_gqa}, 0);
        layer.wo             = create_tensor(tn(LLM_TENSOR_ATTN_OUT,       "weight", il), {n_embd_head_v * n_head, n_embd}, 0);
        layer.attn_q_norm    = create_tensor(tn(LLM_TENSOR_ATTN_Q_NORM,    "weight", il), {n_embd_head_k}, 0);
        layer.attn_k_norm    = create_tensor(tn(LLM_TENSOR_ATTN_K_NORM,    "weight", il), {n_embd_head_k}, 0);

        const int64_t n_ff_exp = hparams.n_ff_exp(il);
        layer.ffn_gate_inp    = create_tensor(tn(LLM_TENSOR_FFN_GATE_INP,   "weight", il), {n_embd, n_expert}, 0);
        layer.ffn_gate_exps   = create_tensor(tn(LLM_TENSOR_FFN_GATE_EXPS, "weight", il), {n_embd, n_ff_exp, n_expert}, 0);
        layer.ffn_up_exps     = create_tensor(tn(LLM_TENSOR_FFN_UP_EXPS,   "weight", il), {n_embd, n_ff_exp, n_expert}, 0);
        layer.ffn_down_exps   = create_tensor(tn(LLM_TENSOR_FFN_DOWN_EXPS, "weight", il), {n_ff_exp, n_embd, n_expert}, 0);
    }
}

std::unique_ptr<llm_graph_context> llama_model_maple::build_arch_graph(const llm_graph_params & params) const {
    return std::make_unique<graph>(*this, params);
}

llama_model_maple::graph::graph(const llama_model & model, const llm_graph_params & params) :
        llm_graph_context(params), model(model) {
    ggml_tensor * inpL = build_inp_embd(model.tok_embd);
    ggml_tensor * inp_pos = build_inp_pos();
    auto * inp_attn = build_attn_inp_kv_iswa();
    ggml_tensor * inp_out_ids = build_inp_out_ids();

    for (int il = 0; il < n_layer; ++il) {
        res->t_layer_inp[il] = inpL;
        ggml_tensor * residual = inpL;
        ggml_tensor * cur = build_norm(inpL, model.layers[il].attn_norm, nullptr, LLM_NORM_RMS, il);
        cb(cur, "attn_norm", il);

        ggml_tensor * Qcur = build_lora_mm(model.layers[il].wq, cur);
        ggml_tensor * Kcur = build_lora_mm(model.layers[il].wk, cur);
        ggml_tensor * Vcur = build_lora_mm(model.layers[il].wv, cur);
        Qcur = ggml_reshape_3d(ctx0, Qcur, n_embd_head_k, n_head, n_tokens);
        Kcur = ggml_reshape_3d(ctx0, Kcur, n_embd_head_k, n_head_kv, n_tokens);
        Vcur = ggml_reshape_3d(ctx0, Vcur, n_embd_head_v, n_head_kv, n_tokens);
        Qcur = build_norm(Qcur, model.layers[il].attn_q_norm, nullptr, LLM_NORM_RMS, il);
        Kcur = build_norm(Kcur, model.layers[il].attn_k_norm, nullptr, LLM_NORM_RMS, il);

        const int64_t n_rot_l = hparams.n_rot(il);
        if (n_rot_l > 0) {
            const float freq_base_l = model.get_rope_freq_base(cparams, il);
            const float freq_scale_l = model.get_rope_freq_scale(cparams, il);
            Qcur = ggml_rope_ext(ctx0, Qcur, inp_pos, nullptr, n_rot_l, rope_type, n_ctx_orig, freq_base_l, freq_scale_l,
                    ext_factor, attn_factor, beta_fast, beta_slow);
            Kcur = ggml_rope_ext(ctx0, Kcur, inp_pos, nullptr, n_rot_l, rope_type, n_ctx_orig, freq_base_l, freq_scale_l,
                    ext_factor, attn_factor, beta_fast, beta_slow);
        }
        cb(Qcur, "Qcur", il);
        cb(Kcur, "Kcur", il);
        cb(Vcur, "Vcur", il);

        const float kq_scale = 1.0f / sqrtf(float(n_embd_head_k));
        cur = build_attn(inp_attn, nullptr, nullptr, nullptr, Qcur, Kcur, Vcur, nullptr, nullptr, nullptr, kq_scale, il);
        cur = build_lora_mm(model.layers[il].wo, cur);
        cb(cur, "attn_out", il);

        if (il == n_layer - 1 && inp_out_ids) {
            cur = ggml_get_rows(ctx0, cur, inp_out_ids);
            residual = ggml_get_rows(ctx0, residual, inp_out_ids);
        }
        cur = ggml_add(ctx0, cur, residual);
        ggml_tensor * ffn_residual = cur;
        cur = build_norm(cur, model.layers[il].attn_post_norm, nullptr, LLM_NORM_RMS, il);
        cur = build_moe_ffn(cur,
                model.layers[il].ffn_gate_inp,
                model.layers[il].ffn_up_exps,
                model.layers[il].ffn_gate_exps,
                model.layers[il].ffn_down_exps,
                nullptr,
                n_expert, n_expert_used,
                LLM_FFN_SILU, true,
                1.0f,
                LLAMA_EXPERT_GATING_FUNC_TYPE_SOFTMAX,
                il);
        cb(cur, "ffn_out", il);
        cur = ggml_add(ctx0, cur, ffn_residual);
        cur = build_cvec(cur, il);
        cb(cur, "l_out", il);
        inpL = cur;
    }

    ggml_tensor * cur = build_norm(inpL, model.output_norm, nullptr, LLM_NORM_RMS, -1);
    cb(cur, "result_norm", -1);
    res->t_embd = cur;
    cur = build_lora_mm(model.output, cur, model.output_s);
    cb(cur, "result_output", -1);
    res->t_logits = cur;
    ggml_build_forward_expand(gf, cur);
}
