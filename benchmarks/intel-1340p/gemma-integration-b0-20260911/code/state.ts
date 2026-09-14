/** SCRIPT_JDOC:
{"summary":"Validate Gemma E4B F16 compact-SWA seq-v3 payload before emitting compatible seq-v2 state","kind":"mutating","weight":"standard","role":"entrypoint"}
*/
import{openSync,readSync,closeSync,statSync,copyFileSync,writeSync,fsyncSync,renameSync,unlinkSync,existsSync}from'node:fs';
import{createHash}from'node:crypto';
export function validateGemmaState(path:string,expectedStreams=2,expectedVersion=3){
 const fd=openSync(path,'r'),size=statSync(path).size;let offset=0;
 const need=(n:number)=>{if(!Number.isSafeInteger(n)||n<0||offset+n>size)throw Error('Truncated/invalid state at '+offset)};
 const bytes=(n:number)=>{need(n);const b=Buffer.alloc(n);if(readSync(fd,b,0,n,offset)!==n)throw Error('Short read');offset+=n;return b};
 const u32=()=>bytes(4).readUInt32LE(),u64=()=>Number(bytes(8).readBigUInt64LE());
 const skip=(n:number)=>{need(n);offset+=n};const caches:any[]=[];
 try{
  if(u32()!==0x67677371||u32()!==expectedVersion)throw Error('Unsupported state header');const packed=u32();if(packed<1||packed>131076)throw Error('Invalid prompt token count');
  const blob=bytes(packed*4);let tokenData=blob,serverWrapped=false;
  if(blob.readUInt32LE(0)===0xffffffff){
   if(packed<5||blob.readUInt32LE(4)!==1)throw Error('Unsupported server token wrapper');
   const n=blob.readUInt32LE(8);if(n<1||packed!==n+4||blob.readUInt32LE(12+n*4)!==0)throw Error('Media or invalid token wrapper');
   tokenData=blob.subarray(12,12+n*4);serverWrapped=true;
  }
  const tokens=tokenData.length/4,kv_offset=offset;
  for(let i=0;i<tokens;i++)if(tokenData.readInt32LE(i*4)<0)throw Error('Non-text token');
  for(let cache=0;cache<2;cache++){
   const streams=u32();if(streams!==expectedStreams)throw Error('Incompatible streams');const seqs:any[]=[];
   for(let s=0;s<streams;s++){
    const count=u32();if(!count)continue;if(count>131072||cache===1&&count>768)throw Error('Not compact-SWA bounded Gemma state');
    let min=Infinity,max=-1;const positions=new Set<number>();let owner=-1;
    for(let i=0;i<count;i++){
     const pos=u32(),nseq=u32(),seq=u32();if(pos>=131072||nseq!==1||seq>=streams||positions.has(pos)||owner>=0&&seq!==owner)throw Error('Unexpected cell metadata/extension');
     owner=seq;positions.add(pos);min=Math.min(min,pos);max=Math.max(max,pos);
    }
    if(max-min+1!==count)throw Error('Noncontiguous positions');
    const trans=u32(),layers=u32(),expectedLayers=cache===0?4:20,width=cache===0?1024:512;
    if(trans!==1||layers!==expectedLayers)throw Error('Not Gemma E4B F16 FA-off layout');
    for(let l=0;l<layers;l++){if(u32()!==1||u64()!==width*2)throw Error('Unexpected K type/row');skip(count*width*2)}
    for(let l=0;l<layers;l++){if(u32()!==1||u32()!==2||u32()!==width)throw Error('Unexpected V type/row');skip(count*width*2)}
    seqs.push({stream:s,owner,count,min,max});
   }
   if(seqs.length!==1)throw Error('Expected one occupied stream per seq file');caches.push({streams,seqs});
  }
  if(offset!==size)throw Error('Trailing bytes: unsupported schema');
  const global=caches[0].seqs[0],swa=caches[1].seqs[0];if(global.owner!==swa.owner||global.stream!==swa.stream||global.max!==swa.max||global.min!==0||global.count!==tokens||swa.min>=Math.max(0,global.max-512))throw Error('Insufficient target/SWA position coverage');
  return {tokens,packed,serverWrapped,tokenData,kv_offset,size,caches,parsed_bytes:offset,schema:'Gemma E4B standard compact-SWA, no M-RoPE/PLE extensions, F16 FA-off, identical v2/v3 payload subset'};
 }finally{closeSync(fd)}
}
function payloadHash(path:string,start:number){const fd=openSync(path,'r'),b=Buffer.alloc(1024*1024),h=createHash('sha256');let pos=start;try{for(;;){const n=readSync(fd,b,0,b.length,pos);if(!n)break;h.update(b.subarray(0,n));pos+=n}return h.digest('hex')}finally{closeSync(fd)}}
export function convertGemmaV3ToV2(input:string,output:string,streams=2){
 if(existsSync(output))throw Error('Output exists; preserve evidence');const parsed=validateGemmaState(input,streams,3),tmp=output+'.tmp';if(existsSync(tmp))throw Error('Temporary output exists');
 try{const src=openSync(input,'r'),dst=openSync(tmp,'wx',0o600);try{
   const header=Buffer.alloc(12);header.writeUInt32LE(0x67677371);header.writeUInt32LE(2,4);header.writeUInt32LE(parsed.tokens,8);writeSync(dst,header);writeSync(dst,parsed.tokenData);
   const buf=Buffer.alloc(1024*1024);let at=parsed.kv_offset;for(;;){const n=readSync(src,buf,0,buf.length,at);if(!n)break;writeSync(dst,buf,0,n);at+=n}fsyncSync(dst);
  }finally{closeSync(src);closeSync(dst)}
  const target=validateGemmaState(tmp,streams,2),source_hash=payloadHash(input,parsed.kv_offset),target_hash=payloadHash(tmp,target.kv_offset);if(source_hash!==target_hash||!parsed.tokenData.equals(target.tokenData))throw Error('KV or tokens changed');renameSync(tmp,output);
  const clean=({tokenData,...rest}:any)=>rest;
  return {input,output,parsed:clean(parsed),target:clean(target),kv_sha256:source_hash,scope:'Validate Gemma subset; unwrap text-only server tokens and translate v3 to v2. KV bytes and token IDs unchanged. Native loader guards retained; media/extensions rejected.'};
 }catch(e){if(existsSync(tmp))unlinkSync(tmp);throw e}
}
if(import.meta.main){const[input,output,streams]=process.argv.slice(2);console.log(JSON.stringify(convertGemmaV3ToV2(input,output,Number(streams??2)),null,2))}
