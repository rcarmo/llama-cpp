/** SCRIPT_JDOC:
{"summary":"Generate operator-boundary hooks against the exact pinned CPU graph loop","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';const root=import.meta.dir;let s=readFileSync(root+'/patch/ggml-cpu-parent.c','utf8');const replace=(old:string,next:string)=>{if(s.split(old).length!==2)throw Error('Exact source anchor: '+old);s=s.replace(old,next)};replace('#include "whole-token-profile.h"','#include "whole-token-profile.h"\n#include "operator-meter.h"');const start='        // Try fused ops, fall back to normal compute';replace(start,`        int gm_family = 0;
        if (node->op == GGML_OP_MUL_MAT && node->src[0] && node->src[1] && node->src[1]->ne[1] == 4) {
            if (node->src[0]->type == GGML_TYPE_F16 && node->src[0]->ne[0] == 512 && node->src[0]->ne[1] >= 32768) gm_family = 1;
            else if (node->src[0]->type == GGML_TYPE_F16 && node->src[0]->ne[0] >= 32768 && node->src[0]->ne[1] == 512) gm_family = 2;
            else if (node->src[0]->type == GGML_TYPE_Q4_0) gm_family = 3;
        }
        const int gm_measured = gm_begin(gm_family);
`+start);replace('        if (whole_token_profile) {\n            ggml_cpu_whole_token_profile_node_active','        if (gm_measured) gm_end();\n\n        if (whole_token_profile) {\n            ggml_cpu_whole_token_profile_node_active');mkdirSync(root+'/profile-build',{recursive:true});writeFileSync(root+'/patch/ggml-cpu.c',s);
