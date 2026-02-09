'use client';

import { useEffect, useState } from 'react';

export function ZebraDiagnostics() {
  const [diagnostics, setDiagnostics] = useState({
    browserPrintLoaded: false,
    browserPrintVersion: '',
    devices: [] as any[],
    error: '',
  });

  const runDiagnostics = async () => {
    const results: any = {
      browserPrintLoaded: false,
      browserPrintVersion: '',
      devices: [],
      error: '',
    };

    try {
      // Check if BrowserPrint is loaded
      if (typeof window !== 'undefined' && window.BrowserPrint) {
        results.browserPrintLoaded = true;

        // Try to get version
        try {
          results.browserPrintVersion = window.BrowserPrint.version || 'Unknown';
        } catch (e) {
          results.browserPrintVersion = 'Unable to detect';
        }

        // Try to get devices
        try {
          const devices = await new Promise<any[]>((resolve) => {
            window.BrowserPrint.getLocalDevices(
              (deviceList: any[]) => resolve(deviceList || []),
              () => resolve([])
            );
          });
          results.devices = devices;
        } catch (e: any) {
          results.error = e.message;
        }
      } else {
        results.error = 'BrowserPrint SDK not loaded';
      }
    } catch (e: any) {
      results.error = e.message;
    }

    setDiagnostics(results);
  };

  useEffect(() => {
    // Wait a bit for scripts to load
    const timer = setTimeout(() => {
      runDiagnostics();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Zebra Browser Print Diagnostics</h2>
        <button
          onClick={runDiagnostics}
          className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded hover:bg-blue-600 dark:hover:bg-blue-700 text-sm"
        >
          🔄 Refresh
        </button>
      </div>

      <div className="space-y-3 text-sm">
        {/* BrowserPrint SDK Status */}
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${diagnostics.browserPrintLoaded ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span className="font-medium">BrowserPrint SDK:</span>
          <span className={diagnostics.browserPrintLoaded ? 'text-green-600' : 'text-red-600'}>
            {diagnostics.browserPrintLoaded ? 'Loaded ✓' : 'Not Loaded ✗'}
          </span>
          {diagnostics.browserPrintVersion && (
            <span className="text-gray-500">({diagnostics.browserPrintVersion})</span>
          )}
        </div>

        {/* Devices Found */}
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${diagnostics.devices.length > 0 ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
          <span className="font-medium">Printers Found:</span>
          <span className={diagnostics.devices.length > 0 ? 'text-green-600' : 'text-yellow-600'}>
            {diagnostics.devices.length}
          </span>
        </div>

          {/* Device List */}
        {diagnostics.devices.length > 0 && (
          <div className="ml-5 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
            {diagnostics.devices.map((device, idx) => (
              <div key={idx} className="text-gray-700 dark:text-gray-300 py-1">
                <span className="font-medium">{device.name || device.uid || 'Unknown'}</span>
                <span className="text-gray-500 dark:text-gray-500 text-xs ml-2">
                  ({device.connection || device.deviceType || 'unknown type'})
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Error Message */}
        {diagnostics.error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-3 mt-4">
            <p className="text-red-900 font-medium">Error</p>
            <p className="text-red-700 text-sm mt-1">{diagnostics.error}</p>
          </div>
        )}

        {/* Troubleshooting Tips */}
        {!diagnostics.browserPrintLoaded && (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 mt-4">
            <p className="text-yellow-900 font-medium">Troubleshooting:</p>
            <ul className="list-disc list-inside text-yellow-700 text-sm mt-2 space-y-1">
              <li>Check browser console (F12) for script loading errors</li>
              <li>Verify files exist: /BrowserPrint-3.1.250.min.js</li>
              <li>Try refreshing the page</li>
              <li>Check if scripts are being blocked by browser</li>
            </ul>
          </div>
        )}

        {diagnostics.browserPrintLoaded && diagnostics.devices.length === 0 && (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 mt-4">
            <p className="text-yellow-900 font-medium">No Printers Found:</p>
            <ul className="list-disc list-inside text-yellow-700 text-sm mt-2 space-y-1">
              <li>Install Zebra Browser Print service on this device</li>
              <li>Ensure the service is running</li>
              <li>Pair your printer via Bluetooth</li>
              <li>Check printer is powered on</li>
              <li>Verify printer has labels loaded</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
