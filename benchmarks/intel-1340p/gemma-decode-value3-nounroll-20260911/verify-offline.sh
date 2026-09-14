#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Audit retained value3 native/screens/confirmation without inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
bun test "$here/audit.test.ts" "$here/dispatch.test.ts"
bun -e "import{audit}from'$here/audit-results.ts';if(!audit('$here').audit_pass)throw Error('Audit')"
echo 'PASS value3 native coverage, neutral independent confirmation, unchanged B0 restoration'
