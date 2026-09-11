import { test, expect } from 'bun:test';
import { checkSpeechJobs } from './speech';
const raw = ['whisper-stt.service','whisper-stt-diarizer.service'].map(Id=>`Id=${Id}\nLoadState=loaded\nActiveState=inactive\nSubState=dead\nMainPID=0`).join('\n\n');
function fake(patch: any = {}) { return {command:async(argv:string[])=>argv[0]==='systemctl'?raw:'',jobs:async()=>[],native:()=>[],...patch}; }
test('explicit stopped mode accepts two inactive units and no sockets/native, without HTTP',async()=>{
 await checkSpeechJobs('stopped',fake({jobs:async()=>{throw Error('Unexpected HTTP')}}));expect(true).toBe(true);
});
test('active mode still requires available terminal job metadata',async()=>{
 await checkSpeechJobs('active',fake());
 await expect(checkSpeechJobs('active',fake({jobs:async()=>{throw Error('Connection refused')}}))).rejects.toThrow();
 for(const jobs of [[{state:'running'}],null,[{}]]) await expect(checkSpeechJobs('active',fake({jobs:async()=>jobs}))).rejects.toThrow();
});
test('stopped mode rejects reactivation, missing/failed units and nonzero PID',async()=>{
 for(const [a,b] of [['ActiveState=inactive','ActiveState=active'],['LoadState=loaded','LoadState=not-found'],['SubState=dead','SubState=failed'],['MainPID=0','MainPID=123']]) await expect(checkSpeechJobs('stopped',fake({command:async()=>raw.replace(a,b)}))).rejects.toThrow();
});
test('stopped mode rejects listeners, connections, native work and command failure',async()=>{
 for(const patch of [{command:async(a:string[])=>a[0]==='systemctl'?raw:'LISTEN 0 1'}, {native:()=>['diar-server']}, {native:()=>['whisper-cli']}, {command:async()=>{throw Error('Unavailable')}}]) await expect(checkSpeechJobs('stopped',fake(patch))).rejects.toThrow();
 await expect(checkSpeechJobs('unknown' as any,fake())).rejects.toThrow();
});
test('stopped unit parsing rejects malformed/duplicate blocks and permits order swap',async()=>{
 const blocks=raw.split('\n\n');
 for(const output of ['',raw.replace('\n\n','\n'),blocks[0]+'\n\n'+blocks[0],raw.replace('MainPID=0','MainPID=')]) await expect(checkSpeechJobs('stopped',fake({command:async()=>output}))).rejects.toThrow();
 await checkSpeechJobs('stopped',fake({command:async(a:string[])=>a[0]==='systemctl'?blocks.reverse().join('\n\n'):''}));expect(true).toBe(true);
});
test('established sockets reject even with no listeners',async()=>{
 await expect(checkSpeechJobs('stopped',fake({command:async(a:string[])=>a[0]==='systemctl'?raw:a.includes('established')?'0 0 127.0.0.1:8701 127.0.0.1:40000':''}))).rejects.toThrow('sockets');
});
