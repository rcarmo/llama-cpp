// Permission/availability probe only: open disabled user-space counters, no load or policy change.
#define _GNU_SOURCE
#include <linux/perf_event.h>
#include <sys/syscall.h>
#include <unistd.h>
#include <string.h>
#include <stdio.h>
#include <errno.h>
static void probe(const char *name,int type,unsigned long long config,int pid,int cpu){struct perf_event_attr a;memset(&a,0,sizeof(a));a.size=sizeof(a);a.type=type;a.config=config;a.disabled=1;a.exclude_kernel=pid>=0;a.exclude_hv=pid>=0;a.read_format=PERF_FORMAT_TOTAL_TIME_ENABLED|PERF_FORMAT_TOTAL_TIME_RUNNING;int fd=syscall(__NR_perf_event_open,&a,pid,cpu,-1,0);int e=errno;printf("{\"name\":\"%s\",\"type\":%d,\"config\":%llu,\"pid\":%d,\"cpu\":%d,\"opened\":%s,\"errno\":%d,\"error\":\"%s\"}\n",name,type,config,pid,cpu,fd>=0?"true":"false",fd>=0?0:e,fd>=0?"":strerror(e));if(fd>=0)close(fd);}
int main(){probe("core-cycles-self",4,0x3c,0,-1);probe("atom-cycles-self",10,0x3c,0,-1);probe("generic-instructions-self",PERF_TYPE_HARDWARE,PERF_COUNT_HW_INSTRUCTIONS,0,-1);probe("imc-read-cpu0",26,0x20ff,-1,0);return 0;}
