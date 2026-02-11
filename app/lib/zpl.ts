import type { LabelData } from '@/types';
import { logger } from './config';

/**
 * Generate ZPL for a single label
 */
export function generateLabel(data: LabelData): string {
  logger.debug('Generating ZPL label for:', data.itemName);
  const timestamp = new Date().toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Truncate item name if too long (max 25 chars for 1" width)
  const itemName =
    data.itemName.length > 25
      ? data.itemName.substring(0, 22) + '...'
      : data.itemName;

  // Format NDC with dashes if not already formatted
  const formattedNDC = data.ndc.includes('-') 
    ? data.ndc 
    : data.ndc.replace(/(\d{5})(\d{4})(\d{2})/, '$1-$2-$3');

  logger.debug('Label data processed:', {
    itemName,
    formattedNDC,
    cost: data.cost,
    dateReceived: data.dateReceived,
    supplier: data.supplier,
    timestamp,
  });

  // 1" x 1" label at 203 DPI
  // ^XA = Start format
  // ^FO = Field Origin (x,y coordinates)
  // ^A0N = Font (0=default, N=normal)
  // ^FD = Field Data
  // ^FS = Field Separator
  // ^XZ = End format

  const zpl = `^XA
^FO20,15^A0N,23,23^FD${itemName}^FS
^FO20,45^A0N,18,18^FDNDC: ${formattedNDC}^FS
^FO20,70^A0N,18,18^FDCost: $${data.cost}^FS
^FO20,95^A0N,18,18^FDRcvd: ${data.dateReceived}^FS
^FO20,120^A0N,18,18^FDFrom: ${data.supplier}^FS
^FO20,145^A0N,14,14^FDPrinted: ${timestamp}^FS
^XZ`;
  
  logger.debug('ZPL generated successfully, length:', zpl.length);
  return zpl;
}

/**
 * Generate ZPL for multiple labels (based on invoice quantity)
 * Returns a single ZPL string with all labels
 */
export function generateMultipleLabels(data: LabelData, quantity: number): string {
  logger.info(`📄 Generating ${quantity} labels for:`, data.itemName);
  
  const qty = Math.max(1, Math.min(quantity, 999)); // Safety: 1-999 labels
  const labels: string[] = [];
  
  for (let i = 0; i < qty; i++) {
    labels.push(generateLabel(data));
  }
  
  // Combine all ZPL commands
  const combinedZPL = labels.join('\n');
  
  logger.debug(`Generated ${qty} labels, total ZPL length:`, combinedZPL.length);
  return combinedZPL;
}
