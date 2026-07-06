const DEFAULTS = {
  apiUrl: 'http://172.18.129.154:3000',
  hours: 168,
  mockPrint: true,
  enabled: true,
  printerIp: '172.18.129.132',
  printBridgeUrl: 'http://127.0.0.1:9101/print',
  printWidth: 203,
  labelLength: 203,
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
    hoursHint.textContent = `Today uses ${effective}h window (Sun/Mon auto-widen to at least 7 days).`;
  } else {
    hoursHint.textContent = `Lookup window: ${effective} hours.`;
  }
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  if (settings.hours === 24) {
    settings.hours = DEFAULTS.hours;
    await chrome.storage.sync.set({ hours: settings.hours });
  }
  if (settings.printWidth === 448 && settings.labelLength === 582) {
    settings.printWidth = DEFAULTS.printWidth;
    settings.labelLength = DEFAULTS.labelLength;
    await chrome.storage.sync.set({
      printWidth: settings.printWidth,
      labelLength: settings.labelLength,
    });
  }
  if (settings.labelLength === 102) {
    settings.labelLength = DEFAULTS.labelLength;
    await chrome.storage.sync.set({ labelLength: settings.labelLength });
  }
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
      const configuredIp = printerIpInput.value.trim();
      const bridgeIp = result.printerIp || '';
      if (bridgeIp && configuredIp && bridgeIp !== configuredIp) {
        printerIpInput.value = bridgeIp;
        await chrome.storage.sync.set({ printerIp: bridgeIp });
        bridgeStatus.textContent = `Printer IP synced to bridge: ${bridgeIp} (was ${configuredIp})`;
        return result;
      }
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
checkBridge(false);
