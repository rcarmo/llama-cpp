/** SCRIPT_JDOC:
{"summary":"Strict resource, numeric test-file and owned-lock validation for B0 maintenance","kind":"read-only","weight":"lightweight","role":"module"}
*/
import { readFileSync, openSync, writeFileSync, closeSync, unlinkSync } from 'node:fs';
export function requiredCounter(text: string, key: string) {
 const m=text.match(new RegExp('^'+key+':?\\s+(\\d+)(?:\\s|$)','m'));
 if(!m)throw Error('Missing counter '+key);const n=Number(m[1]);if(!Number.isSafeInteger(n))throw Error('Invalid counter '+key);return n;
}
export function resources(mem: string, workers: string[]) {
 if(requiredCounter(mem,'MemAvailable')<6*1048576)throw Error('Memory reserve');
 for(const w of workers){if(/^State:\s+Z\b/m.test(w))continue;if(requiredCounter(w,'VmRSS')<=0)throw Error('Worker missing');if(requiredCounter(w,'VmSwap')>16384)throw Error('Worker swap');}
}
export function parseCases(source: string, expected: number) {
 const lines=source.trim().split('\n');if(lines.length!==expected)throw Error('Case count');
 return lines.map(line=>{const t=line.trim().split(/\s+/);let i=0;const num=()=>{if(!/^\d+$/.test(t[i]??''))throw Error('Numeric case required');return Number(t[i++])};
 const op=num(),type=num(),dims=Array.from({length:4},num),params=num();if(op!==29||type!==0||params>16||dims.some(n=>n<1))throw Error('MUL_MAT header');for(let j=0;j<params;j++)num();const nsrc=num();if(nsrc!==2)throw Error('Two sources');
 const src=Array.from({length:nsrc},()=>({type:num(),ne:Array.from({length:4},num),nb:Array.from({length:4},num)}));
 if(!t[i]||i!==t.length-1||src.some(s=>s.ne.some(n=>n<1)||s.nb.some(n=>n<1)))throw Error('Case EOF/shape');
 if(src[0].ne[0]!==src[1].ne[0]||dims[0]!==src[0].ne[1]||dims[1]!==src[1].ne[1])throw Error('Matrix dimensions');
 return {op,type,dims,src,name:t[i]};});
}
export function acquireLock(path: string) {
 try {const fd=openSync(path,'wx');writeFileSync(fd,String(process.pid));return fd;}
 catch(e){if(e.code!=='EEXIST')throw e;throw Error('Retained lock: inspect owner and supervised unit before explicitly removing '+path);}
}
export function releaseLock(path: string, fd: number) {
 closeSync(fd);if(readFileSync(path,'utf8').trim()!==String(process.pid))throw Error('Lock ownership changed');unlinkSync(path);
}
