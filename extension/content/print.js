async function printLabels(zpl, labelCount = 1) {
  const result = await chrome.runtime.sendMessage({ type: 'PRINT_ZPL', zpl, labelCount });

  if (result?.ok) {
    BP_RX.log('Printed via network', { ...result, labelCount });
    return;
  }

  throw new Error(result?.error || 'Print bridge failed — is the print bridge running?');
}

/** @deprecated use printLabels */
async function printOneLabel(zpl) {
  return printLabels(zpl, 1);
}
