function escapeZpl(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\^/g, '\\^')
    .replace(/~/g, '\\~');
}

function generateLabel(data) {
  const timestamp = new Date().toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const printWidth = data.printWidth || 448;
  const labelLength = data.labelLength || 582;

  const itemName =
    data.itemName.length > 32 ? `${data.itemName.substring(0, 29)}...` : data.itemName;

  const formattedNDC = data.ndc.includes('-')
    ? data.ndc
    : data.ndc.replace(/(\d{5})(\d{4})(\d{2})/, '$1-$2-$3');

  const upcLine = data.upc ? `\n^FO24,150^A0N,28,28^FDUPC: ${escapeZpl(data.upc)}^FS` : '';
  const lotLine = data.lot ? `\n^FO24,190^A0N,28,28^FDLot: ${escapeZpl(data.lot)}^FS` : '';

  return `^XA
^PW${printWidth}
^LL${labelLength}
^LH0,0
^CI28
^FO24,36^A0N,34,34^FD${escapeZpl(itemName)}^FS
^FO24,90^A0N,26,26^FDNDC: ${escapeZpl(formattedNDC)}^FS${upcLine}${lotLine}
^FO24,240^A0N,24,24^FDCost: $${escapeZpl(data.cost)}^FS
^FO24,280^A0N,24,24^FDRcvd: ${escapeZpl(data.dateReceived)}^FS
^FO24,320^A0N,24,24^FDFrom: ${escapeZpl(data.supplier)}^FS
^FO24,360^A0N,18,18^FDPrinted: ${escapeZpl(timestamp)}^FS
^XZ`;
}

function generateTestLabel(settings) {
  return `^XA
^PW${settings.printWidth || 448}
^LL${settings.labelLength || 582}
^LH0,0
^CI28
^FO24,40^A0N,36,36^FDBP RX Test Print^FS
^FO24,100^A0N,30,30^FDUPC: 300030894212^FS
^FO24,150^A0N,30,30^FDLot: TEST^FS
^FO24,220^A0N,26,26^FB400,3,0,C,0^FDExtension network print OK^FS
^XZ`;
}
