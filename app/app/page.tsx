'use client';

import { ScanInput } from '@/components/ScanInput';
import { InvoiceDisplay } from '@/components/InvoiceDisplay';
import { ItemRow } from '@/components/ItemRow';
import { PrinterStatus } from '@/components/PrinterStatus';
import { Alert } from '@/components/Alert';
import { ZebraDiagnostics } from '@/components/ZebraDiagnostics';
import { ThemeToggle } from '@/components/ThemeToggle';
import { DebugPanel } from '@/components/DebugPanel';
import { useStore } from '@/lib/store';
import { useEffect, useState } from 'react';

export default function Home() {
  const { items, currentInvoice } = useStore();
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Load Zebra Browser Print scripts
  useEffect(() => {
    console.log('='.repeat(60));
    console.log('🚀 BP RX Sticker App Starting...');
    console.log('Debug Mode:', process.env.NEXT_PUBLIC_DEBUG);
    console.log('Mock Print:', process.env.NEXT_PUBLIC_MOCK_PRINT);
    console.log('API URL:', process.env.NEXT_PUBLIC_API_URL);
    console.log('='.repeat(60));
    
    if (typeof window !== 'undefined') {
      // Check if already loaded
      if (window.BrowserPrint) {
        console.log('✓ BrowserPrint already loaded');
        return;
      }
      
      // Load main BrowserPrint library
      console.log('📦 Loading BrowserPrint SDK...');
      const script1 = document.createElement('script');
      script1.src = '/BrowserPrint-3.1.250.min.js';
      script1.async = false;
      script1.onload = () => {
        console.log('✅ BrowserPrint library loaded successfully');
        console.log('   Available methods:', Object.keys(window.BrowserPrint || {}));
        
        // Load Zebra helper library after main library
        console.log('📦 Loading Zebra helper library...');
        const script2 = document.createElement('script');
        script2.src = '/BrowserPrint-Zebra-1.1.250.min.js';
        script2.async = false;
        script2.onload = () => {
          console.log('✅ Zebra helper library loaded successfully');
          console.log('   BrowserPrint available:', !!window.BrowserPrint);
          console.log('   Ready to connect to printers!');
        };
        script2.onerror = (e) => {
          console.error('❌ Failed to load Zebra helper library:', e);
        };
        document.body.appendChild(script2);
      };
      script1.onerror = (e) => {
        console.error('❌ Failed to load BrowserPrint library:', e);
        console.error('   Check that /BrowserPrint-3.1.250.min.js exists in public folder');
      };
      document.body.appendChild(script1);
    }
  }, []);

  const pendingItems = items.filter((item) => !item.completed);
  const completedItems = items.filter((item) => item.completed);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Alert />
      <DebugPanel />

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">BP RX Sticker</h1>
              {process.env.NEXT_PUBLIC_MOCK_PRINT === 'true' && (
                <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                  🧪 Mock Print Mode
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <PrinterStatus />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Diagnostics toggle */}
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 underline"
          >
            {showDiagnostics ? '✕ Hide' : '🔧'} Diagnostics
          </button>
        </div>

        {/* Zebra diagnostics */}
        {showDiagnostics && <ZebraDiagnostics />}

        {/* Scan input */}
        <div className="mb-6">
          <ScanInput />
        </div>

        {/* Invoice progress */}
        <InvoiceDisplay />

        {/* Item lists */}
        {currentInvoice && items.length > 0 && (
          <div className="space-y-6">
            {/* Pending items */}
            {pendingItems.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  📦 Pending Items ({pendingItems.length})
                </h2>
                <div className="space-y-3">
                  {pendingItems.map((item) => (
                    <ItemRow key={`${item.ndc}-${item.upc}`} item={item} />
                  ))}
                </div>
              </div>
            )}

            {/* Completed items */}
            {completedItems.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-3">
                  ✓ Completed Items ({completedItems.length})
                </h2>
                <div className="space-y-3">
                  {completedItems.map((item) => (
                    <ItemRow key={`${item.ndc}-${item.upc}`} item={item} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!currentInvoice && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-12 text-center">
            <div className="text-6xl mb-4">📦</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Ready to Scan
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Scan a barcode to get started
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
