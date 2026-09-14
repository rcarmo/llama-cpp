#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Audit frozen fixture references and stored native/sandbox outcome evidence without running models","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
bun test "$here/fixtures.test.ts"
bun - "$here" <<'TS'
const here=process.argv[2],read=(p:string)=>Bun.file(here+'/'+p).json();const r=await read('baseline-results.json'),c=await read('chunk-baseline-results.json'),s=await read('sandbox-preflight.json');if(!s.pass||r.coding.filter(x=>x.pass).length!==2||!r.coding.filter(x=>x.fixture.includes('merge')).every(x=>!x.pass)||!r.retrieval.every(x=>x.pass)||!r.tools.every(x=>x.pass)||!c.rows.every(x=>x.pass))throw Error('Outcomes');console.log('PASS preserved coding failure plus passing frozen baseline tasks and sandbox controls');
TS
