const attached = new WeakSet();
const seenLabels = new Set();
let toastContainer = null;
let statusBadge = null;
let fieldObserver = null;
let domObserver = null;
let sendScanFn = null;
let printInFlight = false;
let isActive = false;
let lastInputValue = '';
let routePollTimer = null;
let inputPollTimer = null;
let domCheckTimer = null;
let hasShownActiveToast = false;
let bridgeWarningShown = false;
let gracePeriodEnds = 0;

function isTargetPage() {
  return (
    location.hostname === 'onescan.lspedia.com' &&
    location.hash.toLowerCase().startsWith(BP_RX.TARGET_HASH.toLowerCase())
  );
}

function isGracePeriod() {
  return Date.now() < gracePeriodEnds;
}

function ensureToastContainer() {
  if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.className = 'bp-rx-toast-container';
  document.body.appendChild(toastContainer);
  return toastContainer;
}

function removeUi() {
  toastContainer?.remove();
  statusBadge?.remove();
  toastContainer = null;
  statusBadge = null;
}

function ensureStatusBadge(state) {
  if (!isActive) return;

  if (!statusBadge || !document.body.contains(statusBadge)) {
    statusBadge = document.createElement('div');
    statusBadge.id = 'bp-rx-status-badge';
    statusBadge.style.cssText =
      'position:fixed;bottom:12px;right:12px;z-index:2147483647;padding:6px 10px;border-radius:999px;font:600 11px/1.2 system-ui,sans-serif;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.2);pointer-events:none;';
    document.body.appendChild(statusBadge);
  }

  const colors = { waiting: '#1e40af', listening: '#166534', error: '#991b1b' };
  statusBadge.style.background = colors[state.variant] || colors.waiting;
  statusBadge.textContent = state.text;
}

function showToast(variant, title, message, meta) {
  if (!isActive) return;
  BP_RX.log('toast', variant, title, message || '');

  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `bp-rx-toast bp-rx-toast--${variant}`;

  const titleEl = document.createElement('div');
  titleEl.className = 'bp-rx-toast__title';
  titleEl.textContent = title;
  toast.appendChild(titleEl);

  if (message) {
    const msg = document.createElement('div');
    msg.textContent = message;
    toast.appendChild(msg);
  }

  if (meta) {
    const metaEl = document.createElement('div');
    metaEl.className = 'bp-rx-toast__meta';
    metaEl.textContent = meta;
    toast.appendChild(metaEl);
  }

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
}

function formatParsedMeta(parsed) {
  if (!parsed) return '';
  const parts = [];
  if (parsed.upc) parts.push(`UPC ${parsed.upc}`);
  if (parsed.gtin) parts.push(`GTIN ${parsed.gtin}`);
  if (parsed.lot) parts.push(`Lot ${parsed.lot}`);
  if (parsed.serial) parts.push(`Serial ${parsed.serial}`);
  return parts.join(' · ');
}

async function maybePrintOneLabel(result, parsedHint) {
  if (result.status !== 'ready_to_print' || result.mockPrint || printInFlight) return 0;

  printInFlight = true;
  const printStart = Date.now();
  try {
    const printSettings = await chrome.storage.sync.get({
      printWidth: 448,
      labelLength: 582,
    });

    const zpl = generateLabel({
      itemName: result.item.itemName,
      ndc: result.item.ndc,
      upc: result.parsed?.upc || result.matchedCode || result.item.upc,
      lot: result.parsed?.lot || parsedHint?.lot,
      cost: result.item.cost,
      dateReceived: result.item.lastReceived,
      supplier: result.item.supplier,
      printWidth: printSettings.printWidth,
      labelLength: printSettings.labelLength,
    });
    await printOneLabel(zpl);
    result.printed = true;
    return Date.now() - printStart;
  } finally {
    printInFlight = false;
  }
}

function finalizeTiming(result, scanStartedAt, printMs = 0) {
  const timing = {
    ...(result.timing || {}),
    printMs: printMs || result.timing?.printMs || 0,
    totalMs: Date.now() - scanStartedAt,
  };
  result.timing = timing;
  return timing;
}

async function persistLastResult(result) {
  await chrome.storage.local.set({ lastResult: result });
}

async function handleScanResult(raw, result, parsedHint, scanStartedAt) {
  if (result.reason === 'duplicate' || result.reason === 'wrong_page') {
    BP_RX.log('Lookup skipped', result.reason);
    return;
  }
  if (result.reason === 'disabled') {
    showToast('warn', 'Extension paused', 'Enable listening in the BP RX popup');
    return;
  }

  const timingLine = () => BP_RX.formatTiming(finalizeTiming(result, scanStartedAt));

  if (!result.ok) {
    finalizeTiming(result, scanStartedAt);
    await persistLastResult(result);
    BP_RX.log('Scan timing', result.timing);
    ensureStatusBadge({ variant: 'error', text: `BP RX: not found (${BP_RX.formatDuration(result.timing.totalMs)})` });
    showToast(
      'error',
      'Not on recent invoice',
      result.message || 'No matching item found',
      [formatParsedMeta(result.parsed || parsedHint), timingLine()].filter(Boolean).join(' · ')
    );
    return;
  }

  const itemName = result.item?.itemName || 'Item found';
  const invoiceNumber = result.invoice?.invoiceNumber || '';

  if (result.status === 'already_completed') {
    finalizeTiming(result, scanStartedAt);
    await persistLastResult(result);
    BP_RX.log('Scan timing', result.timing);
    ensureStatusBadge({
      variant: 'listening',
      text: `BP RX: already completed (${BP_RX.formatDuration(result.timing.totalMs)})`,
    });
    showToast(
      'warn',
      'Already completed',
      itemName,
      [invoiceNumber ? `Invoice ${invoiceNumber}` : null, timingLine()].filter(Boolean).join(' · ')
    );
    return;
  }

  try {
    const printMs = await maybePrintOneLabel(result, parsedHint);
    finalizeTiming(result, scanStartedAt, printMs);
    await persistLastResult(result);
    BP_RX.log('Scan timing', result.timing);

    ensureStatusBadge({
      variant: 'listening',
      text: `BP RX: done (${BP_RX.formatDuration(result.timing.totalMs)})`,
    });
    showToast(
      'success',
      result.mockPrint ? 'Would print 1 label' : 'Printed 1 label',
      itemName,
      [
        invoiceNumber ? `Invoice ${invoiceNumber}` : null,
        formatParsedMeta(result.parsed || parsedHint),
        timingLine(),
      ]
        .filter(Boolean)
        .join(' · ')
    );
  } catch (err) {
    finalizeTiming(result, scanStartedAt);
    await persistLastResult(result);
    BP_RX.warn('Print failed', err.message, result.timing);
    ensureStatusBadge({ variant: 'error', text: 'BP RX: print failed' });
    showToast('error', 'Print failed', itemName, [err.message, timingLine()].join(' · '));
  }
}

function createSendScan() {
  const recent = new Map();

  return function sendScan(raw, source, parsedHint) {
    if (!isActive || !isTargetPage()) {
      BP_RX.log('Blocked — not on SSCC Scan In', { source, hash: location.hash });
      return;
    }

    if (!BP_RX.hasRuntime()) {
      showToast('error', 'Extension needs refresh', 'Reload at chrome://extensions, then refresh this tab');
      return;
    }

    const value = (raw || parsedHint?.gtin || '').trim();
    if (value.length < BP_RX.MIN_SCAN_LENGTH && !parsedHint?.gtin) {
      BP_RX.log('Blocked — value too short', { source, length: value.length });
      return;
    }

    const dedupeKey = parsedHint?.gtin ? labelKey(parsedHint) : value;
    const now = Date.now();
    const lastAt = recent.get(dedupeKey);
    if (lastAt && now - lastAt < BP_RX.DEDUPE_MS) {
      BP_RX.log('Blocked — duplicate', { source, dedupeKey: dedupeKey.slice(0, 40) });
      return;
    }
    recent.set(dedupeKey, now);

    const scanStartedAt = Date.now();
    BP_RX.log('→ API lookup', { source, preview: value.slice(0, 60), parsedHint });
    ensureStatusBadge({ variant: 'waiting', text: 'BP RX: looking up…' });

    chrome.runtime.sendMessage(
      {
        type: 'BARCODE_SCAN',
        raw: parsedHint?.gtin || value,
        source,
        page: location.hash,
        oneScan: parsedHint || null,
        scanStartedAt,
      },
      async (result) => {
        if (chrome.runtime.lastError) {
          BP_RX.warn('sendMessage failed', chrome.runtime.lastError.message);
          showToast('error', 'Extension error', 'Reload extension + refresh this tab');
          return;
        }
        BP_RX.log('← API result', result?.status || result?.reason || result?.ok, result?.timing);
        await handleScanResult(value, result || {}, parsedHint, scanStartedAt);
      }
    );
  };
}

function mergeSeedLabels() {
  let added = 0;
  document.querySelectorAll(BP_RX.LABELS_SELECTOR).forEach((el) => {
    const parsed = parseOneScanLabel(el.textContent);
    if (!parsed?.gtin) return;
    const key = labelKey(parsed);
    if (!seenLabels.has(key)) {
      seenLabels.add(key);
      added += 1;
    }
  });
  if (added > 0) {
    BP_RX.log('Seeded items on page (no API)', { added, total: seenLabels.size });
  }
  return added;
}

function startGracePeriod() {
  seenLabels.clear();
  gracePeriodEnds = Date.now() + BP_RX.GRACE_MS;
  mergeSeedLabels();
  BP_RX.log('Grace period started — existing items will not trigger lookup', {
    seconds: BP_RX.GRACE_MS / 1000,
  });

  [1000, 2500, 5000, 7000].forEach((ms) => {
    setTimeout(() => {
      if (!isActive) return;
      mergeSeedLabels();
      if (ms >= BP_RX.GRACE_MS - 500) {
        BP_RX.log('Grace period ending — new scans will trigger lookup');
      }
    }, ms);
  });
}

function checkForNewScan(source) {
  if (!isActive) return;

  document.querySelectorAll(BP_RX.LABELS_SELECTOR).forEach((el) => {
    const parsed = parseOneScanLabel(el.textContent);
    if (!parsed?.gtin) return;

    const key = labelKey(parsed);
    if (seenLabels.has(key)) return;

    seenLabels.add(key);

    if (isGracePeriod()) {
      BP_RX.log('New item during grace — seeded only', { gtin: parsed.gtin });
      return;
    }

    BP_RX.log('New scan detected (OneScan added item)', { source, gtin: parsed.gtin });
    sendScanFn(parsed.gtin, 'scan:dom-new', parsed);
  });
}

function scheduleDomCheck(source) {
  clearTimeout(domCheckTimer);
  domCheckTimer = setTimeout(() => checkForNewScan(source), 300);
}

function nodeHasScanResult(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  return (
    node.matches?.('.labels-area, .item-container.scanned') ||
    !!node.querySelector?.('.labels-area, .item-container.scanned')
  );
}

function attachBarcodeListener(input) {
  if (attached.has(input)) return;
  attached.add(input);

  BP_RX.log('Attached barcode input listener');

  let lastNonEmpty = '';
  let keyBuffer = '';
  let keyIdleTimer = null;

  input.addEventListener('focus', () => BP_RX.log('Barcode field focused'), true);

  const flushKeyBuffer = () => {
    const buffered = keyBuffer.trim();
    keyBuffer = '';
    if (buffered.length >= BP_RX.MIN_SCAN_LENGTH) {
      sendScanFn(buffered, 'scan:key-idle');
    }
  };

  input.addEventListener(
    'keydown',
    (event) => {
      if (!isActive) return;
      if (event.key.length === 1) {
        keyBuffer += event.key;
        clearTimeout(keyIdleTimer);
        keyIdleTimer = setTimeout(flushKeyBuffer, 150);
      }
    },
    true
  );

  input.addEventListener(
    'input',
    () => {
      if (!isActive) return;
      const value = input.value;
      BP_RX.log('Barcode input event', { length: value.length });

      if (value.length >= BP_RX.MIN_SCAN_LENGTH) {
        lastNonEmpty = value;
      }

      if (lastNonEmpty.length >= BP_RX.MIN_SCAN_LENGTH && value.length === 0) {
        BP_RX.log('Barcode input cleared');
        sendScanFn(lastNonEmpty, 'scan:input-cleared');
        flushKeyBuffer();
        lastNonEmpty = '';
      }
    },
    true
  );

  lastInputValue = input.value;
}

function scanForBarcodeFields(root = document) {
  if (!isActive) return 0;
  const fields = root.querySelectorAll(BP_RX.BARCODE_SELECTOR);
  fields.forEach(attachBarcodeListener);
  return fields.length;
}

function stopTimers() {
  if (inputPollTimer) {
    clearInterval(inputPollTimer);
    inputPollTimer = null;
  }
  if (domCheckTimer) {
    clearTimeout(domCheckTimer);
    domCheckTimer = null;
  }
}

function stopObservers() {
  fieldObserver?.disconnect();
  domObserver?.disconnect();
  fieldObserver = null;
  domObserver = null;
}

function startInputPoll() {
  if (inputPollTimer) return;
  inputPollTimer = setInterval(() => {
    if (!isActive) return;
    const input = document.querySelector(BP_RX.BARCODE_SELECTOR);
    if (!input) return;

    const value = input.value;
    if (value === lastInputValue) return;

    if (lastInputValue.length >= BP_RX.MIN_SCAN_LENGTH && value.length === 0) {
      BP_RX.log('Poll detected barcode input clear');
      sendScanFn(lastInputValue, 'scan:poll-cleared');
    }
    lastInputValue = value;
  }, 400);
}

function watchDomScans() {
  if (domObserver) return;

  domObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (nodeHasScanResult(node)) {
          scheduleDomCheck('mutation');
          return;
        }
      }
    }
  });

  if (document.body) {
    domObserver.observe(document.body, { childList: true, subtree: true });
  }
}

function watchBarcodeField() {
  if (fieldObserver) return;

  fieldObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches?.(BP_RX.BARCODE_SELECTOR)) {
          attachBarcodeListener(node);
        } else {
          scanForBarcodeFields(node);
        }
      }
    }
  });

  if (document.body) {
    fieldObserver.observe(document.body, { childList: true, subtree: true });
  }
}

async function maybeWarnBridgeDown() {
  if (!BP_RX.hasRuntime()) return;

  const { mockPrint = true } = await chrome.storage.sync.get({ mockPrint: true });
  if (mockPrint) return;

  try {
    const health = await chrome.runtime.sendMessage({ type: 'BRIDGE_HEALTH' });
    if (health?.ok) return;
    if (bridgeWarningShown) return;
    bridgeWarningShown = true;
    showToast(
      'error',
      'Print bridge not running',
      health?.error || 'Run install-windows.bat on this PC or start server.js'
    );
  } catch {
    if (!bridgeWarningShown) {
      bridgeWarningShown = true;
      showToast('error', 'Print bridge not running', 'Start the print bridge on this PC');
    }
  }
}

function activate() {
  if (!isTargetPage()) {
    deactivate();
    return;
  }

  const wasActive = isActive;
  isActive = true;

  if (!wasActive) {
    BP_RX.log('ACTIVE on SSCC Scan In');
    hasShownActiveToast = false;
    bridgeWarningShown = false;
    startGracePeriod();
  }

  const fieldCount = scanForBarcodeFields();
  watchBarcodeField();
  watchDomScans();
  startInputPoll();

  ensureStatusBadge({
    variant: fieldCount > 0 ? 'listening' : 'waiting',
    text: fieldCount > 0 ? 'BP RX: ready — scan a barcode' : 'BP RX: waiting for barcode field…',
  });

  if (!hasShownActiveToast) {
    hasShownActiveToast = true;
    showToast('info', 'BP RX Sticker active', 'Scan a product — 1 scan = 1 label');
    maybeWarnBridgeDown();
  }
}

function deactivate() {
  gracePeriodEnds = 0;
  if (!isActive) {
    removeUi();
    return;
  }

  isActive = false;
  hasShownActiveToast = false;
  bridgeWarningShown = false;
  stopTimers();
  stopObservers();
  seenLabels.clear();
  removeUi();
  BP_RX.log('Inactive — left SSCC Scan In');
}

function syncRoute() {
  if (isTargetPage()) activate();
  else deactivate();
}

function boot() {
  try {
    sendScanFn = createSendScan();
    BP_RX.log('onescan.js booted', { hash: location.hash, target: isTargetPage() });

    syncRoute();

    window.addEventListener('hashchange', () => {
      BP_RX.log('hashchange', location.hash);
      syncRoute();
    });

    if (routePollTimer) clearInterval(routePollTimer);
    routePollTimer = setInterval(syncRoute, 3000);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'BP_RX_PING') {
        sendResponse({
          ok: true,
          active: isActive,
          gracePeriod: isGracePeriod(),
          seededCount: seenLabels.size,
          hash: location.hash,
          target: isTargetPage(),
          fields: document.querySelectorAll(BP_RX.BARCODE_SELECTOR).length,
          runtime: BP_RX.hasRuntime(),
        });
        return true;
      }

      if (message?.type === 'BP_RX_TEST_SCAN') {
        if (!isTargetPage()) {
          sendResponse({ ok: false, error: 'Not on SSCC Scan In page' });
          return true;
        }
        BP_RX.log('Test scan from popup');
        sendScanFn(message.raw || '307815770310', 'scan:test');
        sendResponse({ ok: true });
        return true;
      }

      return false;
    });
  } catch (err) {
    BP_RX.warn('Boot failed', err.message);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('load', boot);
} else {
  boot();
}
