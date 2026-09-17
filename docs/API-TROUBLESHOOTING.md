# API troubleshooting

Quick reference for the invoice lookup API at `http://172.18.129.154:3000`.

Used by the Chrome extension (`extension/lib/api.js`). The legacy T56 PWA uses the same endpoints.

---

## Health check

```bash
curl -s http://172.18.129.154:3000/health
```

## Test a barcode lookup

```bash
curl -s "http://172.18.129.154:3000/api/items/barcode/YOUR_UPC_OR_NDC/recent?hours=168" | jq .
```

Expected success:

```json
{ "searchType": "UPC", "item": { ... }, "invoice": { ... }, "completed": false }
```

Common errors:

| Response | Meaning |
|----------|---------|
| 404 / "not found" | No invoice line in the time window |
| 500 | Server or database error — check logs |

---

## Watch API logs

```bash
ssh luke@172.18.129.154 'sudo journalctl -u prx-api -f'
```

Last 50 lines:

```bash
ssh luke@172.18.129.154 'sudo journalctl -u prx-api -n 50 --no-pager'
```

---

## Common issues

### Same drug on two invoices — second scan says "already completed"

Completion is tracked **per invoice** (`invoice_id` + `ndc` + `upc`). The lookup
endpoint must return the **incomplete** invoice when the same product appears on
multiple recent invoices — not just the newest row by `StatusChangedOn`.

After updating `api-endpoints/new-endpoints.js` on the server, barcode/UPC/NDC
recent endpoints prefer the first matching invoice that is not yet labeled.

### Item not found but staff know it was received

The extension searches invoices from the last **7 days** (168 hours; extended on Sun/Mon).

Check `StatusChangedOn` in the database:

```bash
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices -c "
  SELECT \"InvoiceNumber\", \"StatusChangedOn\",
         AGE(NOW(), \"StatusChangedOn\") AS age
  FROM \"prx-invoices\"
  ORDER BY \"StatusChangedOn\" DESC NULLS LAST
  LIMIT 10;
"
```

If invoices are missing entirely, check the n8n **PRX Invoice Detail** workflow and PioneerRx ActiveReport.

### "value too long for type character varying"

Long drug names exceed column limits on the `prx_invoices_completed` table.

```bash
ssh luke@172.18.129.154
PGPASSWORD=3781 psql -h localhost -U luke -d prx_invoices \
  -f ~/prx-api/migrations/002_increase_varchar_limits.sql
sudo systemctl restart prx-api
```

### Completed table missing

```bash
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices \
  -f migrations/001_create_completed_invoices_table.sql
```

---

## Deploy API endpoint changes

Snippet files in `api-endpoints/` are merged into `~/prx-api/server.js` on the server:

```bash
ssh luke@172.18.129.154
cd ~/prx-api
cp server.js server.js.bak-$(date +%Y%m%d)
# edit server.js — merge from api-endpoints/
node --check server.js
sudo systemctl restart prx-api
sudo systemctl status prx-api
```

---

## Automated diagnostic script

```bash
./diagnose-api.sh
```

---

## Related docs

- [`help_docs/PRX_INVOICE_SYSTEM_DOCUMENTATION.md`](../help_docs/PRX_INVOICE_SYSTEM_DOCUMENTATION.md) — full system reference
- [`extension/print-bridge/TROUBLESHOOTING.md`](../extension/print-bridge/TROUBLESHOOTING.md) — print bridge (separate from API)
