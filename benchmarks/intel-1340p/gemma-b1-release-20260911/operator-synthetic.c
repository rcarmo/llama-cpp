// No-model control: equal instruction loops in all three operator labels.
#define _GNU_SOURCE
#include "operator-meter.h"
int main(void) {
    volatile uint64_t result=1;
    uint64_t start=gm_clock();
    for(int i=0;i<320;i++)for(int family=1;family<=3;family++) {
        int measured=gm_begin(family);
        for(int j=0;j<100000;j++)result=result*1664525+1013904223;
        if(measured)gm_end();
    }
    fprintf(stderr,"SYNTHETIC result=%llu elapsed_ns=%llu\n",(unsigned long long)result,(unsigned long long)(gm_clock()-start));
    return 0;
}
