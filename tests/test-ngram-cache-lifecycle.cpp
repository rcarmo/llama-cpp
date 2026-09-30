#include "ngram-cache.h"
#include "speculative.h"

#include <algorithm>
#include <cstdio>
#include <vector>

static llama_tokens reference_draft(const llama_tokens & input, int limit) {
    common_ngram_cache context, dynamic, cache_static;
    auto tokens = input;
    common_ngram_cache_update(context, LLAMA_NGRAM_MIN, LLAMA_NGRAM_MAX, tokens, (int) tokens.size(), false);
    llama_tokens result = {input.back()};
    common_ngram_cache_draft(tokens, result, limit, LLAMA_NGRAM_MIN, LLAMA_NGRAM_MAX,
                            context, dynamic, cache_static);
    result.erase(result.begin());
    return result;
}

static bool compare_draft(common_speculative * spec, llama_seq_id seq, const llama_tokens & input,
                          int limit, const char * name) {
    llama_tokens prompt(input.begin(), input.end() - 1), result;
    auto & params = common_speculative_get_draft_params(spec, seq);
    params.drafting = true;
    params.prompt = &prompt;
    params.id_last = input.back();
    params.result = &result;
    params.n_max = limit;
    common_speculative_draft(spec);
    const auto expected = reference_draft(input, limit < 0 ? 8 : limit);
    if (result != expected) {
        std::fprintf(stderr, "%s seq=%d input=%zu limit=%d expected:", name, seq, input.size(), limit);
        for (const auto token : expected) std::fprintf(stderr, " %d", token);
        std::fprintf(stderr, "; actual:");
        for (const auto token : result) std::fprintf(stderr, " %d", token);
        std::fprintf(stderr, "\n");
        return false;
    }
    // Public draft params hold caller-owned pointers only for this synchronous call.
    params.prompt = nullptr;
    params.result = nullptr;
    return true;
}

static llama_tokens repetition(llama_token offset, int repeats) {
    llama_tokens input;
    for (int i = 0; i < repeats; ++i) {
        for (int j = 1; j <= 6; ++j) input.push_back(offset + j);
    }
    return input;
}

int main() {
    common_params_speculative params;
    params.types = {COMMON_SPECULATIVE_TYPE_NGRAM_CACHE};
    common_speculative_ptr spec(common_speculative_init(params, 2));
    if (!spec) return 1;
    auto input = repetition(0, 8);
    common_speculative_begin(spec.get(), 0, {});
    if (!compare_draft(spec.get(), 0, input, -1, "initial")) return 1;
    // Appended suffixes must include n-grams crossing the old/new boundary.
    for (int i = 0; i < 25; ++i) {
        input.push_back(i % 6 + 1);
        if (!compare_draft(spec.get(), 0, input, -1, "append")) return 1;
    }
    if (!compare_draft(spec.get(), 0, input, -1, "unchanged input")) return 1;
    auto changed_last = input;
    changed_last.back() = 99;
    if (!compare_draft(spec.get(), 0, changed_last, -1, "last token rewrite")) return 1;
    if (!compare_draft(spec.get(), 0, input, -1, "restore last token")) return 1;
    auto second = repetition(100, 4);
    common_speculative_begin(spec.get(), 0, second);
    if (!compare_draft(spec.get(), 0, second, -1, "new shorter request")) return 1;
    auto third = repetition(200, 4);
    if (!compare_draft(spec.get(), 0, third, -1, "same-length rewrite")) return 1;
    auto divergent = repetition(300, 6);
    if (!compare_draft(spec.get(), 0, divergent, -1, "longer divergent rewrite")) return 1;
    divergent.resize(17);
    if (!compare_draft(spec.get(), 0, divergent, -1, "rollback/truncate")) return 1;
    auto shifted = repetition(400, 8);
    common_speculative_begin(spec.get(), 0, shifted);
    shifted.erase(shifted.begin(), shifted.begin() + 11);
    if (!compare_draft(spec.get(), 0, shifted, -1, "context shift")) return 1;
    common_speculative_begin(spec.get(), 1, third);
    if (!compare_draft(spec.get(), 1, third, -1, "second sequence")) return 1;
    if (!compare_draft(spec.get(), 0, shifted, -1, "sequence isolation")) return 1;
    if (!compare_draft(spec.get(), 0, shifted, 2, "draft cap")) return 1;
    if (!compare_draft(spec.get(), 0, shifted, 0, "zero draft cap")) return 1;
    // A prefix-only first update followed by a short suffix must match full rebuild.
    auto prefix = repetition(500, 2);
    common_speculative_begin(spec.get(), 0, prefix);
    for (int i = 0; i < 30; ++i) {
        prefix.push_back(i % 6 + 501);
        if (!compare_draft(spec.get(), 0, prefix, 8, "boundary updates")) return 1;
    }
    // Changing follower distributions exercise updates that a repeated cycle can hide.
    llama_tokens varied = {701, 702, 703, 701, 702, 704, 701, 702};
    common_speculative_begin(spec.get(), 0, varied);
    for (int i = 0; i < 160; ++i) {
        varied.push_back(701 + ((i * 7 + i / 9) % 5));
        if (!compare_draft(spec.get(), 0, varied, 8, "varied append")) return 1;
    }
    llama_tokens tiny = {901};
    common_speculative_begin(spec.get(), 0, {});
    if (!compare_draft(spec.get(), 0, tiny, 8, "single token")) return 1;
    tiny.push_back(902);
    if (!compare_draft(spec.get(), 0, tiny, 8, "two tokens")) return 1;
    // Each edit must give the same result as rebuilding the confirmed token stream.
    for (int i = 0; i < 300; ++i) {
        switch (i % 7) {
            case 0: tiny.push_back(901 + i % 5); break;
            case 1: tiny.back() = 906 + i % 3; break;
            case 2: tiny.insert(tiny.end(), {901, 902, 903, 901, 902}); break;
            case 3: tiny[0] = 920 + i % 4; break;
            case 4: tiny.resize(std::max<size_t>(1, tiny.size() / 2)); break;
            case 5: common_speculative_begin(spec.get(), 0, tiny); break;
            case 6: if (tiny.size() > 3) tiny.erase(tiny.begin(), tiny.begin() + 2); break;
        }
        if (!compare_draft(spec.get(), 0, tiny, i % 4, "mixed edits")) return 1;
    }
    std::puts("ngram lifecycle: reset/append/rewrite/rollback/shift/two-sequence/limits PASS");
    return 0;
}
