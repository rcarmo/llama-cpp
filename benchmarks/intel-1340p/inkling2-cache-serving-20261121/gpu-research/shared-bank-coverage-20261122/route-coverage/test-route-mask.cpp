#include "route-mask.h"
#include <cassert>
#include <cstdio>
int main() {
    int32_t data[] = {0,127,7,9,1,-1,15,16};
    ggml_tensor t{}; t.type=GGML_TYPE_I32; t.data=data;
    t.ne[0]=2; t.ne[1]=2; t.ne[2]=t.ne[3]=1;
    t.nb[0]=4; t.nb[1]=16; t.nb[2]=t.nb[3]=32;
    char mask[129]; assert(route_mask_128(t,mask));
    for(int i=0;i<128;i++) assert(mask[i]==((i==0||i==1||i==127)?'1':'0'));
    assert(mask[128]==0);
    data[4]=128; assert(!route_mask_128(t,mask)); data[4]=1;
    t.type=GGML_TYPE_F32; assert(!route_mask_128(t,mask)); t.type=GGML_TYPE_I32;
    t.ne[2]=2; assert(!route_mask_128(t,mask)); t.ne[2]=1;
    t.ne[0]=0; assert(!route_mask_128(t,mask)); t.ne[0]=2;
    t.ne[1]=129; assert(!route_mask_128(t,mask)); t.ne[1]=2;
    t.data=nullptr; assert(!route_mask_128(t,mask)); t.data=data;
    t.nb[0]=2; assert(!route_mask_128(t,mask));
    puts("PASS route-mask: exact logical stride, padding ignored, negative id skipped, id/type/dimension/null/stride guards");
}
