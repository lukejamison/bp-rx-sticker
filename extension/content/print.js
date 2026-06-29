async function printOneLabel(zpl) {
  const result = await chrome.runtime.sendMessage({ type: 'PRINT_ZPL', zpl });

  if (result?.ok) {
    BP_RX.log('Printed via network', result);
    return;
  }

  throw new Error(result?.error || 'Print failed — is the print bridge running?');
}
