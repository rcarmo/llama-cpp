// Sparse per-worker operator-boundary counters. User-space core/atom events; never per tile.
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
#include <stdatomic.h>
#include <pthread.h>
#include <errno.h>
struct gm_group { int fd[4]; uint64_t before[7]; };
struct gm_slot { int tid; int counts[4],samples[4],errors; uint64_t ns[4],cycles[4],instructions[4],refs[4],misses[4],enabled[4],running[4]; struct gm_group g[2]; uint64_t start; int current; };
static struct gm_slot gm_slots[64];static atomic_int gm_n=0;static _Thread_local struct gm_slot * gm_tls;static pthread_once_t gm_once=PTHREAD_ONCE_INIT;
static uint64_t gm_clock(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return(uint64_t)t.tv_sec*1000000000+t.tv_nsec;}
static void gm_dump(void){int n=atomic_load(&gm_n);if(n>64)n=64;for(int i=0;i<n;i++){struct gm_slot*s=&gm_slots[i];for(int f=1;f<4;f++)fprintf(stderr,"OPMETER tid=%d family=%d calls=%d samples=%d errors=%d ns=%llu cycles=%llu instructions=%llu refs=%llu misses=%llu enabled=%llu running=%llu\n",s->tid,f,s->counts[f],s->samples[f],s->errors,(unsigned long long)s->ns[f],(unsigned long long)s->cycles[f],(unsigned long long)s->instructions[f],(unsigned long long)s->refs[f],(unsigned long long)s->misses[f],(unsigned long long)s->enabled[f],(unsigned long long)s->running[f]);for(int g=0;g<2;g++)for(int j=0;j<4;j++)if(s->g[g].fd[j]>=0)close(s->g[g].fd[j]);}}
static void gm_register(void){atexit(gm_dump);}
static struct gm_slot *gm_init(void){pthread_once(&gm_once,gm_register);int i=atomic_fetch_add(&gm_n,1);if(i>=64)return NULL;struct gm_slot*s=&gm_slots[i];s->tid=syscall(SYS_gettid);const uint64_t configs[]={0x3c,0xc0,0x4f2e,0x412e};for(int g=0;g<2;g++)for(int j=0;j<4;j++){struct perf_event_attr a;memset(&a,0,sizeof(a));a.size=sizeof(a);a.type=g?10:4;a.config=configs[j];a.exclude_kernel=1;a.exclude_hv=1;a.read_format=PERF_FORMAT_GROUP|PERF_FORMAT_TOTAL_TIME_ENABLED|PERF_FORMAT_TOTAL_TIME_RUNNING;s->g[g].fd[j]=syscall(__NR_perf_event_open,&a,0,-1,j?s->g[g].fd[0]:-1,0);if(s->g[g].fd[j]<0)s->errors++;}return s;}
static int gm_begin(int family){if(family<1||family>3)return 0;const char*env=getenv("GGML_OPERATOR_METER");if(!env||env[0]!='1')return 0;if(!gm_tls)gm_tls=gm_init();struct gm_slot*s=gm_tls;if(!s)return 0;int phase=getenv("GGML_OPERATOR_METER_PHASE")?atoi(getenv("GGML_OPERATOR_METER_PHASE")):0;int c=s->counts[family]++;if((c%32)!=(phase%32))return 0;s->current=family;for(int g=0;g<2;g++)if(read(s->g[g].fd[0],s->g[g].before,sizeof(s->g[g].before))!=(ssize_t)sizeof(s->g[g].before)||s->g[g].before[0]!=4){s->errors++;return 0;}s->start=gm_clock();return 1;}
static void gm_end(void){struct gm_slot*s=gm_tls;int f=s->current;s->ns[f]+=gm_clock()-s->start;s->samples[f]++;for(int g=0;g<2;g++){uint64_t v[7];if(read(s->g[g].fd[0],v,sizeof(v))!=(ssize_t)sizeof(v)||v[0]!=4){s->errors++;continue;}s->enabled[f]+=v[1]-s->g[g].before[1];s->running[f]+=v[2]-s->g[g].before[2];s->cycles[f]+=v[3]-s->g[g].before[3];s->instructions[f]+=v[4]-s->g[g].before[4];s->refs[f]+=v[5]-s->g[g].before[5];s->misses[f]+=v[6]-s->g[g].before[6];}}
#endif
