#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Verify rounded-query source and scoped speed/qualification/PMU evidence without inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d);trap 'rm -rf "$tmp"' EXIT
cp "$here/patch/sgemm-parent.cpp" "$tmp/sgemm.cpp"
(cd "$tmp";git apply --check "$here/patch/query-reuse.patch";git apply "$here/patch/query-reuse.patch")
cmp "$tmp/sgemm.cpp" "$here/patch/sgemm.cpp"
bun test "$here/helper.test.ts" "$here/audit.test.ts" "$here/qualification.test.ts" "$here/pmu.test.ts"
echo 'PASS exactqueryreusepatch,native/actualdispatch,scopedspeed/qualification/failure andPMUaudits; no inference'
