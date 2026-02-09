import type {
  LookupResponse,
  InvoiceProgressResponse,
  CompletedItemData,
} from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://172.18.129.154:3000';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      error.error || error.message || 'API request failed',
      response.status,
      error
    );
  }

  return response.json();
}

export async function lookupBarcode(
  code: string,
  hours: number = 24
): Promise<LookupResponse> {
  return fetchApi<LookupResponse>(
    `/api/items/barcode/${encodeURIComponent(code)}/recent?hours=${hours}`
  );
}

export async function getInvoiceItems(
  invoiceId: string
): Promise<InvoiceProgressResponse> {
  return fetchApi<InvoiceProgressResponse>(`/api/invoices/${invoiceId}/items`);
}

export async function markCompleted(
  data: CompletedItemData
): Promise<{ success: boolean; alreadyCompleted: boolean }> {
  return fetchApi('/api/completed', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function reprintLabel(completedId: string): Promise<{ success: boolean }> {
  return fetchApi(`/api/completed/${completedId}/reprint`, {
    method: 'POST',
  });
}

export async function getStats(days: number = 7): Promise<any> {
  return fetchApi(`/api/stats/completed?days=${days}`);
}
