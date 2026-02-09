import { create } from 'zustand';
import type { Invoice, InvoiceItem } from '@/types';
import * as api from './api';
import { getPrinter } from './printer';
import { generateLabel } from './zpl';

interface AppState {
  // Current state
  currentInvoice: Invoice | null;
  items: InvoiceItem[];
  scanning: boolean;
  lastScanResult: 'success' | 'error' | 'already_completed' | null;
  errorMessage: string | null;
  successMessage: string | null;

  // Printer state
  printerConnected: boolean;
  printerName: string | null;

  // Actions
  scanBarcode: (code: string) => Promise<void>;
  loadInvoiceItems: (invoiceId: string) => Promise<void>;
  reprintItem: (item: InvoiceItem) => Promise<void>;
  connectPrinter: () => Promise<void>;
  clearMessages: () => void;
  reset: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  currentInvoice: null,
  items: [],
  scanning: false,
  lastScanResult: null,
  errorMessage: null,
  successMessage: null,
  printerConnected: false,
  printerName: null,

  // Scan barcode action
  scanBarcode: async (code: string) => {
    const state = get();
    
    if (state.scanning) return;
    
    set({ scanning: true, lastScanResult: null, errorMessage: null, successMessage: null });

    try {
      // 1. Lookup item
      const response = await api.lookupBarcode(code.trim());

      // 2. Check if already completed
      if (response.completed) {
        set({
          scanning: false,
          lastScanResult: 'already_completed',
          errorMessage: `Item already scanned at ${new Date(response.completionInfo?.scannedAt || '').toLocaleTimeString()}`,
        });
        
        // Still load invoice to show progress
        await get().loadInvoiceItems(response.invoice.id);
        return;
      }

      // 3. Print label
      const printer = getPrinter();
      if (!printer.isConnected()) {
        await printer.connect();
        set({ printerConnected: true, printerName: printer.getDeviceName() });
      }

      const zpl = generateLabel({
        itemName: response.item.itemName,
        ndc: response.item.ndc,
        cost: response.item.cost,
        dateReceived: response.item.lastReceived,
        supplier: response.item.supplier,
      });

      await printer.print(zpl);

      // 4. Mark as completed
      await api.markCompleted({
        invoiceId: response.invoice.id,
        invoiceNumber: response.invoice.invoiceNumber,
        itemId: response.item.itemId,
        ndc: response.item.ndc,
        upc: response.item.upc,
        itemName: response.item.itemName,
        supplierName: response.item.supplier,
        invoiceDate: response.invoice.invoiceDate,
        statusChangedOn: response.invoice.statusChangedOn,
        cost: response.item.cost,
        quantity: response.item.invoiceQty,
        stockSize: response.item.stockSize,
        strength: response.item.strength,
        deviceId: navigator.userAgent,
      });

      // 5. Update state
      set({
        scanning: false,
        lastScanResult: 'success',
        successMessage: `✓ Label printed for ${response.item.itemName}`,
        currentInvoice: response.invoice,
      });

      // 6. Reload invoice items to update progress
      await get().loadInvoiceItems(response.invoice.id);

      // Play success sound
      playSound('success');

    } catch (error: any) {
      console.error('Scan error:', error);
      set({
        scanning: false,
        lastScanResult: 'error',
        errorMessage: error.message || 'Failed to process scan',
      });
      
      // Play error sound
      playSound('error');
    }
  },

  // Load invoice items
  loadInvoiceItems: async (invoiceId: string) => {
    try {
      const response = await api.getInvoiceItems(invoiceId);
      set({
        currentInvoice: response.invoice,
        items: response.items,
      });
    } catch (error: any) {
      console.error('Load invoice error:', error);
      set({
        errorMessage: error.message || 'Failed to load invoice items',
      });
    }
  },

  // Reprint item
  reprintItem: async (item: InvoiceItem) => {
    set({ scanning: true, errorMessage: null, successMessage: null });

    try {
      const printer = getPrinter();
      if (!printer.isConnected()) {
        await printer.connect();
        set({ printerConnected: true, printerName: printer.getDeviceName() });
      }

      const zpl = generateLabel({
        itemName: item.itemName,
        ndc: item.ndc,
        cost: item.cost,
        dateReceived: item.lastReceived,
        supplier: item.supplier,
      });

      await printer.print(zpl);

      set({
        scanning: false,
        successMessage: `✓ Label reprinted for ${item.itemName}`,
      });

      playSound('success');

    } catch (error: any) {
      console.error('Reprint error:', error);
      set({
        scanning: false,
        errorMessage: error.message || 'Failed to reprint label',
      });
      playSound('error');
    }
  },

  // Connect to printer
  connectPrinter: async () => {
    try {
      const printer = getPrinter();
      await printer.connect();
      set({
        printerConnected: true,
        printerName: printer.getDeviceName(),
        successMessage: `✓ Connected to ${printer.getDeviceName()}`,
      });
    } catch (error: any) {
      console.error('Printer connection error:', error);
      set({
        printerConnected: false,
        printerName: null,
        errorMessage: error.message || 'Failed to connect to printer',
      });
    }
  },

  // Clear messages
  clearMessages: () => {
    set({ errorMessage: null, successMessage: null });
  },

  // Reset state
  reset: () => {
    set({
      currentInvoice: null,
      items: [],
      scanning: false,
      lastScanResult: null,
      errorMessage: null,
      successMessage: null,
    });
  },
}));

// Simple sound effects
function playSound(type: 'success' | 'error') {
  if (typeof window === 'undefined') return;

  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;

  const audioContext = new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  if (type === 'success') {
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
  } else {
    oscillator.frequency.value = 300;
    oscillator.type = 'sawtooth';
  }

  gainNode.gain.value = 0.1;

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.1);
}
