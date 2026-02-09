'use client';

import { useState } from 'react';
import type { InvoiceItem } from '@/types';
import { useStore } from '@/lib/store';

interface ItemRowProps {
  item: InvoiceItem;
}

export function ItemRow({ item }: ItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { reprintItem, scanning } = useStore();

  const handleReprint = async () => {
    if (!scanning) {
      await reprintItem(item);
    }
  };

  return (
    <div
      className={`border rounded-lg p-4 transition-colors ${
        item.completed
          ? 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600'
          : 'bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-500'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {item.completed ? (
              <span className="text-green-500 text-xl">✓</span>
            ) : (
              <span className="text-blue-500 text-xl">⭘</span>
            )}
            <h3
              className={`font-semibold ${
                item.completed ? 'line-through text-gray-600 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'
              }`}
            >
              {item.itemName}
            </h3>
          </div>

          <div className="ml-7 space-y-1 text-sm">
            <p className="text-gray-600 dark:text-gray-400">NDC: {item.ndc}</p>
            <div className="flex gap-4">
              <p className="text-gray-600 dark:text-gray-400">Cost: ${item.cost}</p>
              <p className="text-gray-600 dark:text-gray-400">Qty: {item.invoiceQty}</p>
            </div>
          </div>

          {item.completed && item.completionInfo && (
            <p className="ml-7 mt-2 text-xs text-gray-500 dark:text-gray-500">
              Scanned: {new Date(item.completionInfo.scannedAt).toLocaleTimeString()}
            </p>
          )}

          {expanded && (
            <div className="ml-7 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <p>Strength: {item.strength}</p>
              <p>Stock Size: {item.stockSize}</p>
              <p>On Hand: {item.onHand}</p>
              <p>Supplier: {item.supplier}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 ml-4">
          {item.completed && (
            <button
              onClick={handleReprint}
              disabled={scanning}
              className="px-3 py-1 text-sm bg-blue-500 dark:bg-blue-600 text-white rounded hover:bg-blue-600 dark:hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              🔄 Reprint
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
          >
            {expanded ? '▴' : '▾'}
          </button>
        </div>
      </div>
    </div>
  );
}
