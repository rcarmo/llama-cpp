#include "ggml-backend.h"
#include "ggml.h"
#include "llama.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

struct capture_state {
    std::filesystem::path output_dir;
    std::ofstream manifest;
};

static bool capture_name(const char * name) {
    static const std::array<const char *, 10> prefixes = {
        "embd", "Qcur-", "Kcur-", "Vcur-", "kq_soft_max-",
        "ffn_moe_logits-", "ffn_moe_topk-", "ffn_moe_weights_norm-",
        "l_out-", "result_norm",
    };
    for (const char * prefix : prefixes) {
        if (strncmp(name, prefix, strlen(prefix)) == 0) {
            return true;
        }
    }
    return false;
}

static std::string safe_name(const char * name) {
    std::string result(name);
    for (char & c : result) {
        if (!std::isalnum(static_cast<unsigned char>(c)) && c != '-' && c != '_') {
            c = '_';
        }
    }
    return result;
}

static bool capture_tensor(ggml_tensor * tensor, bool ask, void * user_data) {
    if (ask) {
        return capture_name(tensor->name);
    }
    if (!capture_name(tensor->name)) {
        return true;
    }

    auto * state = static_cast<capture_state *>(user_data);
    const std::string filename = safe_name(tensor->name) + ".bin";
    const auto path = state->output_dir / filename;
    std::vector<uint8_t> data(ggml_nbytes(tensor));
    ggml_backend_tensor_get(tensor, data.data(), 0, data.size());
    std::ofstream output(path, std::ios::binary);
    output.write(reinterpret_cast<const char *>(data.data()), data.size());
    output.close();

    state->manifest << tensor->name << '\t' << ggml_type_name(tensor->type);
    for (int i = 0; i < GGML_MAX_DIMS; ++i) {
        state->manifest << '\t' << tensor->ne[i];
    }
    state->manifest << '\t' << filename << '\n';
    return true;
}

int main(int argc, char ** argv) {
    if (argc != 3 && argc != 4) {
        fprintf(stderr, "usage: %s MODEL OUTPUT_DIR [EMBEDDING_F32]\n", argv[0]);
        return 2;
    }

    const std::array<llama_token, 15> reference_tokens = {
        151644, 872, 198, 5598, 1172, 25, 27223, 867, 151645, 198,
        151644, 77091, 198, 151667, 198,
    };
    const std::string rendered = "<|im_start|>user\nReturn only: MAPLE<|im_end|>\n<|im_start|>assistant\n<think>\n";

    capture_state state;
    state.output_dir = argv[2];
    std::filesystem::create_directories(state.output_dir);
    state.manifest.open(state.output_dir / "manifest.tsv");
    if (!state.manifest) {
        fprintf(stderr, "failed to create output manifest\n");
        return 2;
    }

    llama_backend_init();

    llama_model_params model_params = llama_model_default_params();
    llama_model * model = llama_model_load_from_file(argv[1], model_params);
    if (!model) {
        fprintf(stderr, "failed to load model\n");
        return 1;
    }

    const llama_vocab * vocab = llama_model_get_vocab(model);
    const int32_t token_count = -llama_tokenize(vocab, rendered.data(), rendered.size(), nullptr, 0, false, true);
    std::vector<llama_token> tokenized(token_count);
    if (llama_tokenize(vocab, rendered.data(), rendered.size(), tokenized.data(), tokenized.size(), false, true) < 0 ||
            tokenized.size() != reference_tokens.size() ||
            !std::equal(tokenized.begin(), tokenized.end(), reference_tokens.begin())) {
        fprintf(stderr, "tokenizer parity failed\n");
        llama_model_free(model);
        llama_backend_free();
        return 1;
    }

    llama_context_params context_params = llama_context_default_params();
    context_params.n_ctx = 512;
    context_params.n_batch = 512;
    context_params.n_ubatch = 512;
    context_params.n_threads = 8;
    context_params.n_threads_batch = 8;
    context_params.flash_attn_type = LLAMA_FLASH_ATTN_TYPE_DISABLED;
    const bool cache_f32 = std::getenv("MAPLE_PARITY_CACHE_F32") != nullptr;
    context_params.type_k = cache_f32 ? GGML_TYPE_F32 : GGML_TYPE_F16;
    context_params.type_v = cache_f32 ? GGML_TYPE_F32 : GGML_TYPE_F16;
    context_params.embeddings = true;
    context_params.cb_eval = capture_tensor;
    context_params.cb_eval_user_data = &state;

    llama_context * context = llama_init_from_model(model, context_params);
    if (!context) {
        fprintf(stderr, "failed to create context\n");
        llama_model_free(model);
        llama_backend_free();
        return 1;
    }

    const bool use_embedding = argc == 4;
    llama_batch batch = llama_batch_init(reference_tokens.size(), use_embedding ? llama_model_n_embd(model) : 0, 1);
    if (use_embedding) {
        std::ifstream embedding_input(argv[3], std::ios::binary);
        embedding_input.read(reinterpret_cast<char *>(batch.embd),
                reference_tokens.size() * llama_model_n_embd(model) * sizeof(float));
        if (!embedding_input || embedding_input.peek() != std::ifstream::traits_type::eof()) {
            fprintf(stderr, "invalid embedding input\n");
            return 1;
        }
    }
    for (size_t i = 0; i < reference_tokens.size(); ++i) {
        if (!use_embedding) {
            batch.token[i] = reference_tokens[i];
        }
        batch.pos[i] = i;
        batch.n_seq_id[i] = 1;
        batch.seq_id[i][0] = 0;
        batch.logits[i] = true;
    }
    batch.n_tokens = reference_tokens.size();

    if (llama_decode(context, batch) != 0) {
        fprintf(stderr, "decode failed\n");
        llama_batch_free(batch);
        llama_free(context);
        llama_model_free(model);
        llama_backend_free();
        return 1;
    }

    const uint32_t n_vocab = llama_vocab_n_tokens(vocab);
    std::ofstream logits_output(state.output_dir / "logits.bin", std::ios::binary);
    std::ofstream hidden_output(state.output_dir / "final_hidden.bin", std::ios::binary);
    for (size_t i = 0; i < reference_tokens.size(); ++i) {
        const float * logits = llama_get_logits_ith(context, i);
        const float * hidden = llama_get_embeddings_ith(context, i);
        if (!logits || !hidden) {
            fprintf(stderr, "missing output at token %zu\n", i);
            return 1;
        }
        logits_output.write(reinterpret_cast<const char *>(logits), n_vocab * sizeof(float));
        hidden_output.write(reinterpret_cast<const char *>(hidden), llama_model_n_embd_out(model) * sizeof(float));
    }
    state.manifest << "logits\tf32\t" << n_vocab << '\t' << reference_tokens.size() << "\t1\t1\tlogits.bin\n";
    state.manifest << "final_hidden\tf32\t" << llama_model_n_embd_out(model) << '\t' << reference_tokens.size() << "\t1\t1\tfinal_hidden.bin\n";

    llama_batch_free(batch);
    llama_free(context);
    llama_model_free(model);
    llama_backend_free();
    return 0;
}
