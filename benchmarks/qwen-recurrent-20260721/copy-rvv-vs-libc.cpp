#include "spacemit/rvv_kernels.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <thread>
#include <vector>

using copy_fn = void (*)(void *, const void *, size_t);

static void libc_copy(void * dst, const void * src, size_t n) { std::memcpy(dst, src, n); }
static void rvv_copy(void * dst, const void * src, size_t n) { spacemit_kernels::rvv::memcpy1d(dst, src, (int64_t) n); }

static double bench_single(copy_fn fn, size_t bytes, int reps) {
    void * a = nullptr; void * b = nullptr;
    posix_memalign(&a, 4096, bytes); posix_memalign(&b, 4096, bytes);
    std::memset(a, 0x5a, bytes); std::memset(b, 0xa5, bytes);
    auto begin = std::chrono::steady_clock::now();
    for (int i=0;i<reps;++i) { fn(b,a,bytes); std::swap(a,b); }
    auto end = std::chrono::steady_clock::now();
    volatile unsigned char check = ((unsigned char*)a)[bytes/2]; (void)check;
    free(a); free(b);
    return std::chrono::duration<double>(end-begin).count();
}

static double bench_parallel(copy_fn fn, size_t bytes_per_thread, int nth, int reps) {
    const size_t total = bytes_per_thread*nth;
    void * aa=nullptr; void * bb=nullptr; posix_memalign(&aa,4096,total);posix_memalign(&bb,4096,total);
    std::memset(aa,0x33,total);std::memset(bb,0xcc,total);
    std::atomic<int> ready{0}; std::atomic<bool> go{false};
    std::vector<std::thread> ts;
    auto begin=std::chrono::steady_clock::now();
    for(int t=0;t<nth;++t) ts.emplace_back([&,t]{
        unsigned char *a=(unsigned char*)aa+t*bytes_per_thread,*b=(unsigned char*)bb+t*bytes_per_thread;
        ready.fetch_add(1);while(!go.load(std::memory_order_acquire)){}
        for(int i=0;i<reps;++i){fn(b,a,bytes_per_thread);std::swap(a,b);}
    });
    while(ready.load()!=nth){} begin=std::chrono::steady_clock::now();go.store(true,std::memory_order_release);
    for(auto& t:ts)t.join();auto end=std::chrono::steady_clock::now();
    volatile unsigned char check=((unsigned char*)aa)[total/2];(void)check;free(aa);free(bb);
    return std::chrono::duration<double>(end-begin).count();
}

static void report(const char*name,double sec,size_t bytes,int reps){double gb=(double)bytes*reps/1e9;std::printf("%-20s seconds=%8.4f GB/s=%8.3f\n",name,sec,gb/sec);}
int main(){
    for(int round=0;round<5;++round){
        report("libc-64KiB",bench_single(libc_copy,64<<10,4000),64<<10,4000);
        report("rvv-64KiB",bench_single(rvv_copy,64<<10,4000),64<<10,4000);
        report("libc-8MiB",bench_single(libc_copy,8<<20,200),8<<20,200);
        report("rvv-8MiB",bench_single(rvv_copy,8<<20,200),8<<20,200);
        report("libc-8x1MiB",bench_parallel(libc_copy,1<<20,8,300),8<<20,300);
        report("rvv-8x1MiB",bench_parallel(rvv_copy,1<<20,8,300),8<<20,300);
    }
}
