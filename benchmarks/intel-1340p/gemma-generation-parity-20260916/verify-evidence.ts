#!/usr/bin/env bun
/** SCRIPT_JDOC:
{"summary":"Verify Gemma generation-parity aggregate results and deployment evidence","kind":"read-only","weight":"standard","role":"entrypoint"}
*/
const dir = import.meta.dir;
const parseTsv = async (path: string) => {
  const [head, ...lines] = (await Bun.file(`${dir}/${path}`).text()).trim().split('\n').map(line => line.split('\t'));
  return lines.map(values => Object.fromEntries(head.map((key, index) => [key, values[index]])));
};
const median2 = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b);
  if (sorted.length === 2) return (sorted[0] + sorted[1]) / 2;
  if (sorted.length === 4) return (sorted[1] + sorted[2]) / 2;
  throw new Error(`unsupported median length ${sorted.length}`);
};
const close = (a: number, b: number, tolerance = 1e-6) => {
  if (Math.abs(a - b) > tolerance) throw new Error(`${a} != ${b}`);
};
const result = await Bun.file(`${dir}/result.json`).json() as any;
const factor = await parseTsv('factor-screen/results.tsv');
if (factor.length !== 12 || factor.some(row => row.swap_peak !== '0')) throw new Error('factor screen rows/swap');
if (new Set(factor.map(row => row.content_sha256)).size !== 1) throw new Error('factor output mismatch');
const draftOff = median2(factor.filter(row => row.factor === 'draft-min' && row.arm === 'off').map(row => +row.decode_tps));
const draftOn = median2(factor.filter(row => row.factor === 'draft-min' && row.arm === 'on').map(row => +row.decode_tps));
close((draftOn / draftOff - 1) * 100, result.accepted[1].decode_change_pct);
const small = await parseTsv('smallbatch-screen/results.tsv');
const smallOff = median2(small.filter(row => row.arm === 'off').map(row => +row.decode_tps));
const smallOn = median2(small.filter(row => row.arm === 'on').map(row => +row.decode_tps));
close((smallOn / smallOff - 1) * 100, result.rejected[1].decode_change_pct);
const semantic = await parseTsv('semantic-candidate-ab/results.tsv');
const live = median2(semantic.filter(row => row.arm === 'live').map(row => +row.decode_tps));
const candidate = median2(semantic.filter(row => row.arm === 'candidate').map(row => +row.decode_tps));
close(live, result.final_sustained_ab.live_decode_tps);
close(candidate, result.final_sustained_ab.candidate_decode_tps);
const quality = await Bun.file(`${dir}/unspecified-sampling/results.json`).json() as any;
if (quality.rows.length !== 4 || quality.rows.some((row: any) => !row.assessment.ok || !row.sandbox.pass || row.zero_copy.copied_bytes !== 0)) throw new Error('quality gate');
const nonstream = await Bun.file(`${dir}/qualification/nonstream.json`).json() as any;
const stream = await Bun.file(`${dir}/qualification/stream.json`).json() as any;
const tool = await Bun.file(`${dir}/qualification/stream-tool.json`).json() as any;
const cancel = await Bun.file(`${dir}/qualification/cancel-serial.json`).json() as any;
if (!nonstream.passed || nonstream.results.length !== 7 || !stream.passed || !tool.passed || !cancel.passed) throw new Error('qualification gate');
const health = await Bun.file(`${dir}/deployment/live-health-after.json`).json() as any;
if (!health.vulkan_model_resident || health.shared_bytes <= 0 || health.copied_bytes !== 0) throw new Error('live health');
const service = await Bun.file(`${dir}/deployment/live-service.txt`).text();
for (const expected of ['ActiveState=active', 'SubState=running', 'NRestarts=0', 'MemorySwapCurrent=0', 'MemorySwapPeak=0']) if (!service.includes(expected)) throw new Error(`service ${expected}`);
console.log(JSON.stringify({passed: true, factor_rows: factor.length, smallbatch_rows: small.length, quality_rows: quality.rows.length, nonstream_rows: nonstream.results.length, live_shared_bytes: health.shared_bytes}, null, 2));
