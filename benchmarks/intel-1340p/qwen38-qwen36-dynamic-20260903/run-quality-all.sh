#!/usr/bin/env bash
set -u
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$here/state"
set +e
"$here/run-quality.sh" qwen38
q38_rc=$?
printf '%s\n' "$q38_rc" > "$here/state/qwen38-quality.exit-code"
"$here/run-quality.sh" qwen36
q36_rc=$?
printf '%s\n' "$q36_rc" > "$here/state/qwen36-quality.exit-code"
jq -n --argjson qwen38 "$q38_rc" --argjson qwen36 "$q36_rc" '{qwen38_exit:$qwen38,qwen36_exit:$qwen36}' > "$here/state/quality-all.json"
exit $((q38_rc != 0 || q36_rc != 0))
