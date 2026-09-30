#include "ngram-cache.h"
#include "llama.h"

#include <algorithm>
#include <cstdlib>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <string>
#include <utility>
#include <vector>

static std::vector<llama_token> tokens_for_model(const char * model_path) {
    const std::string text = "The quick brown fox jumps over the lazy dog. Gemma can process a repeated prompt with several candidate completions. "
                             "The quick brown fox jumps over the lazy dog. The next paragraph repeats the prompt with small changes. ";
    if (!model_path) {
        std::vector<llama_token> tokens;
        for (size_t i = 0; i < text.size(); ++i) {
            tokens.push_back((llama_token) (10 + (unsigned char) text[i]));
        }
        return tokens;
    }

    auto params = llama_model_default_params();
    params.vocab_only = true;
    params.n_gpu_layers = 0;
    llama_model * model = llama_model_load_from_file(model_path, params);
    if (!model) {
        std::fprintf(stderr, "could not load Gemma vocabulary\n");
        std::exit(2);
    }
    const llama_vocab * vocab = llama_model_get_vocab(model);
    int32_t n = -llama_tokenize(vocab, text.data(), (int32_t) text.size(), nullptr, 0, true, false);
    if (n <= 0) {
        std::fprintf(stderr, "could not count Gemma tokens\n");
        std::exit(2);
    }
    std::vector<llama_token> tokens(n);
    if (llama_tokenize(vocab, text.data(), (int32_t) text.size(), tokens.data(), n, true, false) != n) {
        std::fprintf(stderr, "could not tokenize Gemma fixture\n");
        std::exit(2);
    }
    std::printf("vocab=%d fixture_tokens=%d first=%d,%d,%d,%d\n", llama_vocab_n_tokens(vocab), n,
                tokens[0], tokens[1], tokens[2], tokens[3]);
    llama_model_free(model);
    return tokens;
}

static uint64_t hash_cache(const common_ngram_cache & cache) {
    std::vector<std::pair<common_ngram, common_ngram_cache_part>> ordered(cache.begin(), cache.end());
    std::sort(ordered.begin(), ordered.end(), [](const auto & a, const auto & b) {
        return std::lexicographical_compare(a.first.tokens, a.first.tokens + LLAMA_NGRAM_MAX,
                                            b.first.tokens, b.first.tokens + LLAMA_NGRAM_MAX);
    });
    uint64_t result = UINT64_C(1469598103934665603);
    for (const auto & entry : ordered) {
        for (const auto token : entry.first.tokens) {
            result = (result ^ (uint32_t) token) * UINT64_C(1099511628211);
        }
        std::vector<std::pair<llama_token, int32_t>> followers(entry.second.begin(), entry.second.end());
        std::sort(followers.begin(), followers.end());
        for (const auto & follower : followers) {
            result = (result ^ (uint32_t) follower.first) * UINT64_C(1099511628211);
            result = (result ^ (uint32_t) follower.second) * UINT64_C(1099511628211);
        }
    }
    return result;
}

static bool test_follower_container() {
    common_ngram_cache_part part;
    const std::vector<llama_token> keys = {999, 1, 4096, 17, 512, 3, 128, 42};
    for (const auto key : keys) part.emplace(key, key + 1);
    part.emplace(17, 9000);
    const auto duplicate = part.find(17);
    if (part.size() != keys.size() || duplicate == part.end() || duplicate->second != 18) return false;
    const auto & const_part = part;
    for (int token = -1; token <= 4097; ++token) {
        const bool present = std::find(keys.begin(), keys.end(), token) != keys.end();
        auto it = const_part.find(token);
        if ((it != const_part.end()) != present || (present && it->second != token + 1)) return false;
    }
    part.erase(part.find(17));
    if (part.find(17) != part.end() || part.size() != keys.size() - 1) return false;
    part.emplace(17, 5);
    if (part.find(17) == part.end() || part.find(17)->second != 5) return false;
    // Odd sizes and power-of-two boundaries exercise the fixed-length search.
    for (int n = 0; n <= 257; ++n) {
        common_ngram_cache_part values;
        for (int i = n - 1; i >= 0; --i) values.emplace(3 * i, i + 1);
        const auto & const_values = values;
        for (int token = -1; token <= 3 * n; ++token) {
            const bool present = token >= 0 && token % 3 == 0 && token / 3 < n;
            auto it = const_values.find(token);
            if ((it != const_values.end()) != present || (present && it->second != token / 3 + 1)) return false;
        }
    }
    return true;
}

static bool test_legacy_ties_and_duplicates() {
    const llama_token prefix[] = {41, 42};
    const common_ngram key(prefix, 2);
    const auto path = std::filesystem::temp_directory_path() /
        ("llama-ngram-legacy-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()) + ".bin");
    // Legacy records may arrive unsorted; duplicate insertion keeps the first count.
    const int32_t size = 3;
    const llama_token tokens[] = {9, 3, 9};
    const int32_t counts[] = {256, 256, 999};
    {
        std::ofstream file(path, std::ios::binary);
        file.write(reinterpret_cast<const char *>(&key), sizeof(key));
        file.write(reinterpret_cast<const char *>(&size), sizeof(size));
        for (int i = 0; i < size; ++i) {
            file.write(reinterpret_cast<const char *>(&tokens[i]), sizeof(tokens[i]));
            file.write(reinterpret_cast<const char *>(&counts[i]), sizeof(counts[i]));
        }
    }
    auto cache = common_ngram_cache_load(path.string());
    std::filesystem::remove(path);
    auto it = cache.find(key);
    if (cache.size() != 1 || it == cache.end() || it->second.size() != 2) return false;
    const auto high = it->second.find(9);
    const auto low = it->second.find(3);
    if (high == it->second.end() || low == it->second.end() || high->second != 256 || low->second != 256) return false;
    common_ngram_cache context, dynamic;
    std::vector<llama_token> input = {41, 42};
    std::vector<llama_token> draft = {42};
    common_ngram_cache_draft(input, draft, 1, 1, 2, context, dynamic, cache);
    if (draft.size() != 2 || draft[1] != 3) return false;
    // The primary-cache scoring path uses the same lowest-token tie rule.
    common_ngram_cache_merge(context, cache);
    draft = {42};
    common_ngram_cache_draft(input, draft, 1, 1, 2, context, dynamic, cache);
    if (draft.size() != 2 || draft[1] != 3) return false;
    common_ngram_cache_save(cache, path.string());
    auto reloaded = common_ngram_cache_load(path.string());
    std::filesystem::remove(path);
    return hash_cache(cache) == hash_cache(reloaded);
}

int main(int argc, char ** argv) {
    if (argc > 2) {
        std::fprintf(stderr, "usage: %s [MODEL.gguf]\n", argv[0]);
        return 2;
    }
    if (!test_follower_container() || !test_legacy_ties_and_duplicates()) {
        std::fprintf(stderr, "follower container or legacy tie/duplicate regression failed\n");
        return 1;
    }
    const auto pattern = tokens_for_model(argc == 2 ? argv[1] : nullptr);
    std::vector<llama_token> corpus;
    for (int i = 0; i < 256; ++i) {
        corpus.insert(corpus.end(), pattern.begin(), pattern.end());
        corpus.push_back(pattern[i % pattern.size()]);
    }
    const llama_token prefix0 = pattern[2];
    const llama_token prefix1 = pattern[3];
    for (int i = 0; i < 4096; ++i) {
        for (int repetition = 0; repetition < 2; ++repetition) {
            corpus.insert(corpus.end(), {prefix0, prefix1, (llama_token) (1000 + i)});
        }
    }
    for (int i = 0; i < 10000; ++i) {
        corpus.insert(corpus.end(), {prefix0, prefix1, (llama_token) 1000});
    }

    common_ngram_cache cache_static;
    const auto load_start = std::chrono::steady_clock::now();
    common_ngram_cache_update(cache_static, LLAMA_NGRAM_STATIC, LLAMA_NGRAM_STATIC, corpus, (int) corpus.size(), false);
    const auto path = std::filesystem::temp_directory_path() /
        ("llama-ngram-test-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()) + ".bin");
    common_ngram_cache_save(cache_static, path.string());
    auto cache_loaded = common_ngram_cache_load(path.string());
    std::filesystem::remove(path);
    if (hash_cache(cache_static) != hash_cache(cache_loaded)) {
        std::fprintf(stderr, "static cache round-trip mismatch\n");
        return 1;
    }
    const auto load_us = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - load_start).count();

    common_ngram_cache empty_context, empty_dynamic, weak_context;
    std::vector<llama_token> fanout_input = {prefix0, prefix1};
    std::vector<llama_token> weak_corpus;
    for (int i = 0; i < 2048; ++i) {
        weak_corpus.insert(weak_corpus.end(), {prefix0, prefix1, (llama_token) (1000 + i)});
    }
    common_ngram_cache_update(weak_context, LLAMA_NGRAM_MIN, LLAMA_NGRAM_MAX, weak_corpus, (int) weak_corpus.size(), false);
    const llama_token ngram_key[] = {prefix0, prefix1};
    auto part = weak_context.find(common_ngram(ngram_key, 2));
    if (part == weak_context.end() || part->second.size() != 2048) {
        std::fprintf(stderr, "weak-context follower count mismatch\n");
        return 1;
    }
    const auto existing = part->second.find(1000);
    if (existing == part->second.end()) {
        std::fprintf(stderr, "weak-context follower missing\n");
        return 1;
    }
    part->second.erase(existing);
    part->second.emplace(9000, 1);
    llama_token fanout_result = LLAMA_TOKEN_NULL;
    const auto fanout_start = std::chrono::steady_clock::now();
    for (int i = 0; i < 2000; ++i) {
        std::vector<llama_token> draft = {prefix1};
        common_ngram_cache_draft(fanout_input, draft, 1, LLAMA_NGRAM_MIN, LLAMA_NGRAM_MAX, empty_context, empty_dynamic, cache_loaded);
        if (draft.size() != 2 || draft[1] != 1000) {
            std::fprintf(stderr, "static high-fanout draft mismatch: %zu\n", draft.size());
            return 1;
        }
        fanout_result = draft[1];
    }
    const auto fanout_us = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - fanout_start).count();
    const auto weak_start = std::chrono::steady_clock::now();
    for (int i = 0; i < 2000; ++i) {
        std::vector<llama_token> draft = {prefix1};
        common_ngram_cache_draft(fanout_input, draft, 1, LLAMA_NGRAM_MIN, LLAMA_NGRAM_MAX, weak_context, empty_dynamic, cache_loaded);
        if (draft.size() != 2 || draft[1] != 1000) {
            std::fprintf(stderr, "weak-context draft mismatch: %zu\n", draft.size());
            return 1;
        }
    }
    const auto weak_us = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - weak_start).count();

    common_ngram_cache cache_context, cache_dynamic;
    std::vector<llama_token> input(pattern.begin(), pattern.end());
    common_ngram_cache_update(cache_context, LLAMA_NGRAM_MIN, LLAMA_NGRAM_MAX, input, (int) input.size(), false);
    common_ngram_cache_merge(cache_dynamic, cache_context);
    if (hash_cache(cache_context) != hash_cache(cache_dynamic)) {
        std::fprintf(stderr, "dynamic cache merge mismatch\n");
        return 1;
    }

    uint64_t draft_hash = UINT64_C(1469598103934665603);
    int drafted = 0;
    const auto draft_start = std::chrono::steady_clock::now();
    for (int i = 0; i < 3000; ++i) {
        std::vector<llama_token> draft = { input.back() };
        common_ngram_cache_draft(input, draft, 4, LLAMA_NGRAM_MIN, LLAMA_NGRAM_MAX, cache_context, cache_dynamic, cache_loaded);
        drafted += (int) draft.size() - 1;
        for (size_t j = 1; j < draft.size(); ++j) {
            draft_hash = (draft_hash ^ (uint32_t) draft[j]) * UINT64_C(1099511628211);
        }
        input.push_back(pattern[i % pattern.size()]);
        common_ngram_cache_update(cache_context, LLAMA_NGRAM_MIN, LLAMA_NGRAM_MAX, input, 1, false);
        if ((i + 1) % 1000 == 0) {
            common_ngram_cache_merge(cache_dynamic, cache_context);
            cache_context.clear();
        }
    }
    const auto draft_us = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - draft_start).count();
    std::printf("static_entries=%zu static_hash=%016llx dynamic_hash=%016llx drafted=%d draft_hash=%016llx fanout_result=%d load_us=%lld draft_us=%lld fanout_us=%lld weak_us=%lld\n",
                cache_loaded.size(), (unsigned long long) hash_cache(cache_loaded), (unsigned long long) hash_cache(cache_dynamic),
                drafted, (unsigned long long) draft_hash, fanout_result, (long long) load_us, (long long) draft_us, (long long) fanout_us, (long long) weak_us);
    return 0;
}
