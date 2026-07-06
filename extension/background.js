importScripts('lib/gs1.js', 'lib/api.js', 'lib/printConfig.js', 'lib/zpl.js');

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

function buildLabelData(lastResult) {
  if (!lastResult?.item) return null;

  return {
    itemName: lastResult.item.itemName,
    ndc: lastResult.item.ndc,
    upc: lastResult.parsed?.upc || lastResult.matchedCode || lastResult.item.upc,
    lot: lastResult.parsed?.lot,
    cost: lastResult.item.cost,
    dateReceived: lastResult.item.lastReceived,
    supplier: lastResult.item.supplier,
  };
}

function buildLabelZpl(lastResult, printSettings, labelCount) {
  const data = buildLabelData(lastResult);
  if (!data) return null;

  const count = labelCount ?? lastResult.labelCount ?? resolveLabelCount(lastResult.item);
  return generateMultipleLabels(
    {
      ...data,
      printWidth: printSettings.printWidth,
      labelLength: printSettings.labelLength,
    },
    count
  );
}

async function processScan(raw, meta = {}) {
  const scanStartedAt = meta.scanStartedAt || Date.now();
  const apiStart = Date.now();

  if (!isTargetPage(meta.page)) {
    warn('Rejected scan from non-target page', meta.page);
    return { ok: false, reason: 'wrong_page' };
  }

  if (!meta.source?.startsWith('scan:')) {
    warn('Rejected non-barcode scan source', meta.source);
    return { ok: false, reason: 'not_barcode_scan' };
  }

  // scan:test goes directly to API — used by popup test button
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

  log('lookup codes', lookupCodes, 'hours', settings.hours);

  let lookup;
  try {
    lookup = await lookupWithCandidates(lookupCodes, settings);
  } catch (err) {
    warn('lookup failed', err.message, err.tried);
    const apiMs = Date.now() - apiStart;
    const payload = {
      ok: false,
      status: 'not_found',
      message: err.message,
      parsed,
      tried: err.tried || lookupCodes,
      at: new Date().toISOString(),
      timing: {
        scanStartedAt,
        apiMs,
        totalMs: Date.now() - scanStartedAt,
      },
    };
    await chrome.storage.local.set({ lastResult: payload });
    return payload;
  }

  const apiMs = Date.now() - apiStart;
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
    labelCount: resolveLabelCount(result.item),
    at: new Date().toISOString(),
    timing: {
      scanStartedAt,
      apiMs,
      totalMs: Date.now() - scanStartedAt,
    },
  };

  await chrome.storage.local.set({ lastResult: payload });
  log('lookup success', {
    matchedCode,
    status: payload.status,
    item: result.item?.itemName,
    mockPrint: settings.mockPrint,
    apiMs,
  });

  return payload;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PRINT_ZPL') {
    const labelCount = message.labelCount || 1;
    const printStart = Date.now();
    log('PRINT_ZPL start', { labelCount, bytes: message.zpl?.length || 0 });
    getPrintSettings()
      .then((settings) => printZplViaBridge(message.zpl, settings))
      .then((data) => {
        log('PRINT_ZPL ok', { ms: Date.now() - printStart, ...data });
        sendResponse({ ok: true, ...data });
      })
      .catch((err) => {
        warn('PRINT_ZPL failed', err.message, { ms: Date.now() - printStart });
        sendResponse({
          ok: false,
          error: `${err.message}. Start: node extension/print-bridge/server.js`,
        });
      });
    return true;
  }

  if (message?.type === 'BRIDGE_HEALTH') {
    getPrintSettings()
      .then((settings) => checkPrintBridgeHealth(settings))
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message?.type === 'REPRINT_LAST') {
    getPrintSettings()
      .then(async (printSettings) => {
        const { lastResult } = await chrome.storage.local.get('lastResult');
        if (!lastResult?.item) {
          throw new Error('No scan to reprint yet');
        }
        if (!lastResult.ok && lastResult.status !== 'already_completed') {
          throw new Error('Last scan did not produce a printable label');
        }

        const settings = await getSettings();
        if (settings.mockPrint && !message.force) {
          return sendResponse({
            ok: false,
            error: 'Mock print is ON — use Settings to disable, or reprint forces print',
          });
        }

        const labelCount = lastResult.labelCount ?? resolveLabelCount(lastResult.item);
        const zpl = buildLabelZpl(lastResult, printSettings, labelCount);
        if (!zpl) throw new Error('Could not build label from last scan');

        log('REPRINT_LAST start', { labelCount, bytes: zpl.length });
        const printStart = Date.now();
        const data = await printZplViaBridge(zpl, printSettings);
        log('REPRINT_LAST ok', { ms: Date.now() - printStart, ...data });
        sendResponse({
          ok: true,
          ...data,
          itemName: lastResult.item.itemName,
          labelCount,
        });
      })
      .catch((err) => {
        warn('REPRINT_LAST failed', err.message);
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  if (message?.type === 'PRINT_TEST') {
    getPrintSettings()
      .then(async (settings) => {
        const zpl = generateTestLabel(settings);
        await printZplViaBridge(zpl, settings);
        sendResponse({ ok: true, printerIp: settings.printerIp });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message?.type === 'BP_RX_TEST_API') {
    processScan(message.raw || '307815770310', {
      source: 'scan:test',
      page: '#/ssccScanIn',
      scanStartedAt: Date.now(),
    })
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, message: err.message }));
    return true;
  }

  if (message?.type !== 'BARCODE_SCAN') {
    return false;
  }

  processScan(message.raw, {
    source: message.source,
    page: message.page,
    oneScan: message.oneScan,
    scanStartedAt: message.scanStartedAt,
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
