'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';

export function ScanInput() {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { scanBarcode, scanning, clearMessages } = useStore();

  // Auto-focus on mount and after scanning
  useEffect(() => {
    inputRef.current?.focus();
  }, [scanning]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || scanning) return;

    clearMessages();
    await scanBarcode(input);
    setInput('');
    
    // Re-focus after scan completes (for continuous scanning)
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={scanning ? 'Processing...' : 'Scan barcode...'}
          disabled={scanning}
          className="w-full px-6 py-4 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
          autoComplete="off"
          autoFocus
        />
        {scanning && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="animate-spin h-6 w-6 border-3 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}
      </div>
    </form>
  );
}
