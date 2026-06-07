import axios from 'axios';

// In Docker (VITE_API_URL=""), falls back to '/api' → nginx proxies /api/* to server:3001/*
// In local dev set VITE_API_URL=http://localhost:3001 to hit server directly
const BASE =
  (import.meta as unknown as { env: { VITE_API_URL?: string } }).env.VITE_API_URL || '/api';

export const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cl_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('cl_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

import type { SmsInput, ParseResult } from '@cardledger/shared';

export async function parseSmsAi(input: SmsInput): Promise<ParseResult> {
  const { data } = await api.post<ParseResult>('/sms/parse/ai', input);
  return data;
}

export async function login(username: string, password: string): Promise<string> {
  const { data } = await api.post<{ token: string }>('/auth/login', { username, password });
  localStorage.setItem('cl_token', data.token);
  return data.token;
}

export function logout() {
  localStorage.removeItem('cl_token');
  window.location.href = '/login';
}

export function isAuthenticated(): boolean {
  const token = localStorage.getItem('cl_token');
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
