#include "expert-io-advice.h"

#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#elif defined(__linux__) || defined(__APPLE__)
#include <cerrno>
#include <sys/mman.h>
#else
#include <cerrno>
#endif

int ggml_expert_io_advise_memory(void * address, size_t length) {
    if (address == nullptr || length == 0) return EINVAL;
#if defined(_WIN32)
    WIN32_MEMORY_RANGE_ENTRY range;
    range.VirtualAddress = address;
    range.NumberOfBytes = length;
    return PrefetchVirtualMemory(GetCurrentProcess(), 1, &range, 0) ? 0 : static_cast<int>(GetLastError());
#elif defined(__linux__) || defined(__APPLE__)
    return madvise(address, length, MADV_WILLNEED) == 0 ? 0 : errno;
#else
    return ENOTSUP;
#endif
}
