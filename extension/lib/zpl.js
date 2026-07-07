(function (root) {
  /** 203 dpi — 1" x 1" RX price sticker */
  const LABEL_DPI = 203;
  const DEFAULT_PRINT_WIDTH = LABEL_DPI;
  const DEFAULT_LABEL_LENGTH = LABEL_DPI;

  const LABEL_HOME_Y = 8;
  const MARGIN_X = 6;

  function escapeZpl(text) {
    // Strip embedded newlines/tabs/control chars first -- a raw \n or \r inside
    // ^FD...^FS data (e.g. from a supplier name with stray whitespace in the
    // source data) breaks the ZPL command stream and can garble everything
    // printed after it, not just that one field.
    const cleaned = String(text ?? '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim();
    return cleaned
      .replace(/\\/g, '\\\\')
      .replace(/\^/g, '\\^')
      .replace(/~/g, '\\~');
  }

  /**
   * ZPL's ^FB with a single allowed line does NOT gracefully clip overflow --
   * when the text is wider than the box, the printer overlaps/crams glyphs
   * together instead of truncating, producing unreadable garbled text. So we
   * must never hand it text wider than the box; truncate (with an ellipsis)
   * *before* printing based on the font's approximate advance width.
   * Empirically verified against the actual Zebra font-0 renderer (Labelary):
   * a factor of ~0.58x the configured font width per character leaves a safe
   * margin (measured breaking point was ~0.53x-0.55x).
   */
  function maxCharsForWidth(boxWidthDots, fontWidthDots) {
    const avgCharWidth = fontWidthDots * 0.58;
    return Math.max(4, Math.floor(boxWidthDots / avgCharWidth));
  }

  function formatPrice(cost) {
    const num = Number.parseFloat(String(cost ?? '').replace(/[$,]/g, ''));
    if (Number.isNaN(num)) return '$0.00';
    return `$${num.toFixed(2)}`;
  }

  function abbrevText(text, maxLen) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return '';
    if (trimmed.length <= maxLen) return trimmed;
    return `${trimmed.substring(0, maxLen - 1)}…`;
  }

  function formatNdc(ndc) {
    const raw = String(ndc ?? '').trim();
    if (!raw) return '';
    if (raw.includes('-')) return raw;
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 11) return digits.replace(/(\d{5})(\d{4})(\d{2})/, '$1-$2-$3');
    return raw;
  }

  /** 11-digit NDC for Data Matrix (no dashes). */
  function ndcBarcodeDigits(ndc) {
    const digits = String(ndc ?? '').replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) return '';
    return digits.padStart(11, '0');
  }

  function formatCodeLine(ndc, upc) {
    const ndcFmt = formatNdc(ndc);
    if (ndcFmt) return `NDC ${ndcFmt}`;
    const upcDigits = String(upc ?? '').replace(/\D/g, '');
    if (upcDigits) return `UPC ${upcDigits}`;
    return '';
  }

  function formatUpcLine(upc) {
    const upcDigits = String(upc ?? '').replace(/\D/g, '');
    if (!upcDigits) return '';
    return `UPC ${upcDigits}`;
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const parsed = new Date(dateStr);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
    }
    return abbrevText(dateStr, 10);
  }

  /**
   * 1" x 1" (203 x 203 dots) — name, NDC, large price, supplier, rcvd/lot.
   */
  function generateLabel(data) {
    const printWidth = data.printWidth || DEFAULT_PRINT_WIDTH;
    const labelLength = data.labelLength || DEFAULT_LABEL_LENGTH;
    const homeY = data.labelHomeY ?? LABEL_HOME_Y;
    const contentWidth = printWidth - MARGIN_X * 2;

    const ndcDigits = ndcBarcodeDigits(data.ndc);
    const price = formatPrice(data.cost);

    const fontName = 18;
    const fontCode = 17;
    const fontCodeLabel = 15;
    const fontPrice = price.length <= 7 ? 38 : 32;
    const fontMed = 20;
    const fontMedWidth = 15;
    const fontSmall = 17;
    const fontSmallWidth = 13;
    const gap = 4;

    // Data Matrix geometry, computed up front so every text field can derive
    // its safe width from where the barcode *actually* lands instead of a
    // hardcoded guess. (Previously `dmReserved` was a fixed 62 dots that didn't
    // match the barcode's real position, so text boxes ran ~10 dots into the
    // barcode itself -- e.g. the supplier line printed directly on top of it.)
    const dmModule = 4;
    const dmSize = ndcDigits ? dmModule * 16 : 0;
    const dmX = printWidth - dmSize - 14;
    const dmY = labelLength - dmSize - 10;
    const dmGap = 8;
    const textWidth = ndcDigits ? Math.max(60, dmX - MARGIN_X - dmGap) : contentWidth;

    // ^FB fields must be truncated to fit textWidth *before* printing (see
    // maxCharsForWidth) -- ZPL overlaps glyphs on overflow rather than
    // clipping them, even across the 2 wrapped lines allowed for the name.
    const name = abbrevText(data.itemName, 2 * maxCharsForWidth(textWidth, fontName));
    const supplier = abbrevText(data.supplier, maxCharsForWidth(textWidth, fontMedWidth));
    const lotPrefix = 'Lot ';
    const rcvdPrefix = 'Rcvd ';
    const lotMaxChars = Math.max(4, maxCharsForWidth(textWidth, fontSmallWidth) - lotPrefix.length);
    const rcvdMaxChars = Math.max(4, maxCharsForWidth(textWidth, fontSmallWidth) - rcvdPrefix.length);
    const received = abbrevText(formatDateShort(data.dateReceived), rcvdMaxChars);
    const lot = data.lot ? abbrevText(String(data.lot).trim(), lotMaxChars) : '';
    const ndcFormatted = abbrevText(formatNdc(data.ndc), 14);
    const upcLine = abbrevText(formatUpcLine(data.upc), maxCharsForWidth(textWidth, fontCode));

    let y = homeY;

    let zpl = `^XA
^PW${printWidth}
^LL${labelLength}
^LH0,0
^LT0
^CI28
^FO${MARGIN_X},${y}^A0N,${fontName},${fontName}^FB${textWidth},2,${gap},L,0^FD${escapeZpl(name)}^FS`;

    y += fontName * 2 + gap + 2;
    if (ndcFormatted) {
      zpl += `\n^FO${MARGIN_X},${y}^A0N,${fontCodeLabel},${fontCodeLabel}^FDNDC^FS`;
      y += fontCodeLabel + 1;
      zpl += `\n^FO${MARGIN_X},${y}^A0N,${fontCode},${fontCode}^FD${escapeZpl(ndcFormatted)}^FS`;
      y += fontCode + gap;
    } else if (upcLine) {
      zpl += `\n^FO${MARGIN_X},${y}^A0N,${fontCode},${fontCode}^FB${textWidth},1,0,L,0^FD${escapeZpl(upcLine)}^FS`;
      y += fontCode + gap;
    }

    zpl += `\n^FO${MARGIN_X},${y}^A0N,${fontPrice},${fontPrice}^FD${escapeZpl(price)}^FS`;
    y += fontPrice + gap;

    if (supplier) {
      zpl += `\n^FO${MARGIN_X},${y}^A0N,${fontMed},${fontMedWidth}^FB${textWidth},1,0,L,0^FD${escapeZpl(supplier)}^FS`;
      y += fontMed + gap;
    }

    const footerGap = 2;
    const footerBottom = labelLength - 6;
    if (lot) {
      const lotY = footerBottom - fontSmall;
      zpl += `\n^FO${MARGIN_X},${lotY}^A0N,${fontSmall},${fontSmallWidth}^FB${textWidth},1,0,L,0^FD${lotPrefix}${escapeZpl(lot)}^FS`;
    }
    if (received) {
      const rcvdY = lot
        ? footerBottom - fontSmall * 2 - footerGap
        : footerBottom - fontSmall;
      zpl += `\n^FO${MARGIN_X},${rcvdY}^A0N,${fontSmall},${fontSmallWidth}^FB${textWidth},1,0,L,0^FD${rcvdPrefix}${escapeZpl(received)}^FS`;
    }

    if (ndcDigits) {
      zpl += `\n^FO${dmX},${dmY}^BXN,${dmModule},200^FD${ndcDigits}^FS`;
    }

    zpl += '\n^XZ';
    return zpl;
  }

  function generateTestLabel(settings) {
    const printWidth = settings?.printWidth || DEFAULT_PRINT_WIDTH;
    const labelLength = settings?.labelLength || DEFAULT_LABEL_LENGTH;

    return generateLabel({
      itemName: 'ELIQUIS 5MG NCNR',
      ndc: '30781577031',
      upc: '300030894212',
      cost: '4.52',
      supplier: 'CARDINAL HEALTH',
      dateReceived: '06/01/2026',
      lot: 'RF6342',
      printWidth,
      labelLength,
    });
  }

  /** Label count from API item (invoice qty, then received qty). */
  function resolveLabelCount(item) {
    const raw = item?.invoiceQty ?? item?.receivedQty ?? item?.invoiceQuantity ?? item?.receivedQuantity ?? '1';
    const n = Number.parseInt(String(raw).replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(n, 99);
  }

  function generateMultipleLabels(data, quantity) {
    const qty = Math.max(1, Math.min(Number(quantity) || 1, 99));
    const labels = [];
    for (let i = 0; i < qty; i++) {
      labels.push(generateLabel(data));
    }
    return labels.join('\n');
  }

  root.DEFAULT_PRINT_WIDTH = DEFAULT_PRINT_WIDTH;
  root.DEFAULT_LABEL_LENGTH = DEFAULT_LABEL_LENGTH;
  root.LABEL_HOME_Y = LABEL_HOME_Y;
  root.generateLabel = generateLabel;
  root.generateMultipleLabels = generateMultipleLabels;
  root.resolveLabelCount = resolveLabelCount;
  root.generateTestLabel = generateTestLabel;
})(typeof globalThis !== 'undefined' ? globalThis : self);
