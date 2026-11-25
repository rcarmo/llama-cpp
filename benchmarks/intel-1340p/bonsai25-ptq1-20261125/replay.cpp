// Paired Bonsai CPU/Vulkan replay using the retained Inkling/Gemma token fixture.
#include "common.h"
#include "llama.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <cstring>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

using model_ptr = std::unique_ptr<llama_model, decltype(&llama_model_free)>;
using context_ptr = std::unique_ptr<llama_context, decltype(&llama_free)>;

static void require(bool ok, const char * message) {
    if (!ok) throw std::runtime_error(message);
}

static void decode(llama_context * ctx, const std::vector<llama_token> & tokens, int pos) {
    auto batch = llama_batch_init(tokens.size(), 0, 1);
    for (int i = 0; i < (int) tokens.size(); ++i) {
        batch.token[i] = tokens[i]; batch.pos[i] = pos + i;
        batch.n_seq_id[i] = 1; batch.seq_id[i][0] = 0;
        batch.logits[i] = i + 1 == (int) tokens.size();
    }
    batch.n_tokens = tokens.size();
    const bool trace = std::getenv("MOE_TRACE_PHASE") != nullptr;
    if (trace) std::fprintf(stderr, "REPLAY_PHASE begin tokens=%zu pos=%d\n", tokens.size(), pos);
    const int rc = llama_decode(ctx, batch);
    llama_batch_free(batch);
    require(rc == 0, "decode");
    llama_synchronize(ctx);
    if (trace) std::fprintf(stderr, "REPLAY_PHASE end tokens=%zu pos=%d\n", tokens.size(), pos);
}

static std::vector<uint8_t> save(llama_context * ctx) {
    const size_t size = llama_state_seq_get_size(ctx, 0);
    std::vector<uint8_t> data(size);
    require(size && llama_state_seq_get_data(ctx, data.data(), size, 0) == size, "save");
    return data;
}

static void restore(llama_context * ctx, const std::vector<uint8_t> & data) {
    require(llama_state_seq_set_data(ctx, data.data(), data.size(), 0) == data.size(), "restore");
}

static uint64_t compare(llama_context * a, llama_context * b, int n_vocab) {
    const auto * x = llama_get_logits(a);
    const auto * y = llama_get_logits(b);
    require(x && y, "logits");
    uint64_t hash = UINT64_C(1469598103934665603);
    for (int i = 0; i < n_vocab; ++i) {
        require(std::isfinite(x[i]) && std::isfinite(y[i]), "nonfinite logits");
        require(std::memcmp(x + i, y + i, sizeof(float)) == 0, "same-state CPU logit mismatch");
        uint32_t bits; std::memcpy(&bits, x + i, sizeof(bits));
        hash ^= bits; hash *= UINT64_C(1099511628211);
    }
    return hash;
}

static int setting(const char * name, int fallback) {
    const char * value = std::getenv(name);
    return value ? std::stoi(value) : fallback;
}

static llama_context_params context_params(bool gpu, int n_ctx, int cache_mib) {
    auto p = llama_context_default_params();
    p.n_ctx = n_ctx; p.n_batch = setting("MOE_BATCH",512); p.n_ubatch = 128;
    p.n_seq_max = 1; p.swa_full = false; p.n_threads = 4; p.n_threads_batch = 4;
    p.type_k = GGML_TYPE_F16; p.type_v = GGML_TYPE_F16;
    p.flash_attn_type = LLAMA_FLASH_ATTN_TYPE_DISABLED;
    p.offload_kqv = gpu; p.op_offload = setting("MOE_GPU_PREFILL", 0) != 0;
#ifdef FORK_GEMMA
    p.kv_cpu_shared = false;
    p.moe_cache_size = 0;
    p.sched_async_cpu = false;
#endif
    (void) cache_mib;
    p.n_threads = setting("FLINT_THREADS", 4);
    p.n_threads_batch = setting("FLINT_BATCH_THREADS", p.n_threads);
    p.n_ubatch = setting("FLINT_UBATCH", 128);
    if (setting("FLINT_FA", 0)) p.flash_attn_type = LLAMA_FLASH_ATTN_TYPE_ENABLED;
    return p;
}

class trial_threadpools {
    llama_context * ctx;
    decltype(ggml_threadpool_free) * pool_free = nullptr;
    ggml_threadpool_t pool = nullptr, batch_pool = nullptr;
public:
    explicit trial_threadpools(llama_context * context) : ctx(context) {}
    void attach() {
    auto cpu_reg = ggml_backend_reg_by_name("CPU"); require(cpu_reg != nullptr, "CPU backend");
    auto pool_new = (decltype(ggml_threadpool_new) *) ggml_backend_reg_get_proc_address(cpu_reg, "ggml_threadpool_new");
    pool_free = (decltype(ggml_threadpool_free) *) ggml_backend_reg_get_proc_address(cpu_reg, "ggml_threadpool_free");
    if (setting("FLINT_POOL", 0)) {
        require(pool_new && pool_free, "threadpool API");
        auto params = ggml_threadpool_params_default(setting("FLINT_THREADS", 4));
        params.poll = setting("MOE_POLL", 50);
        if (setting("FLINT_POOL", 0) == 2 || setting("FLINT_POOL",0) == 3) {
            const bool generic = setting("FLINT_POOL",0) == 3;
            require(generic || setting("FLINT_THREADS",4)==4, "four P-core worker mask");
            const char * mask_text = std::getenv("MOE_CPU_MASK");
            const uint64_t mask = generic && mask_text ? std::strtoull(mask_text,nullptr,0) : 0x55;
            require(__builtin_popcountll(mask) >= setting("FLINT_THREADS",4), "insufficient worker mask");
            for (int i=0;i<GGML_MAX_N_THREADS;++i) params.cpumask[i] = i<64 && ((mask>>i)&1);
            params.strict_cpu = setting("MOE_DECODE_STRICT",1) != 0;
            auto batch_params = ggml_threadpool_params_default(setting("FLINT_BATCH_THREADS",16));
            const char * batch_mask_text = std::getenv("MOE_BATCH_CPU_MASK");
            const uint64_t batch_mask = batch_mask_text ? std::strtoull(batch_mask_text, nullptr, 0) : 0xffff;
            require(__builtin_popcountll(batch_mask) >= setting("FLINT_BATCH_THREADS",16), "insufficient batch mask");
            for (int i = 0; i < GGML_MAX_N_THREADS; ++i) batch_params.cpumask[i] = i < 64 && ((batch_mask >> i) & 1);
            batch_params.poll = setting("MOE_BATCH_POLL", setting("MOE_POLL",50)); batch_params.strict_cpu = generic;
            batch_pool = pool_new(&batch_params); require(batch_pool != nullptr, "batch threadpool allocation");
        }
        pool = pool_new(&params); require(pool != nullptr, "threadpool allocation");
        llama_attach_threadpool(ctx, pool, batch_pool);
    }

    }
    ~trial_threadpools() {
        if (pool) { llama_detach_threadpool(ctx); pool_free(pool); }
        if (batch_pool) pool_free(batch_pool);
    }
};

static void benchmark(llama_context * ctx, const llama_model * model, const llama_vocab * vocab, bool gpu, int cache_mib) {
    const int count = setting("FLINT_PROMPT", 512), generated = setting("FLINT_DECODE", 64), reps = setting("FLINT_REPS", 2);
    require(count >= 32 && count + generated < setting("MOE_CONTEXT",2048) && count <= 8192 && generated <= 512 && generated > 0 && reps > 0 && reps <= 4, "benchmark bounds");
    std::string text;
    const std::string fixture = "// Stable deduplication and verification.\nfunction uniqueStable(items) {\n  const seen = new Set();\n  return items.filter(item => {\n    if (seen.has(item)) return false;\n    seen.add(item);\n    return true;\n  });\n}\nconst input = [3, 1, 3, 2, 1];\nconst expected = [3, 1, 2];\nconsole.assert(JSON.stringify(uniqueStable(input)) === JSON.stringify(expected));\nExplain why insertion order and identity are preserved.\n";
    while (text.size() < size_t(count + generated) * 10) text += fixture;
    auto tokens = common_tokenize(vocab, text, true, true);
    require(tokens.size() >= size_t(count + generated), "fixture length");
    uint64_t token_hash = UINT64_C(1469598103934665603);
    for (int i=0;i<count+generated;++i) { token_hash ^= uint64_t(tokens[i]); token_hash *= UINT64_C(1099511628211); }
    std::printf("TOKEN_STREAM_HASH hash=%llu tokens=%d\n", (unsigned long long)token_hash, count+generated);
    const int n_vocab = llama_vocab_n_tokens(vocab);
    auto finite = [&]() {
        const auto * logits = llama_get_logits(ctx); require(logits != nullptr, "benchmark logits");
        for (int i = 0; i < n_vocab; ++i) require(std::isfinite(logits[i]), "benchmark nonfinite logits");
    };
    trial_threadpools pools(ctx); pools.attach();
    const char * dump_path = std::getenv("MOE_DUMP_LOGITS");
    std::ofstream dump;
    if (dump_path) { dump.open(dump_path, std::ios::binary); require(bool(dump), "logit dump open"); }
    std::printf("TUNING_CONFIG decode_mask=%s batch_mask=%s poll=%d batch_poll=%d\n", std::getenv("MOE_CPU_MASK") ? std::getenv("MOE_CPU_MASK") : "default", std::getenv("MOE_BATCH_CPU_MASK") ? std::getenv("MOE_BATCH_CPU_MASK") : "0xffff", setting("MOE_POLL",50), setting("MOE_BATCH_POLL",setting("MOE_POLL",50)));
    std::printf("BENCH_CONFIG mode=%s cache_mib=%d threads=%d batch_threads=%d ubatch=%d fa=%d pool=%d async=%d prompt=%d decode=%d reps=%d\n", gpu ? "vulkan" : "cpu", cache_mib, setting("FLINT_THREADS",4), setting("FLINT_BATCH_THREADS",setting("FLINT_THREADS",4)), setting("FLINT_UBATCH",128), setting("FLINT_FA",0), setting("FLINT_POOL",0), setting("FLINT_ASYNC",0), count, generated, reps);
    std::fflush(stdout);
    if (!setting("BONSAI_NO_WARMUP",0)) {
    for(int pos=0;pos<count;pos+=setting("MOE_BATCH",512)){const int end=std::min(pos+setting("MOE_BATCH",512),count);decode(ctx,{tokens.begin()+pos,tokens.begin()+end},pos);finite();} for(int i=0;i<generated;++i){decode(ctx,{tokens[count+i]},count+i);finite();} std::printf("WORKLOAD_WARMUP_COMPLETE\n");
    }
    for (int rep = 0; rep < reps; ++rep) {
        llama_memory_clear(llama_get_memory(ctx), true);
        const auto start = llama_time_us();
        for (int pos = 0; pos < count; pos += setting("MOE_BATCH",512)) {
            const int end = std::min(pos + setting("MOE_BATCH",512), count);
            decode(ctx, {tokens.begin()+pos, tokens.begin()+end}, pos);
        }
        const auto prefilled = llama_time_us(); finite();
        std::vector<int> argmaxes; argmaxes.reserve(generated);
        int64_t decode_us = 0; uint64_t hash = UINT64_C(1469598103934665603), logits_hash = UINT64_C(1469598103934665603);
        for (int i = 0; i < generated; ++i) {
            const auto step_start = llama_time_us();
            decode(ctx, {tokens[count+i]}, count+i);
            decode_us += llama_time_us()-step_start;
            finite();
            const auto * logits = llama_get_logits(ctx);
            if (dump && rep == 0 && i < 8) dump.write(reinterpret_cast<const char *>(logits), n_vocab * sizeof(float));
            for(int j=0;j<n_vocab;++j){uint32_t bits;std::memcpy(&bits,logits+j,sizeof(bits));logits_hash ^= bits;logits_hash *= UINT64_C(1099511628211);}
            const int best = std::max_element(logits, logits+n_vocab)-logits;
            argmaxes.push_back(best);
            hash ^= uint64_t(best); hash *= UINT64_C(1099511628211);
        }
        const auto done = llama_time_us();
        const double pp_ms = double(prefilled-start)/1000, tg_ms = double(decode_us)/1000;
        std::printf("BENCH_RESULT rep=%d prompt=%d generated=%d pp_ms=%.3f tg_ms=%.3f pp_tps=%.6f tg_tps=%.6f wall_ms=%.3f hash=%llu finite=1\n", rep, count, generated, pp_ms, tg_ms, count*1000/pp_ms, generated*1000/tg_ms, double(done-start)/1000, (unsigned long long)hash);
        std::printf("LOGITS_HASH rep=%d hash=%llu\n",rep,(unsigned long long)logits_hash);
        std::printf("ARGMAX_SEQUENCE rep=%d values=", rep);
        for (size_t i = 0; i < argmaxes.size(); ++i) std::printf("%s%d", i ? "," : "", argmaxes[i]);
        std::printf("\n");
        std::fflush(stdout);
    }
    (void) model;
}


int main(int argc, char ** argv) {
    if (argc != 2) return 2;
    try {
        const bool gpu = setting("BONSAI_USE_GPU", 0) != 0;
        ggml_backend_load_all(); llama_backend_init();
        ggml_backend_dev_t devices[] = {gpu ? ggml_backend_dev_by_name("Vulkan0") : nullptr, nullptr};
        require(!gpu || devices[0], "Vulkan0 unavailable");
        auto mp=llama_model_default_params();
        mp.devices=devices; mp.n_gpu_layers=gpu ? -1 : 0; mp.no_host=true; mp.use_extra_bufts=false;
        std::printf("PLACEMENT gpu=%d requested=%s\n", gpu, gpu ? "Vulkan0" : "CPU");
        mp.load_mode=LLAMA_LOAD_MODE_MMAP;
        std::string repack_pattern;
        llama_model_tensor_buft_override overrides[2] = {};
        if (const char * pattern = std::getenv("MOE_REPACK_PATTERN")) {
            repack_pattern = pattern;
            auto reg = ggml_backend_reg_by_name("CPU");
            auto extras = reinterpret_cast<ggml_backend_dev_get_extra_bufts_t>(ggml_backend_reg_get_proc_address(reg, "ggml_backend_dev_get_extra_bufts"));
            require(extras != nullptr, "extra buffer API");
            for (auto * b = extras(ggml_backend_reg_dev_get(reg,0)); b && *b; ++b) {
                if (std::strcmp(ggml_backend_buft_name(*b), "CPU_REPACK") == 0) overrides[0] = {repack_pattern.c_str(), *b};
            }
            require(overrides[0].buft != nullptr, "CPU_REPACK unavailable");
            mp.tensor_buft_overrides = overrides;
            std::printf("REPACK_CONFIG pattern=%s\n", repack_pattern.c_str());
        }
        model_ptr model(llama_model_load_from_file(argv[1],mp),llama_model_free);
        require(bool(model),"model load");
        std::printf("MODEL_ID layers=%d vocab=%d context=%d\n",llama_model_n_layer(model.get()),llama_vocab_n_tokens(llama_model_get_vocab(model.get())),setting("MOE_CONTEXT",8192));
        auto cp=context_params(gpu,setting("MOE_CONTEXT",8192),0);
        context_ptr ctx(llama_init_from_model(model.get(),cp),llama_free);
        require(bool(ctx),"context");
        benchmark(ctx.get(),model.get(),llama_model_get_vocab(model.get()),gpu,0);
        ctx.reset();model.reset();llama_backend_free();
        std::puts("RESULT PASS finite replay");return 0;
    } catch(const std::exception &e) { std::fprintf(stderr,"RESULT FAIL %s\n",e.what());return 1; }
}
