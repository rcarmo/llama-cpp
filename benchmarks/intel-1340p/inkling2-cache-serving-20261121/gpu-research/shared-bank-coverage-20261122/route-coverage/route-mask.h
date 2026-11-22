#pragma once
#include "ggml.h"
#include <cstring>
#include <cstdint>
inline bool route_mask_128(const ggml_tensor & t, char (&mask)[129]) {
    std::memset(mask, '0', 128); mask[128] = 0;
    if (t.type != GGML_TYPE_I32 || !t.data || t.ne[0] <= 0 || t.ne[0] > 128 || t.ne[1] <= 0 || t.ne[1] > 128 || t.ne[2] != 1 || t.ne[3] != 1 || t.nb[0] < sizeof(int32_t)) return false;
    const size_t bytes = ggml_nbytes(&t);
    for (int64_t row = 0; row < t.ne[1]; ++row) {
        for (int64_t col = 0; col < t.ne[0]; ++col) {
            const size_t offset = row*t.nb[1] + col*t.nb[0];
            if (offset > bytes || bytes - offset < sizeof(int32_t)) return false;
            int32_t id;
            std::memcpy(&id, (const char *) t.data + offset, sizeof(id));
            if (id < 0) continue;
            if (id >= 128) return false;
            mask[id] = '1';
        }
    }
    return true;
}
