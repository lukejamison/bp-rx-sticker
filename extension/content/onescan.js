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

function isTargetPage() {
  return (
    location.hostname === 'onescan.lspedia.com' &&
    location.hash.toLowerCase().startsWith(BP_RX.TARGET_HASH.toLowerCase())
  );
}

function scanDedupeKey(raw, parsed) {
  if (parsed?.gtin || parsed?.serial || parsed?.lot) {
    return labelKey(parsed);
  }
  return raw.trim();
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

function ensureStatusBadge(state, force = false) {
  if (!force && !isActive) return;

  if (!statusBadge || !document.body.contains(statusBadge)) {
    statusBadge = document.createElement('div');
    statusBadge.id = 'bp-rx-status-badge';
    statusBadge.style.cssText =
      'position:fixed;bottom:12px;right:12px;z-index:2147483647;padding:6px 10px;border-radius:999px;font:600 11px/1.2 system-ui,sans-serif;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.2);pointer-events:none;';
    document.body.appendChild(statusBadge);
  }

  const colors = { waiting: '#1e40af', listening: '#166534', error: '#991b1b', idle: '#4b5563' };
  statusBadge.style.background = colors[state.variant] || colors.waiting;
  statusBadge.textContent = state.text;
}

function showToast(variant, title, message, meta) {
  BP_RX.log('toast', variant, title, message, meta || '');

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
  const parts = [];
  if (parsed?.upc) parts.push(`UPC ${parsed.upc}`);
  if (parsed?.gtin) parts.push(`GTIN ${parsed.gtin}`);
  if (parsed?.lot) parts.push(`Lot ${parsed.lot}`);
  if (parsed?.serial) parts.push(`Serial ${parsed.serial}`);
  return parts.join(' · ');
}

async function maybePrintOneLabel(result) {
  if (result.status !== 'ready_to_print' || result.mockPrint || printInFlight) return;

  printInFlight = true;
  try {
    const zpl = generateLabel({
      itemName: result.item.itemName,
      ndc: result.item.ndc,
      cost: result.item.cost,
      dateReceived: result.item.lastReceived,
      supplier: result.item.supplier,
    });
    await printOneLabel(zpl);
    result.printed = true;
  } finally {
    printInFlight = false;
  }
}

async function handleScanResult(raw, result, parsedHint) {
  if (result.reason === 'duplicate') {
    BP_RX.log('Skipped duplicate scan');
    return;
  }
  if (result.reason === 'disabled') {
    showToast('warn', 'Extension paused', 'Enable listening in the BP RX popup');
    return;
  }
  if (result.reason === 'wrong_page') {
    return;
  }

  if (!result.ok) {
    ensureStatusBadge({ variant: 'error', text: 'BP RX: not found' });
    showToast(
      'error',
      'Not on recent invoice',
      result.message || 'No matching item found',
      formatParsedMeta(result.parsed || parsedHint || {})
    );
    return;
  }

  const itemName = result.item?.itemName || 'Item found';
  const invoiceNumber = result.invoice?.invoiceNumber || '';

  if (result.status === 'already_completed') {
    ensureStatusBadge({ variant: 'listening', text: 'BP RX: already completed' });
    showToast('warn', 'Already completed', itemName, invoiceNumber ? `Invoice ${invoiceNumber}` : '');
    return;
  }

  try {
    await maybePrintOneLabel(result);
    ensureStatusBadge({ variant: 'listening', text: 'BP RX: label ready' });
    showToast(
      'success',
      result.mockPrint ? 'Would print 1 label' : 'Printed 1 label',
      itemName,
      [invoiceNumber ? `Invoice ${invoiceNumber}` : null, formatParsedMeta(result.parsed || parsedHint)]
        .filter(Boolean)
        .join(' · ')
    );
  } catch (err) {
    BP_RX.warn('Print failed', err.message);
    ensureStatusBadge({ variant: 'error', text: 'BP RX: print failed' });
    showToast('error', 'Print failed', itemName, err.message);
  }
}

function createSendScan() {
  const recent = new Map();

  return function sendScan(raw, source, parsedHint) {
    if (!isActive || !isTargetPage()) {
      BP_RX.log('Ignored scan — not active on SSCC Scan In', { source, hash: location.hash });
      return;
    }

    if (!BP_RX.hasRuntime()) {
      showToast('error', 'Extension needs refresh', 'Reload at chrome://extensions, then refresh this tab');
      return;
    }

    const value = (raw || parsedHint?.gtin || '').trim();
    if (value.length < BP_RX.MIN_SCAN_LENGTH && !parsedHint?.gtin) {
      BP_RX.log('Ignored scan — too short', { source, length: value.length });
      return;
    }

    const dedupeKey = parsedHint?.gtin ? labelKey(parsedHint) : scanDedupeKey(value, parsedHint);
    const now = Date.now();
    const lastAt = recent.get(dedupeKey);
    if (lastAt && now - lastAt < BP_RX.DEDUPE_MS) {
      BP_RX.log('Ignored duplicate scan', { source, dedupeKey });
      return;
    }
    recent.set(dedupeKey, now);

    BP_RX.log('Sending scan to background', { source, preview: value.slice(0, 60), parsedHint });
    ensureStatusBadge({ variant: 'waiting', text: 'BP RX: looking up…' });

    chrome.runtime.sendMessage(
      {
        type: 'BARCODE_SCAN',
        raw: parsedHint?.gtin || value,
        source,
        page: location.hash,
        oneScan: parsedHint || null,
      },
      async (result) => {
        if (chrome.runtime.lastError) {
          BP_RX.warn('sendMessage failed', chrome.runtime.lastError.message);
          ensureStatusBadge({ variant: 'error', text: 'BP RX: extension error' });
          showToast('error', 'Extension error', 'Reload extension + refresh this tab');
          return;
        }

        BP_RX.log('Lookup result', result);
        await handleScanResult(value, result || {}, parsedHint);
      }
    );
  };
}

function seedExistingLabels() {
  seenLabels.clear();
  document.querySelectorAll(BP_RX.LABELS_SELECTOR).forEach((el) => {
    const parsed = parseOneScanLabel(el.textContent);
    if (parsed?.gtin) seenLabels.add(labelKey(parsed));
  });
  BP_RX.log('Seeded existing labels (will not re-print)', seenLabels.size);
}

function checkForNewDomScan(source) {
  if (!isActive) return;

  document.querySelectorAll(BP_RX.LABELS_SELECTOR).forEach((el) => {
    const parsed = parseOneScanLabel(el.textContent);
    if (!parsed?.gtin) return;

    const key = labelKey(parsed);
    if (seenLabels.has(key)) return;

    seenLabels.add(key);
    BP_RX.log('New OneScan item detected', { source, parsed });
    sendScanFn(parsed.gtin, 'scan:dom-new', parsed);
  });
}

function attachBarcodeListener(input) {
  if (attached.has(input)) return;
  attached.add(input);

  BP_RX.log('Attached barcode input listener');

  let lastNonEmpty = '';
  let keyBuffer = '';
  let keyIdleTimer = null;

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
      BP_RX.log('keydown on barcode field', event.key.length === 1 ? event.key : event.key);
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
      BP_RX.log('input event on barcode field', { length: value.length });

      if (value.length >= BP_RX.MIN_SCAN_LENGTH) {
        lastNonEmpty = value;
      }

      if (lastNonEmpty.length >= BP_RX.MIN_SCAN_LENGTH && value.length === 0) {
        BP_RX.log('Input cleared after scan');
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

function startInputPoll() {
  if (inputPollTimer) clearInterval(inputPollTimer);
  inputPollTimer = setInterval(() => {
    if (!isActive) return;
    const input = document.querySelector(BP_RX.BARCODE_SELECTOR);
    if (!input) return;

    const value = input.value;
    if (value === lastInputValue) return;

    if (lastInputValue.length >= BP_RX.MIN_SCAN_LENGTH && value.length === 0) {
      BP_RX.log('Poll detected input clear', lastInputValue.slice(0, 40));
      sendScanFn(lastInputValue, 'scan:poll-cleared');
    }

    lastInputValue = value;
  }, 100);
}

function stopInputPoll() {
  if (inputPollTimer) {
    clearInterval(inputPollTimer);
    inputPollTimer = null;
  }
}

function watchDomScans() {
  if (domObserver) domObserver.disconnect();

  domObserver = new MutationObserver(() => {
    checkForNewDomScan('mutation');
  });

  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function activate() {
  if (!isTargetPage()) {
    deactivate();
    return;
  }
  if (isActive) {
    scanForBarcodeFields();
    return;
  }

  isActive = true;
  BP_RX.log('ACTIVE on SSCC Scan In', location.hash);

  seedExistingLabels();
  const fieldCount = scanForBarcodeFields();
  watchDomScans();
  startInputPoll();

  ensureStatusBadge({
    variant: fieldCount > 0 ? 'listening' : 'waiting',
    text: fieldCount > 0 ? 'BP RX: ready — scan a barcode' : 'BP RX: waiting for barcode field…',
  });
  showToast('info', 'BP RX Sticker active', 'Scan a product — 1 scan = 1 label lookup');

  if (fieldObserver) fieldObserver.disconnect();
  fieldObserver = new MutationObserver(() => {
    if (!isActive) return;
    const count = scanForBarcodeFields(document);
    if (count > 0) {
      ensureStatusBadge({ variant: 'listening', text: 'BP RX: ready — scan a barcode' });
    }
  });
  fieldObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function deactivate() {
  isActive = false;
  stopInputPoll();
  fieldObserver?.disconnect();
  domObserver?.disconnect();
  fieldObserver = null;
  domObserver = null;
  BP_RX.log('Inactive (not on SSCC Scan In)', location.hash);
  ensureStatusBadge({ variant: 'idle', text: 'BP RX: inactive — open SSCC Scan In' }, true);
}

function syncRoute() {
  if (isTargetPage()) {
    activate();
  } else {
    deactivate();
  }
}

function boot() {
  sendScanFn = createSendScan();

  BP_RX.log('onescan.js booted', {
    hash: location.hash,
    target: isTargetPage(),
    runtime: BP_RX.hasRuntime(),
  });

  syncRoute();

  window.addEventListener('hashchange', () => {
    BP_RX.log('hashchange', location.hash);
    syncRoute();
  });

  if (routePollTimer) clearInterval(routePollTimer);
  routePollTimer = setInterval(syncRoute, 1000);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'BP_RX_PING') {
      sendResponse({
        ok: true,
        active: isActive,
        hash: location.hash,
        target: isTargetPage(),
        fields: document.querySelectorAll(BP_RX.BARCODE_SELECTOR).length,
        seenLabels: seenLabels.size,
        runtime: BP_RX.hasRuntime(),
      });
      return true;
    }

    if (message?.type === 'BP_RX_TEST_SCAN') {
      BP_RX.log('Test scan requested from popup');
      sendScanFn(message.raw || '307815770310', 'scan:test');
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
