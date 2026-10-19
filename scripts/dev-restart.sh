#!/bin/bash
# Restart the local dev server without killing the shell that launched it.
cd /home/claude/proj || exit 1
PIDS=$(ss -lptn 'sport = :3000' 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u)
for pid in $PIDS; do kill "$pid" 2>/dev/null; done
sleep 2
nohup npx tsx server.ts > /tmp/server.log 2>&1 &
sleep "${1:-25}"
tail -6 /tmp/server.log
