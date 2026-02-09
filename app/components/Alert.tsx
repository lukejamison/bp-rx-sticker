'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';

export function Alert() {
  const { errorMessage, successMessage, clearMessages } = useStore();

  useEffect(() => {
    if (errorMessage || successMessage) {
      const timer = setTimeout(() => {
        clearMessages();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [errorMessage, successMessage, clearMessages]);

  if (!errorMessage && !successMessage) return null;

  return (
    <div className="fixed top-4 right-4 left-4 md:left-auto md:w-96 z-50 animate-slide-in">
      {errorMessage && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-lg">
          <div className="flex items-start">
            <span className="text-red-500 text-2xl mr-3">✕</span>
            <div className="flex-1">
              <p className="text-red-900 font-medium">Error</p>
              <p className="text-red-700 text-sm mt-1">{errorMessage}</p>
            </div>
            <button
              onClick={clearMessages}
              className="text-red-500 hover:text-red-700 ml-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded shadow-lg">
          <div className="flex items-start">
            <span className="text-green-500 text-2xl mr-3">✓</span>
            <div className="flex-1">
              <p className="text-green-900 font-medium">Success</p>
              <p className="text-green-700 text-sm mt-1">{successMessage}</p>
            </div>
            <button
              onClick={clearMessages}
              className="text-green-500 hover:text-green-700 ml-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
