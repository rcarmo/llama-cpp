#!/usr/bin/env python3
import argparse
import collections
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("perf_log")
parser.add_argument("--prompt-size", type=int, default=128,
                    help="matrix N dimension used to classify prompt blocks; 0 disables classification")
args = parser.parse_args()

blocks = []
entries = []
in_block = False
for raw in Path(args.perf_log).read_text(errors="replace").splitlines():
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
    # This is a benchmark-specific heuristic: prompt blocks contain a matrix N
    # dimension equal to the configured prompt size. Use 0 for "unknown".
    if args.prompt_size == 0:
        kind = "unknown"
    else:
        marker = f" n={args.prompt_size} "
        kind = "prompt" if any(marker in f" {name} " for name, _, _, _ in block_entries) else "decode"
    groups = collections.Counter()
    for name, _, usec, _ in block_entries:
        groups[name.split()[0] if name else "unknown"] += usec
    print(f"block={idx} kind={kind} total_us={total:.2f}")
    for op, usec in groups.most_common(8):
        print(f"  {op:24s} {usec:10.2f} us {100.0*usec/total:6.2f}%")
    for name, count, usec, gflops in sorted(block_entries, key=lambda x: x[2], reverse=True)[:5]:
        print(f"    hot {usec:9.2f} us count={count:3d} {gflops:9.2f} GF/s {name}")
