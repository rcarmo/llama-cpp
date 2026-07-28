#!/usr/bin/env python3
import collections
import re
import sys
from pathlib import Path

if len(sys.argv) != 2:
    raise SystemExit(f"usage: {sys.argv[0]} PERF_LOG")

block = []
blocks = []
for raw in Path(sys.argv[1]).read_text(errors="replace").splitlines():
    if raw.startswith("ggml_vulkan: PERF:"):
        line = raw.split("PERF:", 1)[1].strip()
        if line.startswith("total time"):
            m = re.search(r"total time ([-0-9.]+) us", line)
            if m:
                blocks.append((float(m.group(1)), block))
            block = []
        else:
            m = re.match(r"(.*?)\s+([-0-9.]+) us\s+([-0-9.]+) GFLOPS/s", line)
            if m:
                block.append((m.group(1).strip(), float(m.group(2)), float(m.group(3))))

print(f"blocks={len(blocks)}")
for idx, (total, entries) in enumerate(blocks):
    kind = "prompt" if any(" n=128 " in f" {name} " for name, _, _ in entries) else "decode"
    groups = collections.Counter()
    for name, usec, _ in entries:
        op = name.split()[0] if name else "unknown"
        groups[op] += usec
    print(f"block={idx} kind={kind} total_us={total:.2f}")
    for op, usec in groups.most_common(8):
        print(f"  {op:24s} {usec:10.2f} us {100.0*usec/total:6.2f}%")
    for name, usec, gflops in sorted(entries, key=lambda x: x[1], reverse=True)[:5]:
        print(f"    hot {usec:9.2f} us {gflops:9.2f} GF/s {name}")
