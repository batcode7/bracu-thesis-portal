import {handleD1Sync} from '../../backend/d1/sync.mjs';

export function onRequest(context){return handleD1Sync(context.request,context.env);}
