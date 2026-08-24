#include "llama.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <vector>

static bool decode_prompt(llama_context * ctx, const std::array<llama_token, 15> & tokens, bool tokenwise) {
    if (!tokenwise) {
        llama_batch batch = llama_batch_init(tokens.size(), 0, 1);
        for (size_t i = 0; i < tokens.size(); ++i) {
            batch.token[i] = tokens[i];
            batch.pos[i] = i;
            batch.n_seq_id[i] = 1;
            batch.seq_id[i][0] = 0;
            batch.logits[i] = i + 1 == tokens.size();
        }
        batch.n_tokens = tokens.size();
        const bool ok = llama_decode(ctx, batch) == 0;
        llama_batch_free(batch);
        return ok;
    }

    for (size_t i = 0; i < tokens.size(); ++i) {
        llama_batch batch = llama_batch_init(1, 0, 1);
        batch.token[0] = tokens[i];
        batch.pos[0] = i;
        batch.n_seq_id[0] = 1;
        batch.seq_id[0][0] = 0;
        batch.logits[0] = i + 1 == tokens.size();
        batch.n_tokens = 1;
        const bool ok = llama_decode(ctx, batch) == 0;
        llama_batch_free(batch);
        if (!ok) {
            return false;
        }
    }
    return true;
}

int main(int argc, char ** argv) {
    if (argc != 2) {
        fprintf(stderr, "usage: %s MODEL\n", argv[0]);
        return 2;
    }

    const std::array<llama_token, 15> tokens = {
        151644, 872, 198, 5598, 1172, 25, 27223, 867, 151645, 198,
        151644, 77091, 198, 151667, 198,
    };

    llama_backend_init();
    llama_model * model = llama_model_load_from_file(argv[1], llama_model_default_params());
    if (!model) {
        return 1;
    }

    llama_context_params params = llama_context_default_params();
    params.n_ctx = 512;
    params.n_batch = 512;
    params.n_ubatch = 512;
    params.n_threads = 8;
    params.n_threads_batch = 8;
    params.flash_attn_type = LLAMA_FLASH_ATTN_TYPE_DISABLED;
    const bool cache_f32 = std::getenv("MAPLE_PARITY_CACHE_F32") != nullptr;
    params.type_k = cache_f32 ? GGML_TYPE_F32 : GGML_TYPE_F16;
    params.type_v = cache_f32 ? GGML_TYPE_F32 : GGML_TYPE_F16;

    llama_context * batched = llama_init_from_model(model, params);
    llama_context * tokenwise = llama_init_from_model(model, params);
    if (!batched || !tokenwise || !decode_prompt(batched, tokens, false) || !decode_prompt(tokenwise, tokens, true)) {
        return 1;
    }

    const size_t n_vocab = llama_vocab_n_tokens(llama_model_get_vocab(model));
    const float * a = llama_get_logits_ith(batched, -1);
    const float * b = llama_get_logits_ith(tokenwise, -1);
    if (!a || !b) {
        return 1;
    }

    double sum_sq = 0.0;
    double ref_sq = 0.0;
    double max_abs = 0.0;
    for (size_t i = 0; i < n_vocab; ++i) {
        const double diff = double(a[i]) - double(b[i]);
        sum_sq += diff * diff;
        ref_sq += double(a[i]) * double(a[i]);
        max_abs = std::max(max_abs, std::abs(diff));
    }
    const double rmse = std::sqrt(sum_sq / n_vocab);
    const double nrmse = std::sqrt(sum_sq / ref_sq);
    printf("count=%zu\nmax_abs=%.9g\nrmse=%.9g\nnrmse=%.9g\n", n_vocab, max_abs, rmse, nrmse);

    llama_free(tokenwise);
    llama_free(batched);
    llama_model_free(model);
    llama_backend_free();
    return 0;
}
