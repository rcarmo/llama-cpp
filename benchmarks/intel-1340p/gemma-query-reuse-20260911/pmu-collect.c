// Read only per-thread, per-hybrid-PMU grouped user counters during an explicit interval.
#define _GNU_SOURCE
#include <linux/perf_event.h>
#include <sys/syscall.h>
#include <sys/ioctl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <dirent.h>
#include <stdint.h>
struct Group { int tid,type,fd[4]; };
int main(int argc,char**argv){if(argc!=2)return 2;int pid=atoi(argv[1]);if(pid<=0)return 2;char path[100];snprintf(path,sizeof(path),"/proc/%d/task",pid);DIR*d=opendir(path);if(!d)return 3;struct Group groups[1024];int ng=0,failures=0;struct dirent*e;unsigned long long configs[]={0x3c,0xc0,0x4f2e,0x412e};while((e=readdir(d))){int tid=atoi(e->d_name);if(tid<=0)continue;for(int t=0;t<2;t++){if(ng>=1024)return 4;struct Group g={.tid=tid,.type=t?10:4,.fd={-1,-1,-1,-1}};for(int j=0;j<4;j++){struct perf_event_attr a;memset(&a,0,sizeof(a));a.size=sizeof(a);a.type=g.type;a.config=configs[j];a.disabled=1;a.exclude_kernel=1;a.exclude_hv=1;a.read_format=PERF_FORMAT_GROUP|PERF_FORMAT_TOTAL_TIME_ENABLED|PERF_FORMAT_TOTAL_TIME_RUNNING;g.fd[j]=syscall(__NR_perf_event_open,&a,tid,-1,j?g.fd[0]:-1,0);if(g.fd[j]<0){fprintf(stderr,"open tid=%d type=%d event=%d errno=%d %s\n",tid,g.type,j,errno,strerror(errno));failures++;break;}}if(g.fd[3]<0){for(int j=0;j<4;j++)if(g.fd[j]>=0)close(g.fd[j]);}else groups[ng++]=g;}}closedir(d);printf("{\"phase\":\"ready\",\"pid\":%d,\"groups\":%d,\"open_failures\":%d}\n",pid,ng,failures);fflush(stdout);if(!ng)return 5;if(getchar()==EOF)return 6;for(int i=0;i<ng;i++){ioctl(groups[i].fd[0],PERF_EVENT_IOC_RESET,PERF_IOC_FLAG_GROUP);if(ioctl(groups[i].fd[0],PERF_EVENT_IOC_ENABLE,PERF_IOC_FLAG_GROUP)<0)return 7;}puts("{\"phase\":\"enabled\"}");fflush(stdout);if(getchar()==EOF)return 8;for(int i=0;i<ng;i++){ioctl(groups[i].fd[0],PERF_EVENT_IOC_DISABLE,PERF_IOC_FLAG_GROUP);uint64_t values[7]={0};ssize_t n=read(groups[i].fd[0],values,sizeof(values));if(n!=(ssize_t)sizeof(values)||values[0]!=4){fprintf(stderr,"readgroup error tid=%d n=%zd nr=%llu\n",groups[i].tid,n,(unsigned long long)values[0]);return 9;}printf("{\"phase\":\"counts\",\"tid\":%d,\"pmu_type\":%d,\"enabled_ns\":%llu,\"running_ns\":%llu,\"cycles\":%llu,\"instructions\":%llu,\"cache_references\":%llu,\"cache_misses\":%llu}\n",groups[i].tid,groups[i].type,(unsigned long long)values[1],(unsigned long long)values[2],(unsigned long long)values[3],(unsigned long long)values[4],(unsigned long long)values[5],(unsigned long long)values[6]);for(int j=0;j<4;j++)close(groups[i].fd[j]);}return failures?10:0;}
