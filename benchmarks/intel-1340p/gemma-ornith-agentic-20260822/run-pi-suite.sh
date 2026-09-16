#!/usr/bin/env bash
set -uo pipefail

label=${1:?label}
provider=${2:?provider}
model=${3:?model}
endpoint=${4:?endpoint}
out=${5:?output directory}
root=$(cd "$(dirname "$0")/../../.." && pwd)
fixture=/tmp/gemma-ornith-agentic-fixture-$label
base=/tmp/gemma-ornith-agentic-fixture-base-$label
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
pi --version > "$out/pi-version.txt" 2>&1 || true

run_pi() {
  local name=$1 cwd=$2 timeout_s=$3 prompt=$4 tools=$5
  local start end rc
  printf '%s\n' "$prompt" > "$out/$name.prompt.txt"
  start=$(date +%s%N)
  (cd "$cwd" && timeout --signal=TERM --kill-after=15 "$timeout_s" \
    pi -p --provider "$provider" --model "$model" --thinking low --no-session --tools "$tools" "$prompt") \
    > "$out/$name.stdout" 2> "$out/$name.stderr"
  rc=$?
  end=$(date +%s%N)
  printf '%s\n' "$rc" > "$out/$name.exit-code"
  printf '%s\n' "$(((end-start)/1000000))" > "$out/$name.wall-ms"
  return "$rc"
}

retrieval_prompt='Use repository tools. Inspect the current candidate launcher and explain how LLAMA_USE_MTP selects target-only operation. Reply with the source path, the variable name, and one short sentence describing which speculative arguments are omitted when it is disabled. Do not edit any file.'
run_pi retrieval "$root" 900 "$retrieval_prompt" 'read,grep' || true

edit_prompt='Inspect the failing clamp test. Fix only src/clamp.ts, run bun test, and stop after the test passes. Do not change the test or package.json.'
run_pi edit "$fixture" 1200 "$edit_prompt" 'read,edit,bash' || true
(cd "$fixture" && bun test) > "$out/edit-independent-test.stdout" 2> "$out/edit-independent-test.stderr"
printf '%s\n' "$?" > "$out/edit-independent-test.exit-code"
diff -ru "$base" "$fixture" > "$out/edit.diff" || true

instruction_prompt='Reply with exactly GEMMA_ORNITH_AGENTIC_OK and no other text.'
run_pi instruction "$root" 600 "$instruction_prompt" '' || true

run_pi cancellation "$root" 3 'Count upward indefinitely, one integer per line. Do not stop.' '' || true
recovered=0
for _ in $(seq 1 300); do
  if curl -fsS --max-time 2 "$endpoint/slots" | jq -e 'all(.[]; (.is_processing // false) == false)' >/dev/null 2>&1; then
    recovered=1
    break
  fi
  sleep 0.1
done
[[ $recovered == 1 ]] && printf 'recovered=true\n' > "$out/cancellation-recovery.txt"

bun "$root/benchmarks/intel-1340p/gemma-ornith-agentic-20260822/summarize-pi-suite.ts" \
  "$label" "$provider" "$model" "$out"
