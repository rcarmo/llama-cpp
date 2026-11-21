#include "arg.h"
#include "common.h"
#include "ggml-backend.h"

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#undef NDEBUG
#include <cassert>

int main() {
    ggml_backend_load_all();
    const auto reg = ggml_backend_reg_by_name("CPU");
    assert(reg);
    auto extras = reinterpret_cast<ggml_backend_dev_get_extra_bufts_t>(
            ggml_backend_reg_get_proc_address(reg, "ggml_backend_dev_get_extra_bufts"));
    ggml_backend_buffer_type_t repack = nullptr;
    if (extras) {
        for (auto * b = extras(ggml_backend_reg_dev_get(reg, 0)); b && *b; ++b) {
            if (std::strcmp(ggml_backend_buft_name(*b), "CPU_REPACK") == 0) {
                repack = *b;
            }
        }
    }
    if (!repack) {
        std::puts("SKIP CPU_REPACK not compiled for this backend");
        return 0;
    }
    const std::string pattern = "^blk\\.(6|7)\\.ffn_(gate_up|down)_exps\\.weight$";
    std::vector<std::string> args = {"test", "-m", "unused.gguf", "--no-repack", "--no-host", "--override-tensor", pattern + "=CPU_REPACK"};
    std::vector<char *> argv;
    for (auto & a : args) { argv.push_back(a.data()); }
    common_params params;
    assert(common_params_parse(argv.size(), argv.data(), params, LLAMA_EXAMPLE_COMMON));
    assert(params.no_extra_bufts && params.no_host);
    assert(params.tensor_buft_overrides.size() >= 1);
    assert(std::strcmp(params.tensor_buft_overrides[0].pattern, pattern.c_str()) == 0);
    assert(params.tensor_buft_overrides[0].buft == repack);
    args.back() = pattern + "=CPU_NONEXISTENT";
    argv.clear();
    for (auto & a : args) { argv.push_back(a.data()); }
    common_params invalid;
    assert(!common_params_parse(argv.size(), argv.data(), invalid, LLAMA_EXAMPLE_COMMON));
    std::puts("PASS explicit CPU_REPACK override with default repacking disabled; invalid type rejected");
}
