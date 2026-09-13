#include "ggml.h"
#include "ggml-alloc.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"
#include "ggml-vulkan.h"
#include "../ggml/src/ggml-backend-impl.h"

#include <chrono>
#include <cstdio>
#include <cstring>
#include <cstdint>
#include <vector>
#include <utility>

static int reads = 0, writes = 0, copies = 0;
static void (*saved_get)(ggml_backend_buffer_t, const ggml_tensor *, void *, size_t, size_t);
static void (*saved_set)(ggml_backend_buffer_t, ggml_tensor *, const void *, size_t, size_t);
static bool (*saved_copy)(ggml_backend_buffer_t, const ggml_tensor *, ggml_tensor *);
static void counted_get(ggml_backend_buffer_t b, const ggml_tensor * t, void * p, size_t o, size_t n) { ++reads; saved_get(b,t,p,o,n); }
static void counted_set(ggml_backend_buffer_t b, ggml_tensor * t, const void * p, size_t o, size_t n) { ++writes; saved_set(b,t,p,o,n); }
static bool counted_copy(ggml_backend_buffer_t b, const ggml_tensor * s, ggml_tensor * d) { ++copies; return saved_copy(b,s,d); }

int main() {
    ggml_backend_t vk = ggml_backend_vk_init(0);
    if (!vk) { std::puts("SKIP: Vulkan unavailable"); return 77; }
    auto cpu = ggml_backend_cpu_init();
    ggml_backend_cpu_set_n_threads(cpu, 2);
    auto ctx = ggml_init({ 2 * 1024 * 1024, nullptr, true });
    const size_t count = 1024;
    auto input = ggml_new_tensor_1d(ctx, GGML_TYPE_F32, count);
    auto output = ggml_scale(ctx, input, 2.0f);
    auto graph = ggml_new_graph(ctx);
    ggml_build_forward_expand(graph, output);
    GGML_ASSERT(!ggml_backend_vk_alloc_cpu_shared_buffer(nullptr, 4096));
    GGML_ASSERT(!ggml_backend_vk_alloc_cpu_shared_buffer(cpu, 4096));
    GGML_ASSERT(!ggml_backend_vk_alloc_cpu_shared_buffer(vk, 0));
    auto buffer = ggml_backend_vk_alloc_cpu_shared_buffer(vk, 16384);
    if (!buffer) { std::puts("SKIP: shared Intel UMA allocation unavailable"); ggml_free(ctx); ggml_backend_free(cpu); ggml_backend_free(vk); return 77; }
    auto base = (uint8_t *) ggml_backend_buffer_get_base(buffer);
    GGML_ASSERT(ggml_backend_tensor_alloc(buffer, input, base) == GGML_STATUS_SUCCESS);
    GGML_ASSERT(ggml_backend_tensor_alloc(buffer, output, base + 8192) == GGML_STATUS_SUCCESS);
    const size_t alignment = ggml_backend_buft_get_alignment(ggml_backend_cpu_buffer_type());
    const size_t in_offset = (uintptr_t) input->data - (uintptr_t) ggml_backend_buffer_get_base(buffer);
    const size_t out_offset = (uintptr_t) output->data - (uintptr_t) ggml_backend_buffer_get_base(buffer);
    saved_get=buffer->iface.get_tensor; saved_set=buffer->iface.set_tensor; saved_copy=buffer->iface.cpy_tensor;
    buffer->iface.get_tensor=counted_get; buffer->iface.set_tensor=counted_set; buffer->iface.cpy_tensor=counted_copy;

    GGML_ASSERT(!ggml_backend_vk_buffer_cpu_view(nullptr, buffer, 0, 64));
    GGML_ASSERT(!ggml_backend_vk_buffer_cpu_view(cpu, buffer, 0, 64));
    GGML_ASSERT(!ggml_backend_vk_buffer_cpu_view(vk, nullptr, 0, 64));
    auto foreign = ggml_backend_alloc_buffer(cpu, 256);
    GGML_ASSERT(!ggml_backend_vk_buffer_cpu_view(vk, foreign, 0, 64));
    ggml_backend_buffer_free(foreign);
    for (const auto range : std::vector<std::pair<size_t,size_t>>{{0,0},{1,64},{buffer->size,1},{SIZE_MAX,64},{64,SIZE_MAX}}) {
        GGML_ASSERT(!ggml_backend_vk_buffer_cpu_view(vk, buffer, range.first, range.second));
    }
    auto in_view = ggml_backend_vk_buffer_cpu_view(vk, buffer, in_offset, count*sizeof(float));
    if (!in_view) { std::puts("SKIP: mapped cached coherent Intel UMA buffer unavailable"); ggml_backend_buffer_free(buffer); ggml_free(ctx); ggml_backend_free(cpu); ggml_backend_free(vk); return 77; }
    GGML_ASSERT(ggml_backend_buffer_is_host(in_view));
    GGML_ASSERT(ggml_backend_supports_buft(cpu, ggml_backend_buffer_get_type(in_view)));
    float * in = (float *) ggml_backend_buffer_get_base(in_view);
    for(size_t i=0;i<count;++i)in[i]=float(i%31);
    GGML_ASSERT(ggml_backend_graph_compute_async(vk, graph)==GGML_STATUS_SUCCESS);
    auto out_view = ggml_backend_vk_buffer_cpu_view(vk, buffer, out_offset, count*sizeof(float));
    GGML_ASSERT(out_view);
    auto out = (float *)ggml_backend_buffer_get_base(out_view);
    for(size_t i=0;i<count;++i)GGML_ASSERT(out[i]==2*in[i]);
    GGML_ASSERT(reads==0 && writes==0 && copies==0);

    auto cpu_ctx=ggml_init({2*1024*1024,nullptr,true});
    auto alias=ggml_new_tensor_1d(cpu_ctx,GGML_TYPE_F32,count);
    GGML_ASSERT(ggml_backend_tensor_alloc(in_view,alias,in)==GGML_STATUS_SUCCESS);
    auto scaled=ggml_scale_inplace(cpu_ctx,alias,3.0f);
    auto cpu_graph=ggml_new_graph(cpu_ctx);ggml_build_forward_expand(cpu_graph,scaled);
    GGML_ASSERT(ggml_backend_graph_compute(cpu,cpu_graph)==GGML_STATUS_SUCCESS);
    GGML_ASSERT(ggml_backend_graph_compute_async(vk,graph)==GGML_STATUS_SUCCESS);
    auto reacquired=ggml_backend_vk_buffer_cpu_view(vk,buffer,out_offset,count*sizeof(float));
    GGML_ASSERT(reacquired && ggml_backend_buffer_get_base(reacquired)==out);
    for(size_t i=0;i<count;++i)GGML_ASSERT(out[i]==6*float(i%31));
    auto tail=ggml_backend_vk_buffer_cpu_view(vk,buffer,out_offset+alignment,count*sizeof(float)-alignment);
    GGML_ASSERT(tail && ggml_backend_buffer_get_base(tail)==(uint8_t *)out+alignment);
    auto tail_data=(float *)ggml_backend_buffer_get_base(tail);
    GGML_ASSERT(tail_data[0]==out[alignment/sizeof(float)]);
    GGML_ASSERT(reads==0 && writes==0 && copies==0);
    std::vector<float> control(count);
    ggml_backend_tensor_get(output,control.data(),0,count*sizeof(float));
    GGML_ASSERT(reads==1 && std::memcmp(control.data(),out,count*sizeof(float))==0);
    std::puts("PASS: CPU fill -> GPU scale -> CPU alias -> CPU in-place scale -> GPU scale; zero tensor-copy callbacks, copied control exact");

    ggml_backend_buffer_free(buffer);
    ggml_free(ctx);
    ggml_backend_free(vk);
    for(size_t i=0;i<count;++i)GGML_ASSERT(out[i]==control[i]);
    ggml_backend_buffer_clear(tail,0);
    for(size_t i=alignment/sizeof(float);i<count;++i)GGML_ASSERT(out[i]==0);
    for(size_t i=0;i<alignment/sizeof(float);++i)GGML_ASSERT(out[i]==control[i]);
    ggml_backend_buffer_free(tail);ggml_backend_buffer_free(reacquired);
    ggml_backend_buffer_free(out_view);ggml_free(cpu_ctx);ggml_backend_buffer_free(in_view);

    // An independent allocation must not alias a second slot.
    vk = ggml_backend_vk_init(0);
    auto first = ggml_backend_vk_alloc_cpu_shared_buffer(vk, 4096);
    auto second = ggml_backend_vk_alloc_cpu_shared_buffer(vk, 4096);
    GGML_ASSERT(first && second);
    auto first_view = ggml_backend_vk_buffer_cpu_view(vk, first, 0, 4096);
    auto second_view = ggml_backend_vk_buffer_cpu_view(vk, second, 0, 4096);
    GGML_ASSERT(first_view && second_view);
    GGML_ASSERT(ggml_backend_buffer_get_base(first_view) != ggml_backend_buffer_get_base(second_view));
    ggml_backend_buffer_clear(first_view, 0x5a);
    ggml_backend_buffer_clear(second_view, 0xa5);
    auto half_ctx = ggml_init({ 1024 * 1024, nullptr, true });
    auto half = ggml_new_tensor_1d(half_ctx, GGML_TYPE_F16, 128);
    GGML_ASSERT(ggml_backend_tensor_alloc(first, half, ggml_backend_buffer_get_base(first)) == GGML_STATUS_SUCCESS);
    auto half_cpu = ggml_new_tensor_1d(half_ctx, GGML_TYPE_F16, 128);
    GGML_ASSERT(ggml_backend_tensor_alloc(first_view, half_cpu, ggml_backend_buffer_get_base(first_view)) == GGML_STATUS_SUCCESS);
    std::vector<uint16_t> half_pattern(128), half_read(128);
    for (size_t i = 0; i < half_pattern.size(); ++i) half_pattern[i] = (uint16_t) (i * 499);
    ggml_backend_tensor_set(half_cpu, half_pattern.data(), 0, half_pattern.size() * 2);
    ggml_backend_tensor_get(half, half_read.data(), 0, half_read.size() * 2);
    GGML_ASSERT(half_read == half_pattern);
    for (size_t i = 0; i < 4096; ++i) GGML_ASSERT(((uint8_t *)ggml_backend_buffer_get_base(second_view))[i] == 0xa5);
    for (size_t i = 256; i < 4096; ++i) GGML_ASSERT(((uint8_t *)ggml_backend_buffer_get_base(first_view))[i] == 0x5a);
    ggml_free(half_ctx);
    ggml_backend_buffer_free(first_view); ggml_backend_buffer_free(first);
    ggml_backend_buffer_free(second); ggml_backend_buffer_free(second_view);
    ggml_backend_free(vk);
    ggml_backend_free(cpu);
    std::puts("PASS: F16 payload bytes, independent slot allocations, surrounding canaries, both buffer destruction orders");
    std::puts("PASS: range/alignment rejection, offset aliases, CPU buffer callbacks, allocation and backend lifetime, prefix canaries");
    return 0;
}
