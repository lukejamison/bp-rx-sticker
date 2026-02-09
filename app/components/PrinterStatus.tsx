'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';

export function PrinterStatus() {
  const { printerConnected, printerName, connectPrinter } = useStore();

  useEffect(() => {
    // Try to connect on mount
    connectPrinter();
  }, [connectPrinter]);

  return (
    <div className="flex items-center gap-2">
      {printerConnected ? (
        <>
          <span className="h-3 w-3 bg-green-500 rounded-full animate-pulse"></span>
          <span className="text-sm text-gray-700 dark:text-gray-300">{printerName}</span>
        </>
      ) : (
        <>
          <span className="h-3 w-3 bg-red-500 rounded-full"></span>
          <button
            onClick={connectPrinter}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Connect Printer
          </button>
        </>
      )}
    </div>
  );
}
