/**
 * Parse GS1 Data Matrix / barcode strings (DSCSA product identifiers).
 * Supports human-readable (01)... format, FNC1-separated, and plain codes.
 */

const FNC1 = String.fromCharCode(29);

const FIXED_LENGTH_AIS = {
  '01': 14,
  '17': 6,
};

// Per GS1 General Specifications, these variable-length AIs are
// self-terminating once they reach their maximum length — no FNC1
// separator is required in that case.
const VARIABLE_LENGTH_MAX_AIS = {
  '10': 20, // Batch/Lot number
  '21': 20, // Serial number
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
  // Keep the actual FNC1 separators in place — parseConcatenated() uses
  // them as the authoritative terminator for variable-length fields.
  // (Previously this stripped FNC1 and rejoined the string, which threw
  // away the exact boundary information the separator exists to provide.)
  return parseConcatenated(raw);
}

function parseConcatenated(raw) {
  const result = { raw, gtin: null, expiry: null, lot: null, serial: null, lookupCodes: [] };
  let i = 0;

  while (i < raw.length) {
    if (raw[i] === FNC1) {
      i += 1;
      continue;
    }

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

    if (VARIABLE_LENGTH_MAX_AIS[ai]) {
      // Terminate on an explicit FNC1 separator when present. Otherwise,
      // per GS1 General Specifications, a variable-length field that is
      // not immediately followed by FNC1 must be read up to its defined
      // maximum length (it's "self-terminating" at that point). We
      // deliberately do NOT guess a boundary by looking for something
      // that merely resembles another AI — real serial/lot values are
      // often numeric and can coincidentally contain digit pairs like
      // "01" or "21", which caused false early termination.
      const maxLen = VARIABLE_LENGTH_MAX_AIS[ai];
      let value = '';
      while (i < raw.length && value.length < maxLen) {
        if (raw[i] === FNC1) {
          i += 1;
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

/**
 * Extract the 10-digit "short" NDC from a 12-digit UPC-A code.
 * Pharma UPC-A codes are built as "3" + NDC10 + a standard UPC-A check
 * digit (this is the same check digit GTIN-14 ends up carrying, since the
 * "00" GTIN packaging prefix contributes nothing to the weighted checksum).
 * Returns null when the UPC doesn't carry the "3" NDC indicator digit.
 */
function upc12ToNdc10(upc12) {
  if (!upc12 || upc12.length !== 12 || upc12[0] !== '3') return null;
  return upc12.slice(1, 11);
}

/**
 * A bare 10-digit NDC is ambiguous — it can come from any of three
 * labeler-product-package segment formats (4-4-2, 5-3-2, or 5-4-1), and
 * each normalizes to a different 11-digit NDC depending on which segment
 * absorbs the padding zero. PioneerRx (and most pharmacy systems) store
 * the 11-digit form, so we generate all three candidates and let the
 * lookup try each — only one will actually match, but we don't know
 * which segment format a given labeler uses ahead of time.
 */
function ndc10To11Variants(ndc10) {
  if (!ndc10 || ndc10.length !== 10) return [];
  return [
    `0${ndc10}`, // 4-4-2 -> 5-4-2 (pad labeler segment)
    `${ndc10.slice(0, 5)}0${ndc10.slice(5)}`, // 5-3-2 -> 5-4-2 (pad product segment)
    `${ndc10.slice(0, 9)}0${ndc10.slice(9)}`, // 5-4-1 -> 5-4-2 (pad package segment)
  ];
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

  // Fall back to NDC-based matching. Pioneer's stored "UPC" field is
  // sometimes blank or carries a bad check digit (it's not always a real,
  // independently-verified UPC-A for Rx-only drugs), but the NDC field is
  // reliable — so once UPC candidates are exhausted, try the NDC derived
  // from the same GTIN in all three possible 11-digit paddings.
  const ndc10 = upc12ToNdc10(upc12);
  if (ndc10) {
    add(ndc10);
    ndc10To11Variants(ndc10).forEach(add);
  }

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
  self.upc12ToNdc10 = upc12ToNdc10;
  self.ndc10To11Variants = ndc10To11Variants;
  self.gtinToLookupCandidates = gtinToLookupCandidates;
}
