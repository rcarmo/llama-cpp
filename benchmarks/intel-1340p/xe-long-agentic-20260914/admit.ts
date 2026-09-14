/** SCRIPT_JDOC:
{"summary":"Validate frozen long-task inputs and record a single exact three-arm admission after explicit peer approval","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,existsSync,statSync}from'node:fs';import{createHash}from'node:crypto';import{strict as assert}from'node:assert';
const root=import.meta.dir,id=process.argv[2],arm=process.argv[3];assert.equal(process.argv[4],'explicit-three-way-admit');
const f=JSON.parse(readFileSync(root+'/freeze.json','utf8'));assert.ok(f.order.includes(id));assert.ok(['cpu','copy','share'].includes(arm)&&id.startsWith('long-'+arm+'-'));assert.equal(existsSync(root+'/runs/'+id),false);assert.equal(existsSync(root+'/evidence/unit-'+id+'.log'),false);
for(const[p,h]of Object.entries(f.files))assert.equal(createHash('sha256').update(readFileSync(p)).digest('hex'),h,p);
for(const m of f.models){const s=statSync(m.path);assert.equal(s.size,m.size);assert.equal(s.mtimeMs,m.mtime_ms);assert.equal(s.ino,m.ino);}
writeFileSync(root+'/admission.json',JSON.stringify({id,arm,expires:new Date(Date.now()+1260000).toISOString(),scope:'Fresh three-way exact admission;one1200s16GiBzeroSwap6GiBreserve long-task arm;48turns1024each12288total'},null,2)+'\n');
console.log(`Frozen artifacts validated; exact ${id}/${arm} admission recorded`);
