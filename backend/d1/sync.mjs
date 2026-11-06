/**
 * Owner-only Google Sheets -> D1 import endpoint.
 * A complete generation is made visible in ONE atomic pointer change. Until
 * then, students keep seeing the last successful snapshot.
 */
// Accept legacy snapshot kinds during migration; new snapshots publish `admin`.
const KINDS = new Set(['student','student_email','group','assignment','faculty','admin','prime_admin','deadline','resource']);
const reply = (value,status=200) => Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const clean = value => typeof value==='string'?value.trim():'';
async function equalSecret(a,b){
  if(typeof a!=='string'||typeof b!=='string'||b.length<32||a.length!==b.length)return false;
  const hash=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  const [left,right]=await Promise.all([hash(a),hash(b)]);
  return left.every((value,index)=>value===right[index]);
}
function checkRecord(item){
  if(!item||typeof item!=='object'||!KINDS.has(item.kind)||!clean(item.key)||item.key.length>240)throw new Error('Invalid cache record key');
  for(const field of ['email','thesisId','stage','name'])if(item[field]!==undefined&&(typeof item[field]!=='string'||item[field].length>250))throw new Error('Invalid cache index');
  if(!item.data||typeof item.data!=='object'||Array.isArray(item.data)||JSON.stringify(item.data).length>45000)throw new Error('Invalid cache record data');
}
export async function handleD1Sync(request,env){
  if(request.method!=='POST')return reply({ok:false,error:'Method not allowed'},405);
  if(!env.DB||!env.D1_SYNC_SECRET||!(await equalSecret(request.headers.get('x-d1-sync-secret'),env.D1_SYNC_SECRET)))
    return reply({ok:false,error:'Not authorized'},403);
  if((Number(request.headers.get('content-length'))||0)>650000)return reply({ok:false,error:'Batch too large'},413);
  try{
    const raw=await request.text();if(raw.length>650000)throw new Error('Batch too large');
    const body=JSON.parse(raw),mode=clean(body.mode),generation=clean(body.generation);
    if(!/^[a-zA-Z0-9_-]{16,100}$/.test(generation))throw new Error('Invalid synchronization identifier');
    if(mode==='start'){
      const checksum=clean(body.checksum),count=Number(body.expectedCount);
      if(!/^[a-f0-9]{64}$/.test(checksum)||!Number.isInteger(count)||count<1||count>100000)throw new Error('Invalid snapshot manifest');
      const active=await env.DB.prepare('SELECT checksum FROM portal_active WHERE id=1').first();
      if(active?.checksum===checksum)return reply({ok:true,skip:true});
      await env.DB.prepare('INSERT OR REPLACE INTO portal_sync_runs (generation,checksum,expected_count,started_at,status) VALUES (?,?,?,?,?)')
        .bind(generation,checksum,count,new Date().toISOString(),'loading').run();
      return reply({ok:true,skip:false});
    }
    const job=await env.DB.prepare('SELECT expected_count,status,checksum FROM portal_sync_runs WHERE generation=?').bind(generation).first();
    if(!job||job.status!=='loading')throw new Error('No active synchronization for this identifier');
    if(mode==='batch'){
      if(!Array.isArray(body.records)||body.records.length<1||body.records.length>60)throw new Error('Invalid batch size');
      const records=body.records;records.forEach(checkRecord);
      const sql='INSERT OR REPLACE INTO portal_cache (generation,kind,item_key,email,thesis_id,stage,name,data_json) VALUES (?,?,?,?,?,?,?,?)';
      await env.DB.batch(records.map(item=>env.DB.prepare(sql).bind(generation,item.kind,item.key,
        clean(item.email).toLowerCase(),clean(item.thesisId).toUpperCase(),clean(item.stage),clean(item.name),JSON.stringify(item.data))));
      return reply({ok:true,received:records.length});
    }
    if(mode==='commit'){
      const actual=await env.DB.prepare('SELECT COUNT(*) AS count FROM portal_cache WHERE generation=?').bind(generation).first();
      if(Number(actual?.count)!==Number(job.expected_count))throw new Error('Incomplete snapshot; the previous version remains active');
      const at=new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare('INSERT OR REPLACE INTO portal_active(id,generation,checksum,updated_at) VALUES(1,?,?,?)').bind(generation,job.checksum,at),
        env.DB.prepare("UPDATE portal_sync_runs SET status='committed' WHERE generation=?").bind(generation),
      ]);
      // Retain up to three completed generations for safe rollback. Cleanup
      // failures must never invalidate a successfully activated snapshot.
      try{
        const recent=await env.DB.prepare("SELECT generation FROM portal_sync_runs WHERE status='committed' ORDER BY started_at DESC LIMIT 3").all();
        const keep=(recent.results||[]).map(row=>row.generation);
        if(keep.length)await env.DB.prepare(`DELETE FROM portal_cache WHERE generation NOT IN (${keep.map(()=>'?').join(',')})`).bind(...keep).run();
        if(keep.length)await env.DB.prepare(`DELETE FROM portal_sync_runs WHERE generation NOT IN (${keep.map(()=>'?').join(',')})`).bind(...keep).run();
      }catch(_){/* The current generation is already valid. */}
      return reply({ok:true,active:true,updatedAt:at,records:Number(actual.count)});
    }
    throw new Error('Unknown synchronization operation');
  }catch(error){return reply({ok:false,error:String(error.message||error)},400);}
}
