/**
 * Owner-only Google Sheets -> D1 incremental replication.
 * The initial snapshot is published atomically. Subsequent runs stage ONLY
 * changed/added/deleted rows and commit that delta as a single transaction.
 */
const KINDS = new Set(['student','student_email','group','assignment','faculty','faculty_list','admin','prime_admin','deadline','resource']);
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
async function rowHash(item){
  // The server hashes actual record contents; it never trusts a supplied hash.
  const value=JSON.stringify({kind:item.kind,key:item.key,email:item.email||'',thesisId:item.thesisId||'',
    stage:item.stage||'',name:item.name||'',data:item.data});
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  return Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
}
function checkRemoval(item){
  if(!item||!KINDS.has(item.kind)||typeof item.key!=='string'||!item.key.trim()||item.key.length>240)
    throw new Error('Invalid removal key');
}
async function count(db,sql,...params){
  return Number((await db.prepare(sql).bind(...params).first())?.count||0);
}
async function getActive(db){
  return await db.prepare('SELECT generation,checksum FROM portal_active WHERE id=1').first();
}
async function cleanAbandoned(db,currentGeneration){
  const runs=await db.prepare("SELECT generation FROM portal_sync_runs WHERE status='loading' AND generation<>?")
    .bind(currentGeneration).all();
  // Never hide cleanup failures: silent orphans caused the old storage runaway.
  for(const run of runs.results||[]){
    await db.batch([
      db.prepare('DELETE FROM portal_cache WHERE generation=?').bind(run.generation),
      db.prepare('DELETE FROM portal_sync_deletes WHERE generation=?').bind(run.generation),
      db.prepare('DELETE FROM portal_sync_runs WHERE generation=?').bind(run.generation),
    ]);
  }
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
    const db=env.DB;
    if(mode==='start'){
      const checksum=clean(body.checksum),expectedCount=Number(body.expectedCount);
      if(!/^[a-f0-9]{64}$/.test(checksum)||!Number.isInteger(expectedCount)||expectedCount<1||expectedCount>100000)
        throw new Error('Invalid synchronization manifest');
      const active=await getActive(db);
      if(active?.checksum===checksum)return reply({ok:true,skip:true});
      const existing=await db.prepare('SELECT * FROM portal_sync_runs WHERE generation=?').bind(generation).first();
      if(existing){
        if(existing.status!=='loading'||
           (existing.base_generation||'')!==(active?.generation||'')||(existing.base_checksum||'')!==(active?.checksum||''))
          throw new Error('Synchronization changed while pending; discard its checkpoint and restart');
        if(existing.checksum!==checksum||existing.expected_count!==expectedCount){
          if(active){
            // A changed source during a *delta* needs a new delta plan.
            // In contrast, an initial import can reconcile against its own
            // staged rows without discarding the earlier 10,000+ uploads.
            return reply({ok:true,restart:true});
          }
          await db.batch([
            db.prepare('UPDATE portal_sync_runs SET checksum=?,expected_count=? WHERE generation=?')
              .bind(checksum,expectedCount,generation),
            // Recompute removals against the newest Sheet state. A previously
            // removed key may have been restored in the meantime.
            db.prepare('DELETE FROM portal_sync_deletes WHERE generation=?').bind(generation),
          ]);
        }
      }else{
        await cleanAbandoned(db,generation);
        await db.prepare('INSERT INTO portal_sync_runs(generation,checksum,expected_count,base_generation,base_checksum,started_at,status) VALUES(?,?,?,?,?,?,?)')
          .bind(generation,checksum,expectedCount,active?.generation||'',active?.checksum||'',new Date().toISOString(),'loading').run();
      }
      const existingCount=await count(db,'SELECT COUNT(*) AS count FROM portal_cache WHERE generation=?',active?.generation||generation);
      return reply({ok:true,skip:false,existingCount:existingCount,initial:!active});
    }
    const job=await db.prepare('SELECT * FROM portal_sync_runs WHERE generation=?').bind(generation).first();
    if(!job||job.status!=='loading')throw new Error('No active synchronization for this identifier');
    const active=await getActive(db);
    if((active?.generation||'')!==(job.base_generation||'')||(active?.checksum||'')!==(job.base_checksum||''))
      throw new Error('Active dataset changed during synchronization; restart from a fresh manifest');
    if(mode==='index'){
      const afterKind=clean(body.afterKind),afterKey=clean(body.afterKey);
      if(afterKind&&!KINDS.has(afterKind))throw new Error('Invalid fingerprint cursor');
      const found=await db.prepare(`SELECT kind,item_key AS key,record_hash AS hash FROM portal_cache
        WHERE generation=? AND (kind>? OR (kind=? AND item_key>?))
        ORDER BY kind,item_key LIMIT 1000`)
        .bind(job.base_generation||generation,afterKind,afterKind,afterKey).all();
      return reply({ok:true,rows:found.results||[]});
    }
    if(mode==='batch'){
      if(!Array.isArray(body.records)||body.records.length<1||body.records.length>50)throw new Error('Invalid batch size');
      const records=body.records;records.forEach(checkRecord);
      const digests=await Promise.all(records.map(rowHash));
      const sql=`INSERT OR REPLACE INTO portal_cache
        (generation,kind,item_key,email,thesis_id,stage,name,data_json,record_hash) VALUES (?,?,?,?,?,?,?,?,?)`;
      await db.batch(records.map((item,i)=>db.prepare(sql).bind(generation,item.kind,item.key,
        clean(item.email).toLowerCase(),clean(item.thesisId).toUpperCase(),clean(item.stage),clean(item.name),
        JSON.stringify(item.data),digests[i])));
      return reply({ok:true,received:records.length});
    }
    if(mode==='remove'){
      if(!Array.isArray(body.keys)||body.keys.length<1||body.keys.length>50)throw new Error('Invalid removal batch');
      body.keys.forEach(checkRemoval);
      await db.batch(body.keys.map(item=>db.prepare('INSERT OR IGNORE INTO portal_sync_deletes(generation,kind,item_key) VALUES(?,?,?)')
        .bind(generation,item.kind,item.key)));
      return reply({ok:true,received:body.keys.length});
    }
    if(mode==='commit'){
      const expectedUpserts=body.upserts,expectedDeletes=body.deletes;
      if(!Number.isInteger(expectedUpserts)||expectedUpserts<0||expectedUpserts>100000||
         !Number.isInteger(expectedDeletes)||expectedDeletes<0||expectedDeletes>100000)
        throw new Error('Missing or invalid delta manifest');
      const staged=await count(db,'SELECT COUNT(*) AS count FROM portal_cache WHERE generation=?',generation);
      const removals=await count(db,'SELECT COUNT(*) AS count FROM portal_sync_deletes WHERE generation=?',generation);
      if(staged!==expectedUpserts||removals!==expectedDeletes)
        throw new Error('Incomplete synchronization; the previous version remains active');
      const overlap=await count(db,`SELECT COUNT(*) AS count FROM portal_cache s
        JOIN portal_sync_deletes d ON d.generation=s.generation AND d.kind=s.kind AND d.item_key=s.item_key
        WHERE s.generation=?`,generation);
      if(active&&overlap)throw new Error('Conflicting update/removal for the same record');
      const projected=active?await count(db,`SELECT COUNT(*) AS count FROM (
        SELECT kind,item_key FROM portal_cache a WHERE a.generation=?
          AND NOT EXISTS (SELECT 1 FROM portal_sync_deletes d WHERE d.generation=? AND d.kind=a.kind AND d.item_key=a.item_key)
        UNION SELECT kind,item_key FROM portal_cache WHERE generation=?
      )`,active.generation,generation,generation):staged-removals;
      if(projected!==Number(job.expected_count))
        throw new Error('Record count mismatch; the previous version remains active');
      if(!active&&overlap!==removals)throw new Error('Removal record missing from staged import');
      const at=new Date().toISOString();
      if(!active){
        // First import, including resumptions: reconcile stale staged removals
        // then publish all remaining rows in one atomic transaction.
        await db.batch([
          db.prepare(`DELETE FROM portal_cache WHERE generation=? AND EXISTS (
            SELECT 1 FROM portal_sync_deletes d WHERE d.generation=?
              AND d.kind=portal_cache.kind AND d.item_key=portal_cache.item_key)`)
            .bind(generation,generation),
          db.prepare('INSERT INTO portal_active(id,generation,checksum,updated_at) VALUES(1,?,?,?)')
            .bind(generation,job.checksum,at),
          db.prepare('DELETE FROM portal_sync_deletes WHERE generation=?').bind(generation),
          db.prepare('DELETE FROM portal_sync_runs WHERE generation=?').bind(generation),
        ]);
      }else{
        // Cloudflare D1.batch is a single transaction; readers see all or none.
        await db.batch([
          db.prepare(`INSERT INTO portal_cache(generation,kind,item_key,email,thesis_id,stage,name,data_json,record_hash)
            SELECT ?,kind,item_key,email,thesis_id,stage,name,data_json,record_hash
              FROM portal_cache WHERE generation=?
            ON CONFLICT(generation,kind,item_key) DO UPDATE SET
              email=excluded.email,thesis_id=excluded.thesis_id,stage=excluded.stage,
              name=excluded.name,data_json=excluded.data_json,record_hash=excluded.record_hash`)
            .bind(active.generation,generation),
          db.prepare(`DELETE FROM portal_cache WHERE generation=? AND EXISTS (
            SELECT 1 FROM portal_sync_deletes d WHERE d.generation=?
              AND d.kind=portal_cache.kind AND d.item_key=portal_cache.item_key)`)
            .bind(active.generation,generation),
          db.prepare('UPDATE portal_active SET checksum=?,updated_at=? WHERE id=1 AND generation=? AND checksum=?')
            .bind(job.checksum,at,active.generation,active.checksum),
          db.prepare('DELETE FROM portal_cache WHERE generation=?').bind(generation),
          db.prepare('DELETE FROM portal_sync_deletes WHERE generation=?').bind(generation),
          db.prepare('DELETE FROM portal_sync_runs WHERE generation=?').bind(generation),
        ]);
      }
      return reply({ok:true,active:true,updatedAt:at,records:projected,upserts:staged,deletes:removals});
    }
    throw new Error('Unknown synchronization operation');
  }catch(error){return reply({ok:false,error:String(error.message||error)},400);}
}
