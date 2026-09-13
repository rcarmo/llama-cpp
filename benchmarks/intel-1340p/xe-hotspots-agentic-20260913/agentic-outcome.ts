/** SCRIPT_JDOC:
{"summary":"Classify bounded agentic task outcomes separately from native-process exit status","kind":"read-only","weight":"lightweight","role":"module"}
*/
export function outcome(r:{abort:string;phases:number;rounds:any[];grades:any[];tool_calls:any[];final_grade?:any},limit=10){
 let failure='';
 if(r.abort)failure='harness_or_resource_failure';
 else if(r.rounds.some(x=>x.stop==='length'))failure='output_budget_exhausted';
 else if(r.phases!==2)failure=r.rounds.length>=limit?'round_budget_exhausted':'independent_grade_failed';
 else if(r.grades.length!==2||!r.grades.every(x=>x.ok))failure='independent_grade_failed';
 else if(!r.tool_calls.some(x=>x.name==='edit_file'&&x.result?.ok)||!r.tool_calls.some(x=>x.name==='run_tests'&&x.result?.ok))failure='required_tools_missing';
 return{success:!failure,failure_reason:failure,exit_code:r.abort?1:failure?2:0};
}
export function validAdmission(a:{run_id?:string;expires?:string},id:string,now=Date.now()){
 const expiry=Date.parse(a.expires||'');
 if(a.run_id!==id||!Number.isFinite(expiry)||now>=expiry)throw Error('Admission ID mismatch or expired');
}
