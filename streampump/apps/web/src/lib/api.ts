const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiOptions extends RequestInit {
  data?: unknown;
}

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { data, ...fetchOptions } = options;

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });

  const responseData = await response.json();

  if (!response.ok) {
    throw new ApiError(
      responseData.error || responseData.message || 'Request failed',
      response.status,
      responseData.details
    );
  }

  return responseData;
}

// Session API
export const sessionsApi = {
  list: () => request<{ success: boolean; data: unknown[] }>('/v1/sessions'),
  
  get: (id: string) => request<{ success: boolean; data: unknown }>(`/v1/sessions/${id}`),
  
  create: (data: unknown) => request<{ success: boolean; data: unknown }>('/v1/sessions', {
    method: 'POST',
    data,
  }),
  
  startVoting: (id: string) => request<{ success: boolean; data: unknown }>(`/v1/sessions/${id}/start`, {
    method: 'POST',
  }),
  
  stopVoting: (id: string) => request<{ success: boolean; data: unknown }>(`/v1/sessions/${id}/stop`, {
    method: 'POST',
  }),
  
  finalize: (id: string, useSecondPlace = false) => request<{ success: boolean; data: unknown }>(
    `/v1/sessions/${id}/finalize`,
    { method: 'POST', data: { useSecondPlace } }
  ),
  
  generateLaunchTx: (id: string, idempotencyKey: string) => request<{
    success: boolean;
    data: { serializedTxBase64: string; requestId: string };
  }>(`/v1/sessions/${id}/bags/launch-tx`, {
    method: 'POST',
    data: { idempotencyKey },
  }),
  
  broadcastLaunchTx: (id: string, signedTransaction: string, idempotencyKey: string) => request<{
    success: boolean;
    data: { signature: string; status: string; explorerUrl?: string };
  }>(`/v1/sessions/${id}/broadcast`, {
    method: 'POST',
    data: { signedTransaction, idempotencyKey },
  }),
};

// Vote API
export const voteApi = {
  getSession: (sessionCode: string) => request<{ success: boolean; data: unknown }>(
    `/v1/vote/${sessionCode}/session`
  ),
  
  getResults: (sessionCode: string) => request<{ success: boolean; data: unknown }>(
    `/v1/vote/${sessionCode}/results`
  ),
  
  getStatus: (sessionCode: string) => request<{ success: boolean; data: { hasVoted: boolean; sessionStatus: string } }>(
    `/v1/vote/${sessionCode}/status`
  ),
  
  cast: (sessionCode: string, optionIndex: number) => request<{ success: boolean; message: string }>(
    `/v1/vote/${sessionCode}`,
    { method: 'POST', data: { optionIndex } }
  ),
};

// Trade API
export const tradeApi = {
  getInfo: (sessionCode: string) => request<{ success: boolean; data: unknown }>(
    `/v1/trade/${sessionCode}`
  ),
  
  getQuote: (sessionCode: string, amountSol: number) => request<{
    success: boolean;
    data: { inputAmount: string; outputAmount: string; priceImpact: number };
  }>(`/v1/trade/${sessionCode}/quote`, {
    method: 'POST',
    data: { amountSol },
  }),
  
  createSwapTx: (sessionCode: string, amountSol: number, userWallet: string, idempotencyKey: string) => request<{
    success: boolean;
    data: { serializedTxBase64: string; requestId: string; quote: unknown };
  }>(`/v1/trade/${sessionCode}/swap-tx`, {
    method: 'POST',
    data: { amountSol, userWallet, idempotencyKey },
  }),
  
  broadcastSwap: (sessionCode: string, signedTransaction: string, idempotencyKey: string) => request<{
    success: boolean;
    data: { signature: string; status: string; explorerUrl?: string };
  }>(`/v1/trade/${sessionCode}/broadcast`, {
    method: 'POST',
    data: { signedTransaction, idempotencyKey },
  }),
};

// User API
export const userApi = {
  getMe: () => request<{ success: boolean; data: unknown }>('/v1/users/me'),
  
  updateStreamerProfile: (data: { streamerWalletPubkey: string; platformFeeBps?: number }) => 
    request<{ success: boolean; data: unknown }>('/v1/users/me/streamer-profile', {
      method: 'PUT',
      data,
    }),
  
  sync: (data: { twitchId: string; displayName: string; email?: string; profileImageUrl?: string }) =>
    request<{ success: boolean; data: unknown }>('/v1/users/sync', {
      method: 'POST',
      data,
    }),
};

// Image API
export const imageApi = {
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE}/v1/images/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(data.error || 'Upload failed', response.status);
    }
    return data;
  },
  
  list: () => request<{ success: boolean; data: unknown[] }>('/v1/images'),
  
  attach: (sessionId: string, imageIds: string[]) => request<{ success: boolean }>('/v1/images/attach', {
    method: 'POST',
    data: { sessionId, imageIds },
  }),
};

export { ApiError };
