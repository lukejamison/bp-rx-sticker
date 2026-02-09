export interface InvoiceItem {
  itemId: string;
  itemName: string;
  ndc: string;
  upc: string;
  cost: string;
  lastReceived: string;
  supplier: string;
  stockSize: string;
  strength: string;
  invoiceQty: string;
  receivedQty: string;
  onHand: string;
  completed?: boolean;
  completionInfo?: CompletionInfo | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  statusChangedOn: string;
  supplier: string;
  totalItems: number;
}

export interface CompletionInfo {
  scannedAt: string;
  labelPrintedAt: string;
  reprintCount: number;
}

export interface LookupResponse {
  searchType?: string;
  item: InvoiceItem;
  invoice: Invoice;
  completed: boolean;
  completionInfo: CompletionInfo | null;
}

export interface InvoiceProgressResponse {
  invoice: Invoice;
  progress: {
    total: number;
    completed: number;
    remaining: number;
    percentage: string;
  };
  items: InvoiceItem[];
}

export interface CompletedItemData {
  invoiceId: string;
  invoiceNumber: string;
  itemId: string;
  ndc: string;
  upc: string;
  itemName: string;
  supplierName: string;
  invoiceDate?: string;
  statusChangedOn?: string;
  cost: string;
  quantity: string;
  stockSize?: string;
  strength?: string;
  scannedBy?: string;
  deviceId?: string;
}

export interface LabelData {
  itemName: string;
  ndc: string;
  cost: string;
  dateReceived: string;
  supplier: string;
}
