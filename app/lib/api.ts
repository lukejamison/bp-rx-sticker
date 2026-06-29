import type {
  LookupResponse,
  InvoiceProgressResponse,
  CompletedItemData,
} from '@/types';
import { config, logger } from './config';
import { getEffectiveInvoiceHours } from './invoiceWindow';

const API_BASE_URL = config.apiUrl;

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
  const url = `${API_BASE_URL}${endpoint}`;
  
  logger.debug('API Request:', {
    method: options?.method || 'GET',
    url,
    body: options?.body ? JSON.parse(options.body as string) : undefined,
  });

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    logger.debug('API Response:', {
      status: response.status,
      ok: response.ok,
      url,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      logger.error('API Error:', {
        status: response.status,
        error,
        url,
      });
      throw new ApiError(
        error.error || error.message || 'API request failed',
        response.status,
        error
      );
    }

    const data = await response.json();
    logger.debug('API Data:', data);
    return data;
  } catch (error) {
    logger.error('API Fetch Failed:', error);
    throw error;
  }
}

export async function lookupBarcode(
  code: string,
  hours: number = config.defaultTimeWindow
): Promise<LookupResponse> {
  const effectiveHours = getEffectiveInvoiceHours(hours);
  return fetchApi<LookupResponse>(
    `/api/items/barcode/${encodeURIComponent(code)}/recent?hours=${effectiveHours}`
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
