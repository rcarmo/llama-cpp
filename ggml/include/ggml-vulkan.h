#pragma once

#include "ggml.h"
#include "ggml-backend.h"

#ifdef  __cplusplus
extern "C" {
#endif

#define GGML_VK_NAME "Vulkan"
#define GGML_VK_MAX_DEVICES 16

// backend API
GGML_BACKEND_API ggml_backend_t ggml_backend_vk_init(size_t dev_num);

GGML_BACKEND_API bool ggml_backend_is_vk(ggml_backend_t backend);
GGML_BACKEND_API int  ggml_backend_vk_get_device_count(void);
GGML_BACKEND_API void ggml_backend_vk_get_device_description(int device, char * description, size_t description_size);
GGML_BACKEND_API void ggml_backend_vk_get_device_memory(int device, size_t * free, size_t * total);

GGML_BACKEND_API ggml_backend_buffer_type_t ggml_backend_vk_buffer_type(size_t dev_num);
// pinned host buffer for use with the CPU backend for faster copies between CPU and GPU
GGML_BACKEND_API ggml_backend_buffer_type_t ggml_backend_vk_host_buffer_type(void);

// Opt-in Vulkan allocation eligible for CPU views; NULL if cached coherent Intel UMA memory is unavailable.
// Other Vulkan allocations and scheduler placement are unchanged.
GGML_BACKEND_API ggml_backend_buffer_t ggml_backend_vk_alloc_cpu_shared_buffer(ggml_backend_t backend, size_t size);

// Explicit zero-copy CPU view of Vulkan-owned mapped, coherent, cached Intel UMA memory.
// Waits for work submitted by backend and retains the allocation until the view is freed.
// Returns NULL for unsupported buffers, devices, empty/unaligned ranges or overflow; never copies.
// Caller must serialize access through all other backends and prohibit GPU access during CPU use.
// Synchronize CPU work before submitting Vulkan work again; acquire a new view after GPU writes.
// Storage aliases are not registered with the graph scheduler. Use only with explicit graph ownership.
GGML_BACKEND_API ggml_backend_buffer_t ggml_backend_vk_buffer_cpu_view(
    ggml_backend_t backend, ggml_backend_buffer_t buffer, size_t offset, size_t size);

GGML_BACKEND_API ggml_backend_reg_t ggml_backend_vk_reg(void);

#ifdef  __cplusplus
}
#endif
