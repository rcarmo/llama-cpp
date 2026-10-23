// Deterministic guards/evaluators for the frozen policy and evidence tasks.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out=process.argv[2]??'.';
const suite=JSON.parse(fs.readFileSync(out+'/suite.json','utf8'));
const heldouts=JSON.parse(fs.readFileSync(out+'/suite-B.json','utf8'));
const byId=new Map([...suite.tasks,...heldouts.tasks].map((t:any)=>[t.id.replace(/-B$/,''),t]));
function userText(id:string){const t:any=byId.get(id);assert.ok(t,`missing fixture ${id}`);return t.request.messages.at(-1).content as string;}
function expense(text:string,allowDeadlineWaiver:boolean){
 const rows=new Map<string,{amount:number;receipt:boolean;day:number;category:string;exception:boolean}>();
 for(const line of text.split('\n')){const m=line.match(/^([A-F]): amount (\d+) EUR, receipt (yes|no), submitted day (\d+), category ([a-z]+), manager exception (yes|no)\.$/);if(m)rows.set(m[1],{amount:+m[2],receipt:m[3]==='yes',day:+m[4],category:m[5],exception:m[6]==='yes'});}
 assert.equal(rows.size,6,'parse all six supplied expense rows');
 const approved:string[]=[],reasons:Record<string,string>={};let total=0;
 for(const [id,r] of [...rows].sort(([a],[b])=>a.localeCompare(b))){let reason='approved';if(r.category==='alcohol')reason='alcohol';else if(!r.receipt)reason='missing_receipt';else if(r.day>30&&!(allowDeadlineWaiver&&r.exception))reason='late';if(reason==='approved'){approved.push(id);total+=r.amount}else reasons[id]=reason;}
 return {approved_ids:approved,total_eur:total,reasons};
}
const expenseInput=userText('q04-policy');
const expenses=expense(expenseInput,true);
assert.deepEqual(expenses,{approved_ids:['A','B','F'],total_eur:135,reasons:{C:'missing_receipt',D:'alcohol',E:'late'}});
assert.deepEqual(expense(expenseInput,false).reasons,{B:'late',C:'missing_receipt',D:'alcohol',E:'late'},'deadline exception affects B only; receipt/alcohol exclusions remain');
const returnText=userText('h01-waiver');const records=new Map<string,{opened:boolean;receipt:boolean;day:number;waiver:boolean}>();
for(const m of returnText.matchAll(/(R\d+) (opened|unopened),receipt(yes|no),day(\d+),waiver(yes|no)/g))records.set(m[1],{opened:m[2]==='opened',receipt:m[3]==='yes',day:+m[4],waiver:m[5]==='yes'});
assert.deepEqual([...records.keys()].sort(),['R1','R2','R3','R4'],'extract only the four supplied return IDs');
const returns={eligible:[] as string[],denied:{} as Record<string,string>};
for(const [id,r] of [...records].sort(([a],[b])=>a.localeCompare(b))){let reason='';if(r.opened)reason='opened';else if(!r.receipt)reason='missing_receipt';else if(r.day>14&&!r.waiver)reason='late';if(reason)returns.denied[id]=reason;else returns.eligible.push(id);}
assert.deepEqual(returns,{eligible:['R1','R4'],denied:{R2:'opened',R3:'missing_receipt'}});
function validateReturnDecision(answer:any){assert.ok(answer&&Array.isArray(answer.eligible)&&answer.denied&&typeof answer.denied==='object');const observed=[...answer.eligible,...Object.keys(answer.denied)];assert.equal(new Set(observed).size,observed.length,'no duplicate record IDs');assert.deepEqual(observed.sort(),[...records.keys()].sort(),'reject invented/missing record IDs');assert.deepEqual(answer,returns,'re-evaluate decisions from stated policy');}
assert.throws(()=>validateReturnDecision({eligible:['R1','R4'],denied:{R2:'opened',R3:'missing_receipt',R20:'late'}}),/invented\/missing record IDs/,'reject invented R20');
validateReturnDecision(returns);
const evidence=userText('h02-evidence');
const facts=[...evidence.matchAll(/\[(S\d+)\]\s*([^\n.]+)\./g)].map((m:any)=>({id:m[1],text:m[2]}));assert.equal(facts.length,4);
function mentions(needle:string){return facts.filter(f=>f.text.toLowerCase().includes(needle.toLowerCase()));}
const freebsd=mentions('ProductBeacon4'),audit=mentions('Auditlogging'),solar=mentions('Solaris');
assert.deepEqual(freebsd.map(x=>x.id),['S1','S2']);assert.deepEqual(audit.map(x=>x.id),['S3','S4']);assert.deepEqual(solar,[]);
function resolvePair(pair:any[],yes:string,no:string){const y=pair.filter(x=>x.text.toLowerCase().includes(yes.toLowerCase()));const n=pair.filter(x=>x.text.toLowerCase().includes(no.toLowerCase()));return y.length&&n.length?'unknown':y.length?'yes':n.length?'no':'unknown';}
const resolved={freebsd_supported:resolvePair(freebsd,'supportsFreeBSD','doesnot supportFreeBSD'),audit_log_default:resolvePair(audit,'onbydefault','offbydefault'),solar_is_supported:resolvePair(solar,'supportsSolaris','doesnot supportSolaris'),conflicts:[freebsd.map(x=>x.id),audit.map(x=>x.id)]};
assert.deepEqual(resolved,{freebsd_supported:'unknown',audit_log_default:'unknown',solar_is_supported:'unknown',conflicts:[['S1','S2'],['S3','S4']]});
const receipt={passed:true,checks:['expense precedence/day-30/scoped waiver','exception interaction tests','exact record-set enforcement; R20 injection rejected','conflict abstention/source-ID provenance','unknown for absent Solaris evidence'],output:{expense:expenses,returns,evidence:resolved}};
fs.writeFileSync(out+'/rule-verification.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
