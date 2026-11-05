/**
 * Cloudflare Pages Function for POST /v1/:action.
 * The authenticated API runs on the same origin as the Vite frontend.
 * No spreadsheet, user, or admin data is included in the static build.
 */
import portalApi from '../../backend/api/handler.mjs';

export function onRequest(context) {
  const origin = new URL(context.request.url).origin;
  return portalApi.fetch(context.request, {
    ...context.env,
    APP_ORIGIN: origin,
    GOOGLE_CLIENT_ID: context.env.GOOGLE_CLIENT_ID || context.env.VITE_GOOGLE_CLIENT_ID,
    GOOGLE_HOSTED_DOMAINS: context.env.GOOGLE_HOSTED_DOMAINS || 'bracu.ac.bd,g.bracu.ac.bd',
  });
}
