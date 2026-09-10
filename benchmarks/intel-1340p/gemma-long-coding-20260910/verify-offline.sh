#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Verify checksummed long-context coding evidence and audit tests without model inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
(cd "$here"; sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -a "$here/." "$tmp/"
bun test "$tmp/audit.test.ts"
bun "$tmp/audit-results.ts" >/dev/null
bun -e 'const r=await Bun.file(process.argv[1]).json();if(!r.complete||!r.all_tasks_pass)throw Error("Incomplete or failed codingblock");console.log("PASS four matched coding runs, task checks, cold/warm cache, resources and timings")' "$tmp/results.json"
bun -e 'const root=process.argv[1];const r=await Bun.file(root+"/restoration-identity.json").json(),t=await Bun.file(root+"/restoration-tool-smoke/results.json").json();if(!r.pass||r.swap_kib!==0||!r.libraries.every(x=>x.mapped&&x.expected_sha256===x.actual_sha256)||t.failure||t.rows.length!==3||!t.rows.every(x=>x.pass))throw Error("Restoration incomplete");console.log("PASS recorded unchanged production identity and tools/cache")' "$here"
bash -n "$here/coding-stage.sh"; bash -n "$here/restore.sh"
printf 'PASS offline evidence checks only; no inference, native rerun or live service calls\n'
