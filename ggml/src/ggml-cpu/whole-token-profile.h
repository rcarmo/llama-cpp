#pragma once

#include "ggml.h"

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

bool ggml_cpu_whole_token_profile_enabled(void);
int64_t ggml_cpu_whole_token_profile_time_us(void);
void ggml_cpu_whole_token_profile_graph_begin(void);
void ggml_cpu_whole_token_profile_graph_end(int64_t start_us);
void ggml_cpu_whole_token_profile_node_active(enum ggml_op op, int64_t active_us);
void ggml_cpu_whole_token_profile_node_wall(const struct ggml_tensor * node, int n_threads,
                                            int64_t wall_us);

#ifdef __cplusplus
}
#endif
