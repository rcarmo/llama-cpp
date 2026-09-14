#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Verify FP32 batch interaction evidence, finite64K handoff and restoration without inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
(cd "$here"; sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -a "$here/." "$tmp/"
bun test "$tmp/audit.test.ts"
bun "$tmp/audit-results.ts" >/dev/null
bun -e 'const r=await Bun.file(process.argv[1]).json();if(!r.complete||r.rows.length!==8||!r.full64?.result.ok)throw Error("Incomplete comparison");console.log("PASS eight matched tails and native finite64K handoff; signed full-run tradeoff retained")' "$tmp/results.json"
bun -e 'const root=process.argv[1];for(const suffix of ["tool-smoke","final-tool-smoke"]){const t=await Bun.file(root+"/restoration-"+suffix+"/results.json").json();if(t.failure||t.rows.length!==3||!t.rows.every(x=>x.pass))throw Error("Tool smoke failed")}const r=await Bun.file(root+"/restoration-identity.json").json();if(!r.pass||r.swap_kib!==0||!r.libraries.every(x=>x.mapped&&x.expected_sha256===x.actual_sha256))throw Error("Restoration identity");console.log("PASS recorded original identity, tools and cache")' "$here"
for path in "$here"/*-stage.sh "$here/restore.sh"; do bash -n "$path"; done
printf 'PASS offline evidence checks only; no inference or live service calls\n'
