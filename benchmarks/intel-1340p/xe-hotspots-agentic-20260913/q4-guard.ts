/** SCRIPT_JDOC:
{"summary":"Parse Q4 screen worker and cgroup counters with fail-closed live-process swap validation","kind":"read-only","weight":"lightweight","role":"module"}
*/
export function workerStatus(status:string){
 const state=status.match(/^State:\s+(\S+)/m)?.[1],value=status.match(/^VmSwap:\s+(\d+)/m)?.[1];
 const exited=!status||state==='Z'||state==='X',swap=value===undefined?null:Number(value);
 return{state,exited,swap,violation:!exited&&(swap===null||swap>16384)};
}
export function counter(text:string,key:string){const value=text.match(new RegExp('^'+key+' (\\d+)$','m'))?.[1];if(value===undefined)throw Error('Missing cgroup counter '+key);return Number(value);}
