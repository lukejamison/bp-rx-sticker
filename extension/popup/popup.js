const lastResultSection = document.getElementById('lastResult');
const lastResultBody = document.getElementById('lastResultBody');
const enabledInput = document.getElementById('enabled');
const reprintButton = document.getElementById('reprint');
const openSettingsButton = document.getElementById('openSettings');
const bridgeStatus = document.getElementById('bridgeStatus');
const actionStatus = document.getElementById('actionStatus');

let currentLastResult = null;

function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function canReprint(result) {
  return Boolean(result?.item?.itemName && (result.ok || result.status === 'already_completed'));
}

function renderLastResult(result) {
  currentLastResult = result;

  if (!result) {
    lastResultSection.classList.add('hidden');
    return;
  }

  lastResultSection.classList.remove('hidden');
  reprintButton.disabled = !canReprint(result);

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
  if (result.item?.cost) lines.push(`Cost: $${result.item.cost}`);
  if (result.invoice?.invoiceNumber) lines.push(`Invoice ${result.invoice.invoiceNumber}`);
  if (result.parsed?.lot) lines.push(`Lot: ${result.parsed.lot}`);
  if (result.timing?.totalMs != null) lines.push(`Total: ${formatDuration(result.timing.totalMs)}`);
  if (result.at) {
    const age = Date.now() - new Date(result.at).getTime();
    const ageLabel =
      age < 60000 ? 'Just now' : age < 3600000 ? `${Math.round(age / 60000)}m ago` : `${Math.round(age / 3600000)}h ago`;
    lines.push(`${ageLabel}`);
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

async function loadEnabled() {
  const { enabled = true, mockPrint = true } = await chrome.storage.sync.get({
    enabled: true,
    mockPrint: true,
  });
  enabledInput.checked = enabled;

  if (mockPrint) {
    bridgeStatus.textContent = 'Mock print ON';
    return;
  }

  try {
    const result = await chrome.runtime.sendMessage({ type: 'BRIDGE_HEALTH' });
    bridgeStatus.textContent = result?.ok
      ? `Bridge OK · ${result.printerIp || 'printer'}`
      : 'Bridge offline — check Settings';
  } catch {
    bridgeStatus.textContent = 'Bridge check failed';
  }
}

enabledInput.addEventListener('change', async () => {
  await chrome.storage.sync.set({ enabled: enabledInput.checked });
  actionStatus.textContent = enabledInput.checked ? 'Listening enabled.' : 'Listening paused.';
  setTimeout(() => {
    actionStatus.textContent = '';
  }, 1500);
});

reprintButton.addEventListener('click', async () => {
  if (!canReprint(currentLastResult)) return;

  reprintButton.disabled = true;
  actionStatus.textContent = 'Sending reprint…';

  try {
    const result = await chrome.runtime.sendMessage({ type: 'REPRINT_LAST', force: true });
    if (result?.ok) {
      actionStatus.textContent = `Reprinted — ${result.itemName || 'label sent'}`;
    } else {
      actionStatus.textContent = result?.error || 'Reprint failed';
    }
  } catch (err) {
    actionStatus.textContent = `Reprint error — ${err.message}`;
  } finally {
    reprintButton.disabled = !canReprint(currentLastResult);
  }
});

openSettingsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

loadLastResult();
loadEnabled();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.lastResult) {
    renderLastResult(changes.lastResult.newValue);
  }
  if (area === 'sync' && (changes.enabled || changes.mockPrint)) {
    loadEnabled();
  }
});
