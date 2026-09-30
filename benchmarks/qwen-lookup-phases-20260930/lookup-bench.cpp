#include "speculative.h"
#include <chrono>
#include <cstdio>
#include <cstdlib>

int main(int argc, char ** argv) {
    if (argc != 2) return 2;
    const int size = std::atoi(argv[1]);
    if (size < 8) return 2;
    common_params_speculative config;
    config.types = {COMMON_SPECULATIVE_TYPE_NGRAM_CACHE};
    common_speculative_ptr spec(common_speculative_init(config, 1));
    llama_tokens prompt;
    for (int i = 0; i < size; ++i) prompt.push_back(100 + i % 11);
    common_speculative_begin(spec.get(), 0, prompt);
    uint64_t hash = 1469598103934665603ULL;
    int drafted = 0;
    const auto start = std::chrono::steady_clock::now();
    for (int i = 0; i < 3000; ++i) {
        if (i % 12 == 0) prompt.push_back(100 + (int) prompt.size() % 11);
        llama_tokens result;
        auto & dp = common_speculative_get_draft_params(spec.get(), 0);
        dp.drafting = true;
        dp.n_max = 8;
        dp.id_last = 100 + (int) prompt.size() % 11;
        dp.prompt = &prompt;
        dp.result = &result;
        common_speculative_draft(spec.get());
        drafted += result.size();
        for (const auto token : result) hash = (hash ^ (uint32_t) token) * 1099511628211ULL;
        dp.prompt = nullptr;
        dp.result = nullptr;
    }
    const auto elapsed = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - start).count();
    std::printf("input=%d calls=3000 drafted=%d hash=%016llx total_us=%lld\n", size, drafted, (unsigned long long) hash, (long long) elapsed);
}
