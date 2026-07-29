#!/usr/bin/env python3
import collections
import re
import sys
from pathlib import Path

if len(sys.argv) != 2:
    raise SystemExit(f"usage: {sys.argv[0]} PERF_LOG")

blocks = []
entries = []
in_block = False
for raw in Path(sys.argv[1]).read_text(errors="replace").splitlines():
    line = raw.strip()
    if line == "Vulkan Timings:":
        entries = []
        in_block = True
        continue
    if not in_block:
        continue
    total_match = re.match(r"Total time: ([0-9.]+) us\.", line)
    if total_match:
        blocks.append((float(total_match.group(1)), entries))
        entries = []
        in_block = False
        continue
    match = re.match(r"(.*?):\s+(\d+) x ([0-9.]+) us = ([0-9.]+) us(?: \(([0-9.]+) GFLOPS/s\))?", line)
    if match:
        entries.append((match.group(1).strip(), int(match.group(2)), float(match.group(4)), float(match.group(5) or 0.0)))

print(f"blocks={len(blocks)}")
for idx, (total, block_entries) in enumerate(blocks):
    kind = "prompt" if any(" n=128 " in f" {name} " for name, _, _, _ in block_entries) else "decode"
    groups = collections.Counter()
    for name, _, usec, _ in block_entries:
        groups[name.split()[0] if name else "unknown"] += usec
    print(f"block={idx} kind={kind} total_us={total:.2f}")
    for op, usec in groups.most_common(8):
        print(f"  {op:24s} {usec:10.2f} us {100.0*usec/total:6.2f}%")
    for name, count, usec, gflops in sorted(block_entries, key=lambda x: x[2], reverse=True)[:5]:
        print(f"    hot {usec:9.2f} us count={count:3d} {gflops:9.2f} GF/s {name}")
