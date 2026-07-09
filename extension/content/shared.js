const BP_RX = {
  LOG_PREFIX: '[BP-RX Sticker]',
  TARGET_HASH: '#/ssccScanIn',
  BARCODE_SELECTOR:
    'input[barcode-scanner].barcodeEnableField, input[ng-model="vm.barcodeData.code"]',
  // Deliberately requires ".scanned" -- OneScan can render a whole order's
  // line items into the DOM from a single physical scan (before most of
  // them are marked scanned). A bare ".labels-area" fallback here was
  // confirmed in production logs (2026-07-09) to treat every item in that
  // bulk render as a fresh scan, triggering phantom lookups/prints for
  // products nobody scanned. See onescan.js checkForNewScan() diagnostics.
  LABELS_SELECTOR: '.item-container.scanned .labels-area',
  MIN_SCAN_LENGTH: 8,
  DEDUPE_MS: 4000,
  GRACE_MS: 8000,

  log(...args) {
    console.log(this.LOG_PREFIX, ...args);
  },

  warn(...args) {
    console.warn(this.LOG_PREFIX, ...args);
    this.reportIssue(args);
  },

  // Fire-and-forget relay to the background worker, which forwards to Better
  // Stack if configured. Content scripts can't reach Better Stack directly
  // without their own host permission, so everything routes through here.
  reportIssue(args) {
    if (!this.hasRuntime()) return;
    const [message, ...rest] = args;
    try {
      chrome.runtime
        .sendMessage({
          type: 'REMOTE_LOG',
          level: 'WARN',
          message: String(message ?? ''),
          context: rest.length ? { details: rest } : undefined,
        })
        .catch(() => {});
    } catch {
      // Extension context invalidated (e.g. mid-reload) -- ignore.
    }
  },

  hasRuntime() {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  },

  formatDuration(ms) {
    if (ms == null || Number.isNaN(ms)) return '—';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  },

  formatTiming(timing) {
    if (!timing) return '';
    const parts = [];
    if (timing.apiMs != null) parts.push(`API ${this.formatDuration(timing.apiMs)}`);
    if (timing.printMs != null && timing.printMs > 0) {
      parts.push(`print ${this.formatDuration(timing.printMs)}`);
    }
    if (timing.totalMs != null) parts.push(`total ${this.formatDuration(timing.totalMs)}`);
    return parts.join(' · ');
  },
};

// First line of execution — if you don't see this, the extension isn't injected.
BP_RX.log('shared.js loaded', location.href, location.hash);

function parseOneScanLabel(text) {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;

  // OneScan's label chips run together with no separating whitespace (e.g.
  // "GTIN 00368462461600SN 8084147Lot VP6577Exp 11/30/2028" -- confirmed in
  // production logs 2026-07-09). A naive "\S+ capture until whitespace"
  // regex swallows the next label's text into the current value (the GTIN
  // above would capture as "00368462461600SN"). Instead, find every "LABEL "
  // occurrence (label word immediately followed by a space -- present even
  // when the label itself has no *preceding* space) and treat the text up
  // to the *next* such label as that field's value.
  const labelMatches = [...cleaned.matchAll(/(NDC|GTIN|SN|Lot|Exp)\s/gi)];
  const fields = {};

  labelMatches.forEach((match, i) => {
    const label = match[1].toUpperCase();
    const valueStart = match.index + match[0].length;
    const valueEnd = i + 1 < labelMatches.length ? labelMatches[i + 1].index : cleaned.length;
    const value = cleaned.slice(valueStart, valueEnd).trim();
    if (!value) return;

    if (label === 'NDC') fields.ndc = fields.ndc || value;
    else if (label === 'GTIN') fields.gtin = fields.gtin || value;
    else if (label === 'SN') fields.serial = fields.serial || value;
    else if (label === 'LOT') fields.lot = fields.lot || value;
    else if (label === 'EXP') fields.expiry = fields.expiry || value;
  });

  const gtin = fields.gtin || null;
  const ndc = fields.ndc || null;
  const serial = fields.serial || null;
  const lot = fields.lot || null;
  const expiry = fields.expiry || null;

  if (!gtin && cleaned.length < BP_RX.MIN_SCAN_LENGTH) return null;

  return { raw: cleaned, gtin, ndc, serial, lot, expiry };
}

function labelKey(parsed) {
  return [parsed.gtin, parsed.serial, parsed.lot].filter(Boolean).join('|');
}
