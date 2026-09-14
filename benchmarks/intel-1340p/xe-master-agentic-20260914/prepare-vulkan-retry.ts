/** SCRIPT_JDOC:
{"summary":"Prepare a new parent-project Vulkan build retry without overwriting failed standalone configuration or source snapshot","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,existsSync}from'node:fs';
const root=import.meta.dir;
if(existsSync(root+'/build-vulkan-r1.sh'))throw Error('Retained retry recipe exists');
let build=readFileSync(root+'/build-vulkan.sh','utf8');
build=build.replace('out="$root/build-vulkan"','out="$root/build-vulkan-parent"').replace('"$root/vulkan-source/ggml"','"$root/vulkan-parent"').replaceAll('vulkan-built.sha256','vulkan-r1-built.sha256');
// Collect cgroup evidence on both configure/build failure and success.
build=build.replace('set -euo pipefail','set -euo pipefail\ntrap \'for f in memory.peak memory.swap.peak memory.events cpu.stat;do printf "%s\\n" "$f";cat "/sys/fs/cgroup/$f";done\' EXIT');
writeFileSync(root+'/build-vulkan-r1.sh',build);
let launch=readFileSync(root+'/launch-vulkan-build.sh','utf8');
launch=launch.replaceAll('vulkan-build','vulkan-r1-build').replaceAll('build-vulkan.sh','build-vulkan-r1.sh');
launch=launch.replace('name=xe-master-agentic-vulkan-r1-build','name=xe-master-agentic-vulkan-build-r1');
launch=launch.replace('sha256sum "$root/build-vulkan-r1.sh"','sha256sum "$root/vulkan-parent/CMakeLists.txt" "$root/build-vulkan-r1.sh"');
writeFileSync(root+'/launch-vulkan-r1-build.sh',launch);
console.log('New retry uses parent CMake, fresh build directory, new evidence/run ID; no compilation');
