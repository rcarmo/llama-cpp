// Experimental operator-boundary sampling. No per-tile calls or privilege changes.
#ifndef GEMMA_OPERATOR_METER_H
#define GEMMA_OPERATOR_METER_H
#include <linux/perf_event.h>
#include <sys/syscall.h>
#include <unistd.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <errno.h>
struct gm_group { int type, fd[4], valid; uint64_t before[7]; };
struct gm_slot { int initialized, tid, phase, calls[4], family, cpu; uint64_t start; struct gm_group g[2]; };
static _Thread_local struct gm_slot gm_tls;
static uint64_t gm_clock(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (uint64_t)t.tv_sec*1000000000+t.tv_nsec; }
static int gm_cpu(void) { unsigned cpu=0; return syscall(SYS_getcpu, &cpu, NULL, NULL)<0 ? -1 : (int)cpu; }
static void gm_init(struct gm_slot *s) {
    s->initialized=1; s->tid=syscall(SYS_gettid);
    const char *phase=getenv("GGML_OPERATOR_METER_PHASE"); s->phase=phase?atoi(phase):0;
    const char *names[]={"cpu_core","cpu_atom"};
    const uint64_t configs[]={0x3c,0xc0,0x4f2e,0x412e};
    for(int g=0;g<2;g++) {
        struct gm_group *p=&s->g[g]; p->type=-1; for(int j=0;j<4;j++)p->fd[j]=-1;
        char path[160]; snprintf(path,sizeof(path),"/sys/bus/event_source/devices/%s/type",names[g]);
        FILE *f=fopen(path,"r"); if(f){if(fscanf(f,"%d",&p->type)!=1)p->type=-1;fclose(f);}
        if(p->type<0){fprintf(stderr,"OPERROR tid=%d pmu=%s missing-type\n",s->tid,names[g]);continue;}
        p->valid=1;
        for(int j=0;j<4;j++) {
            struct perf_event_attr a; memset(&a,0,sizeof(a)); a.size=sizeof(a); a.type=p->type; a.config=configs[j];
            a.exclude_kernel=1; a.exclude_hv=1; a.read_format=PERF_FORMAT_GROUP|PERF_FORMAT_TOTAL_TIME_ENABLED|PERF_FORMAT_TOTAL_TIME_RUNNING;
            p->fd[j]=syscall(__NR_perf_event_open,&a,0,-1,j?p->fd[0]:-1,PERF_FLAG_FD_CLOEXEC);
            if(p->fd[j]<0){fprintf(stderr,"OPERROR tid=%d pmu=%s event=%d errno=%d\n",s->tid,names[g],j,errno);p->valid=0;break;}
        }
        if(!p->valid)for(int j=0;j<4;j++)if(p->fd[j]>=0){close(p->fd[j]);p->fd[j]=-1;}
    }
}
static int gm_begin(int family) {
    if(family<1||family>3)return 0;
    const char *env=getenv("GGML_OPERATOR_METER"); if(!env||env[0]!='1')return 0;
    struct gm_slot *s=&gm_tls; if(!s->initialized)gm_init(s);
    int c=s->calls[family]++; if(c%32!=s->phase%32)return 0;
    s->family=family; s->cpu=gm_cpu();
    for(int g=0;g<2;g++){struct gm_group*p=&s->g[g];if(p->valid&&(read(p->fd[0],p->before,sizeof(p->before))!=(ssize_t)sizeof(p->before)||p->before[0]!=4)){p->valid=0;fprintf(stderr,"OPERROR tid=%d pmu=%d read-before\n",s->tid,p->type);}}
    s->start=gm_clock(); return 1;
}
static void gm_end(void) {
    struct gm_slot*s=&gm_tls; uint64_t ns=gm_clock()-s->start; int cpu=gm_cpu();
    uint64_t delta[2][6]={{0}};
    for(int g=0;g<2;g++){struct gm_group*p=&s->g[g];uint64_t v[7];if(!p->valid)continue;
        if(read(p->fd[0],v,sizeof(v))!=(ssize_t)sizeof(v)||v[0]!=4){p->valid=0;fprintf(stderr,"OPERROR tid=%d pmu=%d read-after\n",s->tid,p->type);continue;}
        for(int i=0;i<6;i++)delta[g][i]=v[i+1]-p->before[i+1];
    }
    // Separate PMUs retain their own residency ratios; zero residency is not multiplex loss.
    for(int g=0;g<2;g++)fprintf(stderr,"OPMETER tid=%d family=%d call=%d cpu0=%d cpu1=%d ns=%llu pmu=%d valid=%d enabled=%llu running=%llu cycles=%llu instructions=%llu refs=%llu misses=%llu\n",s->tid,s->family,s->calls[s->family],s->cpu,cpu,(unsigned long long)ns,s->g[g].type,s->g[g].valid,(unsigned long long)delta[g][0],(unsigned long long)delta[g][1],(unsigned long long)delta[g][2],(unsigned long long)delta[g][3],(unsigned long long)delta[g][4],(unsigned long long)delta[g][5]);
}
#endif
