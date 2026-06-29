const DEFAULT_PRINTER_IP = '172.18.129.132';
const DEFAULT_PRINT_BRIDGE_URL = 'http://127.0.0.1:9101/print';
const DEFAULT_PRINT_WIDTH = 448;
const DEFAULT_LABEL_LENGTH = 582;

async function getPrintSettings() {
  return chrome.storage.sync.get({
    printerIp: DEFAULT_PRINTER_IP,
    printBridgeUrl: DEFAULT_PRINT_BRIDGE_URL,
    printWidth: DEFAULT_PRINT_WIDTH,
    labelLength: DEFAULT_LABEL_LENGTH,
    printMethod: 'network',
  });
}

function bridgeHealthUrl(settings) {
  const url = (settings?.printBridgeUrl || DEFAULT_PRINT_BRIDGE_URL).replace(/\/$/, '');
  return url.endsWith('/print') ? url.replace(/\/print$/, '/health') : `${url}/health`;
}

async function checkPrintBridgeHealth(settings) {
  const healthUrl = bridgeHealthUrl(settings);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(healthUrl, { signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      return { ok: false, error: data.error || `Bridge unhealthy (${response.status})`, healthUrl };
    }
    return { ok: true, healthUrl, ...data };
  } catch (err) {
    return {
      ok: false,
      error: err.name === 'AbortError' ? 'Bridge not responding (timeout)' : err.message,
      healthUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function printZplViaBridge(zpl, settings) {
  const url = (settings.printBridgeUrl || DEFAULT_PRINT_BRIDGE_URL).replace(/\/$/, '');
  const printUrl = url.endsWith('/print') ? url : `${url}/print`;

  const response = await fetch(printUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'X-Printer-IP': settings.printerIp || DEFAULT_PRINTER_IP,
    },
    body: zpl,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Print bridge failed (${response.status})`);
  }

  return data;
}

if (typeof self !== 'undefined') {
  self.DEFAULT_PRINTER_IP = DEFAULT_PRINTER_IP;
  self.DEFAULT_PRINT_BRIDGE_URL = DEFAULT_PRINT_BRIDGE_URL;
  self.getPrintSettings = getPrintSettings;
  self.checkPrintBridgeHealth = checkPrintBridgeHealth;
  self.printZplViaBridge = printZplViaBridge;
}
