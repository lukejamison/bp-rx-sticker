'use client';

import { useStore } from '@/lib/store';

export function InvoiceDisplay() {
  const { currentInvoice, items } = useStore();

  if (!currentInvoice || items.length === 0) return null;

  const completedCount = items.filter((item) => item.completed).length;
  const totalCount = items.length;
  const percentage = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Invoice #{currentInvoice.invoiceNumber}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">{currentInvoice.supplier}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {completedCount} / {totalCount}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">items scanned</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
        <div
          className="bg-blue-500 dark:bg-blue-600 h-3 transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-2">{percentage}% complete</p>
    </div>
  );
}
