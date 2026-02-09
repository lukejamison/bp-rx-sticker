/* eslint-disable @typescript-eslint/no-explicit-any */

// Zebra Browser Print integration
// Note: This requires Zebra Browser Print to be installed on the device
// Download from: https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html

declare global {
  interface Window {
    BrowserPrint: any;
  }
}

export class ZebraPrinter {
  private device: any = null;
  private deviceName: string = '';

  async connect(): Promise<boolean> {
    try {
      // Check if running in browser
      if (typeof window === 'undefined') {
        throw new Error('Not running in browser environment');
      }

      // Check if BrowserPrint is loaded
      if (!window.BrowserPrint) {
        console.error('❌ window.BrowserPrint is undefined');
        throw new Error(
          'Zebra Browser Print SDK not loaded. Please refresh the page. ' +
          'If this persists, check browser console for script loading errors.'
        );
      }

      console.log('✓ BrowserPrint SDK found, attempting to connect...');

      // Get default printer first, then try to get all local devices
      const devices = await new Promise<any[]>((resolve, reject) => {
        // First try to get the default device
        window.BrowserPrint.getDefaultDevice(
          'printer',
          (device: any) => {
            if (device) {
              console.log('✓ Found default printer:', device);
              resolve([device]);
            } else {
              console.log('No default printer, checking for local devices...');
              // If no default, try to get all local devices
              window.BrowserPrint.getLocalDevices(
                (deviceList: any[]) => {
                  console.log('Found devices:', deviceList);
                  resolve(deviceList || []);
                },
                (error: any) => {
                  console.error('Error getting local devices:', error);
                  reject(error);
                }
              );
            }
          },
          (error: any) => {
            console.error('Error getting default device:', error);
            reject(error);
          }
        );
      });

      console.log('Devices found:', devices);

      if (!devices || devices.length === 0) {
        throw new Error(
          'No Zebra printers found. Please check:\n' +
          '1. Zebra Browser Print service is running on this device\n' +
          '2. Printer is paired via Bluetooth\n' +
          '3. Printer is powered on\n' +
          '4. Printer has labels loaded'
        );
      }

      this.device = devices[0];
      this.deviceName = this.device.name || this.device.uid || 'Unknown Printer';
      
      console.log('✅ Connected to printer:', this.deviceName);
      return true;
    } catch (error: any) {
      console.error('❌ Printer connection error:', error);
      throw new Error(error.message || 'Failed to connect to printer');
    }
  }

  async print(zpl: string): Promise<void> {
    if (!this.device) {
      throw new Error('Printer not connected. Call connect() first.');
    }

    try {
      await new Promise<void>((resolve, reject) => {
        this.device.send(
          zpl,
          () => {
            console.log('✅ Label sent to printer');
            resolve();
          },
          (error: any) => {
            console.error('❌ Print error:', error);
            reject(new Error('Failed to print label'));
          }
        );
      });
    } catch (error) {
      console.error('❌ Print error:', error);
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
