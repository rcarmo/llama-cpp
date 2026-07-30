#!/usr/bin/env python3
import argparse, json, os, signal, subprocess, time, urllib.request
from pathlib import Path

def proc_io(pid):
    out={}
    try:
        for line in Path(f'/proc/{pid}/io').read_text().splitlines():
            k,v=line.split(':',1); out[k]=int(v)
    except Exception: pass
    return out

def proc_faults(pid):
    try:
        f=Path(f'/proc/{pid}/stat').read_text().split()
        return int(f[9]),int(f[11])
    except Exception: return 0,0

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--mode',choices=['off','bounded','adaptive'],required=True); ap.add_argument('--port',type=int,required=True); ap.add_argument('--output',required=True); ap.add_argument('--model',required=True); a=ap.parse_args()
    root=Path(__file__).resolve().parents[1]; prefix=Path(a.output)
    env=os.environ.copy(); env['GGML_CPU_EXPERT_IO_PROFILE']='1'; env['GGML_CPU_EXPERT_IO_ADVISE_MODE']=a.mode
    cmd=[str(root/'build-expert-io/bin/llama-server'),'-m',a.model,'-ngl','0','-t','6','-c','512','--host','127.0.0.1','--port',str(a.port),'--no-warmup']
    log=prefix.with_suffix('.server.log').open('wb')
    p=subprocess.Popen(cmd,env=env,stdout=log,stderr=subprocess.STDOUT)
    try:
        for _ in range(180):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{a.port}/health',timeout=1).read(); break
            except Exception: time.sleep(1)
        else: raise RuntimeError('server not healthy')
        fd=os.open(a.model,os.O_RDONLY); os.posix_fadvise(fd,0,0,os.POSIX_FADV_DONTNEED); os.close(fd)
        before_io=proc_io(p.pid); before_faults=proc_faults(p.pid); start=time.monotonic()
        payload=json.dumps({'messages':[{'role':'user','content':'Reply with exactly: expert io ok'}],'max_tokens':8,'temperature':0,'seed':1}).encode()
        req=urllib.request.Request(f'http://127.0.0.1:{a.port}/v1/chat/completions',data=payload,headers={'Content-Type':'application/json'})
        response=json.loads(urllib.request.urlopen(req,timeout=300).read()); elapsed=time.monotonic()-start
        after_io=proc_io(p.pid); after_faults=proc_faults(p.pid)
        report={'mode':a.mode,'elapsed_seconds':elapsed,'response':response,'read_bytes':after_io.get('read_bytes',0)-before_io.get('read_bytes',0),'minor_faults':after_faults[0]-before_faults[0],'major_faults':after_faults[1]-before_faults[1],'command':cmd}
        prefix.write_text(json.dumps(report,indent=2)+'\n'); print(json.dumps(report,indent=2))
    finally:
        p.send_signal(signal.SIGTERM)
        try:p.wait(timeout=30)
        except subprocess.TimeoutExpired:p.kill();p.wait()
        log.close()
if __name__=='__main__': main()
