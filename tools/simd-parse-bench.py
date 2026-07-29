#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

if len(sys.argv) < 2:
    raise SystemExit(f"usage: {sys.argv[0]} LOG...")

rows = []
for name in sys.argv[1:]:
    text = Path(name).read_text(errors="replace")
    build = re.search(r"build=(\S+)", text)
    size = re.search(r"size=(\d+)", text)
    start_load = re.search(r"START.*?\n.*?load average: ([0-9.]+),", text, re.S)
    current = None
    for line in text.splitlines():
        stripped = line.strip()
        if stripped in {"q4_0", "q5_0", "q8_0"}:
            current = stripped
        elif current and "min cycles/32 vals" in line:
            minimum = float(line.rsplit(":", 1)[1])
        elif current and "avg cycles/32 vals" in line:
            average = float(line.rsplit(":", 1)[1])
        elif current and "quantized throughput" in line:
            throughput = float(line.rsplit(":", 1)[1].split()[0])
            rows.append({
                "log": name,
                "build": build.group(1) if build else None,
                "size": int(size.group(1)) if size else None,
                "type": current,
                "min_cycles_per_32": minimum,
                "avg_cycles_per_32": average,
                "quantized_gbps": throughput,
                "start_load_1m": float(start_load.group(1)) if start_load else None,
            })
            current = None

json.dump(rows, sys.stdout, indent=2)
print()
