#include "../ggml/src/ggml-prefetch-budget.h"
#include "ggml.h"
#include <cstdio>
#include <initializer_list>

int main() {
    size_t bytes = 123;
    GGML_ASSERT(ggml_prefetch_parse_mib("0", bytes) && bytes == 0);
    GGML_ASSERT(ggml_prefetch_parse_mib("256", bytes) && bytes == 256 * 1024 * 1024);
    for (const char * bad : {"", "-1", " 1", "1x", "1.5", "18446744073709551615"}) {
        GGML_ASSERT(!ggml_prefetch_parse_mib(bad, bytes));
    }
    GGML_ASSERT(!ggml_prefetch_parse_mib(nullptr, bytes));
    const size_t empty[] = {0,0,0};
    GGML_ASSERT(ggml_prefetch_budget_fits(empty,3,100,300,400,100));
    GGML_ASSERT(!ggml_prefetch_budget_fits(empty,3,100,299,400,100));
    GGML_ASSERT(!ggml_prefetch_budget_fits(empty,3,100,300,399,100));
    GGML_ASSERT(!ggml_prefetch_budget_fits(empty,3,100,300,99,100));
    const size_t old[] = {80,80,80};
    // Peak final replacement is 280 + 100, not 240 + 3*100.
    GGML_ASSERT(ggml_prefetch_budget_fits(old,3,100,380,240,100));
    GGML_ASSERT(!ggml_prefetch_budget_fits(old,3,100,379,240,100));
    GGML_ASSERT(!ggml_prefetch_budget_fits(old,3,100,380,239,100));
    GGML_ASSERT(ggml_prefetch_budget_fits(old,3,80,240,0,100));
    GGML_ASSERT(!ggml_prefetch_budget_fits(old,3,80,239,0,100));
    const size_t huge[] = {SIZE_MAX,1};
    GGML_ASSERT(!ggml_prefetch_budget_fits(huge,2,100,SIZE_MAX,SIZE_MAX,0));
    std::puts("prefetch budget tests passed");
}
