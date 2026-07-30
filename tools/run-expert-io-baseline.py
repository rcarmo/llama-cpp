#!/usr/bin/env python3
import argparse
import json
import os
import resource
import subprocess
import time
from pathlib import Path


def read_proc_io(pid: int) -> dict[str, int]:
    result: dict[str, int] = {}
    try:
        for line in Path(f"/proc/{pid}/io").read_text().splitlines():
            key, value = line.split(":", 1)
            result[key] = int(value.strip())
    except (FileNotFoundError, PermissionError, ValueError):
        pass
    return result


def loadavg() -> list[float]:
    return [float(v) for v in os.getloadavg()]


def evict_file(path: Path) -> None:
    if not hasattr(os, "posix_fadvise") or not hasattr(os, "POSIX_FADV_DONTNEED"):
        raise RuntimeError("POSIX_FADV_DONTNEED is unavailable")
    fd = os.open(path, os.O_RDONLY)
    try:
        os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)
    finally:
        os.close(fd)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", choices=("warm", "cold"), required=True)
    parser.add_argument("--evict", action="append", default=[])
    parser.add_argument("--max-load", type=float, default=2.0)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("missing command after --")

    start_load = loadavg()
    if start_load[0] > args.max_load:
        raise SystemExit(f"refusing run: load {start_load[0]:.2f} exceeds {args.max_load:.2f}")
    if args.mode == "cold":
        for name in args.evict:
            evict_file(Path(name))

    stdout_path = Path(args.output).with_suffix(".stdout")
    stderr_path = Path(args.output).with_suffix(".stderr")
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    started = time.monotonic()
    with stdout_path.open("wb") as stdout, stderr_path.open("wb") as stderr:
        proc = subprocess.Popen(command, stdout=stdout, stderr=stderr)
        peak_read_bytes = 0
        peak_write_bytes = 0
        while proc.poll() is None:
            io = read_proc_io(proc.pid)
            peak_read_bytes = max(peak_read_bytes, io.get("read_bytes", 0))
            peak_write_bytes = max(peak_write_bytes, io.get("write_bytes", 0))
            time.sleep(0.05)
        status = proc.wait()
    elapsed = time.monotonic() - started
    after = resource.getrusage(resource.RUSAGE_CHILDREN)

    report = {
        "mode": args.mode,
        "command": command,
        "status": status,
        "elapsed_seconds": elapsed,
        "start_load": start_load,
        "end_load": loadavg(),
        "minor_faults": after.ru_minflt - before.ru_minflt,
        "major_faults": after.ru_majflt - before.ru_majflt,
        "user_cpu_seconds": after.ru_utime - before.ru_utime,
        "system_cpu_seconds": after.ru_stime - before.ru_stime,
        "max_rss_kib": after.ru_maxrss,
        "sampled_read_bytes": peak_read_bytes,
        "sampled_write_bytes": peak_write_bytes,
        "stdout": str(stdout_path),
        "stderr": str(stderr_path),
    }
    Path(args.output).write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return status


if __name__ == "__main__":
    raise SystemExit(main())
