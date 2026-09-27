(function (root) {
  /** 203 dpi — 1" x 1" RX price sticker */
  const LABEL_DPI = 203;
  const DEFAULT_PRINT_WIDTH = LABEL_DPI;
  const DEFAULT_LABEL_LENGTH = LABEL_DPI;

  const LABEL_HOME_Y = 4;

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
    if (maxLen <= 3) return trimmed.substring(0, maxLen);
    // ASCII ellipsis — font 0 does not reliably draw "…", and a wide glyph
    // there is what makes the last characters collide.
    return `${trimmed.substring(0, maxLen - 3)}...`;
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
   * 1" x 1" (203 x 203 dots).
   *
   * The Data Matrix sits in the bottom-right. Everything above it uses the
   * full label width, so the drug name is not squeezed down to ~20 characters.
   * Received/lot (and supplier, if the name is very tall) stay in the column
   * to the left of the barcode. Positions are computed once and reused by the
   * HTML preview so what you see is what the printer is asked to draw.
   */
  function layoutLabel(data) {
    const printWidth = data.printWidth || DEFAULT_PRINT_WIDTH;
    const labelLength = data.labelLength || DEFAULT_LABEL_LENGTH;
    const margin = 4;
    const contentWidth = printWidth - margin * 2;

    const ndcDigits = ndcBarcodeDigits(data.ndc);
    const dmModule = 4;
    const dmSize = ndcDigits ? dmModule * 16 : 0;
    const dmX = ndcDigits ? printWidth - dmSize - margin : 0;
    const dmY = ndcDigits ? labelLength - dmSize - margin : 0;
    const dmGap = 4;
    const bandTop = ndcDigits ? dmY : labelLength - margin;
    const sideWidth = ndcDigits ? Math.max(60, dmX - margin - dmGap) : contentWidth;

    const fields = [];

    const rawName = String(data.itemName || '').trim();
    const wideChars = maxCharsForWidth(contentWidth, 16);
    const nameFont = rawName.length > wideChars ? 14 : 16;
    const nameChars = maxCharsForWidth(contentWidth, nameFont);
    const nameLines = rawName.length > nameChars ? 2 : 1;
    const name = abbrevText(rawName, nameLines * nameChars) || 'ITEM';
    const nameHeight = nameFont * nameLines + (nameLines > 1 ? 1 : 0);
    let y = margin;
    fields.push({
      role: 'name',
      x: margin,
      y,
      w: contentWidth,
      h: nameHeight,
      fontH: nameFont,
      fontW: nameFont,
      lines: nameLines,
      text: name,
    });
    y += nameHeight + 3;

    const codeFont = 13;
    const ndcFormatted = formatNdc(data.ndc);
    const codeLine = ndcFormatted ? `NDC ${ndcFormatted}` : formatUpcLine(data.upc);
    if (codeLine && y + codeFont <= bandTop - 2) {
      fields.push({
        role: 'code',
        x: margin,
        y,
        w: contentWidth,
        h: codeFont,
        fontH: codeFont,
        fontW: codeFont,
        lines: 1,
        text: abbrevText(codeLine, maxCharsForWidth(contentWidth, codeFont)),
      });
      y += codeFont + 2;
    }

    const metaFont = 13;
    const metaLines = [];
    const received = formatDateShort(data.dateReceived);
    if (received) metaLines.push({ role: 'received', text: `Rcvd ${received}` });
    if (data.lot) metaLines.push({ role: 'lot', text: `Lot ${String(data.lot).trim()}` });

    const metaBlock = metaLines.length * (metaFont + 1);

    function sideMetaFields() {
      const placed = [];
      let metaBottom = labelLength - margin;
      for (let i = metaLines.length - 1; i >= 0; i--) {
        metaBottom -= metaFont;
        placed.push({
          role: metaLines[i].role,
          x: margin,
          y: metaBottom,
          w: sideWidth,
          h: metaFont,
          fontH: metaFont,
          fontW: metaFont,
          lines: 1,
          text: abbrevText(metaLines[i].text, maxCharsForWidth(sideWidth, metaFont)),
        });
        metaBottom -= 1;
      }
      return placed;
    }

    const supplierFont = 14;
    const itemFont = 12;
    const supplierRaw = String(data.supplier || '').trim();
    const itemRaw = String(data.supplierItemNumber || '').trim();
    const supplierRows = [];
    if (supplierRaw) supplierRows.push({ role: 'supplier', font: supplierFont, text: supplierRaw });
    if (itemRaw) supplierRows.push({ role: 'supplierItem', font: itemFont, text: itemRaw });
    const supplierHeight = supplierRows.reduce((sum, row) => sum + row.font + 2, 0);

    const priceTop = y;
    const price = formatPrice(data.cost);
    const desiredPrice = price.length >= 8 ? 26 : 32;
    let keepMetaAbove = metaLines.length > 0;
    let priceRoom = bandTop - priceTop - supplierHeight - (keepMetaAbove ? metaBlock : 0) - 2;
    let priceFont = Math.min(desiredPrice, priceRoom);
    if (priceFont < 22 && keepMetaAbove) {
      keepMetaAbove = false;
      priceRoom = bandTop - priceTop - supplierHeight - 2;
      priceFont = Math.min(desiredPrice, priceRoom);
    }
    const priceFits = priceFont >= 20;

    if (priceFits) {
      fields.push({
        role: 'price',
        x: margin,
        y: priceTop,
        w: contentWidth,
        h: priceFont,
        fontH: priceFont,
        fontW: priceFont,
        lines: 1,
        text: price,
      });
      y = priceTop + priceFont + 3;
    }

    const supplierFitsAbove = supplierRows.length > 0 && y + supplierHeight <= bandTop;
    if (supplierFitsAbove) {
      for (const row of supplierRows) {
        fields.push({
          role: row.role,
          x: margin,
          y,
          w: contentWidth,
          h: row.font,
          fontH: row.font,
          fontW: row.font,
          lines: 1,
          text: abbrevText(row.text, maxCharsForWidth(contentWidth, row.font)),
        });
        y += row.font + 2;
      }
    } else if (supplierRows.length && ndcDigits) {
      const sideMeta = sideMetaFields();
      const metaTop = sideMeta.length
        ? Math.min(...sideMeta.map((field) => field.y))
        : labelLength - margin;
      let sideY = metaTop - 2;
      for (let i = supplierRows.length - 1; i >= 0; i--) {
        sideY -= supplierRows[i].font;
        if (sideY < bandTop) break;
        fields.push({
          role: supplierRows[i].role,
          x: margin,
          y: sideY,
          w: sideWidth,
          h: supplierRows[i].font,
          fontH: supplierRows[i].font,
          fontW: supplierRows[i].font,
          lines: 1,
          text: abbrevText(supplierRows[i].text, maxCharsForWidth(sideWidth, supplierRows[i].font)),
        });
        sideY -= 1;
      }
    } else if (supplierRows.length) {
      for (const row of supplierRows) {
        if (y + row.font > labelLength - margin) break;
        fields.push({
          role: row.role,
          x: margin,
          y,
          w: contentWidth,
          h: row.font,
          fontH: row.font,
          fontW: row.font,
          lines: 1,
          text: abbrevText(row.text, maxCharsForWidth(contentWidth, row.font)),
        });
        y += row.font + 2;
      }
    }

    if (keepMetaAbove) {
      for (const line of metaLines) {
        if (y + metaFont > bandTop) break;
        fields.push({
          role: line.role,
          x: margin,
          y,
          w: contentWidth,
          h: metaFont,
          fontH: metaFont,
          fontW: metaFont,
          lines: 1,
          text: abbrevText(line.text, maxCharsForWidth(contentWidth, metaFont)),
        });
        y += metaFont + 1;
      }
    } else if (ndcDigits) {
      fields.push(...sideMetaFields());
    } else if (metaLines.length) {
      let metaY = labelLength - margin - metaFont;
      for (let i = metaLines.length - 1; i >= 0; i--) {
        if (metaY < y) break;
        fields.push({
          role: metaLines[i].role,
          x: margin,
          y: metaY,
          w: contentWidth,
          h: metaFont,
          fontH: metaFont,
          fontW: metaFont,
          lines: 1,
          text: abbrevText(metaLines[i].text, maxCharsForWidth(contentWidth, metaFont)),
        });
        metaY -= metaFont + 1;
      }
    }

    const dm = ndcDigits
      ? { role: 'barcode', x: dmX, y: dmY, w: dmSize, h: dmSize, module: dmModule, text: ndcDigits }
      : null;

    return { printWidth, labelLength, fields, dm };
  }

  function generateLabel(data) {
    const layout = layoutLabel(data);
    let zpl = `^XA
^PW${layout.printWidth}
^LL${layout.labelLength}
^LH0,0
^LT0
^CI28`;

    for (const field of layout.fields) {
      const wrap = field.lines > 1 ? `^FB${field.w},${field.lines},1,L,0` : '';
      zpl += `\n^FO${field.x},${field.y}^A0N,${field.fontH},${field.fontW}${wrap}^FD${escapeZpl(field.text)}^FS`;
    }

    if (layout.dm) {
      zpl += `\n^FO${layout.dm.x},${layout.dm.y}^BXN,${layout.dm.module},200^FD${layout.dm.text}^FS`;
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
      supplierItemNumber: '019174',
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
  root.layoutLabel = layoutLabel;
  root.generateLabel = generateLabel;
  root.generateMultipleLabels = generateMultipleLabels;
  root.resolveLabelCount = resolveLabelCount;
  root.generateTestLabel = generateTestLabel;
})(typeof globalThis !== 'undefined' ? globalThis : self);
