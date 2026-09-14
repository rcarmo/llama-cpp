/** SCRIPT_JDOC:
{"summary":"Campaign-wide fail-closed ownership lease through preflight, work and verified restoration","kind":"mutating","weight":"lightweight","role":"module"}
*/
import { mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync,rmdirSync,existsSync } from 'node:fs';
export type RecordState={token:string;unit:string;phase:'admission'|'stop-intent'|'running'|'restoring';snapshot?:any};
export class Lease {
 constructor(public path:string){}
 read():RecordState|null { if(!existsSync(this.path))return null;return JSON.parse(readFileSync(this.path+'/owner.json','utf8')); }
 acquire(token:string,unit:string){if(!/^[a-zA-Z0-9-]{10,100}$/.test(token))throw Error('Token');try{mkdirSync(this.path,{mode:0o700})}catch(e){if(e.code==='EEXIST')throw Error('Lease held; no automatic stale takeover');throw e}this.write({token,unit,phase:'admission'});}
 write(r:RecordState){writeFileSync(this.path+'/owner.tmp',JSON.stringify(r,null,2)+'\n',{mode:0o600});renameSync(this.path+'/owner.tmp',this.path+'/owner.json');}
 owned(token:string,unit:string){const r=this.read();if(!r||r.token!==token||r.unit!==unit)throw Error('Not lease owner');return r;}
 change(token:string,unit:string,phase:RecordState['phase'],snapshot?:any){const r=this.owned(token,unit);this.write({...r,phase,...(snapshot?{snapshot}:{})});}
 release(token:string,unit:string){this.owned(token,unit);unlinkSync(this.path+'/owner.json');rmdirSync(this.path);}
}
export interface Operations {preflight():Promise<any>;stop(snapshot:any):Promise<void>;work():Promise<void>;cleanup(snapshot:any):Promise<void>;checkSnapshot(snapshot:any):Promise<void>;start(snapshot:any):Promise<void>;verify(snapshot:any):Promise<void>}
export async function runStage(lease:Lease,token:string,unit:string,ops:Operations){lease.acquire(token,unit);const snapshot=await ops.preflight();lease.change(token,unit,'stop-intent',snapshot);await ops.stop(snapshot);lease.change(token,unit,'running');await ops.work();}
// Invoked by ExecStopPost after systemd has stopped all processes in this stage's cgroup.
// A failed admission has no stop intent. Wrong/delayed token is a no-op; failed cleanup/verify retains the lease.
export async function restoreStage(lease:Lease,token:string,unit:string,ops:Operations){let r:RecordState|null;try{r=lease.read()}catch{throw Error('Uncertain lease; manual inspection required')}if(!r||r.token!==token||r.unit!==unit)return{restored:false,reason:'not-owner'};if(r.phase==='admission'){lease.release(token,unit);return{restored:false,reason:'admission-only'}}if(!r.snapshot)throw Error('Missing snapshot');await ops.checkSnapshot(r.snapshot);lease.change(token,unit,'restoring');await ops.cleanup(r.snapshot);await ops.start(r.snapshot);await ops.verify(r.snapshot);lease.release(token,unit);return{restored:true};}
