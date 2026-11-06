import type { Role } from './data';

export const PORTAL_LIVE = import.meta.env.VITE_PORTAL_MODE === 'live';
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export interface Session { email: string; name: string; role: Role; roles?:Role[]; designation?:string; room?:string }

type CacheRecord = {expires:number;data:unknown};
const responseCache=new Map<string,CacheRecord>();
const pending=new Map<string,Promise<unknown>>();
let activeRequests=0;
const activityListeners=new Set<(count:number)=>void>();
export function subscribePortalActivity(listener:(count:number)=>void){
  activityListeners.add(listener);listener(activeRequests);
  return ()=>{activityListeners.delete(listener);};
}
function requestActivity(action:string){
  // Type-ahead has its own discreet spinner; keep typing uninterrupted.
  if(action==='suggest')return ()=>{};
  activeRequests++;activityListeners.forEach(listener=>listener(activeRequests));
  return ()=>{activeRequests=Math.max(0,activeRequests-1);activityListeners.forEach(listener=>listener(activeRequests));};
}
export function clearLiveCache(){responseCache.clear();pending.clear();}
export function invalidateLiveCache(action?:string){
  if(!action){clearLiveCache();return;}
  for(const key of responseCache.keys())if(key.startsWith(action+':'))responseCache.delete(key);
}

export async function liveRequest<T>(token: string, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  // Cloudflare Pages Functions live on the same origin as the React frontend.
  // The optional override is retained for local integration tests only.
  const endpoint = `${API_BASE_URL}/v1/${encodeURIComponent(action)}`;
  const finished=requestActivity(action);
  try{
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(action==='login'&&token?{Authorization: `Bearer ${token}`}:{}) },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const result: { ok?: boolean; error?: string; data?: T } = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true || result.data === undefined) {
      throw new Error(result.error || `Unable to load the requested portal data (${response.status}).`);
    }
    return result.data;
  }finally{
    finished();
  }
}

// Short-lived, in-memory cache. Never persist personal data, grades or tokens.
export async function cachedLiveRequest<T>(token:string,action:string,payload:Record<string,unknown>={},ttl=90000):Promise<T> {
  const key=action+':'+JSON.stringify(payload),now=Date.now();
  const cached=responseCache.get(key);if(cached&&cached.expires>now)return cached.data as T;
  if(pending.has(key))return pending.get(key) as Promise<T>;
  const promise=liveRequest<T>(token,action,payload).then(data=>{responseCache.set(key,{data,expires:Date.now()+ttl});return data;}).finally(()=>pending.delete(key));
  pending.set(key,promise);return promise;
}
