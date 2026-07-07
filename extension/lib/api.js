const DEFAULT_API_URL = 'http://172.18.129.154:3000';
/** 7 days — receiving backlog often spans the week (not just same-day invoices). */
const DEFAULT_HOURS = 168;
const WEEKEND_HOURS = 168;

/** Sun/Mon: ensure at least a full week for Fri–Mon receiving gaps. */
function getEffectiveHours(configuredHours) {
  const day = new Date().getDay();
  const base = configuredHours ?? DEFAULT_HOURS;
  if (day === 0 || day === 1) {
    return Math.max(base, WEEKEND_HOURS);
  }
  return base;
}

function ndcLookupVariants(code) {
  const digits = String(code ?? '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) return [];

  const variants = new Set();
  variants.add(digits.padStart(11, '0'));
  variants.add(digits);
  const unpadded = digits.replace(/^0+/, '');
  if (unpadded) variants.add(unpadded);
  return [...variants];
}

function expandLookupCodes(codes) {
  const ordered = [];
  const seen = new Set();

  const add = (code) => {
    const value = String(code ?? '').trim();
    if (!value || value.length < 8 || seen.has(value)) return;
    seen.add(value);
    ordered.push(value);
  };

  for (const code of codes) {
    add(code);
    ndcLookupVariants(code).forEach(add);
  }

  return ordered;
}

async function getSettings() {
  const stored = await chrome.storage.sync.get({
    apiUrl: DEFAULT_API_URL,
    hours: DEFAULT_HOURS,
    mockPrint: true,
    enabled: true,
  });
  if (stored.hours === 24) {
    stored.hours = DEFAULT_HOURS;
    await chrome.storage.sync.set({ hours: DEFAULT_HOURS });
  }
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

  for (const code of expandLookupCodes(codes)) {
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

/**
 * Marks an invoice line item as completed after a real (non-mock) print, so
 * later scans of the *same* NDC/UPC on the *same* invoice (e.g. re-scanning
 * additional serialized units of a multi-quantity line) are recognized as
 * already handled instead of re-printing the full invoiceQty again.
 * Mirrors the PWA's `markCompleted` call against the same `/api/completed`
 * endpoint/table, so completion is shared across both clients.
 */
async function markCompleted(apiUrl, data) {
  const url = `${apiUrl.replace(/\/$/, '')}/api/completed`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(body.error || body.message || `Mark completed failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return body;
}

if (typeof self !== 'undefined') {
  self.DEFAULT_API_URL = DEFAULT_API_URL;
  self.WEEKEND_HOURS = WEEKEND_HOURS;
  self.getEffectiveHours = getEffectiveHours;
  self.expandLookupCodes = expandLookupCodes;
  self.getSettings = getSettings;
  self.lookupBarcode = lookupBarcode;
  self.lookupWithCandidates = lookupWithCandidates;
  self.markCompleted = markCompleted;
}
