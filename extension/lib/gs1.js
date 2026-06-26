/**
 * Parse GS1 Data Matrix / barcode strings (DSCSA product identifiers).
 * Supports human-readable (01)... format, FNC1-separated, and plain codes.
 */

const FNC1 = String.fromCharCode(29);

const FIXED_LENGTH_AIS = {
  '01': 14,
  '17': 6,
};

function parseHumanReadable(raw) {
  const result = { raw, gtin: null, expiry: null, lot: null, serial: null, lookupCodes: [] };
  const re = /\((\d{2})\)([^(]*)/g;
  let match;

  while ((match = re.exec(raw)) !== null) {
    const ai = match[1];
    const value = match[2].trim();
    assignAi(result, ai, value);
  }

  result.lookupCodes = buildLookupCodes(result);
  return result;
}

function parseFnc1(raw) {
  const normalized = raw.replace(new RegExp(FNC1, 'g'), FNC1);
  return parseConcatenated(normalized.split(FNC1).join(''));
}

function parseConcatenated(raw) {
  const result = { raw, gtin: null, expiry: null, lot: null, serial: null, lookupCodes: [] };
  let i = 0;

  while (i < raw.length) {
    if (!/\d/.test(raw[i])) {
      i += 1;
      continue;
    }

    const ai = raw.slice(i, i + 2);
    i += 2;

    if (FIXED_LENGTH_AIS[ai]) {
      const len = FIXED_LENGTH_AIS[ai];
      const value = raw.slice(i, i + len);
      if (value.length < len) break;
      assignAi(result, ai, value);
      i += len;
      continue;
    }

    if (ai === '10' || ai === '21') {
      let value = '';
      while (i < raw.length) {
        const nextAi = raw.slice(i, i + 2);
        if (
          (nextAi === '01' || nextAi === '17' || nextAi === '10' || nextAi === '21') &&
          /^\d{2}$/.test(nextAi) &&
          value.length > 0
        ) {
          break;
        }
        value += raw[i];
        i += 1;
      }
      assignAi(result, ai, value);
      continue;
    }

    break;
  }

  result.lookupCodes = buildLookupCodes(result);
  return result;
}

function assignAi(result, ai, value) {
  if (!value) return;
  switch (ai) {
    case '01':
      result.gtin = value;
      break;
    case '17':
      result.expiry = value;
      break;
    case '10':
      result.lot = value;
      break;
    case '21':
      result.serial = value;
      break;
    default:
      break;
  }
}

/**
 * Convert GTIN-14 (e.g. 00307815770310) to 12-digit UPC (e.g. 307815770310).
 * Pioneer stores the last 12 digits — the leading "00" packaging prefix is dropped.
 */
function gtinToUpc12(gtin) {
  const digits = gtin.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 12) {
    return digits;
  }

  const gtin14 = digits.padStart(14, '0').slice(-14);
  return gtin14.slice(-12);
}

function gtinToLookupCandidates(gtin) {
  const ordered = [];
  const seen = new Set();

  const add = (code) => {
    if (!code || code.length < 8 || seen.has(code)) return;
    seen.add(code);
    ordered.push(code);
  };

  const digits = gtin.replace(/\D/g, '');
  if (!digits) return [];

  const gtin14 = digits.padStart(14, '0').slice(-14);
  const upc12 = gtinToUpc12(digits);

  // Try 12-digit UPC first — matches Pioneer invoice data
  add(upc12);
  add(gtin14);
  add(digits);
  add(gtin14.slice(1, 13));
  if (upc12) add(`0${upc12}`);

  return ordered;
}

function buildLookupCodes(parsed) {
  const ordered = [];
  const seen = new Set();

  const add = (code) => {
    if (!code || code.length < 8 || seen.has(code)) return;
    seen.add(code);
    ordered.push(code);
  };

  if (parsed.gtin) {
    gtinToLookupCandidates(parsed.gtin).forEach(add);
  }

  const stripped = parsed.raw.replace(/[^\d]/g, '');
  if (stripped.length >= 8 && stripped.length <= 14) {
    gtinToLookupCandidates(stripped).forEach(add);
  }

  if (/^\d{8,14}$/.test(parsed.raw.trim())) {
    add(parsed.raw.trim());
  }

  return ordered;
}

function parseGs1Barcode(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { raw: trimmed, gtin: null, expiry: null, lot: null, serial: null, lookupCodes: [] };
  }

  if (trimmed.includes('(')) {
    return parseHumanReadable(trimmed);
  }

  if (trimmed.includes(FNC1)) {
    return parseFnc1(trimmed);
  }

  if (/^01\d{14}/.test(trimmed)) {
    return parseConcatenated(trimmed);
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (/^\d{8,14}$/.test(digitsOnly)) {
    const parsed = parseConcatenated(`01${digitsOnly.padStart(14, '0').slice(-14)}`);
    parsed.lookupCodes = buildLookupCodes({ ...parsed, raw: trimmed });
    if (!parsed.lookupCodes.includes(digitsOnly)) {
      parsed.lookupCodes.unshift(digitsOnly);
    }
    return parsed;
  }

  return {
    raw: trimmed,
    gtin: null,
    expiry: null,
    lot: null,
    serial: null,
    lookupCodes: [trimmed],
  };
}

if (typeof self !== 'undefined') {
  self.parseGs1Barcode = parseGs1Barcode;
  self.gtinToUpc12 = gtinToUpc12;
  self.gtinToLookupCandidates = gtinToLookupCandidates;
}
