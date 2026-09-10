#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Reconstruct diagnosticshapeprofiler sources and audit retained counters offline","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd);repo=$(git -C "$here" rev-parse --show-toplevel)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d);trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/ggml/src/ggml-cpu"
for f in whole-token-profile.cpp whole-token-profile.h ggml-cpu.c repack.cpp;do
 git -C "$repo" show "abdbeadfb:ggml/src/ggml-cpu/$f" > "$tmp/ggml/src/ggml-cpu/$f"
 (cd "$tmp";git apply --check "$here/patch/$f.patch";git apply "$here/patch/$f.patch")
done
cp "$here/patch/shape-profile.inc" "$tmp/ggml/src/ggml-cpu/shape-profile.inc"
bun - "$here" "$tmp" <<'TS'
import{readFileSync}from'node:fs';import{createHash}from'node:crypto';const[here,tmp]=process.argv.slice(2),m=JSON.parse(readFileSync(here+'/source-provenance.json','utf8'));for(const f of m.sources)if(createHash('sha256').update(readFileSync(tmp+'/ggml/src/ggml-cpu/'+f.path)).digest('hex')!==f.sha256)throw Error('Sourcehash '+f.path);console.log('PASS pinnedsource reconstruction');
TS
cp -a "$here/." "$tmp/evidence/"
bun test "$tmp/evidence/audit.test.ts"
bun "$tmp/evidence/audit-results.ts" >/dev/null
printf 'PASS shape counters, packing boundaries, baseline restoration; no inference\n'
