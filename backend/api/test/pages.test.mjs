import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onRequest} from '../../../functions/v1/[action].js';
import {onRequest as syncRequest} from '../../../functions/internal/d1-sync.js';

const origin = 'https://bracu-thesis-portal.pages.dev';
const env = {VITE_GOOGLE_CLIENT_ID:'public-client-id.apps.googleusercontent.com'};

function request(sourceOrigin,method='POST') {
  return new Request(`${origin}/v1/session`,{method,headers:{origin:sourceOrigin}});
}

test('Pages Function serves the authentication API on the frontend origin',async()=>{
  const response=await onRequest({request:request(origin),env});
  assert.equal(response.status,401); // No Google bearer token yet.
  assert.equal(response.headers.get('access-control-allow-origin'),origin);
});

test('Pages Function rejects other browser origins',async()=>{
  const response=await onRequest({request:request('https://example.net'),env});
  assert.equal(response.status,403);
});

test('Pages Function accepts same-origin preflight without granting credentials',async()=>{
  const response=await onRequest({request:request(origin,'OPTIONS'),env});
  assert.equal(response.status,204);
});

test('Pages Function remains locked without Google OAuth configuration',async()=>{
  const response=await onRequest({request:request(origin),env:{}});
  assert.equal(response.status,503);
});

test('Pages routing includes private D1 import endpoint; it refuses missing synchronization secrets',async()=>{
  const routes=JSON.parse(readFileSync(new URL('../../../public/_routes.json',import.meta.url),'utf8'));
  assert.ok(routes.include.includes('/v1/*'));
  assert.ok(routes.include.includes('/internal/*'));
  const response=await syncRequest({request:new Request(origin+'/internal/d1-sync',{method:'POST',body:'{}'}),env:{}});
  assert.equal(response.status,403);
});
