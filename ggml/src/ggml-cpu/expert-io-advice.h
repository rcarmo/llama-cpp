#pragma once

#include <cstddef>

// Returns 0 on success or a platform error code. The address/length must refer
// to a live mapped/allocated expert-weight range for the duration of the call.
int ggml_expert_io_advise_memory(void * address, size_t length);
