/* eslint-disable @typescript-eslint/no-explicit-any */

// Zebra Browser Print integration
// Note: This requires Zebra Browser Print to be installed on the device
// Download from: https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html

import { config, logger } from './config';

declare global {
  interface Window {
    BrowserPrint: any;
  }
}

export class ZebraPrinter {
  private device: any = null;
  private deviceName: string = '';

  async connect(): Promise<boolean> {
    logger.info('🔌 Attempting to connect to printer...');
    logger.debug('Mock print mode:', config.mockPrint);
    
    try {
      // Check if running in browser
      if (typeof window === 'undefined') {
        logger.error('Not in browser environment');
        throw new Error('Not running in browser environment');
      }

      // Mock mode - skip real connection
      if (config.mockPrint) {
        logger.info('✓ Mock print mode - simulating printer connection');
        this.device = { mock: true };
        this.deviceName = 'Mock Printer (Testing Mode)';
        return true;
      }

      // Check if BrowserPrint is loaded
      if (!window.BrowserPrint) {
        logger.error('window.BrowserPrint is undefined');
        logger.debug('Available on window:', Object.keys(window).filter(k => k.toLowerCase().includes('print')));
        throw new Error(
          'Zebra Browser Print SDK not loaded. Please refresh the page. ' +
          'If this persists, check browser console for script loading errors.'
        );
      }

      logger.info('✓ BrowserPrint SDK found, attempting to connect...');

      // Get default printer first, then try to get all local devices
      logger.debug('Calling BrowserPrint.getDefaultDevice...');
      const devices = await new Promise<any[]>((resolve, reject) => {
        // First try to get the default device
        window.BrowserPrint.getDefaultDevice(
          'printer',
          (device: any) => {
            if (device) {
              logger.info('✓ Found default printer:', device);
              resolve([device]);
            } else {
              logger.warn('No default printer, checking for local devices...');
              // If no default, try to get all local devices
              window.BrowserPrint.getLocalDevices(
                (deviceList: any[]) => {
                  logger.info('Found devices:', deviceList);
                  resolve(deviceList || []);
                },
                (error: any) => {
                  logger.error('Error getting local devices:', error);
                  reject(error);
                }
              );
            }
          },
          (error: any) => {
            logger.error('Error getting default device:', error);
            reject(error);
          }
        );
      });

      logger.debug('Total devices found:', devices.length, devices);

      if (!devices || devices.length === 0) {
        const errorMsg = 
          'No Zebra printers found. Please check:\n' +
          '1. Zebra Browser Print service is running on this device\n' +
          '2. Printer is paired via Bluetooth\n' +
          '3. Printer is powered on\n' +
          '4. Printer has labels loaded';
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      this.device = devices[0];
      this.deviceName = this.device.name || this.device.uid || 'Unknown Printer';
      
      logger.info('✅ Connected to printer:', this.deviceName);
      return true;
    } catch (error: any) {
      logger.error('❌ Printer connection error:', error);
      throw new Error(error.message || 'Failed to connect to printer');
    }
  }

  async print(zpl: string): Promise<void> {
    logger.info('🖨️  Printing label...');
    logger.debug('ZPL Command:', zpl);
    
    if (!this.device) {
      logger.error('Printer not connected');
      throw new Error('Printer not connected. Call connect() first.');
    }

    // Mock mode - simulate printing
    if (config.mockPrint) {
      logger.info('✓ Mock print - simulating 1 second print time');
      await new Promise(resolve => setTimeout(resolve, 1000));
      logger.info('✅ Mock print completed successfully');
      return;
    }

    // Real printing
    try {
      logger.debug('Sending ZPL to device:', this.deviceName);
      await new Promise<void>((resolve, reject) => {
        this.device.send(
          zpl,
          () => {
            logger.info('✅ Label sent to printer successfully');
            resolve();
          },
          (error: any) => {
            logger.error('❌ Print error:', error);
            reject(new Error('Failed to print label: ' + (error?.message || 'Unknown error')));
          }
        );
      });
    } catch (error: any) {
      logger.error('❌ Print failed:', error);
      throw error;
    }
  }

  async getStatus(): Promise<any> {
    if (!this.device) {
      return null;
    }

    try {
      return await new Promise((resolve) => {
        this.device.sendThenRead(
          '~HS',
          (status: any) => resolve(status),
          () => resolve(null)
        );
      });
    } catch (error) {
      console.error('❌ Status check error:', error);
      return null;
    }
  }

  isConnected(): boolean {
    return this.device !== null;
  }

  getDeviceName(): string {
    return this.deviceName;
  }

  disconnect(): void {
    this.device = null;
    this.deviceName = '';
  }
}

// Singleton instance
let printerInstance: ZebraPrinter | null = null;

export function getPrinter(): ZebraPrinter {
  if (!printerInstance) {
    printerInstance = new ZebraPrinter();
  }
  return printerInstance;
}
