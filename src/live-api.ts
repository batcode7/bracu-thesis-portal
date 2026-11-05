import type { Role } from './data';

export const PORTAL_LIVE = import.meta.env.VITE_PORTAL_MODE === 'live';
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export interface Session { email: string; name: string; role: Role }

export async function liveRequest<T>(token: string, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  // Cloudflare Pages Functions live on the same origin as the React frontend.
  // The optional override is retained for local integration tests only.
  const endpoint = `${API_BASE_URL}/v1/${encodeURIComponent(action)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const result: { ok?: boolean; error?: string; data?: T } = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true || result.data === undefined) {
    throw new Error(result.error || `Unable to load the requested portal data (${response.status}).`);
  }
  return result.data;
}
