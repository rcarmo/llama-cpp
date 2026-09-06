#pragma once

#include <cstddef>
#include <cstdint>

// Internal, backend-independent staging policy helpers.
inline bool ggml_prefetch_parse_mib(const char * text, size_t & bytes) {
    if (!text || !*text) return false;
    constexpr size_t unit = 1024 * 1024;
    size_t value = 0;
    for (const char * p = text; *p; ++p) {
        if (*p < '0' || *p > '9') return false;
        const size_t digit = size_t(*p - '0');
        if (value > (SIZE_MAX / unit - digit) / 10) return false;
        value = value * 10 + digit;
    }
    bytes = value * unit;
    return true;
}

// Choose complete-tensor slots without multiplying potentially large sizes.
// Zero means ordinary transfers; never divide by an empty request.
inline size_t ggml_prefetch_borrowed_slots(size_t requested, size_t capacity, size_t configured) {
    if (requested == 0 || configured == 0) return 0;
    const size_t fits = capacity / requested;
    return fits < configured ? fits : configured;
}

// Slots grow serially: allocate replacement, then release old allocation.
// free_bytes already excludes existing slots; reserve is untouched headroom.
inline bool ggml_prefetch_budget_fits(const size_t * slots, size_t count,
        size_t requested, size_t budget, size_t free_bytes, size_t reserve) {
    size_t resident = 0;
    for (size_t i = 0; i < count; ++i) {
        if (slots[i] > SIZE_MAX - resident) return false;
        resident += slots[i];
    }
    if (resident > budget) return false;
    size_t available = free_bytes > reserve ? free_bytes - reserve : 0;
    for (size_t i = 0; i < count; ++i) {
        if (slots[i] >= requested) continue;
        if (requested > budget - resident || requested > available) return false;
        // Safe subtraction: old size is strictly smaller than requested.
        const size_t growth = requested - slots[i];
        resident += growth;
        available -= growth;
    }
    return true;
}
