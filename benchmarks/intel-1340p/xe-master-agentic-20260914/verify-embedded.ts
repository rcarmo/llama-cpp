/** SCRIPT_JDOC:
{"summary":"Verify split generated shader source reassembly and every embedded ELF shader byte/length without loading or executing the Vulkan plugin","kind":"read-only","weight":"standard","role":"entrypoint"}
*/
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
const root=import.meta.dir,manifest=JSON.parse(readFileSync(root+'/evidence/embedded-split.json','utf8'));
const hash=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex');
const original=readFileSync(manifest.generated,'utf8');assert.equal(hash(original),manifest.source_sha256);
const chunks=manifest.files.map(f=>{const s=readFileSync(root+'/embedded-mul-mm/'+f.name,'utf8');assert.equal(hash(s),f.sha256);assert.ok(s.startsWith(manifest.header));return s.slice(manifest.header.length);});
assert.equal(manifest.header+chunks.join(''),original);
if(process.argv.includes('--source-only')){console.log(`PASS source: ${manifest.files.length} chunks,${manifest.declaration_count} declarations,exact byte reassembly`);process.exit(0);}
const file=readFileSync(root+'/build-vulkan-parent/bin/libggml-vulkan.so');
assert.equal(file.subarray(0,4).toString('hex'),'7f454c46');assert.equal(file[4],2);assert.equal(file[5],1);
const number=(n:bigint)=>{assert.ok(n<=BigInt(Number.MAX_SAFE_INTEGER));return Number(n);};
const shoff=number(file.readBigUInt64LE(40)),shsize=file.readUInt16LE(58),count=file.readUInt16LE(60);
assert.ok(shsize>=64&&shoff+shsize*count<=file.length);
const sections=Array.from({length:count},(_,i)=>{const p=shoff+i*shsize;return{type:file.readUInt32LE(p+4),address:number(file.readBigUInt64LE(p+16)),offset:number(file.readBigUInt64LE(p+24)),size:number(file.readBigUInt64LE(p+32)),link:file.readUInt32LE(p+40),entsize:number(file.readBigUInt64LE(p+56))};});
const symbols=new Map<string,{value:number,size:number,section:number}>();
for(const s of sections.filter(s=>s.type===11||s.type===2)){
 assert.equal(s.entsize,24);const str=sections[s.link];assert.ok(str&&str.offset+str.size<=file.length);
 for(let i=0;i<s.size;i+=24){const p=s.offset+i,n=file.readUInt32LE(p),section=file.readUInt16LE(p+6);if(!n||!section)continue;const end=file.indexOf(0,str.offset+n);assert.ok(end>=0&&end<=str.offset+str.size);const name=file.toString('utf8',str.offset+n,end);symbols.set(name,{value:number(file.readBigUInt64LE(p+8)),size:number(file.readBigUInt64LE(p+16)),section});}
}
function data(name:string,size:number){const sym=symbols.get(name);assert.ok(sym,'Missing symbol '+name);assert.equal(sym.size,size,name);const section=sections[sym.section];assert.ok(section);const p=section.offset+sym.value-section.address;assert.ok(p>=section.offset&&p+size<=section.offset+section.size&&p+size<=file.length);return file.subarray(p,p+size);}
const re=/const uint64_t ([A-Za-z0-9_]+)_len = (\d+);\nconst unsigned char \1_data\[\2\] = \{([\s\S]*?)\n\};/g;
let verified=0,total=0;
for(const m of original.matchAll(re)){
 const n=Number(m[2]),expected=Buffer.alloc(n);let index=0;
 for(const value of m[3].matchAll(/0x([0-9a-fA-F]{1,2})/g)){assert.ok(index<n);expected[index++]=parseInt(value[1],16);}
 assert.equal(index,n);assert.equal(data(m[1]+'_len',8).readBigUInt64LE(),BigInt(n));assert.ok(data(m[1]+'_data',n).equals(expected),m[1]);verified++;total+=n;
}
assert.equal(verified,manifest.declaration_count);assert.equal(total,manifest.shader_bytes);
console.log(`PASS ELF: ${verified} shader lengths and ${total} embedded bytes exactly match original generated source; no plugin execution`);
