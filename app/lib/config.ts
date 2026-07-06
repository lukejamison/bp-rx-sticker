// App configuration
export const config = {
  // Debug mode - enables detailed console logging
  debug: process.env.NEXT_PUBLIC_DEBUG === 'true',
  
  // Mock print mode - simulates printing without actually sending to printer
  mockPrint: process.env.NEXT_PUBLIC_MOCK_PRINT === 'true',
  
  // API URL
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://172.18.129.154:3000',
  
  // Default time window for recent invoices (hours)
  defaultTimeWindow: 168,
};

// Debug logger
export const logger = {
  debug: (...args: any[]) => {
    if (config.debug) {
      console.log('[DEBUG]', new Date().toISOString(), ...args);
    }
  },
  
  info: (...args: any[]) => {
    console.log('[INFO]', new Date().toISOString(), ...args);
  },
  
  warn: (...args: any[]) => {
    console.warn('[WARN]', new Date().toISOString(), ...args);
  },
  
  error: (...args: any[]) => {
    console.error('[ERROR]', new Date().toISOString(), ...args);
  },
};
