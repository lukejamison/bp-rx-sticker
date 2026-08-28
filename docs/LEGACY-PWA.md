# Legacy PWA — Zebra T56

> **Status:** Not actively deployed. The production path is the **Chrome extension + print bridge** on OneScan Windows workstations. This `app/` code is kept for reference and possible future use.

---

## What it was

A Next.js PWA that ran in Chrome on Zebra T56 handhelds, using **Zebra Browser Print** over Bluetooth to print labels directly from the device.

## Why we moved on

- OneScan workstations already have USB/network Zebra printers
- Browser Print on T56 was fragile (SDK loading, Bluetooth pairing, diagnostics)
- The Chrome extension integrates directly into the receiving workflow staff already use

## If you need to run it locally

```bash
cd app
npm install
# Add Browser Print SDK to app/public/ (see app/README.md)
cp .env.example .env.local   # set NEXT_PUBLIC_API_URL
npm run dev
# Open http://localhost:9000
```

## Deployment (Vercel)

1. Push to GitHub
2. Import project at vercel.com, **Root Directory** = `app`
3. Set `NEXT_PUBLIC_API_URL=http://172.18.129.154:3000`

The T56 device must be on the pharmacy LAN to reach the API.

## Key files

| File | Purpose |
|------|---------|
| `app/lib/zpl.ts` | Label layout (parallel to `extension/lib/zpl.js`) |
| `app/lib/store.ts` | Scan → lookup → print flow |
| `app/lib/api.ts` | API client |

Label changes should still be mirrored in `extension/lib/zpl.js` if both paths need to stay in sync.

## T56-specific troubleshooting

Zebra Browser Print issues (SDK not loaded, printer not found, Bluetooth) — see `app/README.md` and the old root `TROUBLESHOOTING.md` content which covered Browser Print diagnostics.
