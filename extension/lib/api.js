const DEFAULT_API_URL = 'http://172.18.129.154:3000';
const DEFAULT_HOURS = 24;
const WEEKEND_HOURS = 72;

/** Sun/Mon: widen window so Fri/Sat invoices still match (e.g. Monday receiving). */
function getEffectiveHours(configuredHours) {
  const day = new Date().getDay();
  const base = configuredHours ?? DEFAULT_HOURS;
  if (day === 0 || day === 1) {
    return Math.max(base, WEEKEND_HOURS);
  }
  return base;
}

async function getSettings() {
  const stored = await chrome.storage.sync.get({
    apiUrl: DEFAULT_API_URL,
    hours: DEFAULT_HOURS,
    mockPrint: true,
    enabled: true,
  });
  return {
    ...stored,
    configuredHours: stored.hours,
    hours: getEffectiveHours(stored.hours),
  };
}

async function lookupBarcode(apiUrl, code, hours = DEFAULT_HOURS) {
  const url = `${apiUrl.replace(/\/$/, '')}/api/items/barcode/${encodeURIComponent(code)}/recent?hours=${hours}`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || data.message || `Lookup failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function lookupWithCandidates(codes, settings) {
  const tried = [];
  let lastError = null;

  for (const code of codes) {
    if (!code || tried.includes(code)) continue;
    tried.push(code);

    try {
      const result = await lookupBarcode(settings.apiUrl, code, settings.hours);
      return { result, matchedCode: code, tried };
    } catch (err) {
      lastError = err;
    }
  }

  const notFound = new Error(lastError?.message || 'Item not found on recent invoices');
  notFound.status = lastError?.status || 404;
  notFound.tried = tried;
  throw notFound;
}

if (typeof self !== 'undefined') {
  self.DEFAULT_API_URL = DEFAULT_API_URL;
  self.WEEKEND_HOURS = WEEKEND_HOURS;
  self.getEffectiveHours = getEffectiveHours;
  self.getSettings = getSettings;
  self.lookupBarcode = lookupBarcode;
  self.lookupWithCandidates = lookupWithCandidates;
}
