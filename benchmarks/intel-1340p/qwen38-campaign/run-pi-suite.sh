#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
out=$root/benchmarks/intel-1340p/qwen38-campaign/pi/qwen38
provider=local-qwen38
model=qwen3.8-27b-q4km-mtp
endpoint=http://127.0.0.1:8094
PI_BIN=${PI_BIN:-/opt/piclaw/current/app/node_modules/.bin/pi}
BUN_BIN=${BUN_BIN:-/opt/piclaw/current/bun/bin/bun}
export PATH="$(dirname "$BUN_BIN"):$(dirname "$PI_BIN"):$PATH"
fixture=/tmp/qwen38-pi-fixture
base=/tmp/qwen38-pi-fixture-base
mkdir -p "$out"
rm -rf "$fixture" "$base"
mkdir -p "$base/src"
cat > "$base/package.json" <<'JSON'
{"name":"agentic-edit-fixture","type":"module","scripts":{"test":"bun test"}}
JSON
cat > "$base/src/clamp.ts" <<'TS'
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, value);
}
TS
cat > "$base/src/clamp.test.ts" <<'TS'
import { expect, test } from "bun:test";
import { clamp } from "./clamp";

test("clamps below, within, and above the range", () => {
  expect(clamp(-2, 0, 10)).toBe(0);
  expect(clamp(5, 0, 10)).toBe(5);
  expect(clamp(12, 0, 10)).toBe(10);
});
TS
cp -a "$base" "$fixture"

run_pi() {
  local name=$1 cwd=$2 timeout_s=$3 prompt=$4 tools=$5
  local start end rc
  start=$(date +%s%N)
  set +e
  (cd "$cwd" && timeout "$timeout_s" "$PI_BIN" -p --provider "$provider" --model "$model" \
    --thinking low --no-session --tools "$tools" "$prompt") \
    > "$out/$name.stdout" 2> "$out/$name.stderr"
  rc=$?
  set -e
  end=$(date +%s%N)
  printf '%s\n' "$rc" > "$out/$name.exit-code"
  printf '%s\n' "$(((end-start)/1000000))" > "$out/$name.wall-ms"
}

run_pi retrieval "$root" 2400 \
  'Use repository tools. Find the function that explicitly disables KV cache shifting for Maple because it uses per-layer RoPE dimensions. Reply with the source path, function name, and one short sentence stating the reason. Do not edit any file.' \
  'read,grep'
retrieval_ok=false
if [[ $(cat "$out/retrieval.exit-code") == 0 ]] && grep -q 'src/llama-kv-cache.cpp' "$out/retrieval.stdout" && grep -q 'get_can_shift' "$out/retrieval.stdout" && grep -Eqi 'per-layer|RoPE|rope' "$out/retrieval.stdout"; then retrieval_ok=true; fi

run_pi edit "$fixture" 2400 \
  'Inspect the failing clamp test. Fix only src/clamp.ts, run bun test, and stop after the test passes. Do not change the test or package.json.' \
  'read,edit,bash'
set +e
(cd "$fixture" && "$BUN_BIN" test) > "$out/edit-independent-test.stdout" 2> "$out/edit-independent-test.stderr"
test_rc=$?
set -e
printf '%s\n' "$test_rc" > "$out/edit-independent-test.exit-code"
diff -ru "$base" "$fixture" > "$out/edit.diff" || true
edit_ok=false
if [[ $(cat "$out/edit.exit-code") == 0 && $test_rc == 0 ]] \
  && grep -Eq 'return (Math\.min\(max, Math\.max\(min, value\)\)|Math\.max\(min, Math\.min\(value, max\)\));' "$fixture/src/clamp.ts" \
  && cmp -s "$base/src/clamp.test.ts" "$fixture/src/clamp.test.ts" \
  && cmp -s "$base/package.json" "$fixture/package.json"; then edit_ok=true; fi

run_pi instruction "$root" 1800 'Reply with exactly PI_QWEN38_OK and no other text.' ''
instruction_ok=false
if [[ $(cat "$out/instruction.exit-code") == 0 ]] && grep -Fxq 'PI_QWEN38_OK' "$out/instruction.stdout"; then instruction_ok=true; fi

run_pi cancellation "$root" 3 'Count upward indefinitely, one integer per line. Do not stop.' ''
cancel_rc=$(cat "$out/cancellation.exit-code")
recovered=false
for _ in $(seq 1 200); do
  if curl -fsS --max-time 2 "$endpoint/slots" | jq -e 'all(.[]; (.is_processing // false) == false)' >/dev/null; then recovered=true; break; fi
  sleep 0.05
done
printf 'recovered=%s\n' "$recovered" > "$out/cancellation-recovery.txt"
cancellation_ok=false
if [[ $cancel_rc == 124 || $cancel_rc == 137 || $cancel_rc == 143 ]] && [[ $recovered == true ]]; then cancellation_ok=true; fi

jq -n \
  --arg provider "$provider" --arg model "$model" \
  --argjson retrieval "$retrieval_ok" --argjson edit "$edit_ok" \
  --argjson instruction "$instruction_ok" --argjson cancellation "$cancellation_ok" \
  --argjson retrieval_wall "$(cat "$out/retrieval.wall-ms")" \
  --argjson edit_wall "$(cat "$out/edit.wall-ms")" \
  --argjson instruction_wall "$(cat "$out/instruction.wall-ms")" \
  '{provider:$provider,model:$model,retrieval:{passed:$retrieval,wall_ms:$retrieval_wall},edit:{passed:$edit,wall_ms:$edit_wall},instruction:{passed:$instruction,wall_ms:$instruction_wall},cancellation:{passed:$cancellation},passed:([$retrieval,$edit,$instruction,$cancellation]|map(select(.==true))|length),failed:([$retrieval,$edit,$instruction,$cancellation]|map(select(.==false))|length)}' \
  > "$out/summary.json"
cat "$out/summary.json"
