const BP_RX = {
  LOG_PREFIX: '[BP-RX Sticker]',
  TARGET_HASH: '#/ssccScanIn',
  BARCODE_SELECTOR:
    'input[barcode-scanner].barcodeEnableField, input[ng-model="vm.barcodeData.code"]',
  LABELS_SELECTOR: '.item-container.scanned .labels-area, .labels-area',
  MIN_SCAN_LENGTH: 8,
  DEDUPE_MS: 4000,
  GRACE_MS: 8000,

  log(...args) {
    console.log(this.LOG_PREFIX, ...args);
  },

  warn(...args) {
    console.warn(this.LOG_PREFIX, ...args);
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

  const gtin = cleaned.match(/\bGTIN\s+(\S+)/i)?.[1] || null;
  const ndc = cleaned.match(/\bNDC\s+(\S+)/i)?.[1] || null;
  const serial = cleaned.match(/\bSN\s+(\S+)/i)?.[1] || null;
  const lot = cleaned.match(/\bLot\s+(\S+)/i)?.[1] || null;
  const expiry = cleaned.match(/\bExp\s+(\S+)/i)?.[1] || null;

  if (!gtin && cleaned.length < BP_RX.MIN_SCAN_LENGTH) return null;

  return { raw: cleaned, gtin, ndc, serial, lot, expiry };
}

function labelKey(parsed) {
  return [parsed.gtin, parsed.serial, parsed.lot].filter(Boolean).join('|');
}
