function generateLabel(data) {
  const timestamp = new Date().toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const itemName =
    data.itemName.length > 25 ? `${data.itemName.substring(0, 22)}...` : data.itemName;

  const formattedNDC = data.ndc.includes('-')
    ? data.ndc
    : data.ndc.replace(/(\d{5})(\d{4})(\d{2})/, '$1-$2-$3');

  return `^XA
^FO20,15^A0N,23,23^FD${itemName}^FS
^FO20,45^A0N,18,18^FDNDC: ${formattedNDC}^FS
^FO20,70^A0N,18,18^FDCost: $${data.cost}^FS
^FO20,95^A0N,18,18^FDRcvd: ${data.dateReceived}^FS
^FO20,120^A0N,18,18^FDFrom: ${data.supplier}^FS
^FO20,145^A0N,14,14^FDPrinted: ${timestamp}^FS
^XZ`;
}
