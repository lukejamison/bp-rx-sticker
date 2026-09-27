# API server update — September 26, 2026

Server: `172.18.129.154`  
App: `~/prx-api/server.js`  
Service: `prx-api`  
Source in this repo: `api-endpoints/new-endpoints.js`

This is the only update that server needs from the September 26, 2026 work. The label layout, print bridge, tray monitor, and Better Stack changes stay on the receiving PC.

No database migration is part of this update. Do not re-run `migrations/001` through `migrations/004`.

---

## What this changes

A scan of the same drug on a second invoice was returning the first invoice after that line was already labeled. Example: quantity 2 on invoice A prints two labels and closes that line, then quantity 1 of the same drug on invoice B says "already completed."

After this update, barcode lookup:

1. Searches every UPC/NDC variant from the scan in one query, including the `candidates` list the extension sends.
2. Walks the matching invoices newest first.
3. Returns the first line that is not labeled yet.
4. Returns "already completed" only when every matching line on every recent invoice is already labeled.
5. Never treats a completion on one invoice as a completion on another invoice.

The extension calls `GET /api/items/barcode/:code/recent`. The UPC and NDC routes use the same lookup, so update all three together. If the new helpers are added and the old routes are left in place, `server.js` will call functions that no longer exist and the API will crash on the next scan.

---

## Replace these helpers

In `~/prx-api/server.js`, delete the old lookup helpers if they are present:

- `RECENT_INVOICE_TIME_FILTER`
- `queryRecentInvoicesByItemLike`
- `getItemCompletionInfo`
- `pickInvoiceLineItem`

Paste in their place, from `api-endpoints/new-endpoints.js`, starting at `function ndcLookupVariants` and ending at the end of `function formatStickerItemResponse`:

- `ndcLookupVariants`
- `comparableDigits`
- `codesEquivalent`
- `collectLookupCodes`
- `lineMatchesAnyCode`
- `completionMatchesLine`
- `queryRecentInvoicesForCodes`
- `pickOpenInvoiceLine`
- `formatStickerItemResponse`

`formatStickerItemResponse` did not change its response shape. Replace it only so the file has one copy.

---

## Replace these three routes

Replace the whole handler, from `app.get(...)` through its closing `});`.

| Route | In `new-endpoints.js` |
| --- | --- |
| `GET /api/items/upc/:upc/recent` | Endpoint 1 |
| `GET /api/items/ndc/:ndc/recent` | Endpoint 2 |
| `GET /api/items/barcode/:code/recent` | Endpoint 7 |

The barcode route must read `req.query.candidates` and include `searchedAllCandidates: true` on both success and 404. That flag tells the extension the server already searched every code, so it does not repeat the lookup one code at a time.

---

## Leave these alone

Do not replace these unless you are rebuilding `server.js` from scratch:

- `POST /api/completed`
- `POST /api/completed/:id/reprint`
- `GET /api/invoices/:invoiceId/items`
- `GET /api/stats/completed`
- Express setup, `pool`, `/health`, and any routes that are not in the table above
- n8n and the PioneerRx invoice sync

`POST /api/completed` is still the right endpoint. Completion remains one row per invoice line (`invoice_id` + `ndc` + `upc`). Quantity 2 on one line is one completion, not two.

---

## Deploy

On your machine, copy the current snippet to the server:

```bash
scp api-endpoints/new-endpoints.js luke@172.18.129.154:~/prx-api/new-endpoints.js
```

On the server:

```bash
ssh luke@172.18.129.154
cd ~/prx-api
cp server.js server.js.bak-20260926
```

Edit `server.js` and apply the replacements above. Use `~/prx-api/new-endpoints.js` as the source. Then:

```bash
node --check server.js
sudo systemctl restart prx-api
sudo systemctl status prx-api
```

`node --check` must pass before the restart. If it fails, restore the backup:

```bash
cp server.js.bak-20260926 server.js
sudo systemctl restart prx-api
```

---

## Confirm it worked

From any machine that can reach the API:

```bash
curl -s "http://172.18.129.154:3000/health"
```

Then look up a real barcode from a recent invoice:

```bash
curl -s "http://172.18.129.154:3000/api/items/barcode/YOUR_CODE/recent?hours=168" | jq '{searchedAllCandidates, completed, invoice: .invoice.invoiceNumber, qty: .item.invoiceQty, name: .item.itemName}'
```

`searchedAllCandidates` must be `true`. A missing field means the old barcode route is still running.

For the two-invoice case, scan the quantity-2 line first and let it print. Then scan the same drug on the other invoice. The second response should be `completed: false` and should name the second invoice, until that line is printed too.

Watch the log while you test:

```bash
ssh luke@172.18.129.154 'sudo journalctl -u prx-api -n 50 --no-pager'
```
