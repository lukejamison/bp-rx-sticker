const DEFAULTS = {
  apiUrl: 'http://172.18.129.154:3000',
  hours: 24,
  mockPrint: true,
  enabled: true,
  printerIp: '172.18.129.132',
  printBridgeUrl: 'http://127.0.0.1:9101/print',
  printWidth: 448,
  labelLength: 582,
};

const apiUrlInput = document.getElementById('apiUrl');
const hoursInput = document.getElementById('hours');
const enabledInput = document.getElementById('enabled');
const mockPrintInput = document.getElementById('mockPrint');
const printerIpInput = document.getElementById('printerIp');
const printBridgeUrlInput = document.getElementById('printBridgeUrl');
const saveButton = document.getElementById('save');
const pingButton = document.getElementById('ping');
const testScanButton = document.getElementById('testScan');
const testApiButton = document.getElementById('testApi');
const testPrintButton = document.getElementById('testPrint');
const checkBridgeButton = document.getElementById('checkBridge');
const saveStatus = document.getElementById('saveStatus');
const connectionStatus = document.getElementById('connectionStatus');
const bridgeStatus = document.getElementById('bridgeStatus');
const hoursHint = document.getElementById('hoursHint');
const lastResultSection = document.getElementById('lastResult');
const lastResultBody = document.getElementById('lastResultBody');

function getEffectiveHours(configured) {
  const day = new Date().getDay();
  const base = Number(configured) || DEFAULTS.hours;
  if (day === 0 || day === 1) return Math.max(base, 72);
  return base;
}

function updateHoursHint() {
  const configured = Number(hoursInput.value) || DEFAULTS.hours;
  const effective = getEffectiveHours(configured);
  const day = new Date().getDay();
  if (day === 0 || day === 1) {
    hoursHint.textContent = `Today uses ${effective}h window (Sun/Mon auto-widen for Fri/Sat invoices).`;
  } else {
    hoursHint.textContent = `Lookup window: ${effective} hours.`;
  }
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  apiUrlInput.value = settings.apiUrl;
  hoursInput.value = settings.hours;
  enabledInput.checked = settings.enabled;
  mockPrintInput.checked = settings.mockPrint;
  printerIpInput.value = settings.printerIp || DEFAULTS.printerIp;
  printBridgeUrlInput.value = settings.printBridgeUrl || DEFAULTS.printBridgeUrl;
  updateHoursHint();
}

function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function renderLastResult(result) {
  if (!result) {
    lastResultSection.classList.add('hidden');
    return;
  }

  lastResultSection.classList.remove('hidden');

  let cardClass = 'error';
  let headline = result.message || 'Unknown';

  if (result.status === 'ready_to_print') {
    cardClass = 'success';
    headline = result.mockPrint ? 'Would print 1 label' : 'Printed 1 label';
  } else if (result.ok && result.status === 'already_completed') {
    cardClass = 'warn';
    headline = 'Already completed';
  }

  const lines = [];
  if (result.item?.itemName) lines.push(result.item.itemName);
  if (result.invoice?.invoiceNumber) lines.push(`Invoice ${result.invoice.invoiceNumber}`);
  if (result.matchedCode) lines.push(`Matched code: ${result.matchedCode}`);
  if (result.parsed?.lot) lines.push(`Lot: ${result.parsed.lot}`);
  if (result.parsed?.serial) lines.push(`Serial: ${result.parsed.serial}`);
  if (result.parsed?.gtin) lines.push(`GTIN: ${result.parsed.gtin}`);
  if (result.parsed?.upc) lines.push(`UPC: ${result.parsed.upc}`);
  if (result.timing) {
    if (result.timing.apiMs != null) lines.push(`API: ${formatDuration(result.timing.apiMs)}`);
    if (result.timing.printMs > 0) lines.push(`Print: ${formatDuration(result.timing.printMs)}`);
    if (result.timing.totalMs != null) lines.push(`Total: ${formatDuration(result.timing.totalMs)}`);
  }
  if (result.at) {
    const age = Date.now() - new Date(result.at).getTime();
    const ageLabel =
      age < 60000 ? 'Just now' : age < 3600000 ? `${Math.round(age / 60000)}m ago` : `${Math.round(age / 3600000)}h ago`;
    lines.push(`At: ${new Date(result.at).toLocaleString()} (${ageLabel})`);
  }

  lastResultBody.innerHTML = `
    <div class="result-card ${cardClass}">
      <strong>${headline}</strong>
      ${lines.length ? `<div class="meta">${lines.join('<br>')}</div>` : ''}
    </div>
  `;
}

async function loadLastResult() {
  const { lastResult } = await chrome.storage.local.get('lastResult');
  renderLastResult(lastResult);
}

saveButton.addEventListener('click', async () => {
  await chrome.storage.sync.set({
    apiUrl: apiUrlInput.value.trim() || DEFAULTS.apiUrl,
    hours: Number(hoursInput.value) || DEFAULTS.hours,
    enabled: enabledInput.checked,
    mockPrint: mockPrintInput.checked,
    printerIp: printerIpInput.value.trim() || DEFAULTS.printerIp,
    printBridgeUrl: printBridgeUrlInput.value.trim() || DEFAULTS.printBridgeUrl,
  });

  saveStatus.textContent = 'Saved.';
  updateHoursHint();
  checkBridge(false);
  setTimeout(() => {
    saveStatus.textContent = '';
  }, 2000);
});

async function getOneScanTab() {
  const tabs = await chrome.tabs.query({ url: 'https://onescan.lspedia.com/*' });
  return tabs.find((tab) => tab.url?.includes('#/ssccScanIn')) || tabs[0] || null;
}

async function checkBridge(showOk = true) {
  if (!mockPrintInput.checked) {
    bridgeStatus.textContent = 'Checking print bridge…';
  } else if (!showOk) {
    bridgeStatus.textContent = '';
    return null;
  } else {
    bridgeStatus.textContent = 'Mock print ON — bridge not required.';
    return null;
  }

  try {
    const result = await chrome.runtime.sendMessage({ type: 'BRIDGE_HEALTH' });
    if (result?.ok) {
      bridgeStatus.textContent = showOk
        ? `Print bridge OK → ${result.printerIp || 'printer'}:${result.printerPort || 9100}`
        : '';
    } else {
      bridgeStatus.textContent =
        result?.error ||
        'Print bridge not running — run install-windows.bat or node extension/print-bridge/server.js';
    }
    return result;
  } catch (err) {
    bridgeStatus.textContent = `Bridge check failed — ${err.message}`;
    return null;
  }
}

pingButton.addEventListener('click', async () => {
  connectionStatus.textContent = 'Checking…';
  const tab = await getOneScanTab();

  if (!tab?.id) {
    connectionStatus.textContent = 'Open OneScan SSCC Scan In in a tab first.';
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'BP_RX_PING' });
    connectionStatus.textContent = response?.active
      ? `Connected — listening (${response.fields} barcode field(s))`
      : `Tab open on ${response?.hash || 'unknown'} — navigate to #/ssccScanIn`;
  } catch {
    connectionStatus.textContent = 'No response — reload extension, refresh OneScan tab.';
  }
});

checkBridgeButton.addEventListener('click', () => checkBridge(true));

testScanButton.addEventListener('click', async () => {
  connectionStatus.textContent = 'Sending test to OneScan tab…';
  const tab = await getOneScanTab();

  if (!tab?.id) {
    connectionStatus.textContent = 'Open OneScan SSCC Scan In in a tab first.';
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'BP_RX_TEST_SCAN',
      raw: '307815770310',
    });
    connectionStatus.textContent = 'Test sent — check OneScan tab for toast + console.';
    setTimeout(loadLastResult, 1500);
  } catch {
    connectionStatus.textContent = 'Tab test failed — try "Test API directly" below.';
  }
});

testApiButton.addEventListener('click', async () => {
  connectionStatus.textContent = 'Calling API directly…';
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'BP_RX_TEST_API',
      raw: '307815770310',
    });
    if (result?.ok || result?.status) {
      const t = result.timing?.totalMs != null ? ` in ${formatDuration(result.timing.totalMs)}` : '';
      connectionStatus.textContent = result.ok
        ? `API OK${t} — ${result.mockPrint ? 'would print' : 'ready to print'}`
        : `API responded${t} — ${result.message || result.status}`;
    } else {
      connectionStatus.textContent = result?.message || 'API test failed';
    }
    loadLastResult();
  } catch (err) {
    connectionStatus.textContent = `API error — ${err.message || 'check API URL & network'}`;
  }
});

testPrintButton.addEventListener('click', async () => {
  connectionStatus.textContent = 'Sending test label to printer…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'PRINT_TEST' });
    if (result?.ok) {
      connectionStatus.textContent = `Test label sent to ${result.printerIp || 'printer'}`;
    } else {
      connectionStatus.textContent = result?.error || 'Print test failed';
    }
  } catch (err) {
    connectionStatus.textContent = `Print error — ${err.message}. Is print bridge running?`;
  }
});

mockPrintInput.addEventListener('change', () => checkBridge(false));

hoursInput.addEventListener('input', updateHoursHint);

loadSettings();
loadLastResult();
checkBridge(false);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.lastResult) {
    renderLastResult(changes.lastResult.newValue);
  }
});
