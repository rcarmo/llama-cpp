import {test,expect} from 'bun:test';
import {mkdtempSync,cpSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import{join}from'node:path';
import {audit} from './audit-results';
import {tests as repairTests} from './repair-task';
import {createHash} from 'node:crypto';
const root=import.meta.dir;
test('completed original and repair records retain failures despite faster matched generation',()=>{
 const c=audit(root,'coding'),r=audit(root,'repair');
 expect(c.complete).toBe(true);expect(r.complete).toBe(true);
 expect(c.all_tasks_pass).toBe(false);expect(r.all_tasks_pass).toBe(false);
 expect(c.rows.every(x=>x.finish_reason==='length'&&x.output_tokens===640)).toBe(true);
 expect(r.rows.every(x=>x.finish_reason==='stop'&&x.output_tokens===321)).toBe(true);
 expect(c.decode_gain_pct).toBeCloseTo(23.339,3);expect(r.decode_gain_pct).toBeCloseTo(23.9510611,5);
 expect(r.restoration.pass).toBe(true);
});
test('claiming taskpass over a failing independent test is rejected',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gemma-coding-audit-'));
 try{cpSync(root+'/runs/repair-0-mode0',dir+'/runs/repair-0-mode0',{recursive:true,filter:s=>!s.includes('/slots')});
 const path=dir+'/runs/repair-0-mode0/result.json',r=JSON.parse(readFileSync(path,'utf8'));r.task_pass=true;writeFileSync(path,JSON.stringify(r));
 expect(()=>audit(dir,'repair')).toThrow('Task acceptance records');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('aliasdiagnostic changes only import, not generatedcode or original acceptance',()=>{
 const original=readFileSync(root+'/runs/repair-0-mode0/sandbox/candidate.ts'),diagnostic=readFileSync(root+'/alias-diagnostic/candidate.ts');
 expect(createHash('sha256').update(original).digest('hex')).toBe(createHash('sha256').update(diagnostic).digest('hex'));
 expect(readFileSync(root+'/alias-diagnostic/independent.test.ts','utf8')).toBe(repairTests.replace('mergeIntervals as merge','mergeIntervalInterval as merge'));
 const r=JSON.parse(readFileSync(root+'/alias-diagnostic.json','utf8'));expect(r.pass).toBe(true);expect(r.stderr).toContain('16 expect() calls');
 expect(audit(root,'repair').all_tasks_pass).toBe(false);
});
