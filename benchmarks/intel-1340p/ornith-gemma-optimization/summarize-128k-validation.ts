#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? join(import.meta.dir, "validation/candidate-128k");
const work = join(import.meta.dir, "workloads/near-capacity-128k");
const profiles = ["ornith", "gemma4"] as const;

type Sample = {
  phase: string; elapsed: number; rss_kib: number; pss_kib: number; read_bytes: number;
  minflt: number; majflt: number; mem_available_kib: number; swap_free_kib: number;
  pswpin_delta: number; pswpout_delta: number; pgmaj_delta: number; pkg_temp_mC: number;
};

function loadJson(path: string) { return JSON.parse(readFileSync(path, "utf8")); }
function samples(path: string): Sample[] {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8").trim();
  if (!text) return [];
  return text.split("\n").slice(1).filter(Boolean).map((line) => {
    const x = line.split("\t");
    return { phase:x[1],elapsed:+x[2],rss_kib:+x[3],pss_kib:+x[4],read_bytes:+x[5],minflt:+x[6],majflt:+x[7],mem_available_kib:+x[8],swap_free_kib:+x[9],pswpin_delta:+x[10],pswpout_delta:+x[11],pgmaj_delta:+x[12],pkg_temp_mC:+x[13] };
  });
}
function max(rows: Sample[], key: keyof Sample) { return rows.length ? Math.max(...rows.map((x) => Number(x[key]))) : null; }
function min(rows: Sample[], key: keyof Sample) { return rows.length ? Math.min(...rows.map((x) => Number(x[key]))) : null; }
function dryRunValue(dir: string, option: string) {
  const path = join(dir, "dry-run.txt");
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  const escaped = option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`(?:^|\\s)${escaped}\\s+(\\S+)`));
  return match?.[1] ?? null;
}
function effectiveNumber(run: any, dir: string, field: string, option: string) {
  const value = run[field] ?? dryRunValue(dir, option);
  return value == null ? null : Number(value);
}
function effectiveString(run: any, dir: string, field: string, option: string) {
  return run[field] ?? dryRunValue(dir, option);
}
function failureMarker(dir: string) {
  for (const [file, reason] of [["thermal-abort.txt","thermal_abort"],["timeout-abort.txt","timeout"],["request-failed.txt","request_failed"]] as const) {
    if (existsSync(join(dir,file))) return { reason, detail: readFileSync(join(dir,file),"utf8").trim() };
  }
  return null;
}

const result: Record<string, any> = {};
let complete = true;
for (const profile of profiles) {
  const name = `${profile}-128k-b1024-u256`;
  const dir = join(root, name);
  const resultPath = join(dir, "result.json");
  const contextPath = join(dir, "context-response.json");
  const rows = samples(join(dir, "samples.tsv"));
  const marker = failureMarker(dir);
  if (marker) {
    complete = false;
    result[profile] = { status:"failed", failure_reason:marker.reason, failure_detail:marker.detail, samples:rows.length, last_elapsed_s:rows.at(-1)?.elapsed??null, max_pss_kib:max(rows,"pss_kib"), max_temp_mC:max(rows,"pkg_temp_mC") };
    continue;
  }
  if (!existsSync(resultPath) || !existsSync(contextPath) || readFileSync(contextPath,"utf8").trim()==="") {
    complete = false;
    result[profile] = { status:"incomplete",samples:rows.length,last_elapsed_s:rows.at(-1)?.elapsed??null,max_pss_kib:max(rows,"pss_kib"),max_temp_mC:max(rows,"pkg_temp_mC") };
    continue;
  }

  let run: any, response: any, metadata: any;
  try {
    run=loadJson(resultPath); response=loadJson(contextPath); metadata=loadJson(join(work,`${profile}-tokenization.json`));
  } catch (error) {
    complete=false; result[profile]={status:"failed",failure_reason:"malformed_json",detail:String(error)}; continue;
  }
  const effective = {
    context: effectiveNumber(run,dir,"context","--ctx-size"),
    batch: effectiveNumber(run,dir,"batch","--batch-size"),
    ubatch: effectiveNumber(run,dir,"ubatch","--ubatch-size"),
    kv: effectiveString(run,dir,"kv","--cache-type-k"),
    flash_attn: effectiveString(run,dir,"flash_attn","--flash-attn"),
  };
  const timings=response.timings??{};
  const message=response.choices?.[0]?.message??{};
  const toolCalls=message.tool_calls??[];
  const tool=toolCalls[0]?.function;
  let toolArgs:any=null;
  try { toolArgs=JSON.parse(tool?.arguments??""); } catch {}
  const accepted={
    context_exact:effective.context===metadata.context,
    geometry_exact:effective.batch===1024&&effective.ubatch===256,
    profile_exact:effective.kv==="f16"&&effective.flash_attn==="off",
    prompt_tokens_at_least_min:(timings.prompt_n??0)>=metadata.prompt_tokens_min,
    output_headroom:(timings.prompt_n??0)+metadata.reserved_output_tokens<=metadata.context,
    generated_output:(timings.predicted_n??0)>0,
    exactly_one_tool_call:toolCalls.length===1,
    required_tool_call:tool?.name===metadata.required_tool_name,
    valid_tool_arguments:toolArgs!==null&&JSON.stringify(Object.keys(toolArgs).sort())===JSON.stringify(["max_results","path","query"])&&typeof toolArgs.query==="string"&&typeof toolArgs.path==="string"&&Number.isInteger(toolArgs.max_results)&&toolArgs.max_results>=1&&toolArgs.max_results<=20,
    no_stray_content:typeof message.content!=="string"||message.content.trim()==="",
    finished_by_tool_call:response.choices?.[0]?.finish_reason==="tool_calls",
    speculative_activity:(timings.draft_n??0)>0&&(timings.draft_n_accepted??0)>0,
    no_thermal_abort:!existsSync(join(dir,"thermal-abort.txt")),
  };
  const status=Object.values(accepted).every(Boolean)?"passed":"failed";
  if(status!=="passed")complete=false;
  result[profile]={status,accepted,context:effective.context,batch:effective.batch,ubatch:effective.ubatch,kv:effective.kv,flash_attn:effective.flash_attn,prompt_tokens:timings.prompt_n,generated_tokens:timings.predicted_n,prompt_tps:timings.prompt_per_second,generation_tps:timings.predicted_per_second,draft_tokens:timings.draft_n,accepted_draft_tokens:timings.draft_n_accepted,finish_reason:response.choices?.[0]?.finish_reason,tool_name:tool?.name??null,tool_arguments:toolArgs,wall_samples:rows.length,elapsed_s:rows.at(-1)?.elapsed??null,max_rss_kib:max(rows,"rss_kib"),max_pss_kib:max(rows,"pss_kib"),max_proc_majflt:max(rows,"majflt"),min_mem_available_kib:min(rows,"mem_available_kib"),min_swap_free_kib:min(rows,"swap_free_kib"),max_pswpin_delta:max(rows,"pswpin_delta"),max_pswpout_delta:max(rows,"pswpout_delta"),max_global_pgmaj_delta:max(rows,"pgmaj_delta"),max_temp_mC:max(rows,"pkg_temp_mC"),final_snapshot:run};
}
const output={generated_at:new Date().toISOString(),complete,profiles:result};
writeFileSync(join(root,"summary.json"),JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify(output,null,2));
if(!complete||Object.values(result).some((x:any)=>x.status!=="passed"))process.exitCode=1;
