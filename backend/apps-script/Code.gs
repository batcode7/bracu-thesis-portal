/*
 * BRAC University Thesis Portal — Google Apps Script data gateway.
 * Deploy as owner-executed web app. Only a trusted, ID-token-verifying Worker
 * may call doPost; the shared bridge secret is a Script Property, never a URL.
 *
 * This project does NOT edit the university's source spreadsheets.
 */
var PRIME_ADMIN_EMAIL = 'partha.bhoumik@bracu.ac.bd';
var DEFAULT_MASTER_ID = '1Zx2ZJoFTHl8VVIxHklX6EXUVzTJuY1xwg3zVDSfclqU';
var DEFAULT_DEADLINES_ID = '1SkyO77YFde-N4bpxQ5lb07FH24hFINyR4JBgD47Xamk';
var DEFAULT_SOURCES = [{ semester: 'Summer 2026', spreadsheetId: '1Z882cDXwrQwuMgbSFF3CQmqyWXuAXq8U3Thn7569QTU' }];
var COMMENT_HEADERS = ['Semester','Phase','ThesisID','MemberKey','Score','Comment','Evaluator','SourceID','SyncedAt'];
var PHASE_INFO = {
  P1: { managerTab: 'P1_Panel', evaluatorTab: 'MarkSheet', first: 4, group: 3, member: 6, mark: 10, comment: 11, max: 5 },
  P2: { managerTab: 'P2_Panel', evaluatorTab: 'MarkSheet', first: 5, group: 3, member: 8, mark: 13, comment: 14, max: 10 },
  Defense: { managerTab: 'FT_Panel', evaluatorTab: 'Marksheet', first: 6, group: 5, member: 7, mark: 14, comment: 15, max: 30 }
};

function scriptProps_() { return PropertiesService.getScriptProperties(); }
function prop_(key, fallback) { return scriptProps_().getProperty(key) || fallback || ''; }
function jsonProp_(key, fallback) { try { var value = prop_(key); return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; } }
function setJsonProp_(key, value) { scriptProps_().setProperty(key, JSON.stringify(value)); }
function norm_(value) { return String(value === null || value === undefined ? '' : value).trim().toLowerCase(); }
function root_(email) { return norm_(email) === PRIME_ADMIN_EMAIL; }
function validBracEmail_(email) { return /^[a-z0-9._%+\-]+@(?:g\.)?bracu\.ac\.bd$/i.test(email); }
function refuse_(message) { throw new Error(message); }
function assert_(condition, message) { if (!condition) refuse_(message); }
function sameSecret_(supplied, expected) {
  if (typeof supplied !== 'string' || typeof expected !== 'string' || !expected || supplied.length !== expected.length) return false;
  var mismatch = 0; for (var i = 0; i < expected.length; i++) mismatch |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}
function isValidStudentId_(id) { return /^[0-9]{8}$/.test(String(id)); }
function isValidGroupId_(id) { return /^[TPI][0-9]{6,12}$/i.test(String(id)); }
function number_(value) { var str = String(value === undefined || value === null ? '' : value).trim(); return str && /^-?\d+(\.\d+)?$/.test(str) ? Number(str) : null; }
function rows_(id, tab, width) {
  var sheet = SpreadsheetApp.openById(id).getSheetByName(tab);
  assert_(sheet, 'Missing source tab: ' + tab);
  if (sheet.getLastRow() < 1) return [];
  return sheet.getRange(1, 1, sheet.getLastRow(), Math.min(width || sheet.getLastColumn(), sheet.getMaxColumns())).getDisplayValues();
}
function replaceRows_(sheet, data) {
  var width=COMMENT_HEADERS.length,required=Math.max(1,data.length+1);
  if(sheet.getMaxRows()<required)sheet.insertRowsAfter(sheet.getMaxRows(),required-sheet.getMaxRows());
  sheet.clearContents();sheet.getRange(1,1,1,width).setValues([COMMENT_HEADERS]);
  for(var offset=0;offset<data.length;offset+=500){var batch=data.slice(offset,offset+500);sheet.getRange(offset+2,1,batch.length,width).setValues(batch);}
}
function masterId_() { return prop_('MASTER_SHEET_ID', DEFAULT_MASTER_ID); }
function students_() {
  var aliases = jsonProp_('STUDENT_ALIASES_JSON', {});
  return rows_(masterId_(), 'All student info', 5).slice(1).filter(function(r){return isValidStudentId_(r[1]) && isValidGroupId_(r[3]);}).map(function(r){
    var stored = norm_(r[4]); var verified = Object.keys(aliases).filter(function(k){return String(aliases[k]) === String(r[1]);});
    return { id: String(r[1]), name: String(r[2] || ''), thesisId: String(r[3]), email: stored, aliases: verified };
  });
}
function groups_() {
  return rows_(masterId_(), 'Group info', 9).slice(1).filter(function(r){return isValidGroupId_(r[1]);}).map(function(r){
    return { id: String(r[1]), type: r[2] || 'Thesis', stage: r[3] || 'Unknown', primarySupervisor: r[4] || '', secondarySupervisor: r[5] || '', coSupervisor1: r[6] || '', coSupervisor2: r[7] || '', title: r[8] || '' };
  });
}
function marks_() {
  var result = {}; rows_(masterId_(), 'Marks', 19).slice(1).forEach(function(r){
    if (!isValidStudentId_(r[1])) return;
    var a = [number_(r[9]),number_(r[10]),number_(r[11])];
    result[String(r[1])] = { p1: number_(r[7]), p2: number_(r[8]), defense: a.every(function(x){return x !== null;}) ? a.reduce(function(x,y){return x+y;},0) : null, supervisor: number_(r[12]), total: number_(r[14]), grade: r[16] || '', finalCheck: r[17] || '', remarks: r[18] || '' };
  }); return result;
}
function sourceRegistry_() { return jsonProp_('SEMESTER_SOURCES_JSON', DEFAULT_SOURCES); }
function facultyDirectory_() { return jsonProp_('FACULTY_DIRECTORY_JSON', []); }
function adminEmails_() { return jsonProp_('ADMIN_EMAILS_JSON', []); }
function role_(email, studentRows) {
  if (root_(email)) return 'prime_admin';
  if (adminEmails_().some(function(item){return norm_(item) === email;})) return 'admin';
  if (facultyDirectory_().some(function(item){return norm_(item.email) === email;})) return 'supervisor';
  if (studentRows.some(function(item){return item.email === email || item.aliases.indexOf(email) >= 0;})) return 'student';
  return null;
}
function permission_(role, needed) { assert_(needed.indexOf(role) !== -1, 'Not authorized for this action'); }
function facultyGroups_(email, groupRows) {
  var faculty = facultyDirectory_().filter(function(f){return norm_(f.email) === email;})[0];
  if (!faculty) return [];
  var names = (faculty.names || []).map(norm_);
  return groupRows.filter(function(g){return [g.primarySupervisor,g.secondarySupervisor,g.coSupervisor1,g.coSupervisor2].some(function(name){return names.indexOf(norm_(name)) >= 0 && !!norm_(name);});});
}
function indexBook_() {
  var id = prop_('COMMENTS_INDEX_SHEET_ID');
  if (!id) {
    var created = SpreadsheetApp.create('BRACU Thesis Portal — Private Comment Index');
    var sheet = created.getSheets()[0]; sheet.setName('Comments'); sheet.getRange(1,1,1,COMMENT_HEADERS.length).setValues([COMMENT_HEADERS]);
    scriptProps_().setProperty('COMMENTS_INDEX_SHEET_ID', created.getId());
    return created;
  }
  return SpreadsheetApp.openById(id);
}
function comments_() {
  var id = prop_('COMMENTS_INDEX_SHEET_ID'); if (!id) return [];
  var sheet = SpreadsheetApp.openById(id).getSheetByName('Comments'); if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,COMMENT_HEADERS.length).getDisplayValues().map(function(r){return {semester:r[0],phase:r[1],thesisId:r[2],memberKey:norm_(r[3]),score:number_(r[4]),comment:String(r[5]||'').trim(),evaluator:r[6],sourceId:r[7],syncedAt:r[8]};});
}
function releases_() { return jsonProp_('RELEASED_PHASES_JSON', {}); }
function phaseEvaluations_(student, group, studentMarks, comments) {
  var released = releases_(); var result = [];
  ['P1','P2','Defense'].forEach(function(phase){
    var matching = comments.filter(function(c){return c.phase === phase && c.thesisId === group.id && (c.memberKey === student.id || c.memberKey === student.email || student.aliases.indexOf(c.memberKey) >= 0);});
    var semesters = []; matching.forEach(function(c){if(semesters.indexOf(c.semester) < 0) semesters.push(c.semester);});
    semesters.forEach(function(semester){
      var phaseRows = matching.filter(function(c){return c.semester === semester;});
      var feedback = phaseRows.filter(function(c){return !!c.comment && c.comment !== '-';});
      var key = semester + '|' + phase;
      var score = phase === 'P1' ? studentMarks.p1 : phase === 'P2' ? studentMarks.p2 : studentMarks.defense;
      var completeFeedback = phaseRows.length > 0 && phaseRows.every(function(c){return c.score !== null && !!c.comment && c.comment !== '-';});
      var published = !!released[key] && score !== null && score !== undefined && completeFeedback && feedback.length > 0;
      result.push({id:student.id+'|'+key,studentId:student.id,phase:phase,semester:semester,score:published?score:null,maxScore:PHASE_INFO[phase].max,comment:published?feedback.map(function(f){return f.evaluator+': '+f.comment;}).join('\n\n'):null,evaluator:published?feedback.map(function(f){return f.evaluator;}).join(', '):'',publication:published?'published':'pending'});
    });
    if (!semesters.length) result.push({id:student.id+'|'+phase,studentId:student.id,phase:phase,semester:'Not recorded',score:null,maxScore:PHASE_INFO[phase].max,comment:null,evaluator:'',publication:'pending'});
  });
  result.push({id:student.id+'|Supervisor',studentId:student.id,phase:'Supervisor',semester:'Not published',score:null,maxScore:55,comment:null,evaluator:'',publication:'pending'});
  return result;
}
function studentDashboard_(email, studentRows, groupRows) {
  var student = studentRows.filter(function(s){return s.email === email || s.aliases.indexOf(email) >= 0;})[0];
  assert_(student, 'Student record not matched to the signed-in BRAC email');
  var group = groupRows.filter(function(g){return g.id === student.thesisId;})[0]; assert_(group, 'Group not found');
  return { student: {id:student.id,name:student.name,email:email,thesisId:student.thesisId}, group: {id:group.id,title:group.title,type:group.type,stage:group.stage,primarySupervisor:group.primarySupervisor,secondarySupervisor:group.secondarySupervisor,members:studentRows.filter(function(s){return s.thesisId === group.id;}).map(function(s){return s.id;})},evaluations:phaseEvaluations_(student,group,marks_()[student.id]||{p1:null,p2:null,defense:null},comments_()) };
}
function supervisorDashboard_(email, studentRows, groupRows) {
  var authorized = facultyGroups_(email,groupRows); var ids = authorized.map(function(g){return g.id;}),allMarks=marks_();
  return { supervisorEmail:email,students:studentRows.filter(function(s){return ids.indexOf(s.thesisId)>=0;}).map(function(s){var m=allMarks[s.id]||{};return {id:s.id,name:s.name,email:s.email,thesisId:s.thesisId,progress:{p1:m.p1!==null&&m.p1!==undefined,p2:m.p2!==null&&m.p2!==undefined,defense:m.defense!==null&&m.defense!==undefined}};}),groups:authorized };
}
function adminSearch_(q, stage, type, studentRows, groupRows) {
  q = norm_(q); assert_(q.length <= 120,'Search text too long');
  var map = {},directory=facultyDirectory_(); groupRows.forEach(function(g){map[g.id]=g;});
  return studentRows.filter(function(s){
    var g=map[s.thesisId];if(!g) return false;
    if(stage && stage!=='All stages' && g.stage!==stage)return false;
    if(type && type!=='All types' && g.type!==type)return false;
    if(!q)return true;
    return [s.id,s.name,s.email,g.id,g.title,g.primarySupervisor,g.secondarySupervisor,g.coSupervisor1,g.coSupervisor2].some(function(v){return norm_(v).indexOf(q)>=0;}) || directory.some(function(f){return norm_(f.initial)===q && (f.names||[]).map(norm_).some(function(name){return [g.primarySupervisor,g.secondarySupervisor,g.coSupervisor1,g.coSupervisor2].map(norm_).indexOf(name)>=0;});});
  }).slice(0,100).map(function(s){return {student:{id:s.id,name:s.name,email:s.email,thesisId:s.thesisId},group:map[s.thesisId]};});
}
function adminDetail_(studentId, studentRows, groupRows) {
  var s=studentRows.filter(function(x){return x.id===String(studentId);})[0]; assert_(s,'Student ID not found');
  var group=groupRows.filter(function(g){return g.id===s.thesisId;})[0];assert_(group,'Group not found');
  return {student:{id:s.id,name:s.name,email:s.email,thesisId:s.thesisId},group:group,members:studentRows.filter(function(x){return x.thesisId===group.id;}).map(function(x){return {id:x.id,name:x.name,email:x.email};}),marks:marks_()[s.id]||{},evaluations:phaseEvaluations_(s,group,marks_()[s.id]||{p1:null,p2:null,defense:null},comments_())};
}
function deadlineLinks_() {
  var sheet = SpreadsheetApp.openById(prop_('DEADLINE_SHEET_ID',DEFAULT_DEADLINES_ID)).getSheetByName('Deadlines and Links');
  assert_(sheet,'Deadline tab missing');var last=sheet.getLastRow();if(last<2)return [];
  var range=sheet.getRange(2,1,last-1,6),rows=range.getDisplayValues(),rich=range.getRichTextValues(),lastStage='',result=[];
  rows.forEach(function(r,i){
    if(r[0])lastStage=r[0];if(!r[1])return;
    var link=(rich[i][5]&&rich[i][5].getLinkUrl())||(rich[i][2]&&rich[i][2].getLinkUrl())||'';
    if(link && !/^https:\/\//i.test(link))link='';
    result.push({id:String(i+2),phase:lastStage,title:r[1],day:r[2],date:r[3],status:r[4]||'Reference',action:r[5]||r[2]||'View',url:link});
  });return result;
}
function summary_(studentRows) {
  var released=releases_(),rows=comments_(),keyMap={},semesterMap={},byStudent={},lookups={},allMarks=marks_();
  studentRows.forEach(function(s){
    [s.id,s.email].concat(s.aliases).forEach(function(member){if(member)lookups[s.thesisId+'|'+norm_(member)]=s.id;});
  });
  rows.forEach(function(c){
    if(!released[c.semester+'|'+c.phase])return;
    var id=lookups[c.thesisId+'|'+c.memberKey];if(!id)return;
    var key=c.semester+'|'+c.phase+'|'+id;
    if(!byStudent[key])byStudent[key]={studentId:id,thesisId:c.thesisId,semester:c.semester,phase:c.phase,complete:true};
    if(!c.comment||c.comment==='-'||c.score===null)byStudent[key].complete=false;
  });
  Object.keys(byStudent).forEach(function(key){
    var record=byStudent[key],m=allMarks[record.studentId]||{};
    var official=record.phase==='P1'?m.p1:record.phase==='P2'?m.p2:m.defense;
    if(!record.complete||official===null||official===undefined)return;
    var phaseKey=record.semester+'|'+record.phase;
    if(!keyMap[phaseKey])keyMap[phaseKey]={students:{},groups:{}};
    if(!semesterMap[record.semester])semesterMap[record.semester]={students:{},groups:{}};
    keyMap[phaseKey].students[record.studentId]=true;keyMap[phaseKey].groups[record.thesisId]=true;
    semesterMap[record.semester].students[record.studentId]=true;semesterMap[record.semester].groups[record.thesisId]=true;
  });
  return sourceRegistry_().map(function(source){
    var semester=semesterMap[source.semester],obj={semester:source.semester,students:semester?Object.keys(semester.students).length:0,groups:semester?Object.keys(semester.groups).length:0};
    ['P1','P2','Defense'].forEach(function(p){var record=keyMap[source.semester+'|'+p];obj[p]={students:record?Object.keys(record.students).length:0,groups:record?Object.keys(record.groups).length:0};});return obj;
  });
}
function listPanelLinks_(managerId,phase) {
  var sheet=SpreadsheetApp.openById(managerId).getSheetByName(PHASE_INFO[phase].managerTab);assert_(sheet,'Panel source missing');
  var last=sheet.getLastRow();if(last<2)return [];
  var linkRows=sheet.getRange(1,6,last,4).getDisplayValues(),found={},list=[];
  linkRows.forEach(function(r){var match=String(r[3]||'').match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);if(!match||found[match[1]])return;found[match[1]]=true;list.push({spreadsheetId:match[1],evaluator:r[0]||'Faculty evaluator'});});return list;
}
function readEvaluator_(entry,phase,semester) {
  var cfg=PHASE_INFO[phase],book=SpreadsheetApp.openById(entry.spreadsheetId),sheet=book.getSheetByName(cfg.evaluatorTab);
  if(!sheet)throw new Error('Evaluator MarkSheet missing');
  var last=sheet.getLastRow();if(last<cfg.first)return [];
  var rows=sheet.getRange(cfg.first,1,last-cfg.first+1,Math.max(cfg.comment,cfg.member,cfg.mark)).getDisplayValues();
  var groupId='', groupFeedback='', output=[],now=new Date().toISOString();
  rows.forEach(function(r){
    if(isValidGroupId_(r[cfg.group-1])){groupId=String(r[cfg.group-1]);groupFeedback='';}
    var member=norm_(r[cfg.member-1]);if(!groupId || !member)return;
    if(phase==='Defense'&&!isValidStudentId_(member))return;
    if(phase!=='Defense'&&member.indexOf('@')<0)return;
    var comment=String(r[cfg.comment-1]||'').trim(),mark=number_(r[cfg.mark-1]);
    if(phase==='P1'){if(comment)groupFeedback=comment;if(!comment)comment=groupFeedback;}
    if(mark===null&&!comment)return;
    output.push([semester,phase,groupId,member,mark===null?'':mark,comment,entry.evaluator,entry.spreadsheetId,now]);
  });return output;
}
function syncPhase_(semester,phase) {
  assert_(PHASE_INFO[phase],'Invalid phase');var source=sourceRegistry_().filter(function(s){return s.semester===semester;})[0];assert_(source,'Semester not registered');
  var lock=LockService.getScriptLock();assert_(lock.tryLock(5000),'Another sync is running');
  try {
    var key='SYNC_'+semester.replace(/[^a-z0-9]/gi,'_')+'_'+phase;
    var state=jsonProp_(key,null),book=indexBook_(),sheet;
    if(!state){var pending='Stage_'+new Date().getTime();sheet=book.insertSheet(pending);sheet.getRange(1,1,1,COMMENT_HEADERS.length).setValues([COMMENT_HEADERS]);state={sheet:pending,position:0};}
    else sheet=book.getSheetByName(state.sheet);
    assert_(sheet,'Sync state sheet missing');
    var links=listPanelLinks_(source.spreadsheetId,phase),end=Math.min(links.length,state.position+8),items=[],errors=[];
    for(var i=state.position;i<end;i++){
      try{items=items.concat(readEvaluator_(links[i],phase,semester));}
      catch(err){errors.push('Evaluator '+(i+1)+': '+String(err.message||err));}
    }
    if(items.length)sheet.getRange(sheet.getLastRow()+1,1,items.length,COMMENT_HEADERS.length).setValues(items);
    state.position=end;state.errors=(state.errors||[]).concat(errors).slice(-20);
    if(end<links.length){setJsonProp_(key,state);return {complete:false,processed:end,total:links.length,errors:state.errors};}
    if(state.errors.length){setJsonProp_(key,state);return {complete:false,processed:end,total:links.length,errors:state.errors,message:'Fix inaccessible evaluator sheets before promoting this snapshot'};}
    var main=book.getSheetByName('Comments'),existing=comments_().filter(function(c){return !(c.semester===semester&&c.phase===phase);}).map(function(c){return [c.semester,c.phase,c.thesisId,c.memberKey,c.score===null?'':c.score,c.comment,c.evaluator,c.sourceId,c.syncedAt];});
    var staged=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,COMMENT_HEADERS.length).getDisplayValues():[];
    replaceRows_(main,existing.concat(staged));
    // A refreshed import must be explicitly reviewed and re-published.
    var releaseFlags=releases_();releaseFlags[semester+'|'+phase]=false;setJsonProp_('RELEASED_PHASES_JSON',releaseFlags);
    book.deleteSheet(sheet);scriptProps_().deleteProperty(key);
    return {complete:true,processed:links.length,total:links.length,imported:staged.length};
  } finally {lock.releaseLock();}
}
function restartSync_(semester,phase) {
  assert_(PHASE_INFO[phase]&&sourceRegistry_().some(function(s){return s.semester===semester;}),'Unknown semester or phase');
  var key='SYNC_'+semester.replace(/[^a-z0-9]/gi,'_')+'_'+phase;
  var lock=LockService.getScriptLock();assert_(lock.tryLock(5000),'Another sync is running');
  try{var state=jsonProp_(key,null);if(state){var book=indexBook_(),sheet=book.getSheetByName(state.sheet);if(sheet)book.deleteSheet(sheet);}scriptProps_().deleteProperty(key);return {restarted:true};}finally{lock.releaseLock();}
}
function request_(body) {
  var principal=body.principal||{},email=norm_(principal.email);
  assert_(!!principal.sub && validBracEmail_(email),'A verified BRAC identity is required');
  var studentRows=students_(),groupRows=groups_(),role=role_(email,studentRows);assert_(role,'Account is not authorized');
  var action=String(body.action||''),p=body.payload||{};
  if(action==='session')return {role:role,email:email,name:principal.name||email};
  if(action==='student'){permission_(role,['student']);return studentDashboard_(email,studentRows,groupRows);}
  if(action==='supervisor'){permission_(role,['supervisor']);return supervisorDashboard_(email,studentRows,groupRows);}
  if(action==='deadlines')return {entries:deadlineLinks_()};
  if(action==='search'){permission_(role,['admin','prime_admin']);return {rows:adminSearch_(p.q,p.stage,p.type,studentRows,groupRows)};}
  if(action==='detail'){permission_(role,['admin','prime_admin']);return adminDetail_(p.studentId,studentRows,groupRows);}
  if(action==='summary'){permission_(role,['admin','prime_admin']);return {semesters:summary_(studentRows)};}
  if(action==='registry'){permission_(role,['admin','prime_admin']);return {sources:sourceRegistry_(),releases:releases_()};}
  if(action==='admins'){permission_(role,['prime_admin']);return {admins:adminEmails_()};}
  if(action==='aliases'){permission_(role,['prime_admin']);return {aliases:jsonProp_('STUDENT_ALIASES_JSON',{})};}
  if(action==='setAlias'||action==='removeAlias'){
    permission_(role,['prime_admin']);var aliasEmail=norm_(p.email),studentId=String(p.studentId||'').trim();
    assert_(validBracEmail_(aliasEmail),'Invalid university email');
    var aliases=jsonProp_('STUDENT_ALIASES_JSON',{});
    if(action==='setAlias'){
      assert_(isValidStudentId_(studentId)&&studentRows.some(function(s){return s.id===studentId;}),'Student ID not found');
      assert_(!studentRows.some(function(s){return s.email===aliasEmail&&s.id!==studentId;}),'Email is assigned to another student');
      aliases[aliasEmail]=studentId;
    }else{delete aliases[aliasEmail];}
    setJsonProp_('STUDENT_ALIASES_JSON',aliases);return {aliases:aliases};
  }
  if(action==='addAdmin'||action==='removeAdmin'){
    permission_(role,['prime_admin']);var target=norm_(p.email);assert_(validBracEmail_(target)&&!root_(target),'Invalid administrator email');
    var admins=adminEmails_().filter(function(x){return norm_(x)!==target;});if(action==='addAdmin')admins.push(target);
    setJsonProp_('ADMIN_EMAILS_JSON',admins);return {admins:admins};
  }
  if(action==='faculty'){permission_(role,['prime_admin']);return {faculty:facultyDirectory_()};}
  if(action==='setFaculty'){
    permission_(role,['prime_admin']);var facEmail=norm_(p.email),name=String(p.name||'').trim(),initial=String(p.initial||'').trim().toUpperCase();
    assert_(validBracEmail_(facEmail)&&name.length>3&&name.length<180&&/^[A-Z0-9]{2,10}$/.test(initial),'Invalid faculty mapping');
    var directory=facultyDirectory_().filter(function(x){return norm_(x.email)!==facEmail;});directory.push({email:facEmail,names:[name],initial:initial});setJsonProp_('FACULTY_DIRECTORY_JSON',directory);return {faculty:directory};
  }
  if(action==='registerSemester'){
    permission_(role,['admin','prime_admin']);var sem=String(p.semester||'').trim(),id=String(p.spreadsheetId||'').trim();
    assert_(/^(Spring|Summer|Fall) 20\d\d$/.test(sem)&&/^[\w-]{25,100}$/.test(id),'Invalid semester source');
    var sources=sourceRegistry_(),prior=sources.filter(function(s){return s.semester===sem;})[0];
    assert_(!prior||prior.spreadsheetId===id,'Semester already registered; existing historical source cannot be overwritten');
    if(!prior){SpreadsheetApp.openById(id);sources.push({semester:sem,spreadsheetId:id});setJsonProp_('SEMESTER_SOURCES_JSON',sources);}
    return {sources:sources};
  }
  if(action==='sync'){permission_(role,['admin','prime_admin']);return syncPhase_(String(p.semester||''),String(p.phase||''));}
  if(action==='restartSync'){permission_(role,['admin','prime_admin']);return restartSync_(String(p.semester||''),String(p.phase||''));}
  if(action==='release'){
    permission_(role,['admin','prime_admin']);var releasePhase=String(p.phase||''),releaseSemester=String(p.semester||'');
    assert_(!!PHASE_INFO[releasePhase]&&sourceRegistry_().some(function(s){return s.semester===releaseSemester;}),'Unknown semester or phase');
    var published=releases_();
    if(p.published){
      var semesterRows=comments_().filter(function(c){return c.semester===releaseSemester&&c.phase===releasePhase;});
      assert_(semesterRows.length>0,'Synchronize this semester and phase before publishing');
      assert_(semesterRows.every(function(c){return c.score!==null&&!!c.comment&&c.comment!=='-';}),'Every evaluator record needs a mark and a comment before phase publication');
    }
    published[releaseSemester+'|'+releasePhase]=!!p.published;setJsonProp_('RELEASED_PHASES_JSON',published);return {releases:published};
  }
  refuse_('Unknown API action');
}
function doPost(e) {
  try {
    var raw=(e&&e.postData&&e.postData.contents)||'';assert_(raw.length<24000,'Request too large');
    var body=JSON.parse(raw),expected=prop_('BRIDGE_SECRET');
    assert_(expected.length>=32&&sameSecret_(body.secret,expected),'Unauthorized bridge');
    var data=request_(body);return ContentService.createTextOutput(JSON.stringify({ok:true,data:data})).setMimeType(ContentService.MimeType.JSON);
  }catch(err){return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(err.message||err)})).setMimeType(ContentService.MimeType.JSON);}
}
function doGet() { return ContentService.createTextOutput('Not available'); }
