#!/usr/bin/env bash
set -euo pipefail

label=${1:?label}
provider=${2:?provider}
model=${3:?model}
endpoint=${4:?endpoint}
out=${5:?output directory}
root=$(cd "$(dirname "$0")/../../.." && pwd)
fixture=/tmp/maple-qwen-pi-fixture-$label
base=/tmp/maple-qwen-pi-fixture-base-$label
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
  (cd "$cwd" && timeout "$timeout_s" pi -p --provider "$provider" --model "$model" \
    --thinking low --no-session --tools "$tools" "$prompt") \
    > "$out/$name.stdout" 2> "$out/$name.stderr"
  rc=$?
  set -e
  end=$(date +%s%N)
  printf '%s\n' "$rc" > "$out/$name.exit-code"
  printf '%s\n' "$(((end-start)/1000000))" > "$out/$name.wall-ms"
  return "$rc"
}

retrieval_prompt='Use repository tools. Find the function that explicitly disables KV cache shifting for Maple because it uses per-layer RoPE dimensions. Reply with the source path, function name, and one short sentence stating the reason. Do not edit any file.'
run_pi retrieval "$root" 600 "$retrieval_prompt" 'read,grep' || true
if ! grep -q 'src/llama-kv-cache.cpp' "$out/retrieval.stdout" || ! grep -q 'get_can_shift' "$out/retrieval.stdout" || ! grep -Eqi 'per-layer|RoPE|rope' "$out/retrieval.stdout"; then
  printf 'failure=wrong path or function\n' > "$out/retrieval-failure.txt"
fi

edit_prompt='Inspect the failing clamp test. Fix only src/clamp.ts, run bun test, and stop after the test passes. Do not change the test or package.json.'
run_pi edit "$fixture" 900 "$edit_prompt" 'read,edit,bash' || true
set +e
(cd "$fixture" && bun test) > "$out/edit-independent-test.stdout" 2> "$out/edit-independent-test.stderr"
test_rc=$?
set -e
printf '%s\n' "$test_rc" > "$out/edit-independent-test.exit-code"
diff -ru "$base" "$fixture" > "$out/edit.diff" || true
[[ $(cat "$out/edit.exit-code") == 0 && $test_rc == 0 ]]
grep -Eq 'return (Math\.min\(max, Math\.max\(min, value\)\)|Math\.max\(min, Math\.min\(value, max\)\));' "$fixture/src/clamp.ts"
cmp "$base/src/clamp.test.ts" "$fixture/src/clamp.test.ts"
cmp "$base/package.json" "$fixture/package.json"

instruction_prompt='Reply with exactly PI_TRIPLE_MODEL_OK and no other text.'
run_pi instruction "$root" 300 "$instruction_prompt" '' || true
[[ $(cat "$out/instruction.exit-code") == 0 ]]
grep -Fxq 'PI_TRIPLE_MODEL_OK' "$out/instruction.stdout"

# Start an intentionally long stream, terminate the Pi client, then require the server slot to recover.
set +e
run_pi cancellation "$root" 3 'Count upward indefinitely, one integer per line. Do not stop.' ''
cancel_rc=$?
set -e
[[ $cancel_rc == 124 || $cancel_rc == 137 || $cancel_rc == 143 ]]
recovered=0
for _ in $(seq 1 200); do
  if curl -fsS --max-time 2 "$endpoint/slots" | jq -e 'all(.[]; (.is_processing // false) == false)' >/dev/null; then
    recovered=1
    break
  fi
  sleep 0.05
done
[[ $recovered == 1 ]]
printf 'recovered=true\n' > "$out/cancellation-recovery.txt"

bun "$root/benchmarks/intel-1340p/maple-qwen-campaign/summarize-pi-suite.ts" "$label"
cat "$out/summary.json"
