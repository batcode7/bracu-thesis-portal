/*
 * BRAC University Thesis Portal — Google Apps Script data gateway.
 * Deploy as owner-executed web app. Only a trusted, ID-token-verifying Worker
 * may call doPost; the shared bridge secret is a Script Property, never a URL.
 *
 * This project does NOT edit the university's source spreadsheets.
 */
// Initial administrator for existing deployments. Once ADMIN_ROLE_LIST_JSON is
// written, every administrator is governed by the same editable role list.
var BOOTSTRAP_ADMIN_EMAIL = 'partha.bhoumik@bracu.ac.bd';
var DEFAULT_MASTER_ID = '1Zx2ZJoFTHl8VVIxHklX6EXUVzTJuY1xwg3zVDSfclqU';
var DEFAULT_DEADLINES_ID = '1SkyO77YFde-N4bpxQ5lb07FH24hFINyR4JBgD47Xamk';
var COMMENT_HEADERS = ['Semester','Phase','ThesisID','MemberKey','Score','Comment','Evaluator','SourceID','SyncedAt'];
var ANNOUNCEMENT_HEADERS = ['ID','Kind','Title','Body','EventDate','Location','URL','Pinned','Status','CreatedAt','UpdatedAt','Author'];
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
// Honorifics and innocuous punctuation do not create new identities. A matching
// name must still resolve to exactly ONE official directory email.
function facultyKey_(value) {
  return String(value||'').normalize('NFKC').trim().replace(/^(?:(?:mr|mrs|ms|miss|dr|prof|professor)\.?\s+)+/gi,'')
    .replace(/[.\u2019']/g,'').replace(/\s+/g,' ').trim().toLowerCase();
}
function facultyDisplayName_(value) {
  // Presentation only: leave Dr. and Prof. intact, never alter verified identities.
  return String(value||'').trim().replace(/^(?:(?:mr|mrs|ms|miss)\.?\s+)+/gi,'').trim();
}
function facultyDisplaySortKey_(value) { return facultyDisplayName_(value).replace(/^(?:(?:dr|prof|professor)\.?\s+)+/gi,'').toLowerCase(); }
function facultyMatches_(name,directory) {
  var key=facultyKey_(name);if(!key)return [];
  return directory.filter(function(f){return (f.names||[]).some(function(n){return facultyKey_(n)===key;});});
}
function verifiedFaculty_(name,directory) {
  var matches=facultyMatches_(name,directory);return matches.length===1?matches[0]:null;
}
function adminEmails_() {
  // Migrate the original admin, older regular admins, and delegated prime admins.
  // The new property is authoritative after the first edit; the founder can
  // then be removed without reappearing through a legacy fallback property.
  var saved=jsonProp_('ADMIN_ROLE_LIST_JSON',null);
  var oldAdmins=jsonProp_('ADMIN_EMAILS_JSON',[]);
  var oldPrimeAdmins=jsonProp_('PRIME_ADMIN_EMAILS_JSON',[]);
  var list=Array.isArray(saved)?saved:[BOOTSTRAP_ADMIN_EMAIL]
    .concat(Array.isArray(oldAdmins)?oldAdmins:[],Array.isArray(oldPrimeAdmins)?oldPrimeAdmins:[]);
  return list.map(norm_).filter(function(e,i,a){return validBracEmail_(e)&&a.indexOf(e)===i;});
}
function isAdmin_(email) { return adminEmails_().indexOf(norm_(email))>=0; }
function validBracEmail_(email) { return /^[a-z0-9._%+\-]+@(?:g\.)?bracu\.ac\.bd$/i.test(email); }
function refuse_(message) { throw new Error(message); }
function assert_(condition, message) { if (!condition) refuse_(message); }
function sameSecret_(supplied, expected) {
  if (typeof supplied !== 'string' || typeof expected !== 'string' || !expected || supplied.length !== expected.length) return false;
  var mismatch = 0; for (var i = 0; i < expected.length; i++) mismatch |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}
function isValidStudentId_(id) { return /^[0-9]{8}$/.test(String(id).trim()); }
function isValidGroupId_(id) { return /^[TPI][0-9]{6,12}$/i.test(String(id)); }
function groupId_(value) {return String(value===undefined||value===null?'':value).trim().toUpperCase().replace(/\s+/g,'');}
function stageBucket_(stage) {
  var s=norm_(stage).replace(/[\s_-]+/g,'');
  if(/^(prethesis1|p1|pre1)$/.test(s))return 'P1';
  if(/^(prethesis2|p2|pre2)$/.test(s))return 'P2';
  if(/early/.test(s)&&/(def|final|thesis)/.test(s))return 'Defense';
  if(/(final|defense|defence|ft)/.test(s))return 'Defense';
  if(/(complete|finished|graduat)/.test(s))return 'Completed';
  return 'Other';
}
function deadlineStage_(stage) {
  var s=norm_(stage).replace(/[\s_-]+/g,'');
  if(/early/.test(s)&&/(def|final|thesis)/.test(s))return 'Early Defense';
  return stageBucket_(stage);
}
function deadlinePhase_(entry) {
  if(entry.phase==='Early Defense'||(entry.phase==='Defense'&&/^\s*early\s*(?:defen[cs]e|def|final)/i.test(entry.title||'')))return 'Early Defense';
  return entry.phase;
}
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
  return rows_(masterId_(), 'All student info', 5).slice(1).filter(function(r){return isValidStudentId_(r[1]);}).map(function(r){
    var stored = norm_(r[4]); var verified = Object.keys(aliases).filter(function(k){return String(aliases[k]) === String(r[1]);});
    return { id: String(r[1]).trim(), name: String(r[2] || ''), thesisId: groupId_(r[3]), email: stored, aliases: verified };
  });
}
// Group-wide feedback is already consolidated into Thesis Master. A formula's
// placeholder/error must never be presented as actual panel feedback.
function masterComment_(value) {
  var comment=String(value===undefined||value===null?'':value).trim();
  if(!comment||comment==='-'||/^#(?:REF!|N\/A|VALUE!|ERROR!|NAME\?|DIV\/0!)/i.test(comment))return '';
  if(/^no comments(?:\.|\b)/i.test(comment)||/^panel manager link missing\b/i.test(comment))return '';
  return comment;
}
function groups_() {
  // Group info: B = ThesisID, I = Title, J = Abstract, K:P = phase semesters/comments.
  return rows_(masterId_(), 'Group info', 16).slice(1).filter(function(r){return isValidGroupId_(groupId_(r[1]));}).map(function(r){
    return { id: groupId_(r[1]), type: r[2] || 'Thesis', stage: r[3] || 'Unknown', primarySupervisor: r[4] || '', secondarySupervisor: r[5] || '', coSupervisor1: r[6] || '', coSupervisor2: r[7] || '', title: r[8] || '', abstract: String(r[9] || '').trim(),
      phaseSemesters: {P1:String(r[10]||'').trim(),P2:String(r[12]||'').trim(),Defense:String(r[14]||'').trim()},
      phaseComments: {P1:masterComment_(r[11]),P2:masterComment_(r[13]),Defense:masterComment_(r[15])} };
  });
}
function marks_() {
  var result = {}; rows_(masterId_(), 'Marks', 19).slice(1).forEach(function(r){
    if (!isValidStudentId_(r[1])) return;
    var a = [number_(r[9]),number_(r[10]),number_(r[11])];
    result[String(r[1])] = { p1: number_(r[7]), p2: number_(r[8]), defense: a.every(function(x){return x !== null;}) ? a.reduce(function(x,y){return x+y;},0) : null, supervisor: number_(r[12]), total: number_(r[14]), grade: r[16] || '', finalCheck: r[17] || '', remarks: r[18] || '' };
  }); return result;
}
function semesterName_(value) {
  var match=String(value||'').trim().match(/^(Spring|Summer|Fall)\s*(20)?(\d{2})$/i);
  if(!match)return '';
  return match[1].charAt(0).toUpperCase()+match[1].slice(1).toLowerCase()+' 20'+match[3];
}
function sourceRegistry_() {
  // Always read the master registry: admins do not register links via the portal.
  var result=[],seen={};
  rows_(masterId_(),'Panel Manager Links',2).slice(1).forEach(function(r){
    var semester=semesterName_(r[0]),url=String(r[1]||'').trim();
    var match=url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{25,100})(?:\/|$)/i);
    if(!semester||!match||seen[semester])return;
    seen[semester]=true;result.push({semester:semester,spreadsheetId:match[1]});
  });
  return result;
}
// Thesis Master → Faculty Details is the authoritative faculty directory:
// A initial, B name, C designation, D employment status, E room, F email.
// Snapshot it privately; ordinary sign-in and search never rescan the sheet.
function autoFaculty_() {
  // One PropertiesService read is materially faster than one read per chunk.
  var properties=scriptProps_().getProperties(),count=Number(properties.FACULTY_AUTO_PARTS||'0'),parts=[];
  if(!Number.isInteger(count)||count<1||count>100)return [];
  for(var i=0;i<count;i++){var part=properties['FACULTY_AUTO_'+i];if(!part)return [];parts.push(part);}
  try { var parsed=JSON.parse(parts.join(''));return Array.isArray(parsed)?parsed:[]; } catch(_){return [];}
}
function storeAutoFaculty_(items) {
  var properties=scriptProps_(),previous=Number(prop_('FACULTY_AUTO_PARTS','0'))||0;
  var raw=JSON.stringify(items),parts=[];
  for(var i=0;i<raw.length;i+=3000)parts.push(raw.slice(i,i+3000));
  for(var j=0;j<parts.length;j++)properties.setProperty('FACULTY_AUTO_'+j,parts[j]);
  for(var k=parts.length;k<previous;k++)properties.deleteProperty('FACULTY_AUTO_'+k);
  properties.setProperty('FACULTY_AUTO_PARTS',String(parts.length));
  properties.setProperty('FACULTY_AUTO_UPDATED',new Date().toISOString());
}
function facultyDirectory_() {
  var byEmail={};
  autoFaculty_().concat(jsonProp_('FACULTY_DIRECTORY_JSON',[])).forEach(function(f){
    var email=norm_(f.email);if(!validBracEmail_(email)||email.indexOf('@g.')>=0)return;
    if(!byEmail[email])byEmail[email]={email:email,names:[],initial:String(f.initial||'').trim(),designation:f.designation||'',status:f.status||'',room:f.room||'',sourceRow:f.sourceRow||null};
    (f.names||[]).forEach(function(name){name=String(name||'').trim();if(name&&!byEmail[email].names.some(function(n){return norm_(n)===norm_(name);}))byEmail[email].names.push(name);});
    if(!byEmail[email].initial&&f.initial)byEmail[email].initial=String(f.initial);
  });
  return Object.keys(byEmail).sort().map(function(email){return byEmail[email];});
}
function refreshFacultyDirectory_(force) {
  var updated=Date.parse(prop_('FACULTY_AUTO_UPDATED',''))||0;
  var cached=autoFaculty_();
  if(!force && cached.length && Date.now()-updated<5*60*1000)return cached;
  var book=SpreadsheetApp.openById(masterId_()),sheet=book.getSheetByName('Faculty Details');
  assert_(sheet,'Faculty Details tab is missing');
  var rows=sheet.getLastRow()>1?sheet.getRange(1,1,sheet.getLastRow(),6).getDisplayValues():[];
  assert_(rows.length && norm_(rows[0][0])==='initial' && norm_(rows[0][1])==='name' && norm_(rows[0][5])==='email','Faculty directory headers have changed');
  var records={};
  rows.slice(1).forEach(function(r,index){
    var name=String(r[1]||'').trim(),email=norm_(r[5]);
    if(!name||!validBracEmail_(email)||email.indexOf('@g.')>=0)return;
    if(!records[email])records[email]={email:email,names:[],initial:String(r[0]||'').trim().toUpperCase(),designation:String(r[2]||'').trim(),status:String(r[3]||'').trim(),room:String(r[4]||'').trim(),sourceRow:index+2};
    if(!records[email].names.some(function(n){return norm_(n)===norm_(name);}))records[email].names.push(name);
  });
  var items=Object.keys(records).sort().map(function(email){return records[email];});
  storeAutoFaculty_(items);return items;
}
// Run once as the Apps Script owner after deploying a new version. Afterwards
// the faculty snapshot refreshes automatically, without maintaining mappings.
function installFacultyDirectorySync() {
  ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='refreshFacultyDirectoryScheduled_';}).forEach(function(t){ScriptApp.deleteTrigger(t);});
  ScriptApp.newTrigger('refreshFacultyDirectoryScheduled_').timeBased().everyHours(1).create();
  return refreshFacultyDirectory_(true).length;
}
function refreshFacultyDirectoryScheduled_() { refreshFacultyDirectory_(true); }
function facultyList_(groupRows) {
  var faculty=facultyDirectory_(),byName={},counts={},missing={};
  faculty.forEach(function(f){
    counts[f.email]={};
    (f.names||[]).forEach(function(name){
      var key=facultyKey_(name);if(!key)return;
      if(!byName[key])byName[key]={emails:{},count:0};
      if(!byName[key].emails[f.email]){byName[key].emails[f.email]=true;byName[key].count++;}
    });
  });
  groupRows.forEach(function(g){
    [g.primarySupervisor,g.secondarySupervisor,g.coSupervisor1,g.coSupervisor2].forEach(function(raw){
      var name=String(raw||'').trim(),key=facultyKey_(name);if(!key)return;
      var entry=byName[key];
      if(entry&&entry.count===1){counts[Object.keys(entry.emails)[0]][g.id]=true;return;}
      if(!missing[key])missing[key]={name:name,ambiguous:!!entry,ids:{}};
      missing[key].ids[g.id]=true;
    });
  });
  var rows=faculty.map(function(f){return {
    name:f.names[0]||f.email,email:f.email,initial:f.initial||'',designation:f.designation||'',
    status:f.status||'',room:f.room||'',aliases:f.names.slice(1),groups:Object.keys(counts[f.email]).length,source:'Faculty Details'
  };});
  Object.keys(missing).sort().forEach(function(key){var item=missing[key];rows.push({
    name:item.name,email:'',initial:'',designation:'',status:'',room:'',aliases:[],
    groups:Object.keys(item.ids).length,source:item.ambiguous?'Group info · ambiguous faculty name':'Group info · not matched'
  });});
  return rows.sort(function(a,b){return a.name.localeCompare(b.name);});
}
function roles_(email,studentRows) {
  var roles=[];
  if(isAdmin_(email))roles.push('admin');
  if(facultyDirectory_().some(function(item){return norm_(item.email)===email;}))roles.push('supervisor');
  // A verified email must resolve to exactly one Student ID. The upstream
  // source may reuse an email for multiple IDs; never pick the first student.
  var studentIds={};
  studentRows.forEach(function(item){
    if(item.email===email||(item.aliases||[]).indexOf(email)>=0)studentIds[item.id]=true;
  });
  if(Object.keys(studentIds).length===1)roles.push('student');
  return roles;
}
function role_(email,studentRows) { return roles_(email,studentRows)[0]||null; }
function permission_(role, needed) { assert_(needed.indexOf(role) !== -1, 'Not authorized for this action'); }
function auditPreview_(actor,role,target) {
  var events=jsonProp_('ADMIN_PREVIEW_AUDIT_JSON',[]);
  events.push({at:new Date().toISOString(),actor:actor,role:role,target:target});
  setJsonProp_('ADMIN_PREVIEW_AUDIT_JSON',events.slice(-24));
}
function facultyGroups_(email, groupRows) {
  var directory=facultyDirectory_(),faculty = directory.filter(function(f){return norm_(f.email) === email;})[0];
  if (!faculty) return [];
  var seen={};return groupRows.filter(function(g){if(seen[g.id])return false;var assigned=[g.primarySupervisor,g.secondarySupervisor,g.coSupervisor1,g.coSupervisor2].some(function(name){var match=verifiedFaculty_(name,directory);return !!match&&match.email===email;});if(assigned)seen[g.id]=true;return assigned;});
}
function groupAssignmentRoles_(email,group,directory) {
  function assigned(name){var match=verifiedFaculty_(name,directory);return !!match&&match.email===email;}
  var roles=[];
  if(assigned(group.primarySupervisor)||assigned(group.secondarySupervisor))roles.push('Supervisor');
  if(assigned(group.coSupervisor1)||assigned(group.coSupervisor2))roles.push('Co-Supervisor');
  return roles;
}
function facultyAuditSheet_() {
  var id=prop_('FACULTY_AUDIT_SHEET_ID'),book;
  if(!id){book=SpreadsheetApp.create('BRACU Thesis Portal — Faculty Edit Audit');scriptProps_().setProperty('FACULTY_AUDIT_SHEET_ID',book.getId());
    var first=book.getSheets()[0];first.setName('FacultyEdits');first.getRange(1,1,1,7).setValues([['Timestamp','Editor','Faculty Email','Source Row','Field','Old Value','New Value']]);return first;}
  book=SpreadsheetApp.openById(id);var sheet=book.getSheetByName('FacultyEdits');assert_(sheet,'Faculty audit sheet missing');return sheet;
}
function updateFacultyField_(p,editor) {
  var columns={initial:1,designation:3,room:5,email:6},field=String(p.field||'');
  assert_(Object.prototype.hasOwnProperty.call(columns,field),'Field is not editable');
  var originalEmail=norm_(p.email),value=String(p.value===undefined?'':p.value).trim(),expected=String(p.expected===undefined?'':p.expected).trim();
  assert_(originalEmail.endsWith('@bracu.ac.bd')&&validBracEmail_(originalEmail),'Invalid faculty identity');
  assert_(value.length<=120&&!/[\r\n\u0000-\u001f]/.test(value)&&!/^\s*[=+\-@]/.test(value),'Invalid field value');
  if(field==='email')assert_(value===norm_(value)&&validBracEmail_(value)&&value.endsWith('@bracu.ac.bd'),'University faculty email required');
  if(field==='initial')assert_(/^[A-Z0-9]{2,10}$/.test(value),'Use 2–10 uppercase letters or digits for initial');
  if(field==='designation')assert_(value.length>=2,'Designation cannot be empty');
  var lock=LockService.getScriptLock();assert_(lock.tryLock(10000),'Faculty edit in progress; please retry');
  try{
    var book=SpreadsheetApp.openById(masterId_()),sheet=book.getSheetByName('Faculty Details');assert_(sheet,'Faculty Details tab missing');
    var last=sheet.getLastRow(),rows=sheet.getRange(2,1,Math.max(1,last-1),6).getDisplayValues();
    var matches=rows.map(function(r,i){return {row:i+2,values:r};}).filter(function(x){return norm_(x.values[5])===originalEmail;});
    assert_(matches.length===1,'Faculty source email must identify exactly one row');
    var target=matches[0],current=String(target.values[columns[field]-1]||'').trim();
    assert_(field==='email'||field==='initial'?norm_(current)===norm_(expected):current===expected,'Faculty record changed since you opened it; refresh and retry');
    if(field==='email')assert_(!rows.some(function(r,i){return i+2!==target.row&&norm_(r[5])===value;}),'Email already belongs to another faculty member');
    if(field==='initial')assert_(!rows.some(function(r,i){return i+2!==target.row&&norm_(r[0])===norm_(value);}), 'Initial already belongs to another faculty member');
    if(current===value)return {updated:false,field:field,value:value};
    var audit=facultyAuditSheet_(); // Ensure the audit destination exists before changing university records.
    var cell=sheet.getRange(target.row,columns[field]);cell.setNumberFormat('@').setValue(value);
    try{audit.appendRow([new Date().toISOString(),editor,originalEmail,target.row,field,current,value]);}
    catch(auditError){try{cell.setValue(current);}catch(rollbackError){throw new Error('Faculty audit failed and source rollback could not be confirmed; contact the administrator');}throw auditError;}
    refreshFacultyDirectory_(true);
    return {updated:true,field:field,value:value};
  }finally{lock.releaseLock();}
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
  return sheet.getRange(2,1,sheet.getLastRow()-1,COMMENT_HEADERS.length).getDisplayValues().map(function(r){return {semester:r[0],phase:r[1],thesisId:groupId_(r[2]),memberKey:norm_(r[3]),score:number_(r[4]),comment:String(r[5]||'').trim(),evaluator:r[6],sourceId:r[7],syncedAt:r[8]};});
}
function phaseEvaluations_(student, group, studentMarks) {
  // A verified student sees their own official marks and the group-wide comments
  // already consolidated in Thesis Master. No private index or publication gate.
  var result = [];
  ['P1','P2','Defense'].forEach(function(phase){
    var score = phase === 'P1' ? studentMarks.p1 : phase === 'P2' ? studentMarks.p2 : studentMarks.defense;
    if(score===undefined)score=null;
    var comment=masterComment_(group.phaseComments&&group.phaseComments[phase]);
    var semester=String(group.phaseSemesters&&group.phaseSemesters[phase]||'').trim();
    result.push({id:student.id+'|'+phase,studentId:student.id,phase:phase,semester:semester||'Semester not recorded',score:score,maxScore:PHASE_INFO[phase].max,comment:comment||null,evaluator:'',publication:score!==null||!!comment?'published':'pending'});
  });
  var supervisorScore=studentMarks.supervisor===undefined?null:studentMarks.supervisor;
  result.push({id:student.id+'|Supervisor',studentId:student.id,phase:'Supervisor',semester:'Permanent master',score:supervisorScore,maxScore:55,comment:null,evaluator:'',publication:supervisorScore!==null?'published':'pending'});
  return result;
}
function facultyContactsForGroup_(group,faculty) {
  return [
    {slot:'Supervisor 1',name:group.primarySupervisor},
    {slot:'Supervisor 2',name:group.secondarySupervisor},
    {slot:'Co-supervisor 1',name:group.coSupervisor1},
    {slot:'Co-supervisor 2',name:group.coSupervisor2}
  ].map(function(item){
    var match=verifiedFaculty_(item.name,faculty);
    return {slot:item.slot,name:match?match.names[0]:(item.name||''),email:match?match.email:'',room:match?match.room:'',designation:match?match.designation:''};
  });
}
function studentDashboard_(email, studentRows, groupRows) {
  var matches=studentRows.filter(function(s){return s.email === email || s.aliases.indexOf(email) >= 0;});
  assert_(matches.length===1, 'Student identity must match exactly one registered record');
  var student=matches[0];
  var matchingGroups=groupRows.filter(function(g){return g.id === student.thesisId;});assert_(matchingGroups.length===1,'Group must match exactly one master record');
  var group=matchingGroups[0];
  var peers=studentRows.filter(function(s){return s.thesisId===group.id;}).map(function(s){return {id:s.id,name:s.name,email:s.email};});
  var contacts=facultyContactsForGroup_(group,facultyDirectory_());
  return { student: {id:student.id,name:student.name,email:email,thesisId:student.thesisId}, group: {id:group.id,title:group.title,type:group.type,stage:group.stage,primarySupervisor:group.primarySupervisor,secondarySupervisor:group.secondarySupervisor,coSupervisor1:group.coSupervisor1,coSupervisor2:group.coSupervisor2,members:peers.map(function(s){return s.id;})},members:peers,facultyContacts:contacts,evaluations:phaseEvaluations_(student,group,marks_()[student.id]||{p1:null,p2:null,defense:null}) };
}
function supervisorDashboard_(email, studentRows, groupRows) {
  var authorized = facultyGroups_(email,groupRows); var ids = authorized.map(function(g){return g.id;}),allMarks=marks_();
  var faculty=facultyDirectory_();
  var assigned=studentRows.filter(function(s){return ids.indexOf(s.thesisId)>=0;});
  return { supervisorEmail:email,students:assigned.map(function(s){var m=allMarks[s.id]||{};return {id:s.id,name:s.name,email:s.email,thesisId:s.thesisId,marks:{p1:m.p1===undefined?null:m.p1,p2:m.p2===undefined?null:m.p2,defense:m.defense===undefined?null:m.defense,supervisor:m.supervisor===undefined?null:m.supervisor},progress:{p1:m.p1!==null&&m.p1!==undefined,p2:m.p2!==null&&m.p2!==undefined,defense:m.defense!==null&&m.defense!==undefined}};}),groups:authorized.map(function(g){
    var feedback=[];
    ['P1','P2','Defense'].forEach(function(phase){
      var comment=masterComment_(g.phaseComments&&g.phaseComments[phase]);
      if(comment)feedback.push({phase:phase,semester:String(g.phaseSemesters&&g.phaseSemesters[phase]||'').trim(),evaluator:'Panel feedback',comment:comment,students:[]});
    });
    return Object.assign({},g,{myRoles:groupAssignmentRoles_(email,g,faculty),facultyContacts:facultyContactsForGroup_(g,faculty),feedback:feedback});
  }) };
}
function suggestAcademic_(q,studentRows,groupRows,kindFilter) {
  q=norm_(q);assert_(q.length<=100,'Search text too long');
  kindFilter=String(kindFilter||'');assert_(!kindFilter||['student','faculty','group'].indexOf(kindFilter)>=0,'Invalid suggestion type');
  if(q.length<2)return {items:[]};
  var results=[],seen={};
  function rank(fields){var best=99;fields.forEach(function(field){var lower=norm_(field),faculty=facultyKey_(field);[lower,faculty].forEach(function(s){if(!s)return;if(s===q)best=Math.min(best,0);else if(s.indexOf(q)===0)best=Math.min(best,1);else if(s.split(' ').some(function(word){return word.indexOf(q)===0;}))best=Math.min(best,2);else if(s.indexOf(q)>=0)best=Math.min(best,3);});});return best;}
  function add(kind,id,label,detail,fields,email){if(kindFilter&&kindFilter!==kind)return;var score=rank(fields);if(score>3||seen[kind+':'+id])return;seen[kind+':'+id]=true;results.push({kind:kind,id:String(id),label:String(label||id),detail:String(detail||''),email:validBracEmail_(email)?String(email).trim():'',score:score});}
  studentRows.forEach(function(s){var emails=[s.email].concat(s.aliases||[]);add('student',s.id,s.name||s.id,'Student ID '+s.id+(s.thesisId?' · '+s.thesisId:''),[s.id,s.name].concat(emails),emails.filter(validBracEmail_)[0]||'');});
  groupRows.forEach(function(g){add('group',g.id,g.id,'Research group · '+(g.title||'Title not listed'),[g.id,g.title],'');});
  facultyDirectory_().forEach(function(f){add('faculty',f.email,f.names[0]||f.email,'Faculty · '+(f.initial||f.email),[f.email,f.initial].concat(f.names||[]),f.email);});
  var order={student:0,faculty:1,group:2};
  results.sort(function(a,b){return a.score-b.score||order[a.kind]-order[b.kind]||a.label.localeCompare(b.label);});
  return {items:results.slice(0,12).map(function(r){return {kind:r.kind,id:r.id,label:r.label,detail:r.detail,email:r.email};})};
}
function adminSearch_(q, stage, type, studentRows, groupRows, requestedOffset, facultyEmail, requestedLimit) {
  q = norm_(q); assert_(q.length <= 120,'Search text too long');
  var offset=Math.max(0,Number(requestedOffset)||0);assert_(Number.isInteger(offset)&&offset<=100000,'Invalid search offset');
  var limit=requestedLimit===undefined?100:Number(requestedLimit);assert_([10,20,50,100].indexOf(limit)>=0,'Invalid search page size');
  var map = {},directory=facultyDirectory_(); groupRows.forEach(function(g){map[g.id]=g;});
  var onlyFaculty=norm_(facultyEmail),facultyIds=null;
  if(onlyFaculty){assert_(directory.some(function(f){return f.email===onlyFaculty;}),'Faculty selection not verified');facultyIds={};facultyGroups_(onlyFaculty,groupRows).forEach(function(g){facultyIds[g.id]=true;});}
  var matches=studentRows.filter(function(s){
    var g=map[s.thesisId];if(!g) return false;
    if(facultyIds&&!facultyIds[g.id])return false;
    if(stage && stage!=='All stages' && g.stage!==stage)return false;
    if(type && type!=='All types' && g.type!==type)return false;
    if(!q)return true;
    return [s.id,s.name,s.email,g.id,g.title,g.primarySupervisor,g.secondarySupervisor,g.coSupervisor1,g.coSupervisor2].some(function(v){return norm_(v).indexOf(q)>=0;}) || directory.some(function(f){return norm_(f.initial)===q && (f.names||[]).map(norm_).some(function(name){return [g.primarySupervisor,g.secondarySupervisor,g.coSupervisor1,g.coSupervisor2].map(norm_).indexOf(name)>=0;});});
  });
  return {rows:matches.slice(offset,offset+limit).map(function(s){return {student:{id:s.id,name:s.name,email:s.email,thesisId:s.thesisId},group:map[s.thesisId]};}),total:matches.length,offset:offset};
}
function adminDetail_(studentId, studentRows, groupRows) {
  var s=studentRows.filter(function(x){return x.id===String(studentId);})[0]; assert_(s,'Student ID not found');
  var group=groupRows.filter(function(g){return g.id===s.thesisId;})[0];assert_(group,'Group not found');
  return {student:{id:s.id,name:s.name,email:s.email,thesisId:s.thesisId},group:group,members:studentRows.filter(function(x){return x.thesisId===group.id;}).map(function(x){return {id:x.id,name:x.name,email:x.email};}),marks:marks_()[s.id]||{},evaluations:phaseEvaluations_(s,group,marks_()[s.id]||{p1:null,p2:null,defense:null})};
}
// The permanent Thesis Master → Resources tab is the single authoritative
// resource source. Only nonempty Title rows from columns A:B are published.
function masterResources_() {
  var sheet=SpreadsheetApp.openById(masterId_()).getSheetByName('Resources');
  assert_(sheet,'Thesis Master → Resources tab is missing');
  var last=sheet.getLastRow();if(last<1)return [];
  var range=sheet.getRange(1,1,last,2),rows=range.getDisplayValues();
  assert_(norm_(rows[0][0])==='title'&&norm_(rows[0][1])==='data','Thesis Master → Resources headers must be Title and Data');
  var rich=typeof range.getRichTextValues==='function'?range.getRichTextValues():[];
  return rows.slice(1).map(function(row,index){
    var title=String(row[0]||'').trim(),cell=rich[index+1]&&rich[index+1][1];
    var link=cell&&typeof cell.getLinkUrl==='function'?(cell.getLinkUrl()||''):'';
    if(!link&&cell&&typeof cell.getRuns==='function'){
      link=(cell.getRuns()||[]).map(function(run){return run.getLinkUrl();}).filter(Boolean)[0]||'';
    }
    var url=String(link||row[1]||'').trim();
    if(!/^https:\/\/[^\s]+$/i.test(url))url='';
    return {id:String(index+2),phase:'General',audience:'ALL',title:title,detail:'',url:url};
  }).filter(function(item){return !!item.title;});
}
function academicInformation_() {
  var sheet = SpreadsheetApp.openById(prop_('DEADLINE_SHEET_ID',DEFAULT_DEADLINES_ID)).getSheetByName('Deadlines and Links');
  assert_(sheet,'Deadline tab missing');var last=sheet.getLastRow();if(last<2)return {deadlines:[],resources:masterResources_()};
  var range=sheet.getRange(2,1,last-1,6),rows=range.getDisplayValues(),rich=range.getRichTextValues(),lastStage='',deadlines=[],lastDeadline=null;
  function stage_(label) {
    var name=norm_(label);
    if(/early/.test(name)&&/(defen|final)/.test(name))return 'Early Defense';
    if(/pre[\s-]*thesis[\s-]*1|pre[\s-]*1\b/.test(name))return 'P1';
    if(/pre[\s-]*thesis[\s-]*2|pre[\s-]*2\b/.test(name))return 'P2';
    if(/final\s*(thesis|defense)|\bdefen/.test(name))return 'Defense';
    return 'General';
  }
  function linked_(value) {
    if(!value)return '';
    var direct=value.getLinkUrl();if(direct)return direct;
    return (value.getRuns()||[]).map(function(run){return run.getLinkUrl();}).filter(Boolean)[0]||'';
  }
  function url_(cell,text){
    var link=linked_(cell)||(/^(https:\/\/\S+)$/i.test(String(text||'').trim())?String(text).trim():'');
    return /^https:\/\//i.test(link)?link:'';
  }
  rows.forEach(function(r,i){
    if(r[0])lastStage=String(r[0]);
    var phase=stage_(lastStage),title=String(r[1]||'').trim(),day=String(r[2]||'').trim(),date=String(r[3]||'').trim(),daysLeft=String(r[4]||'').trim();
    var resourceUrl=url_(rich[i][2],r[2]),submissionUrl=url_(rich[i][5],r[5]);
    // Sheets frequently places an extra "Submission" hyperlink on the row
    // following a hard-copy deadline. Keep it attached to that deadline.
    if(!title){
      if(lastDeadline&&submissionUrl)lastDeadline.links.push({label:String(r[5]||'Submission'),url:submissionUrl});
      return;
    }
    var isDeadline=!!date||!!daysLeft||!!r[5]&&['P1','P2','Defense','Early Defense'].indexOf(phase)>=0||
      (['P1','P2','Defense'].indexOf(phase)>=0&&!resourceUrl&&/present|defen/i.test(title));
    if(isDeadline){
      var links=[];
      if(submissionUrl)links.push({label:String(r[5]||'Open submission'),url:submissionUrl});
      var entry={id:String(i+2),phase:phase,title:title,day:day,date:date,daysLeft:daysLeft,
        status:daysLeft||'Not specified',action:String(r[5]||'').trim()||'Submission details',url:submissionUrl,links:links};
      deadlines.push(entry);lastDeadline=entry;return;
    }
    lastDeadline=null;
  });
  return {deadlines:deadlines,resources:masterResources_()};
}
function deadlineLinks_(){return academicInformation_().deadlines;}
function summary_(studentRows,providedMarks,providedComments) {
  // Semester attribution comes from the synchronized evaluator index. The
  // permanent master is authoritative for student marks; no publish switch.
  var rows=providedComments||comments_(),keyMap={},semesterMap={},byStudent={},lookups={},allMarks=providedMarks||marks_();
  studentRows.forEach(function(s){
    [s.id,s.email].concat(s.aliases).forEach(function(member){if(member)lookups[s.thesisId+'|'+norm_(member)]=s.id;});
  });
  rows.forEach(function(c){
    if(['P1','P2','Defense'].indexOf(c.phase)<0)return;
    var id=lookups[groupId_(c.thesisId)+'|'+c.memberKey];if(!id)return;
    var key=c.semester+'|'+c.phase+'|'+id;
    if(!byStudent[key])byStudent[key]={studentId:id,thesisId:groupId_(c.thesisId),semester:c.semester,phase:c.phase,hasFeedback:false};
    if(c.comment&&c.comment!=='-')byStudent[key].hasFeedback=true;
  });
  Object.keys(byStudent).forEach(function(key){
    var record=byStudent[key],m=allMarks[record.studentId]||{};
    var official=record.phase==='P1'?m.p1:record.phase==='P2'?m.p2:m.defense;
    if((official===null||official===undefined)&&!record.hasFeedback)return;
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
function overview_(studentRows,groupRows) {
  var allMarks=marks_(),indexed=comments_(),sources=sourceRegistry_();
  var phaseCounts={P1:0,P2:0,Defense:0};
  studentRows.forEach(function(s){var m=allMarks[s.id]||{};if(m.p1!==null&&m.p1!==undefined)phaseCounts.P1++;if(m.p2!==null&&m.p2!==undefined)phaseCounts.P2++;if(m.defense!==null&&m.defense!==undefined)phaseCounts.Defense++;});
  var lastSync='';indexed.forEach(function(r){if(r.syncedAt&&r.syncedAt>lastSync)lastSync=r.syncedAt;});
  var groupIndex={},stageGroups={P1:0,P2:0,Defense:0,Completed:0,Other:0},stageStudents={P1:0,P2:0,Defense:0,Completed:0,Other:0},types={Thesis:0,Project:0,Internship:0,Other:0};
  groupRows.forEach(function(g){if(groupIndex[g.id])return;groupIndex[g.id]=g;stageGroups[stageBucket_(g.stage)]++;var kind=String(g.type||'').trim();types[types.hasOwnProperty(kind)?kind:'Other']++;});
  var unmatched=0,studentIds={};studentRows.forEach(function(s){if(studentIds[s.id])return;studentIds[s.id]=true;var g=groupIndex[s.thesisId];if(!g){unmatched++;return;}stageStudents[stageBucket_(g.stage)]++;});
  var rawStudents=rows_(masterId_(),'All student info',5).slice(1).filter(function(r){return r.some(function(v){return !!String(v||'').trim();});});
  var rawGroups=rows_(masterId_(),'Group info',9).slice(1).filter(function(r){return r.some(function(v){return !!String(v||'').trim();});});
  return {students:Object.keys(studentIds).length,groups:Object.keys(groupIndex).length,recorded:phaseCounts,
    diagnostics:{sourceStudents:rawStudents.length,sourceGroups:rawGroups.length,validStudents:Object.keys(studentIds).length,validGroups:Object.keys(groupIndex).filter(function(id){return isValidGroupId_(id);}).length,
      invalidStudentIds:rawStudents.filter(function(r){return !isValidStudentId_(r[1]);}).length,
      invalidGroupIds:groupRows.filter(function(g){return !isValidGroupId_(g.id);}).length,unmatchedStudents:unmatched,stageGroups:stageGroups,stageStudents:stageStudents,types:types},
    semesters:summary_(studentRows,allMarks,indexed),lastSyncedAt:lastSync,
    sourceStatus:sources.map(function(s){return {semester:s.semester,phases:['P1','P2','Defense'].map(function(p){return {phase:p,indexed:indexed.some(function(r){return r.semester===s.semester&&r.phase===p;})};})};})};
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
    if(isValidGroupId_(r[cfg.group-1])){groupId=groupId_(r[cfg.group-1]);groupFeedback='';}
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
    // The staged import is atomic. Once synchronized, available comments are
    // shown to the verified student and their assigned faculty immediately.
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
function announcementSheet_(create) {
  var id=prop_('ANNOUNCEMENTS_SHEET_ID');
  if(!id){
    if(!create)return null;
    var book=SpreadsheetApp.create('BRACU Thesis Portal — Public Announcements');
    var first=book.getSheets()[0];first.setName('Announcements');
    first.getRange(1,1,1,ANNOUNCEMENT_HEADERS.length).setValues([ANNOUNCEMENT_HEADERS]);
    scriptProps_().setProperty('ANNOUNCEMENTS_SHEET_ID',book.getId());return first;
  }
  var sheet=SpreadsheetApp.openById(id).getSheetByName('Announcements');
  assert_(sheet,'Announcements storage tab is missing');return sheet;
}
function announcements_() {
  var sheet=announcementSheet_(false);if(!sheet||sheet.getLastRow()<2)return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,ANNOUNCEMENT_HEADERS.length).getDisplayValues().map(function(r,i){return {
    id:r[0],kind:r[1],title:r[2],body:r[3],eventDate:r[4],location:r[5],url:r[6],pinned:String(r[7]).toLowerCase()==='true',status:r[8],createdAt:r[9],updatedAt:r[10],author:r[11],row:i+2
  };}).filter(function(item){return !!item.id;});
}
function publicAnnouncements_() {
  var cache=typeof CacheService!=='undefined'?CacheService.getScriptCache():null;
  if(cache){var hit=cache.get('PORTAL_PUBLIC_NEWS_V1');if(hit){try{return JSON.parse(hit);}catch(_){}}}
  var items=announcements_().filter(function(a){return a.status==='published';}).sort(function(a,b){return Number(b.pinned)-Number(a.pinned)||String(b.updatedAt).localeCompare(String(a.updatedAt));}).slice(0,6).map(function(a){return {
    id:a.id,kind:a.kind,title:a.title,body:a.body,eventDate:a.eventDate,location:a.location,url:a.url,pinned:a.pinned,updatedAt:a.updatedAt
  };});
  if(cache)cache.put('PORTAL_PUBLIC_NEWS_V1',JSON.stringify(items),90);
  return items;
}
function invalidatePublicAnnouncements_(){if(typeof CacheService!=='undefined')CacheService.getScriptCache().remove('PORTAL_PUBLIC_NEWS_V1');}
function announcementInput_(p) {
  var fields={kind:String(p.kind||'Notice').trim(),title:String(p.title||'').trim(),body:String(p.body||'').trim(),eventDate:String(p.eventDate||'').trim(),location:String(p.location||'').trim(),url:String(p.url||'').trim(),pinned:p.pinned===true};
  assert_(['Notice','Event','News','Deadline'].indexOf(fields.kind)>=0,'Invalid announcement category');
  assert_(fields.title.length>=4&&fields.title.length<=160,'Title must be 4–160 characters');
  assert_(fields.body.length>=10&&fields.body.length<=1200,'Description must be 10–1200 characters');
  assert_(fields.location.length<=160,'Location is too long');
  assert_(!fields.eventDate||/^20\d\d-\d\d-\d\d$/.test(fields.eventDate),'Invalid event date');
  assert_(!fields.url||(/^https:\/\/[a-zA-Z0-9.-]+(?:\/[^\s]*)?$/.test(fields.url)&&fields.url.length<=500),'Link must be a safe HTTPS URL');
  return fields;
}
function announcementValues_(item) {return [item.id,item.kind,item.title,item.body,item.eventDate,item.location,item.url,String(!!item.pinned),item.status,item.createdAt,item.updatedAt,item.author];}
function saveAnnouncement_(p,email) {
  var details=announcementInput_(p),status=String(p.status||'draft');
  assert_(['draft','published'].indexOf(status)>=0,'Invalid announcement status');
  var lock=LockService.getScriptLock();assert_(lock.tryLock(5000),'Another announcement update is running');
  try {
    var sheet=announcementSheet_(true),entries=announcements_(),existing=entries.filter(function(a){return a.id===String(p.id||'');})[0];
    if(p.id)assert_(existing,'Announcement not found');
    if(!existing)assert_(entries.length<150,'Archive older announcements before creating more');
    var now=new Date().toISOString(),item={...details,id:existing?existing.id:Utilities.getUuid(),status:status,createdAt:existing?existing.createdAt:now,updatedAt:now,author:existing?existing.author:email};
    // Preserve ISO dates, timestamps and boolean strings without Sheets
    // converting them to locale-specific dates or TRUE/FALSE cells.
    sheet.getRange(existing?existing.row:sheet.getLastRow()+1,1,1,ANNOUNCEMENT_HEADERS.length).setNumberFormat('@').setValues([announcementValues_(item)]);
    invalidatePublicAnnouncements_();return {item:item};
  }finally{lock.releaseLock();}
}
function statusAnnouncement_(p) {
  var status=String(p.status||''),id=String(p.id||'');assert_(['draft','published','archived'].indexOf(status)>=0,'Invalid status');
  var lock=LockService.getScriptLock();assert_(lock.tryLock(5000),'Another announcement update is running');
  try {
    var sheet=announcementSheet_(false);assert_(sheet,'No announcements have been created');
    var existing=announcements_().filter(function(a){return a.id===id;})[0];assert_(existing,'Announcement not found');
    var item={...existing,status:status,updatedAt:new Date().toISOString()};
    sheet.getRange(existing.row,1,1,ANNOUNCEMENT_HEADERS.length).setNumberFormat('@').setValues([announcementValues_(item)]);
    invalidatePublicAnnouncements_();return {item:item};
  }finally{lock.releaseLock();}
}
function request_(body) {
  var action=String(body.action||''),p=body.payload||{};
  // The bridge secret is still required by doPost, but this action returns
  // only explicitly published, administrator-authored public announcements.
  if(action==='publicAnnouncements')return {items:publicAnnouncements_()};
  var principal=body.principal||{},email=norm_(principal.email);
  assert_(!!principal.sub && validBracEmail_(email),'A verified BRAC identity is required');
  if(action==='previewCandidates'){
    permission_(isAdmin_(email)?'admin':null,['admin']);
    try{refreshFacultyDirectory_(false);}catch(_){/* Use last verified snapshot. */}
    return {faculty:facultyDirectory_().map(function(f){return {email:f.email,name:facultyDisplayName_(f.names[0]||f.email),initial:f.initial||'',room:f.room||'',designation:f.designation||''};}).sort(function(a,b){return facultyDisplaySortKey_(a.name).localeCompare(facultyDisplaySortKey_(b.name))||a.email.localeCompare(b.email);})};
  }
  // Publishing requires only the verified administrator identity. Avoid loading
  // large academic master tabs for every visit to the news editor.
  if(['announcements','saveAnnouncement','statusAnnouncement'].indexOf(action)>=0){
    permission_(isAdmin_(email)?'admin':null,['admin']);
    if(action==='announcements')return {items:announcements_()};
    if(action==='saveAnnouncement')return saveAnnouncement_(p,email);
    return statusAnnouncement_(p);
  }
  // These administrator operations need only an authenticated administrator and
  // the verified faculty directory. Never load 5,000 students for a role edit.
  if(['admins','addAdmin','removeAdmin'].indexOf(action)>=0){
    permission_(isAdmin_(email)?'admin':null,['admin']);
    if(action==='admins')return {admins:adminEmails_()};
    var targetAdmin=norm_(p.email);
    assert_(targetAdmin.endsWith('@bracu.ac.bd')&&validBracEmail_(targetAdmin),'A verified university faculty email is required');
    if(action==='addAdmin'){
      try{refreshFacultyDirectory_(false);}catch(_){/* Use the last verified directory. */}
      assert_(facultyDirectory_().some(function(item){return item.email===targetAdmin;}),'Administrator must belong to the official Faculty Details directory');
    }
    assert_(action!=='removeAdmin'||targetAdmin!==email,'You cannot revoke your own admin access');
    var adminLock=LockService.getScriptLock();assert_(adminLock.tryLock(10000),'Administrator update already in progress');
    try{
      var nextAdmins=adminEmails_().filter(function(x){return x!==targetAdmin;});
      if(action==='addAdmin')nextAdmins.push(targetAdmin);
      assert_(nextAdmins.length>0,'The portal must retain at least one administrator');
      setJsonProp_('ADMIN_ROLE_LIST_JSON',nextAdmins);
      var auditAdmins=jsonProp_('ADMIN_ROLE_AUDIT_JSON',[]);
      auditAdmins.push({at:new Date().toISOString(),actor:email,target:targetAdmin,action:action});
      setJsonProp_('ADMIN_ROLE_AUDIT_JSON',auditAdmins.slice(-60));
      return {admins:adminEmails_()};
    }finally{adminLock.releaseLock();}
  }
  if(['faculty','facultyList','updateFaculty','overviewCounts'].indexOf(action)>=0){
    permission_(isAdmin_(email)?'admin':null,['admin']);
    if(action==='faculty'){
      try{refreshFacultyDirectory_(false);}catch(_){/* Use previous verified snapshot. */}
      return {faculty:facultyDirectory_()};
    }
    if(action==='updateFaculty')return updateFacultyField_(p,email);
    if(action==='overviewCounts'){
      var stageCounts={P1:0,P2:0,Defense:0,Completed:0},seenGroups={};
      groups_().forEach(function(g){if(seenGroups[g.id])return;seenGroups[g.id]=true;var phase=stageBucket_(g.stage);if(Object.prototype.hasOwnProperty.call(stageCounts,phase))stageCounts[phase]++;});
      return {counts:stageCounts};
    }
    var facultyWarning='';
    try{refreshFacultyDirectory_(false);}catch(_){facultyWarning='Automatic faculty refresh unavailable; showing the last verified directory.';}
    var listing=facultyList_(groups_());
    var facQuery=norm_(p.q||'');assert_(facQuery.length<=120,'Faculty search text too long');
    var facFilter=String(p.filter||'all');assert_(['all','verified','missing'].indexOf(facFilter)>=0,'Invalid faculty filter');
    var facOffset=Math.max(0,Number(p.offset)||0),facLimit=p.limit===undefined?10:Number(p.limit);
    assert_(Number.isInteger(facOffset)&&facOffset<=100000&&[10,20,50,100].indexOf(facLimit)>=0,'Invalid faculty page');
    var filtered=listing.filter(function(f){return (facFilter==='all'||(facFilter==='verified'?!!f.email:!f.email))&&
      (!facQuery||[f.name,f.email,f.initial,f.designation,f.room].concat(f.aliases||[]).some(function(field){return norm_(field).indexOf(facQuery)>=0;}));});
    return {faculty:filtered.slice(facOffset,facOffset+facLimit),total:filtered.length,offset:facOffset,
      updatedAt:prop_('FACULTY_AUTO_UPDATED',''),warning:facultyWarning,
      matched:listing.filter(function(f){return !!f.email;}).length,missing:listing.filter(function(f){return !f.email;}).length};
  }
  try{refreshFacultyDirectory_(false);}catch(_){/* Retain last verified snapshot if the source is temporarily unavailable. */}
  var studentRows=students_(),groupRows=groups_(),role=role_(email,studentRows);
  if(!role&&email.endsWith('@bracu.ac.bd')) {
    var refreshed=Date.parse(prop_('FACULTY_AUTO_UPDATED',''))||0;
    if(Date.now()-refreshed>5*60*1000){try{refreshFacultyDirectory_(false);role=role_(email,studentRows);}catch(_){/* Refuse unknown users if the directory is unavailable. */}}
  }
  var listedStudent=studentRows.some(function(s){return s.email===email||s.aliases.indexOf(email)>=0;});
  assert_(role,email.endsWith('@g.bracu.ac.bd')&&!listedStudent?'Not registered for thesis yet':'Account is not authorized');
  if(action==='session'){
    var account=facultyDirectory_().filter(function(f){return f.email===email;})[0];
    return {role:role,roles:roles_(email,studentRows),email:email,name:principal.name||email,
      designation:account?account.designation||'':'',room:account?account.room||'':''};
  }
  if(action==='student'){assert_(roles_(email,studentRows).indexOf('student')>=0,'Not authorized for this action');return studentDashboard_(email,studentRows,groupRows);}
  if(action==='supervisor'){
    assert_(roles_(email,studentRows).indexOf('supervisor')>=0,'Not authorized for this action');
    var dashboard=supervisorDashboard_(email,studentRows,groupRows);
    if(p.limit===undefined)return dashboard;
    var supLimit=Number(p.limit),supOffset=Number(p.offset||0),supQuery=norm_(p.q||'');
    assert_([10,20,50,100].indexOf(supLimit)>=0&&Number.isInteger(supOffset)&&supOffset>=0&&supOffset<=100000&&supQuery.length<=120,'Invalid supervisor page');
    var supStage=String(p.stage||'all'),supType=String(p.type||'all'),supRole=String(p.myRole||'all');
    assert_(['all','P1','P2','Defense','Completed','Deferred'].indexOf(supStage)>=0&&['all','Thesis','Project','Internship'].indexOf(supType)>=0&&['all','Supervisor','Co-Supervisor'].indexOf(supRole)>=0,'Invalid supervisor filter');
    var filteredGroups=dashboard.groups.filter(function(g){
      var current=stageBucket_(g.stage);
      if(supStage!=='all'&&(supStage==='Deferred'?norm_(g.stage)!=='deferred':current!==supStage))return false;
      if(supType!=='all'&&g.type!==supType)return false;
      if(supRole!=='all'&&(g.myRoles||[]).indexOf(supRole)<0)return false;
      return !supQuery||[g.id,g.title,g.type,g.stage,g.primarySupervisor,g.secondarySupervisor,g.coSupervisor1,g.coSupervisor2].concat(
        dashboard.students.filter(function(s){return s.thesisId===g.id;}).reduce(function(a,s){return a.concat([s.id,s.name,s.email]);},[])).some(function(v){return norm_(v).indexOf(supQuery)>=0;});
    }).sort(function(a,b){return a.id.localeCompare(b.id);});
    var pageGroups=filteredGroups.slice(supOffset,supOffset+supLimit).map(function(g){var slim=Object.assign({},g);delete slim.abstract;return slim;});
    var pageIds={};pageGroups.forEach(function(g){pageIds[g.id]=true;});
    var matchingIds={};filteredGroups.forEach(function(g){matchingIds[g.id]=true;});
    return {supervisorEmail:email,groups:pageGroups,students:dashboard.students.filter(function(s){return !!pageIds[s.thesisId];}),
      totalGroups:filteredGroups.length,totalStudents:dashboard.students.filter(function(s){return !!matchingIds[s.thesisId];}).length,offset:supOffset};
  }
  if(action==='deadlines'){
    var entries=academicInformation_().deadlines;
    if(role==='student'){
      var mine=studentRows.filter(function(s){return s.email===email||s.aliases.indexOf(email)>=0;})[0];
      var group=mine&&groupRows.filter(function(g){return g.id===mine.thesisId;})[0];
      var phase=group?deadlineStage_(group.stage):'';
      entries=entries.filter(function(entry){return entry.phase==='General'||deadlinePhase_(entry)===phase;});
    }
    return {entries:entries};
  }
  if(action==='resources')return {items:academicInformation_().resources};
  if(action==='groupAbstract'){
    var abstractId=String(p.groupId||'').trim();assert_(abstractId&&abstractId.length<=100,'Invalid group ID');
    var abstractGroup=groupRows.filter(function(g){return g.id===abstractId;})[0];assert_(abstractGroup,'Group not found');
    var authorizedGroup=roles_(email,studentRows).indexOf('admin')>=0||
      (roles_(email,studentRows).indexOf('supervisor')>=0&&facultyGroups_(email,groupRows).some(function(g){return g.id===abstractId;}))||
      studentRows.some(function(s){return s.thesisId===abstractId&&(s.email===email||(s.aliases||[]).indexOf(email)>=0);});
    assert_(authorizedGroup,'Not authorized for this group');
    return {groupId:abstractId,abstract:String(abstractGroup.abstract||'')};
  }
  if(action==='groupAbstracts'){
    var requested=p.groupIds;
    assert_(Array.isArray(requested)&&requested.length<=20&&requested.every(function(id){return typeof id==='string'&&id.length>0&&id.length<=100;}),'Invalid group IDs');
    var adminAllowed=roles_(email,studentRows).indexOf('admin')>=0;
    var assignedGroupIds={};
    if(!adminAllowed&&roles_(email,studentRows).indexOf('supervisor')>=0)facultyGroups_(email,groupRows).forEach(function(g){assignedGroupIds[g.id]=true;});
    var ownStudent=studentRows.filter(function(s){return s.email===email||(s.aliases||[]).indexOf(email)>=0;})[0];
    var abstracts={};requested.forEach(function(id){
      assert_(adminAllowed||assignedGroupIds[id]||ownStudent&&ownStudent.thesisId===id,'Not authorized for one or more groups');
      var group=groupRows.filter(function(g){return g.id===id;})[0];
      if(group)abstracts[id]=String(group.abstract||'');
    });
    return {abstracts:abstracts};
  }
  if(action==='suggest'){permission_(role,['admin']);return suggestAcademic_(p.q,studentRows,groupRows,p.kind);}
  if(action==='search'){permission_(role,['admin']);return adminSearch_(p.q,p.stage,p.type,studentRows,groupRows,p.offset,p.facultyEmail,p.limit);}
  if(action==='detail'){permission_(role,['admin']);return adminDetail_(p.studentId,studentRows,groupRows);}
  if(action==='summary'){permission_(role,['admin']);return {semesters:summary_(studentRows)};}
  if(action==='overview'){permission_(role,['admin']);return overview_(studentRows,groupRows);}
  if(action==='preview'){
    permission_(role,['admin']);
    var previewRole=String(p.role||''),target=norm_(p.email);
    assert_(['admin','student','supervisor'].indexOf(previewRole)>=0,'Invalid preview role');
    if(previewRole==='admin'){
      auditPreview_(email,previewRole,email);return {role:previewRole,email:email,data:null};
    }
    assert_(validBracEmail_(target),'Enter a BRAC University email for the preview');
    if(previewRole==='student'){
      assert_(studentRows.some(function(s){return s.email===target||s.aliases.indexOf(target)>=0;}),'No student record matches that university account');
      var studentPreview=studentDashboard_(target,studentRows,groupRows);
      auditPreview_(email,previewRole,target);
      return {role:previewRole,email:target,data:studentPreview};
    }
    try{refreshFacultyDirectory_(false);}catch(_){/* No invented faculty identity if directory is unavailable. */}
    assert_(facultyDirectory_().some(function(f){return f.email===target;}),'Faculty email not in the verified directory');
    var facultyPreview=supervisorDashboard_(target,studentRows,groupRows);
    auditPreview_(email,previewRole,target);
    return {role:previewRole,email:target,data:facultyPreview};
  }
  if(action==='registry'){permission_(role,['admin']);return {sources:sourceRegistry_()};}
  if(action==='aliases'){permission_(role,['admin']);return {aliases:jsonProp_('STUDENT_ALIASES_JSON',{})};}
  if(action==='setAlias'||action==='removeAlias'){
    permission_(role,['admin']);var aliasEmail=norm_(p.email),studentId=String(p.studentId||'').trim();
    assert_(validBracEmail_(aliasEmail),'Invalid university email');
    var aliases=jsonProp_('STUDENT_ALIASES_JSON',{});
    if(action==='setAlias'){
      assert_(isValidStudentId_(studentId)&&studentRows.some(function(s){return s.id===studentId;}),'Student ID not found');
      assert_(!studentRows.some(function(s){return s.email===aliasEmail&&s.id!==studentId;}),'Email is assigned to another student');
      aliases[aliasEmail]=studentId;
    }else{delete aliases[aliasEmail];}
    setJsonProp_('STUDENT_ALIASES_JSON',aliases);return {aliases:aliases};
  }
  if(action==='setFaculty'){
    permission_(role,['admin']);var facEmail=norm_(p.email),name=String(p.name||'').trim(),initial=String(p.initial||'').trim().toUpperCase();
    assert_(validBracEmail_(facEmail)&&name.length>3&&name.length<180&&/^[A-Z0-9]{2,10}$/.test(initial),'Invalid faculty mapping');
    var directory=facultyDirectory_().filter(function(x){return norm_(x.email)!==facEmail;});directory.push({email:facEmail,names:[name],initial:initial});setJsonProp_('FACULTY_DIRECTORY_JSON',directory);return {faculty:directory};
  }
  if(action==='sync'){permission_(role,['admin']);return syncPhase_(String(p.semester||''),String(p.phase||''));}
  if(action==='restartSync'){permission_(role,['admin']);return restartSync_(String(p.semester||''),String(p.phase||''));}
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
