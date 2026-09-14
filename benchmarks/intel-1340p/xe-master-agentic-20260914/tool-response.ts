/** SCRIPT_JDOC:
{"summary":"Remove only terminal Bun test elapsed time from model-visible responses while retaining raw results separately","kind":"read-only","weight":"lightweight","role":"module"}
*/
// Raw results remain in tools.json; only model-visible fixture-test durations change.
export function stableToolResponse(name:string,result:any){
 if(name!=='run_tests'||!result||typeof result!=='object')return result;
 const clean=(text:unknown)=>typeof text==='string'?text.replace(/^(Ran [1-9]\d* tests? across [1-9]\d* files?\. )\[\d+(?:\.\d+)?(?:ms|s)\]$/gm,'$1[elapsed]').replace(/^(\((?:pass|fail)\) contract )\[\d+(?:\.\d+)?(?:ms|s)\]$/gm,'$1[elapsed]'):text;
 return{...result,stdout:clean(result.stdout),stderr:clean(result.stderr)};
}
