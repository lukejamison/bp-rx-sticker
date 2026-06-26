importScripts('lib/gs1.js', 'lib/api.js');

const LOG_PREFIX = '[BP-RX Sticker BG]';
const TARGET_HASH = '#/ssccScanIn';
const RECENT_SCAN_MS = 4000;

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

function warn(...args) {
  console.warn(LOG_PREFIX, ...args);
}

let lastScanKey = '';
let lastScanAt = 0;

function isTargetPage(hash) {
  return typeof hash === 'string' && hash.toLowerCase().startsWith(TARGET_HASH.toLowerCase());
}

function buildDedupeKey(raw, parsed) {
  if (parsed.gtin || parsed.serial || parsed.lot) {
    return [parsed.upc, parsed.gtin, parsed.serial, parsed.lot].filter(Boolean).join('|');
  }
  return parsed.upc || raw.trim();
}

async function processScan(raw, meta = {}) {
  if (!isTargetPage(meta.page)) {
    warn('Rejected scan from non-target page', meta.page);
    return { ok: false, reason: 'wrong_page' };
  }

  if (!meta.source?.startsWith('scan:')) {
    warn('Rejected non-barcode scan source', meta.source);
    return { ok: false, reason: 'not_barcode_scan' };
  }

  log('processScan', raw.slice(0, 80), meta.source);

  const settings = await getSettings();
  if (!settings.enabled) {
    return { ok: false, reason: 'disabled' };
  }

  const parsed = parseGs1Barcode(raw);
  if (meta.oneScan) {
    parsed.gtin = parsed.gtin || meta.oneScan.gtin;
    parsed.lot = parsed.lot || meta.oneScan.lot;
    parsed.serial = parsed.serial || meta.oneScan.serial;
    parsed.expiry = parsed.expiry || meta.oneScan.expiry;
    parsed.ndc = meta.oneScan.ndc;
  }

  if (parsed.gtin) {
    parsed.upc = gtinToUpc12(parsed.gtin);
  } else if (/^\d{12,14}$/.test(raw.trim())) {
    parsed.upc = gtinToUpc12(raw.trim());
  }

  const dedupeKey = buildDedupeKey(raw, parsed);
  const now = Date.now();
  if (dedupeKey === lastScanKey && now - lastScanAt < RECENT_SCAN_MS) {
    return { ok: false, reason: 'duplicate' };
  }
  lastScanKey = dedupeKey;
  lastScanAt = now;

  const lookupCodes = parsed.lookupCodes.length > 0 ? [...parsed.lookupCodes] : [raw.trim()];
  if (parsed.upc && !lookupCodes.includes(parsed.upc)) {
    lookupCodes.unshift(parsed.upc);
  }

  log('lookup codes', lookupCodes);

  let lookup;
  try {
    lookup = await lookupWithCandidates(lookupCodes, settings);
  } catch (err) {
    warn('lookup failed', err.message, err.tried);
    const payload = {
      ok: false,
      status: 'not_found',
      message: err.message,
      parsed,
      tried: err.tried || lookupCodes,
      at: new Date().toISOString(),
    };
    await chrome.storage.local.set({ lastResult: payload });
    return payload;
  }

  const { result, matchedCode } = lookup;

  const payload = {
    ok: true,
    status: result.completed ? 'already_completed' : 'ready_to_print',
    mockPrint: settings.mockPrint,
    matchedCode,
    parsed,
    item: result.item,
    invoice: result.invoice,
    completed: result.completed,
    completionInfo: result.completionInfo,
    at: new Date().toISOString(),
  };

  await chrome.storage.local.set({ lastResult: payload });
  log('lookup success', {
    matchedCode,
    status: payload.status,
    item: result.item?.itemName,
    mockPrint: settings.mockPrint,
  });

  return payload;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'BARCODE_SCAN') {
    return false;
  }

  processScan(message.raw, {
    source: message.source,
    page: message.page,
    oneScan: message.oneScan,
  })
    .then(sendResponse)
    .catch((err) => {
      sendResponse({
        ok: false,
        status: 'error',
        message: err.message || 'Unexpected error',
        at: new Date().toISOString(),
      });
    });

  return true;
});
