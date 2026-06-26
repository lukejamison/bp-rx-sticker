let browserPrintPromise = null;
let printerDevice = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-bp-rx-src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      if (existing.dataset.loaded === 'true') resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.dataset.bpRxSrc = src;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureBrowserPrint() {
  if (window.BrowserPrint && printerDevice) {
    return printerDevice;
  }

  if (!browserPrintPromise) {
    browserPrintPromise = (async () => {
      await loadScript(chrome.runtime.getURL('vendor/BrowserPrint-3.1.250.min.js'));
      await loadScript(chrome.runtime.getURL('vendor/BrowserPrint-Zebra-1.1.250.min.js'));

      if (!window.BrowserPrint) {
        throw new Error('Zebra Browser Print not available. Install Browser Print Desktop.');
      }

      const device = await new Promise((resolve, reject) => {
        window.BrowserPrint.getDefaultDevice(
          'printer',
          (defaultDevice) => {
            if (defaultDevice) {
              resolve(defaultDevice);
              return;
            }
            window.BrowserPrint.getLocalDevices(
              (devices) => {
                if (devices?.length) resolve(devices[0]);
                else reject(new Error('No Zebra printer found'));
              },
              reject
            );
          },
          reject
        );
      });

      printerDevice = device;
      return device;
    })();
  }

  return browserPrintPromise;
}

async function printOneLabel(zpl) {
  const device = await ensureBrowserPrint();

  await new Promise((resolve, reject) => {
    device.send(
      zpl,
      () => resolve(),
      (error) => reject(new Error(error?.message || 'Print failed'))
    );
  });

  BP_RX.log('Printed 1 label');
}
