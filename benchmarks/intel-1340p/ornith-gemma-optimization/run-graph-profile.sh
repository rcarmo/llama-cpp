#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
model=${1:?ornith|gemma4}
depth=${2:?depth}
port=${3:?port}
out=$root/benchmarks/intel-1340p/ornith-gemma-optimization/graph-profile/${model}-d${depth}
rm -rf "$out"; mkdir -p "$out"

export WHOLE_TOKEN_PROFILE=1
export GGML_SPECULATIVE_PROFILE=1
export OUT_ROOT="$out/runner"
export RUN_NAME=profile
"$root/benchmarks/intel-1340p/ornith-gemma-optimization/run-agentic-baseline.sh" "$model" "$depth" "$port" > "$out/harness.stdout"
mv "$out/runner/profile"/* "$out"/
rmdir "$out/runner/profile" "$out/runner"

grep 'GGML_CPU_WHOLE_TOKEN_PROFILE' "$out/server.log" > "$out/whole-token-profile.log"
grep 'GGML_SPECULATIVE_PROFILE' "$out/server.log" > "$out/speculative-profile.log" || true
grep 'GGML_CPU_EXPERT_IO_PROFILE' "$out/server.log" > "$out/expert-profile.log" || true

python3 - "$out" <<'PY'
import json,re,sys
from pathlib import Path
root=Path(sys.argv[1])
rows=[]
for line in (root/'whole-token-profile.log').read_text().splitlines():
    fields=dict(re.findall(r'(\w+)=([^ ]+)',line))
    if fields.get('kind') in ('op','family','total'):
        rows.append(fields)
(root/'profile.json').write_text(json.dumps(rows,indent=2)+'\n')
PY
cat "$out/result.json"
