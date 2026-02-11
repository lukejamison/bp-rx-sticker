import { create } from 'zustand';
import type { Invoice, InvoiceItem } from '@/types';
import * as api from './api';
import { getPrinter } from './printer';
import { generateLabel, generateMultipleLabels } from './zpl';
import { config, logger } from './config';

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
    
    logger.info('📷 Barcode scanned:', code);
    logger.debug('Current state:', { scanning: state.scanning, hasInvoice: !!state.currentInvoice });
    
    if (state.scanning) {
      logger.warn('Already scanning, ignoring duplicate scan');
      return;
    }
    
    set({ scanning: true, lastScanResult: null, errorMessage: null, successMessage: null });
    logger.debug('State updated: scanning = true');

    try {
      // 1. Lookup item
      logger.info('🔍 Looking up item in API...');
      const response = await api.lookupBarcode(code.trim());
      logger.info('✓ Item found:', response.item.itemName);
      logger.debug('Full response:', response);

      // 2. Check if already completed
      if (response.completed && response.completionInfo) {
        logger.warn('⚠️  Item already completed:', {
          scannedAt: response.completionInfo.scannedAt,
          reprintCount: response.completionInfo.reprintCount,
        });
        
        const scannedTime = new Date(response.completionInfo.scannedAt).toLocaleString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
        const printedTime = new Date(response.completionInfo.labelPrintedAt).toLocaleString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
        
        set({
          scanning: false,
          lastScanResult: 'already_completed',
          errorMessage: `⚠️  Already Completed\n\n${response.item.itemName}\n\nScanned: ${scannedTime}\nLabel Printed: ${printedTime}\n\nUse the "Reprint" button if you need another label.`,
        });
        
        // Still load invoice to show progress
        logger.debug('Loading invoice items for progress update...');
        await get().loadInvoiceItems(response.invoice.id);
        return;
      }

      // 3. Print label(s) based on invoice quantity
      logger.info('🖨️  Preparing to print label(s)...');
      const invoiceQty = parseInt(response.item.invoiceQty || '1', 10);
      const labelCount = Math.max(1, Math.min(invoiceQty, 100)); // Safety: 1-100 labels
      logger.info(`📊 Invoice quantity: ${invoiceQty}, will print ${labelCount} label(s)`);
      
      const printer = getPrinter();
      
      if (!printer.isConnected()) {
        logger.debug('Printer not connected, connecting now...');
        await printer.connect();
        set({ printerConnected: true, printerName: printer.getDeviceName() });
        logger.info('✓ Printer connected:', printer.getDeviceName());
      } else {
        logger.debug('Printer already connected:', printer.getDeviceName());
      }

      logger.debug(`Generating ${labelCount} ZPL label(s)...`);
      const zpl = generateMultipleLabels({
        itemName: response.item.itemName,
        ndc: response.item.ndc,
        cost: response.item.cost,
        dateReceived: response.item.lastReceived,
        supplier: response.item.supplier,
      }, labelCount);
      logger.debug('ZPL generated, length:', zpl.length);

      logger.info(`📤 Sending ${labelCount} label(s) to printer...`);
      await printer.print(zpl);
      logger.info(`✅ Printed ${labelCount} label(s)`);

      // 4. Mark as completed
      logger.info('💾 Marking item as completed in database...');
      const completedData = {
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
      };
      logger.debug('Completed item data:', completedData);
      
      await api.markCompleted(completedData);
      logger.info('✅ Item marked as completed');

      // 5. Update state
      logger.debug('Updating UI state...');
      set({
        scanning: false,
        lastScanResult: 'success',
        successMessage: `✓ Printed ${labelCount} label(s) for ${response.item.itemName}`,
        currentInvoice: response.invoice,
      });

      // 6. Reload invoice items to update progress
      logger.info('🔄 Reloading invoice to update progress...');
      await get().loadInvoiceItems(response.invoice.id);

      // Play success sound
      logger.debug('Playing success sound');
      playSound('success');
      
      logger.info('✅ Scan workflow completed successfully');

    } catch (error: any) {
      logger.error('❌ Scan workflow failed:', error);
      logger.debug('Error details:', {
        message: error.message,
        status: error.status,
        data: error.data,
      });
      
      // Build detailed error message
      let errorMsg = error.message || 'Failed to process scan';
      
      if (error.status === 404) {
        errorMsg = `Item not found or not received in last 24 hours\n\nBarcode: ${code}\n\nTry:\n• Scanning a different item\n• Checking if invoice is recent\n• Increasing time window in settings`;
      } else if (error.status === 500) {
        errorMsg = `Server error - check API logs\n\n${error.message}\n\nAPI: ${config.apiUrl}\nCheck: sudo journalctl -u prx-api -n 50`;
      } else if (error.message.includes('Failed to fetch')) {
        errorMsg = `Cannot reach API server\n\nCheck:\n• API is running at ${config.apiUrl}\n• Device is on same network\n• Test: curl ${config.apiUrl}/health`;
      }
      
      set({
        scanning: false,
        lastScanResult: 'error',
        errorMessage: errorMsg,
      });
      
      // Play error sound
      playSound('error');
    }
  },

  // Load invoice items
  loadInvoiceItems: async (invoiceId: string) => {
    logger.info('📋 Loading invoice items:', invoiceId);
    try {
      const response = await api.getInvoiceItems(invoiceId);
      logger.info('✓ Invoice loaded:', {
        invoiceNumber: response.invoice.invoiceNumber,
        totalItems: response.progress.total,
        completed: response.progress.completed,
        percentage: response.progress.percentage,
      });
      
      set({
        currentInvoice: response.invoice,
        items: response.items,
      });
    } catch (error: any) {
      logger.error('❌ Failed to load invoice:', error);
      set({
        errorMessage: error.message || 'Failed to load invoice items',
      });
    }
  },

  // Reprint item
  reprintItem: async (item: InvoiceItem) => {
    logger.info('🔄 Reprinting label for:', item.itemName);
    set({ scanning: true, errorMessage: null, successMessage: null });

    try {
      const printer = getPrinter();
      
      if (!printer.isConnected()) {
        logger.debug('Printer not connected, connecting...');
        await printer.connect();
        set({ printerConnected: true, printerName: printer.getDeviceName() });
      }

      logger.debug('Generating ZPL for reprint...');
      const zpl = generateLabel({
        itemName: item.itemName,
        ndc: item.ndc,
        cost: item.cost,
        dateReceived: item.lastReceived,
        supplier: item.supplier,
      });

      logger.info('📤 Sending reprint to printer...');
      await printer.print(zpl);

      set({
        scanning: false,
        successMessage: `✓ Label reprinted for ${item.itemName}`,
      });

      logger.info('✅ Reprint completed successfully');
      playSound('success');

    } catch (error: any) {
      logger.error('❌ Reprint failed:', error);
      set({
        scanning: false,
        errorMessage: error.message || 'Failed to reprint label',
      });
      playSound('error');
    }
  },

  // Connect to printer
  connectPrinter: async () => {
    logger.info('🔌 Manual printer connection requested...');
    try {
      const printer = getPrinter();
      logger.debug('Attempting connection...');
      await printer.connect();
      
      const deviceName = printer.getDeviceName();
      logger.info('✅ Printer connected:', deviceName);
      logger.debug('Mock mode:', config.mockPrint);
      
      set({
        printerConnected: true,
        printerName: deviceName,
        successMessage: `✓ Connected to ${deviceName}`,
      });
    } catch (error: any) {
      logger.error('❌ Printer connection failed:', error);
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
