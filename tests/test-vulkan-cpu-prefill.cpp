#include "../ggml/src/ggml-vulkan/ggml-vulkan-cpu-prefill.h"

#include <cstdio>

#undef NDEBUG
#include <cassert>

int main() {
    ggml_tensor weight = {};
    ggml_set_name(&weight, "blk.6.ffn_gate_up_exps.weight");
    ggml_tensor op = {};
    op.op = GGML_OP_MUL_MAT_ID;
    op.src[0] = &weight;
    const ggml_vk_cpu_prefill_policy policy("^blk\\.(6|7)\\.ffn_(gate_up|down)_exps\\.weight$");
    assert(policy.enabled && policy.valid);
    assert(policy.allows(&op, 128));
    assert(policy.allows(&op, 2));
    assert(!policy.allows(&op, 1));
    assert(!policy.allows(&op, 0));
    assert(!policy.allows(nullptr, 128));
    op.op = GGML_OP_MUL_MAT;
    assert(policy.allows(&op, 128));
    op.op = GGML_OP_ADD;
    assert(!policy.allows(&op, 128));
    op.op = GGML_OP_MUL_MAT_ID;
    ggml_set_name(&weight, "blk.8.ffn_gate_up_exps.weight");
    assert(!policy.allows(&op, 128));
    ggml_set_name(&weight, "cache_k_l6");
    assert(!policy.allows(&op, 128));
    ggml_set_name(&weight, "");
    assert(!policy.allows(&op, 128));
    op.src[0] = nullptr;
    assert(!policy.allows(&op, 128));
    const ggml_vk_cpu_prefill_policy invalid("[");
    assert(invalid.enabled && !invalid.valid);
    assert(!invalid.allows(&op, 128));
    const ggml_vk_cpu_prefill_policy disabled(nullptr), empty("");
    assert(!disabled.enabled && disabled.valid && disabled.allows(&op, 1));
    assert(!empty.enabled && empty.valid && empty.allows(nullptr, 0));
    std::puts("PASS CPU-owned prefill selection: disabled, invalid, weights, phase, attention exclusions");
}
