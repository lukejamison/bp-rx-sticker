'use client';

import { useState, useEffect } from 'react';

export function DebugPanel() {
  const [showPanel, setShowPanel] = useState(false);
  const [mockPrint, setMockPrint] = useState(false);
  const [debug, setDebug] = useState(false);

  useEffect(() => {
    setMockPrint(process.env.NEXT_PUBLIC_MOCK_PRINT === 'true');
    setDebug(process.env.NEXT_PUBLIC_DEBUG === 'true');
  }, []);

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="fixed bottom-4 right-4 bg-blue-500 dark:bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-600 dark:hover:bg-blue-700 z-40"
      >
        {showPanel ? '✕' : '⚙️'} Debug
      </button>

      {/* Panel */}
      {showPanel && (
        <div className="fixed bottom-20 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 z-40 w-80 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
            Debug Settings
          </h3>

          <div className="space-y-4">
            {/* Current Settings */}
            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-sm">
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Current Settings:</p>
              <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                <p>Debug: <span className={debug ? 'text-green-600' : 'text-red-600'}>{debug ? 'ON' : 'OFF'}</span></p>
                <p>Mock Print: <span className={mockPrint ? 'text-yellow-600' : 'text-red-600'}>{mockPrint ? 'ON' : 'OFF'}</span></p>
                <p>API: {process.env.NEXT_PUBLIC_API_URL}</p>
                <p>Port: {window.location.port || '80'}</p>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded text-xs text-gray-700 dark:text-gray-300">
              <p className="font-medium mb-1">To change settings:</p>
              <p className="mb-2">Edit <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">.env.local</code></p>
              <div className="space-y-1 font-mono text-xs">
                <p>NEXT_PUBLIC_DEBUG=true</p>
                <p>NEXT_PUBLIC_MOCK_PRINT=true</p>
              </div>
              <p className="mt-2">Then click Reload below.</p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={handleReload}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
              >
                🔄 Reload App
              </button>

              <button
                onClick={() => {
                  localStorage.clear();
                  console.clear();
                  alert('Storage cleared! Reload to reset.');
                }}
                className="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
              >
                🗑️ Clear Storage
              </button>

              <button
                onClick={() => {
                  console.clear();
                  console.log('Console cleared at', new Date().toISOString());
                }}
                className="w-full px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded hover:bg-gray-400 dark:hover:bg-gray-600 text-sm"
              >
                🧹 Clear Console
              </button>
            </div>

            {/* Info */}
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Check browser console (F12) for detailed logs
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
