#!/usr/bin/env python3
import argparse
import mmap
import os
import signal
import time

parser = argparse.ArgumentParser()
parser.add_argument("--gib", type=float, required=True)
parser.add_argument("--ready", required=True)
args = parser.parse_args()

size = int(args.gib * 1024 * 1024 * 1024)
page = os.sysconf("SC_PAGE_SIZE")
region = mmap.mmap(-1, size, flags=mmap.MAP_PRIVATE | mmap.MAP_ANONYMOUS)
for offset in range(0, size, page):
    region[offset] = 1
with open(args.ready, "w", encoding="utf-8") as handle:
    handle.write(f"pid={os.getpid()} bytes={size}\n")

running = True
def stop(_signum, _frame):
    global running
    running = False
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
while running:
    time.sleep(1)
region.close()
