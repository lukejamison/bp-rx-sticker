#!/usr/bin/env bash
# Send a test ZPL label to a network Zebra printer (raw TCP port 9100).
#
# Usage:
#   ./send-test-label.sh
#   ./send-test-label.sh 172.18.129.132
#   ./send-test-label.sh 172.18.129.132 /path/to/label.zpl
#
# Label media (from printer): PW 448, LL 582 (~2.1" x 2.85" at 203 dpi)

set -euo pipefail

PRINTER_IP="${1:-172.18.129.132}"
ZPL_FILE="${2:-$(dirname "$0")/sample-label.zpl}"
PORT="${PRINTER_PORT:-9100}"

if [[ ! -f "$ZPL_FILE" ]]; then
  echo "ZPL file not found: $ZPL_FILE" >&2
  exit 1
fi

echo "Sending $(basename "$ZPL_FILE") to ${PRINTER_IP}:${PORT} ..."

if command -v nc >/dev/null 2>&1; then
  nc -w 5 "$PRINTER_IP" "$PORT" < "$ZPL_FILE"
elif command -v ncat >/dev/null 2>&1; then
  ncat -w 5 "$PRINTER_IP" "$PORT" < "$ZPL_FILE"
else
  echo "Need nc (netcat) or ncat installed." >&2
  exit 1
fi

echo "Done — check the printer for one test label."
