/**
 * Companion file for Code.gs. Add this as a SECOND Apps Script file.
 * Thesis Master stays authoritative; D1 is a replaceable read-only copy.
 * This runs every five minutes, including when old rows or IMPORTRANGE cells
 * change (events for recalculated formulas are not dependable).
 */
function d1Snapshot_() {
  refreshFacultyDirectory_(true);
  var faculty=facultyDirectory_(),students=students_(),groups=groups_(),allMarks=marks_(),content=academicInformation_(),records=[],seen={};
  function put(kind,key,data,email,thesisId,stage,name){
    key=String(key||'').trim();assert_(key&&key.length<240,'Invalid '+kind+' cache key');
    var identity=kind+'|'+key;assert_(!seen[identity],'Duplicate '+kind+' key in master: '+key);seen[identity]=true;
    records.push({kind:kind,key:key,email:String(email||'').toLowerCase(),thesisId:String(thesisId||''),stage:String(stage||''),name:String(name||''),data:data});
  }
  var normalizedFaculty={};
  faculty.forEach(function(f){
    var display=facultyDisplayName_((f.names||[])[0]||f.email);
    put('faculty',f.email,{email:f.email,name:display,names:f.names||[],initial:f.initial||'',designation:f.designation||'',room:f.room||'',status:f.status||''},f.email,'','',display);
    (f.names||[]).forEach(function(name){var key=facultyKey_(name);if(key){if(normalizedFaculty[key]&&normalizedFaculty[key]!==f.email)normalizedFaculty[key]='AMBIGUOUS';else if(!normalizedFaculty[key])normalizedFaculty[key]=f.email;}});
  });
  // Student IDs are unique records. Email addresses are only login indexes:
  // an upstream typo must not block a complete D1 snapshot or grant access
  // to an arbitrary student's private information.
  var byEmail={};
  students.forEach(function(s){
    put('student',s.id,{id:s.id,name:s.name,email:s.email,thesisId:s.thesisId,aliases:s.aliases||[],marks:allMarks[s.id]||{}},'',s.thesisId,'',s.name);
    [s.email].concat(s.aliases||[]).forEach(function(address){
      address=norm_(address);if(!validBracEmail_(address))return;
      if(!byEmail[address])byEmail[address]=[];
      if(byEmail[address].indexOf(s.id)<0)byEmail[address].push(s.id);
    });
  });
  var studentById={};students.forEach(function(s){studentById[s.id]=s;});
  var collisions=[];
  Object.keys(byEmail).sort().forEach(function(address){
    var ids=byEmail[address];
    if(ids.length>1){collisions.push({email:address,studentIds:ids});return;}
    var student=studentById[ids[0]];
    put('student_email',address,{studentId:student.id},address,student.thesisId,'','');
  });
  // The list remains visible in Apps Script > Project Settings > Script
  // Properties. Only unambiguous emails are eligible for student login.
  scriptProps_().setProperty('D1_EMAIL_COLLISION_COUNT',String(collisions.length));
  scriptProps_().setProperty('D1_EMAIL_COLLISIONS_JSON',JSON.stringify(collisions.slice(0,40)));
  if(collisions.length)Logger.log('D1 sync skipped ambiguous login emails ('+collisions.length+'): '+JSON.stringify(collisions.slice(0,40)));
  groups.forEach(function(g){
    var memberSlots=[{slot:'Supervisor 1',name:g.primarySupervisor,role:'Supervisor'},{slot:'Supervisor 2',name:g.secondarySupervisor,role:'Supervisor'},
      {slot:'Co-supervisor 1',name:g.coSupervisor1,role:'Co-Supervisor'},{slot:'Co-supervisor 2',name:g.coSupervisor2,role:'Co-Supervisor'}],contacts=[],assignments={};
    memberSlots.forEach(function(slot){
      var email=normalizedFaculty[facultyKey_(slot.name)]||'';
      if(email==='AMBIGUOUS')email='';
      var verified=faculty.filter(function(f){return f.email===email;})[0];
      contacts.push({slot:slot.slot,name:verified?facultyDisplayName_(verified.names[0]):slot.name||'',email:email,room:verified?verified.room||'':'',designation:verified?verified.designation||'':''});
      if(email){if(!assignments[email])assignments[email]=[];if(assignments[email].indexOf(slot.role)<0)assignments[email].push(slot.role);}
    });
    put('group',g.id,Object.assign({},g,{facultyContacts:contacts}), '',g.id,g.stage,g.title);
    Object.keys(assignments).forEach(function(email){put('assignment',email+'|'+g.id,{email:email,thesisId:g.id,myRoles:assignments[email]},email,g.id,g.stage,'');});
  });
  // Precompute the faculty directory so the website never has to scan the
  // full group master just to display the first page of faculty members.
  facultyList_(groups).forEach(function(item,index){
    put('faculty_list',item.email||'unmatched-'+index,item,item.email,'','',item.name);
  });
  adminEmails_().forEach(function(email){put('admin',email,{email:email},email,'','','');});
  content.deadlines.forEach(function(item){put('deadline',item.id,item,'', '',item.phase,item.title);});
  content.resources.forEach(function(item){put('resource',item.id,item,'', '',item.phase,item.title);});
  records.sort(function(a,b){return (a.kind+'|'+a.key).localeCompare(b.kind+'|'+b.key);});
  return records;
}

function d1Hash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(function(n){return ('0'+((n+256)%256).toString(16)).slice(-2);}).join('');
}
function d1Send_(url,secret,request) {
  var response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',headers:{'x-d1-sync-secret':secret},
    payload:JSON.stringify(request),muteHttpExceptions:true});
  var result;try{result=JSON.parse(response.getContentText());}catch(_){throw new Error('D1 returned an invalid response (HTTP '+response.getResponseCode()+')');}
  assert_(response.getResponseCode()===200&&result.ok===true,'D1 synchronization failed: '+String(result.error||response.getResponseCode()));
  return result;
}

function syncD1Now() {
  var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {skipped:true,reason:'Another synchronization is running'};
  try{
    // Apps Script executions have a finite runtime. Stop deliberately before
    // the limit, then resume this exact generation on the next scheduled run.
    var startedAt=Date.now(),maxRuntimeMs=4*60*1000;
    var url=prop_('D1_SYNC_URL'),secret=prop_('D1_SYNC_SECRET');
    assert_(secret.length>=32,'Set D1_SYNC_SECRET in Script Properties');
    assert_(/^https:\/\/[a-z0-9.-]+\/internal\/d1-sync$/i.test(url),'D1_SYNC_URL must be a trusted HTTPS portal sync endpoint');
    var records=d1Snapshot_(),checksum=d1Hash_(JSON.stringify(records));
    // D1 only allows 250 characters in denormalized search indexes. Some
    // thesis/resource titles are longer, but the complete value remains in
    // data_json. Keep the checksum based on the authoritative full records,
    // so an interrupted generation from the previous script can be resumed.
    var shortened=0;
    var wireRecords=records.map(function(record){
      ['email','thesisId','stage'].forEach(function(field){
        assert_(typeof record[field]==='string'&&record[field].length<=250,
          'D1 '+field+' index too long for '+record.kind+' '+record.key);
      });
      assert_(typeof record.name==='string','Invalid D1 name index for '+record.kind+' '+record.key);
      assert_(JSON.stringify(record.data).length<=45000,'D1 record data too large for '+record.kind+' '+record.key);
      if(record.name.length<=250)return record;
      shortened++;
      return Object.assign({},record,{name:record.name.slice(0,250)});
    });
    if(shortened)Logger.log('D1 shortened '+shortened+' search name indexes to 250 characters; full source values retained');
    var properties=scriptProps_();
    var pendingGeneration=prop_('D1_PENDING_GENERATION');
    var pendingChecksum=prop_('D1_PENDING_CHECKSUM');
    var pendingCursor=Number(prop_('D1_PENDING_CURSOR')||0);
    var resuming=pendingChecksum===checksum&&/^[a-zA-Z0-9_-]{16,100}$/.test(pendingGeneration)&&
      Number.isInteger(pendingCursor)&&pendingCursor>=0&&pendingCursor<=records.length;
    var generation=resuming?pendingGeneration:Utilities.getUuid().replace(/-/g,'');
    var cursor=resuming?pendingCursor:0;
    // Save the manifest before sending anything: an interrupted Apps Script
    // invocation can pick up without allocating another generation.
    properties.setProperty('D1_PENDING_GENERATION',generation);
    properties.setProperty('D1_PENDING_CHECKSUM',checksum);
    properties.setProperty('D1_PENDING_CURSOR',String(cursor));
    var start=d1Send_(url,secret,{mode:'start',generation:generation,checksum:checksum,expectedCount:records.length});
    if(!start.skip){
      for(var i=cursor;i<records.length;){
        var chunk=[],bytes=0;
        while(i<records.length&&chunk.length<50){
          var estimated=JSON.stringify(wireRecords[i]).length+2;
          if(chunk.length&&bytes+estimated>400000)break;
          chunk.push(wireRecords[i++]);bytes+=estimated;
        }
        d1Send_(url,secret,{mode:'batch',generation:generation,records:chunk});
        properties.setProperty('D1_PENDING_CURSOR',String(i));
        if(i<records.length&&Date.now()-startedAt>=maxRuntimeMs){
          Logger.log('D1 sync checkpoint: '+i+'/'+records.length+' records; next trigger resumes generation '+generation);
          return {synced:false,pending:true,imported:i,count:records.length,generation:generation};
        }
      }
      d1Send_(url,secret,{mode:'commit',generation:generation});
    }
    properties.deleteProperty('D1_PENDING_GENERATION');
    properties.deleteProperty('D1_PENDING_CHECKSUM');
    properties.deleteProperty('D1_PENDING_CURSOR');
    properties.setProperty('D1_LAST_CHECKSUM',checksum);
    properties.setProperty('D1_LAST_SYNC_AT',new Date().toISOString());
    Logger.log('D1 synchronization complete: '+records.length+' records; changed='+!start.skip);
    return {synced:true,count:records.length,changed:!start.skip};
  }finally{lock.releaseLock();}
}

/** Run once as Apps Script owner, after configuring D1_SYNC_URL and secret. */
function installD1Sync() {
  ScriptApp.getProjectTriggers().filter(function(trigger){return trigger.getHandlerFunction()==='syncD1Now';}).forEach(function(trigger){ScriptApp.deleteTrigger(trigger);});
  ScriptApp.newTrigger('syncD1Now').timeBased().everyMinutes(5).create();
  return syncD1Now();
}
