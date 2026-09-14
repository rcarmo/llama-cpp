import{test,expect}from'bun:test';import{readFileSync}from'node:fs';
test('score3 row jobs cover all rows once including all residues',()=>{
 for(const m of [32768,32784,64768,65024,65536]){const writes=new Uint8Array(m*4);const block=(ii:number,n:number)=>{for(let j=0;j<4;j++)for(let i=0;i<n;i++){if(ii+i>=m)throw Error('Output bounds');writes[j*m+ii+i]++}};
 for(let job=0;job<Math.ceil(m/48);job++){const end=Math.min(job*48+48,m);let ii=job*48;for(;ii+3<=end;ii+=3)block(ii,3);if(end-ii===2)block(ii,2);if(end-ii===1)block(ii,1)}expect(writes.every(x=>x===1)).toBe(true)}
});
test('score-only opt-in remains inside existing exact ATTN4 gate',()=>{const s=readFileSync(import.meta.dir+'/patch/sgemm.cpp','utf8');expect(s).toContain('k == 512 && m >= 32768 && score3 != nullptr');expect(s).toContain('if (n != 4 || m % 16 != 0 || k % KN != 0) return false;');expect(s).toContain('!params->use_ref');expect(s).toContain('gemm<2, 4, 8>(m, n, 1)')});
