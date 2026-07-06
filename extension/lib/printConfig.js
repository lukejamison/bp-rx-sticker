const DEFAULT_PRINTER_IP = '172.18.129.132';
const DEFAULT_PRINT_BRIDGE_URL = 'http://127.0.0.1:9101/print';
/** 1" x 1" @ 203 dpi */
const DEFAULT_PRINT_WIDTH = 203;
const DEFAULT_LABEL_LENGTH = 203;

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
  const timeoutMs = Math.min(180000, 90000 + zpl.length * 4);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(printUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'X-Printer-IP': settings.printerIp || DEFAULT_PRINTER_IP,
      },
      body: zpl,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `Print bridge failed (${response.status})`);
    }

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Print bridge timed out after ${Math.round(timeoutMs / 1000)}s (not the invoice API)`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

if (typeof self !== 'undefined') {
  self.DEFAULT_PRINTER_IP = DEFAULT_PRINTER_IP;
  self.DEFAULT_PRINT_BRIDGE_URL = DEFAULT_PRINT_BRIDGE_URL;
  self.getPrintSettings = getPrintSettings;
  self.checkPrintBridgeHealth = checkPrintBridgeHealth;
  self.printZplViaBridge = printZplViaBridge;
}
