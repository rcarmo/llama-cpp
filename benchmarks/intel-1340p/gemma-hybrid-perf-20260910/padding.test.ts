import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
const source=readFileSync(import.meta.dir+'/patch/llama-kv-cache.cpp','utf8');
const emitted=(positions:number[],max:number,n:number,padding:boolean,partial:boolean)=>positions.filter(p=>max-p<(padding&&!partial?n+256:n));
test('default source and partial checkpoint behavior unchanged',()=>{
 expect(source).toContain('(flags & LLAMA_STATE_SEQ_FLAGS_PARTIAL_ONLY) == 0');
 expect(source).toContain('swa_type == LLAMA_SWA_TYPE_STANDARD');
 const positions=Array.from({length:768},(_,i)=>4096-768+i);
 expect(emitted(positions,4095,512,false,false)).toHaveLength(512);
 expect(emitted(positions,4095,512,true,true)).toHaveLength(512);
 expect(emitted(positions,4095,512,true,false)).toHaveLength(768);
});
test('retained padding satisfies original strict rollback coverage guard',()=>{
 const p=Array.from({length:768},(_,i)=>4096-768+i),before=emitted(p,4095,512,false,false),after=emitted(p,4095,512,true,false);
 // Prompt save followed by re-evaluation of the final token needs an earlier boundary cell.
 const posNext=4095,threshold=Math.max(0,posNext-512);
 expect(before[0]>=threshold).toBe(true);expect(after[0]<threshold).toBe(true);
});
test('source never exports empty/foreign cells and leaves read path unchanged',()=>{
 expect(source).toContain('add_cell = add_cell && !cells.is_empty(i)');
 expect(source).toContain('add_cell = add_cell && (seq_id == -1 || cells.seq_has(i, seq_id))');
 const original=readFileSync('/var/home/agent/workspace/projects/llama-cpp/src/llama-kv-cache.cpp','utf8');
 expect(source.slice(source.indexOf('void llama_kv_cache::state_read('))).toBe(original.slice(original.indexOf('void llama_kv_cache::state_read(')));
});
test('larger GPU ring remains bounded to target CPU capacity',()=>{const p=Array.from({length:1536},(_,i)=>64662-1536+i),selected=emitted(p,64661,512,true,false);expect(selected).toHaveLength(768);expect(selected[0]).toBe(64662-768);expect(selected.at(-1)).toBe(64661);expect(source).toContain('preserve_swa_padding ? n_swa + 256 : n_swa')});
