#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Audit saved B0 fixture/profile foundation without inference or sandbox execution","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
bun test "$here/preflight.test.ts" "$here/profile.test.ts" "$here/guard-safety.test.ts" "$here/speech.test.ts"
bun -e "import {audit} from '$here/audit-profile.ts'; if(!audit('$here').audit_pass) throw Error('Audit');"
echo 'PASS B0 frozen inputs metadata, guards, saved profile and current restoration evidence'
