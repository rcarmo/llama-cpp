#include "simd-gemm.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <vector>

int main() {
    int cases = 0;
    for (int rows : {1, 2, 4, 8, 25, 63, 64}) {
        for (int cols : {64, 256, 512}) {
            const int depth = 64;
            std::vector<float> a(64*depth), b(depth*cols), full(64*cols), active(64*cols);
            for (int i = 0; i < rows*depth; ++i) a[i] = float((i*17)%97 - 48)/97;
            for (int i = 0; i < depth*cols; ++i) b[i] = float((i*13)%101 - 50)/101;
            simd_gemm(full.data(), a.data(), b.data(), 64, depth, cols);
            simd_gemm(active.data(), a.data(), b.data(), rows, depth, cols);
            for (int i = 0; i < rows*cols; ++i) {
                if (!std::isfinite(active[i]) || std::abs(active[i]-full[i]) > 1e-5f) return 1;
            }
            for (int i = rows*cols; i < 64*cols; ++i) if (active[i] != 0) return 2;
            ++cases;
        }
    }
    std::printf("PASS %d native SIMD active-row equivalence cases\n", cases);
    return 0;
}
