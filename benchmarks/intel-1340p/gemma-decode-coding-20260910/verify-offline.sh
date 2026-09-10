#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Verify longer-coding decode evidence and preserved failures without inference or generatedcodeexecution","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d);trap 'rm -rf "$tmp"' EXIT
cp -a "$here/." "$tmp/"
bun test "$tmp/task.test.ts" "$tmp/audit.test.ts"
bun "$tmp/audit-results.ts" >/dev/null
bun - "$tmp" <<'TS'
const root=process.argv[2];for(const name of ['coding','repair']){const r=await Bun.file(root+'/'+name+'-results.json').json();if(!r.complete||r.all_tasks_pass||!r.matched_output_counts||!r.observed_same_code||!r.restoration?.pass)throw Error('Evidence scope');console.log(name,'retained native completion with exact task failure, matched code/work, and unchanged restoration')}
TS
bash -n "$here/stage.sh";bash -n "$here/repair-stage.sh";bash -n "$here/restore.sh"
printf 'PASS retained timing/failure/alias/restoration evidence; no inference or generatedcodeexecution\n'
