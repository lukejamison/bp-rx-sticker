(function (root) {
  /** 203 dpi — 1" × 0.5" RX price sticker */
  const LABEL_DPI = 203;
  const DEFAULT_PRINT_WIDTH = LABEL_DPI; // 1"
  const DEFAULT_LABEL_LENGTH = Math.round(LABEL_DPI / 2); // 0.5" = 102 dots

  /** Shift content down — avoids top edge / gap cutoff on small media */
  const LABEL_HOME_Y = 14;
  const MARGIN_X = 6;

  function escapeZpl(text) {
    return String(text ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/\^/g, '\\^')
      .replace(/~/g, '\\~');
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

  function formatCodeLine(ndc, upc) {
    const ndcFmt = formatNdc(ndc);
    if (ndcFmt) return `NDC ${ndcFmt}`;
    const upcDigits = String(upc ?? '').replace(/\D/g, '');
    if (upcDigits) return `UPC ${upcDigits}`;
    return '';
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
   * 1" × 0.5" — name, NDC/UPC, cost, supplier, date received, lot (optional).
   * Top-down layout with ^LH Y offset for small-label printers.
   */
  function generateLabel(data) {
    const printWidth = data.printWidth || DEFAULT_PRINT_WIDTH;
    const labelLength = data.labelLength || DEFAULT_LABEL_LENGTH;
    const homeY = data.labelHomeY ?? LABEL_HOME_Y;
    const contentWidth = printWidth - MARGIN_X * 2;

    const name = abbrevText(data.itemName, 22);
    const codeLine = abbrevText(formatCodeLine(data.ndc, data.upc), 24);
    const price = formatPrice(data.cost);
    const supplier = abbrevText(data.supplier, 14);
    const received = formatDateShort(data.dateReceived);
    const lot = data.lot ? abbrevText(String(data.lot).trim(), 12) : '';

    // Fixed rows (dots from label home) — tuned for 102-dot label length
    const yName = homeY;
    const yCode = homeY + 12;
    const yCost = homeY + 24;
    const ySupplier = homeY + 44;
    const yFooter = homeY + 56;

    const priceHeight = price.length <= 7 ? 18 : 15;

    let zpl = `^XA
^PW${printWidth}
^LL${labelLength}
^LH0,0
^LT0
^CI28
^FO${MARGIN_X},${yName}^A0N,11,11^FB${contentWidth},1,0,L,0^FD${escapeZpl(name)}^FS`;

    if (codeLine) {
      zpl += `\n^FO${MARGIN_X},${yCode}^A0N,9,9^FB${contentWidth},1,0,L,0^FD${escapeZpl(codeLine)}^FS`;
    }

    zpl += `\n^FO${MARGIN_X},${yCost}^A0N,${priceHeight},${priceHeight}^FD${escapeZpl(price)}^FS`;

    if (supplier) {
      zpl += `\n^FO${MARGIN_X},${ySupplier}^A0N,9,9^FD${escapeZpl(supplier)}^FS`;
    }

    if (received) {
      const dateX = lot ? MARGIN_X : MARGIN_X;
      zpl += `\n^FO${dateX},${yFooter}^A0N,9,9^FDRcvd ${escapeZpl(received)}^FS`;
    }

    if (lot) {
      zpl += `\n^FO${Math.round(printWidth * 0.45)},${yFooter}^A0N,9,9^FDLot ${escapeZpl(lot)}^FS`;
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

  root.DEFAULT_PRINT_WIDTH = DEFAULT_PRINT_WIDTH;
  root.DEFAULT_LABEL_LENGTH = DEFAULT_LABEL_LENGTH;
  root.LABEL_HOME_Y = LABEL_HOME_Y;
  root.generateLabel = generateLabel;
  root.generateTestLabel = generateTestLabel;
})(typeof globalThis !== 'undefined' ? globalThis : self);
