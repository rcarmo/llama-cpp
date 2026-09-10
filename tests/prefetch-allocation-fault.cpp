// Linux test-only interposer. Arm after model loading via marker file.
#include "ggml-backend.h"
#include <dlfcn.h>
#include <unistd.h>
#include <cstdlib>
#include <cstdio>

extern "C" ggml_backend_buffer_t ggml_backend_buft_alloc_buffer(
        ggml_backend_buffer_type_t buft, size_t size) {
    using fn = ggml_backend_buffer_t (*)(ggml_backend_buffer_type_t, size_t);
    static fn real = reinterpret_cast<fn>(dlsym(RTLD_NEXT, "ggml_backend_buft_alloc_buffer"));
    if (!real) std::abort();
    const char * marker = std::getenv("PREFETCH_FAULT_MARKER");
    const char * expected = std::getenv("PREFETCH_FAULT_BYTES");
    if (marker && expected && size == std::strtoull(expected, nullptr, 10) && access(marker, F_OK) == 0) {
        static unsigned matches = 0;
        const char * nth = std::getenv("PREFETCH_FAULT_NTH");
        if (++matches < (nth ? std::strtoul(nth, nullptr, 10) : 1)) return real(buft, size);
        unlink(marker); // fail once, permit ordinary-transfer recovery
        std::fprintf(stderr, "TEST allocation failure: bytes=%zu buffer=%s\n", size, ggml_backend_buft_name(buft));
        return nullptr;
    }
    return real(buft, size);
}
