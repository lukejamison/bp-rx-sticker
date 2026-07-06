#!/usr/bin/env bash
# Send a test ZPL label to a network Zebra printer (raw TCP port 9100).
#
# Usage:
#   ./send-test-label.sh
#   ./send-test-label.sh 172.18.129.123
#   ./send-test-label.sh 172.18.129.123 /path/to/label.zpl
#
# Label media: PW 203, LL 203 (1" x 1" at 203 dpi)
# Default file: sample-price-sticker.zpl
# If top is cut off, try: sample-price-sticker-offset20.zpl (more top margin)

set -euo pipefail

PRINTER_IP="${1:-172.18.129.123}"
ZPL_FILE="${2:-$(dirname "$0")/sample-price-sticker.zpl}"
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
