/**
 * BRACU Portal secure HTTP handler. Used by Cloudflare Pages Functions.
 * It validates Google Workspace ID tokens cryptographically and forwards only
 * verified identities to a secret-protected owner-run Apps Script backend.
 */

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const ROUTES = new Set([
  'login','logout','session','student','supervisor','deadlines','search','suggest','detail','summary','overview','preview','previewCandidates',
  'registry','admins','addAdmin','removeAdmin','faculty','facultyList','setFaculty',
  'registerSemester','sync','restartSync','aliases','setAlias','removeAlias',
  'announcements','saveAnnouncement','statusAnnouncement','updateFaculty'
]);
const SESSION_COOKIE='bracu_portal_session';
const SESSION_TTL=2*60*60;
let jwksCache = { until: 0, keys: [] };

const json = (value, status, origin) => new Response(JSON.stringify(value), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'vary': 'Origin',
  },
});
function base64url(input) {
  if(!/^[a-zA-Z0-9_-]+$/.test(input)) throw new Error('Malformed token');
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - input.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}
function decodedJson(part) { return JSON.parse(new TextDecoder().decode(base64url(part))); }
function identityError(message) { const error = new Error(message); error.status = 401; return error; }
function bytesUrl(bytes) {return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function sessionKey(env) {
  const secret=env.SESSION_SIGNING_SECRET||env.BRIDGE_SECRET;
  if(typeof secret!=='string'||secret.length<32){const err=new Error('Session signing is not configured');err.status=503;throw err;}
  return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function signSession(principal,env) {
  const now=Math.floor(Date.now()/1000);
  const value=bytesUrl(new TextEncoder().encode(JSON.stringify({v:1,sub:principal.sub,email:principal.email,name:principal.name,iat:now,exp:now+SESSION_TTL})));
  const signature=await crypto.subtle.sign('HMAC',await sessionKey(env),new TextEncoder().encode('BRACU_SESSION_V1.'+value));
  return `${value}.${bytesUrl(new Uint8Array(signature))}`;
}
async function readSession(request,env) {
  const header=request.headers.get('cookie')||'';
  const encoded=header.split(';').map(v=>v.trim()).find(v=>v.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1)||'';
  const parts=encoded.split('.');if(parts.length!==2||encoded.length>4000)throw identityError('Sign in again to continue');
  let valid,data;
  try{
    valid=await crypto.subtle.verify('HMAC',await sessionKey(env),base64url(parts[1]),new TextEncoder().encode('BRACU_SESSION_V1.'+parts[0]));
    if(!valid)throw identityError('Invalid portal session');
    data=decodedJson(parts[0]);
  }catch(error){if(error.status===503)throw error;throw identityError('Invalid portal session');}
  const now=Math.floor(Date.now()/1000);
  if(data.v!==1||!Number.isInteger(data.exp)||data.exp<=now||data.exp>now+SESSION_TTL||!Number.isInteger(data.iat)||data.iat>now+60||
     typeof data.sub!=='string'||data.sub.length<5||typeof data.name!=='string'||typeof data.email!=='string'||
     !/^[a-z0-9._%+\-]+@(?:g\.)?bracu\.ac\.bd$/.test(data.email))throw identityError('Portal session expired');
  return {sub:data.sub,email:data.email,name:data.name};
}
function sessionCookie(value,maxAge) {return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/v1; Max-Age=${maxAge}`;}
async function googleKeys() {
  if (Date.now() < jwksCache.until && jwksCache.keys.length) return jwksCache.keys;
  const response = await fetch(JWKS_URL, { headers: {accept:'application/json'} });
  if (!response.ok) throw new Error('Google signing keys unavailable');
  const result = await response.json();
  if (!Array.isArray(result.keys) || !result.keys.length) throw new Error('Google signing keys unavailable');
  jwksCache = {keys:result.keys, until:Date.now() + 15 * 60 * 1000};
  return result.keys;
}

export async function verifyGoogleToken(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 10000) throw identityError('Invalid sign-in token');
  const header = decodedJson(parts[0]);
  const payload = decodedJson(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw identityError('Unsupported identity signature');
  const jwk = (await googleKeys()).find(item => item.kid === header.kid && item.kty === 'RSA' && (!item.alg || item.alg === 'RS256'));
  if (!jwk) throw identityError('Unknown identity signing key');
  const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!valid) throw identityError('Invalid identity signature');

  const now = Math.floor(Date.now()/1000);
  const domains = String(env.GOOGLE_HOSTED_DOMAINS || 'bracu.ac.bd,g.bracu.ac.bd').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const email = String(payload.email || '').trim().toLowerCase();
  if (!ISSUERS.has(payload.iss) || payload.aud !== env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_ID) throw identityError('Wrong identity issuer or audience');
  if (typeof payload.exp !== 'number' || payload.exp < now - 30 || typeof payload.iat !== 'number' || payload.iat > now + 60) throw identityError('Expired sign-in token');
  if (payload.nbf && payload.nbf > now + 30) throw identityError('Token not active');
  if (payload.email_verified !== true || typeof payload.sub !== 'string' || payload.sub.length < 5) throw identityError('Unverified account');
  if (!domains.includes(String(payload.hd || '').toLowerCase())) throw identityError('BRAC Workspace account required');
  if (!domains.some(domain => email.endsWith('@' + domain))) throw identityError('BRAC Workspace email required');
  return {sub:payload.sub,email,name:String(payload.name||'').slice(0,120)};
}

async function forwardToAppsScript(action, payload, principal, env) {
  if (!env.APPS_SCRIPT_URL || !env.BRIDGE_SECRET || env.BRIDGE_SECRET.length < 32) {
    const error = new Error('Data service not configured');error.status=503;throw error;
  }
  const endpoint = new URL(env.APPS_SCRIPT_URL);
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'script.google.com' || !endpoint.pathname.startsWith('/macros/s/')) {
    const error=new Error('Data service URL not trusted');error.status=503;throw error;
  }
  const response = await fetch(endpoint.toString(), {
    method:'POST',
    headers:{'content-type':'text/plain;charset=utf-8'},
    body:JSON.stringify({secret:env.BRIDGE_SECRET, principal,action,payload}),
    redirect:'follow',
    signal:AbortSignal.timeout(25000),
  });
  if (!response.ok) {const error=new Error('Google data service unavailable');error.status=502;throw error;}
  const body = await response.text();
  if (body.length > 1500000) {const error=new Error('Data response too large');error.status=502;throw error;}
  let decoded;try{decoded=JSON.parse(body);}catch(_){const error=new Error('Invalid Google data response');error.status=502;throw error;}
  if (decoded.ok !== true) {const error=new Error(decoded.error||'Data request denied');error.status=/not authorized|identity|required|not matched/i.test(error.message)?403:400;throw error;}
  return decoded.data;
}

export default {
  async fetch(request, env) {
    const expected = String(env.APP_ORIGIN||'').replace(/\/$/,'');
    const origin = request.headers.get('origin');
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/v1/announcements') {
      try {
        if (!expected) throw new Error('Public feed unavailable');
        const result = await forwardToAppsScript('publicAnnouncements', {}, {sub:'public',email:''}, env);
        return new Response(JSON.stringify({ok:true,data:result}), {status:200,headers:{
          'content-type':'application/json; charset=utf-8',
          'cache-control':'public, max-age=60, s-maxage=60',
          'x-content-type-options':'nosniff',
          'referrer-policy':'no-referrer',
        }});
      } catch (_) {
        return json({ok:false,error:'News and events are temporarily unavailable'},503,expected||'null');
      }
    }
    if (!expected || !env.GOOGLE_CLIENT_ID) return json({ok:false,error:'Portal API is not configured'},503,expected||'null');
    if (origin !== expected) return json({ok:false,error:'Origin not allowed'},403,expected);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{
      'access-control-allow-origin':expected,
      'access-control-allow-headers':'authorization, content-type',
      'access-control-allow-methods':'POST, OPTIONS',
      'vary':'Origin',
      'cache-control':'no-store',
    }});
    const action=url.pathname.replace(/^\/+|\/+$/g,'').replace(/^v1\//,'');
    if (request.method !== 'POST' || !ROUTES.has(action)) return json({ok:false,error:'Unknown endpoint'},404,expected);
    if ((Number(request.headers.get('content-length'))||0)>24000) return json({ok:false,error:'Request too large'},413,expected);
    try {
      if(action==='logout'){
        const response=json({ok:true,data:{signedOut:true}},200,expected);
        response.headers.set('set-cookie',sessionCookie('',0));return response;
      }
      const authorization=request.headers.get('authorization')||'';
      if(action==='login'&&!authorization.startsWith('Bearer '))throw identityError('Verified Google sign-in required');
      const principal=authorization.startsWith('Bearer ')?await verifyGoogleToken(authorization.slice(7),env):await readSession(request,env);
      const text=await request.text();
      if(text.length>24000)return json({ok:false,error:'Request too large'},413,expected);
      const payload=text ? JSON.parse(text) : {};
      if (Array.isArray(payload) || typeof payload !== 'object' || !payload) return json({ok:false,error:'Invalid request'},400,expected);
      const data=await forwardToAppsScript(action==='login'?'session':action,payload,principal,env);
      const response=json({ok:true,data},200,expected);
      if(action==='login')response.headers.set('set-cookie',sessionCookie(await signSession(principal,env),SESSION_TTL));
      return response;
    } catch(error) {
      const status = error.status || (error instanceof SyntaxError ? 400 : 502);
      const publicMessage = status === 502 ? 'Google data service unavailable' : (error.message||'Request failed');
      return json({ok:false,error:publicMessage},status,expected);
    }
  }
};
