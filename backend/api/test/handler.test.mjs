import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import portalWorker, { verifyGoogleToken } from '../handler.mjs';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const env = {
  APP_ORIGIN: 'https://portal.example.org',
  GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
  GOOGLE_HOSTED_DOMAINS: 'bracu.ac.bd,g.bracu.ac.bd',
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/example123/exec',
  BRIDGE_SECRET: 'test-only-random-bridge-secret-012345678901',
};

const generated = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',hash:'SHA-256',modulusLength:2048,publicExponent:new Uint8Array([1,0,1])},true,['sign','verify']);
const publicJwk = await crypto.subtle.exportKey('jwk', generated.publicKey);
const utf8 = new TextEncoder();
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const payload = extra => ({iss:'https://accounts.google.com',aud:env.GOOGLE_CLIENT_ID,sub:'109876543210',email:'student@g.bracu.ac.bd',email_verified:true,hd:'g.bracu.ac.bd',name:'Test Student',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+900,...extra});
async function sign(claims=payload()) {
  const input = `${encode({alg:'RS256',kid:'test-google-key',typ:'JWT'})}.${encode(claims)}`;
  const signed = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',generated.privateKey,utf8.encode(input));
  return `${input}.${Buffer.from(signed).toString('base64url')}`;
}
const mockFetch = globalThis.fetch;
globalThis.fetch = async (url,options) => {
  const target = String(url);
  if(target.includes('googleapis.com/oauth2/v3/certs'))return Response.json({keys:[{...publicJwk,kid:'test-google-key',alg:'RS256'}]});
  if(target.includes('script.google.com')){
    const body=JSON.parse(options.body);
    assert.equal(body.secret, env.BRIDGE_SECRET);
    if(body.action==='publicAnnouncements'){
      assert.equal(body.principal.email,'');
      return Response.json({ok:true,data:{items:[{id:'notice-1',kind:'Notice',title:'Official notice',body:'Public announcement text',status:undefined}]}});
    }
    assert.equal(body.principal.email,'student@g.bracu.ac.bd');
    assert.equal(body.principal.role,undefined);
    return Response.json({ok:true,data:{role:'student',email:body.principal.email}});
  }
  throw new Error('Unexpected URL '+target);
};
const request = (token,origin=env.APP_ORIGIN,action='session') => new Request(`https://api.example.net/v1/${action}`,{method:'POST',headers:{origin,'authorization':'Bearer '+token,'content-type':'application/json'},body:'{}'});

test('accepts a correctly signed university identity and forwards only trusted principal',async()=>{
  const response=await portalWorker.fetch(request(await sign()),env);
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).data,{role:'student',email:'student@g.bracu.ac.bd'});
});
test('rejects signed tokens for the wrong audience',async()=>{
  await assert.rejects(verifyGoogleToken(await sign(payload({aud:'another-client'})),env),/Wrong identity/);
});
test('rejects non-Workspace identities even with a university-looking email',async()=>{
  await assert.rejects(verifyGoogleToken(await sign(payload({hd:'example.org'})),env),/Workspace account/);
});
test('rejects expired tokens and email addresses outside BRAC',async()=>{
  await assert.rejects(verifyGoogleToken(await sign(payload({exp:0})),env),/Expired/);
  await assert.rejects(verifyGoogleToken(await sign(payload({email:'student@example.org'})),env),/Workspace email/);
});
test('rejects a modified signature',async()=>{
  const token=await sign();
  await assert.rejects(verifyGoogleToken(token.slice(0,-5)+'abcde',env),/signature/);
});
test('blocks unapproved origins and unauthenticated requests',async()=>{
  assert.equal((await portalWorker.fetch(request(await sign(),'https://other.example.org'),env)).status,403);
  assert.equal((await portalWorker.fetch(new Request('https://api.example.net/v1/session',{method:'POST',headers:{origin:env.APP_ORIGIN}}),env)).status,401);
});
test('refuses an unconfigured bridge',async()=>{
  const response=await portalWorker.fetch(request(await sign()),{...env,BRIDGE_SECRET:''});
  assert.equal(response.status,503);
});
test('public announcements load without login while announcement editing requires a verified token',async()=>{
  const feed=await portalWorker.fetch(new Request('https://api.example.net/v1/announcements'),env);
  assert.equal(feed.status,200);
  const decoded=await feed.json();
  assert.equal(decoded.data.items[0].title,'Official notice');
  assert.match(feed.headers.get('cache-control'),/public/);
  const writeRequest=new Request('https://api.example.net/v1/saveAnnouncement',{method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/json'},body:JSON.stringify({title:'Forged'})});
  assert.equal((await portalWorker.fetch(writeRequest,env)).status,401);
});
test.after(()=>{globalThis.fetch=mockFetch;});
