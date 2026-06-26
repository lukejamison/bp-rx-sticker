const DEFAULTS = {
  apiUrl: 'http://172.18.129.154:3000',
  hours: 24,
  mockPrint: true,
  enabled: true,
};

const apiUrlInput = document.getElementById('apiUrl');
const hoursInput = document.getElementById('hours');
const enabledInput = document.getElementById('enabled');
const mockPrintInput = document.getElementById('mockPrint');
const saveButton = document.getElementById('save');
const pingButton = document.getElementById('ping');
const testScanButton = document.getElementById('testScan');
const saveStatus = document.getElementById('saveStatus');
const connectionStatus = document.getElementById('connectionStatus');
const lastResultSection = document.getElementById('lastResult');
const lastResultBody = document.getElementById('lastResultBody');

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  apiUrlInput.value = settings.apiUrl;
  hoursInput.value = settings.hours;
  enabledInput.checked = settings.enabled;
  mockPrintInput.checked = settings.mockPrint;
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
  if (result.at) lines.push(`At: ${new Date(result.at).toLocaleString()}`);

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
  });

  saveStatus.textContent = 'Saved.';
  setTimeout(() => {
    saveStatus.textContent = '';
  }, 2000);
});

async function getOneScanTab() {
  const tabs = await chrome.tabs.query({ url: 'https://onescan.lspedia.com/*' });
  return tabs.find((tab) => tab.url?.includes('#/ssccScanIn')) || tabs[0] || null;
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

testScanButton.addEventListener('click', async () => {
  connectionStatus.textContent = 'Sending test lookup…';
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
    connectionStatus.textContent = 'Test sent — check OneScan tab for toast.';
  } catch {
    connectionStatus.textContent = 'Test failed — reload extension, refresh OneScan tab.';
  }
});

loadSettings();
loadLastResult();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.lastResult) {
    renderLastResult(changes.lastResult.newValue);
  }
});
