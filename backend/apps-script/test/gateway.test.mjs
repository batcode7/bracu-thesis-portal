import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../Code.gs',import.meta.url),'utf8');
const props={};
const context=vm.createContext({
  console,
  PropertiesService:{getScriptProperties:()=>({
    getProperty:key=>props[key]||null,
    getProperties:()=>({...props}),
    setProperty:(key,value)=>{props[key]=value;},
    deleteProperty:key=>{delete props[key];},
  })},
});
vm.runInContext(source,context);
const originalGroupReader=context.groups_;
const originalRowsReader=context.rows_;
context.rows_=(id,tab,width)=>tab==='Panel Manager Links'?
  [['Semester','Panel Manager'],['Spring25','https://docs.google.com/spreadsheets/d/1G9JH7bqQfhg8Ei6yWgg1Y-pJzf9Jo-xpJdllcWJnUNY/edit'],['Summer26','https://docs.google.com/spreadsheets/d/1Z882cDXwrQwuMgbSFF3CQmqyWXuAXq8U3Thn7569QTU/edit?usp=sharing'],['Fall26','']]:
  originalRowsReader(id,tab,width);
const students=[
  {id:'22101234',name:'First',thesisId:'T2530123',email:'first@gmail.com',aliases:['first@g.bracu.ac.bd']},
  {id:'22104567',name:'Second',thesisId:'T2530124',email:'second@gmail.com',aliases:['second@g.bracu.ac.bd']},
];
const groups=[
  {id:'T2530123',title:'Research A',type:'Thesis',stage:'Pre-Thesis 2',primarySupervisor:'Faculty A',secondarySupervisor:'Faculty C',coSupervisor1:'Faculty B',coSupervisor2:'',phaseSemesters:{P1:'Spring25',P2:'Summer26',Defense:''},phaseComments:{P1:'Revise methodology',P2:'Add experiments',Defense:''}},
  {id:'T2530124',title:'Research B',type:'Thesis',stage:'Final Thesis',primarySupervisor:'Faculty B',phaseSemesters:{P1:'',P2:'',Defense:'Summer26'},phaseComments:{P1:'',P2:'',Defense:'Private group B defense feedback'}},
];
const marks={
  '22101234':{p1:4,p2:8,defense:null},
  '22104567':{p1:5,p2:9,defense:26},
};
const evaluations=[
  {semester:'Spring 2025',phase:'P1',thesisId:'T2530123',memberKey:'first@gmail.com',score:4,comment:'Revise methodology',evaluator:'Judge A',sourceId:'sheetA'},
  {semester:'Summer 2026',phase:'P2',thesisId:'T2530123',memberKey:'first@gmail.com',score:8,comment:'Add experiments',evaluator:'Judge B',sourceId:'sheetB'},
];
context.students_=()=>students;
context.groups_=()=>groups;
context.marks_=()=>marks;
context.comments_=()=>evaluations;
props.FACULTY_DIRECTORY_JSON=JSON.stringify([{email:'faculty@bracu.ac.bd',names:['Faculty A'],initial:'FA'}]);
props.RELEASED_PHASES_JSON=JSON.stringify({'Spring 2025|P1':true,'Summer 2026|P2':false});

const run=(email,action,payload={})=>context.request_({principal:{email,sub:'signed-verified-id'},action,payload});

test('student account is scoped to its own ID even when a different student ID is submitted',()=>{
  const result=run('first@g.bracu.ac.bd','student',{studentId:'22104567'});
  assert.equal(result.student.id,'22101234');
  assert.equal(result.group.id,'T2530123');
  assert.equal(result.group.stage,'Pre-Thesis 2');
  assert.equal(result.group.coSupervisor1,'Faculty B');
  assert.equal(result.group.secondarySupervisor,'Faculty C');
  assert.equal(result.members[0].name,'First');
  assert.equal(result.facultyContacts.length,4);
  assert.equal(result.facultyContacts[0].email,'faculty@bracu.ac.bd');
  assert.equal(result.facultyContacts[1].email,''); // Unknown faculty must not get an invented email.
  assert.equal(result.evaluations.find(e=>e.phase==='P1').score,4);
  assert.equal(result.evaluations.find(e=>e.phase==='P2').score,8);
  assert.match(result.evaluations.find(e=>e.phase==='P2').comment,/Add experiments/);
  assert.throws(()=>run('first@g.bracu.ac.bd','search',{q:'22104567'}),/Not authorized/);
  assert.throws(()=>run('first@g.bracu.ac.bd','detail',{studentId:'22104567'}),/Not authorized/);
});
test('supervisor receives only the group matched by trusted email/name mapping',()=>{
  const result=run('faculty@bracu.ac.bd','supervisor');
  assert.deepEqual(Array.from(result.students,s=>s.id),['22101234']);
  assert.deepEqual(Array.from(result.groups,g=>g.id),['T2530123']);
  assert.equal(result.groups[0].facultyContacts[0].email,'faculty@bracu.ac.bd');
  assert.equal(result.groups[0].facultyContacts[1].email,'');
  assert.equal(result.groups[0].coSupervisor1,'Faculty B');
  assert.equal(result.students[0].progress.p1,true);
  assert.equal(result.students[0].marks.p1,4);
  assert.equal(result.students[0].marks.p2,8);
  assert.equal(result.groups[0].feedback.length,2);
  assert.equal(result.groups[0].feedback.find(e=>e.phase==='P2').comment,'Add experiments');
  assert.deepEqual(Array.from(result.groups[0].feedback.find(e=>e.phase==='P2').students),[]);
  assert.throws(()=>run('faculty@bracu.ac.bd','detail',{studentId:'22104567'}),/Not authorized/);
});
test('Group info maps title, abstract, each phase semester and group comments',()=>{
  const previous=context.rows_;
  const row=['','P2510530','Project','Completed','Mr. Partha Bhoumik','','Ms. Sukarna Sarker','','Vector Population Modeling','Study of environmental and geospatial factors.','Spring26','Good baseline','Summer26','Improve novelty','','No Comments. Please reach out to your respective panel members for feedback.'];
  context.rows_=(id,tab,width)=>{assert.equal(tab,'Group info');assert.equal(width,16);return [['','Thesis ID','Type','Stage','','','','','Title','Abstract','P1 Semester','P1 Comments','P2 Semester','P2 Comments','Def Semester','Def Comments'],row];};
  try{
    const loaded=originalGroupReader();
    assert.equal(loaded[0].id,'P2510530');
    assert.equal(loaded[0].type,'Project');
    assert.equal(loaded[0].title,'Vector Population Modeling');
    assert.equal(loaded[0].abstract,'Study of environmental and geospatial factors.');
    assert.equal(loaded[0].phaseSemesters.P2,'Summer26');
    assert.equal(loaded[0].phaseComments.P1,'Good baseline');
    assert.equal(loaded[0].phaseComments.P2,'Improve novelty');
    assert.equal(loaded[0].phaseComments.Defense,'');
  }finally{context.rows_=previous;}
});
test('supervisors receive only their own group-wide master comments; indexed evaluator rows are ignored',()=>{
  const old=context.comments_;
  context.comments_=()=>[
    ...evaluations,
    {...evaluations[0],memberKey:'first@g.bracu.ac.bd'},
    {...evaluations[0],memberKey:'second@gmail.com',comment:'Mismatched member must stay private'},
    {...evaluations[0],phase:'Defense',thesisId:'T2530124',memberKey:'second@gmail.com',comment:'Private group B defense feedback'},
  ];
  try{
    const result=run('faculty@bracu.ac.bd','supervisor');
    assert.equal(result.groups.length,1);
    assert.equal(result.groups[0].feedback.length,2);
    assert.ok(result.groups[0].feedback.every(f=>!f.comment.includes('Private group B')&&!f.comment.includes('Mismatched member')));
    assert.equal(result.groups[0].feedback.find(f=>f.phase==='P1').students.length,0);
    assert.equal(result.groups[0].feedback[0].sourceId,undefined);
  }finally{context.comments_=old;}
});
test('zero is a recorded mark and a missing comment does not conceal it',()=>{
  const old=context.marks_;
  context.marks_=()=>({...marks,'22101234':{p1:0,p2:null,defense:null,supervisor:0}});
  try{
    const result=run('first@g.bracu.ac.bd','student');
    assert.equal(result.evaluations.find(e=>e.phase==='P1').score,0);
    assert.equal(result.evaluations.find(e=>e.phase==='P2').score,null);
    assert.match(result.evaluations.find(e=>e.phase==='P2').comment,/Add experiments/);
    assert.equal(result.evaluations.find(e=>e.phase==='Supervisor').score,0);
  }finally{context.marks_=old;}
});
test('any admin can appoint another admin, and the bootstrap account has no special protection',()=>{
  const oldLock=context.LockService;
  const oldDirectory=props.FACULTY_DIRECTORY_JSON;
  context.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
  try{
    props.FACULTY_DIRECTORY_JSON=JSON.stringify([
      {email:'faculty@bracu.ac.bd',names:['Faculty A'],initial:'FA'},
      {email:'other@bracu.ac.bd',names:['Faculty B'],initial:'FB'},
    ]);
    assert.throws(()=>run('faculty@bracu.ac.bd','addAdmin',{email:'other@bracu.ac.bd'}),/Not authorized/);
    assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','addAdmin',{email:'unknown@bracu.ac.bd'}),/official Faculty Details/);
    const result=run('partha.bhoumik@bracu.ac.bd','addAdmin',{email:'faculty@bracu.ac.bd'});
    assert.deepEqual(Array.from(result.admins),['partha.bhoumik@bracu.ac.bd','faculty@bracu.ac.bd']);
    assert.deepEqual(Array.from(run('faculty@bracu.ac.bd','session').roles),['admin','supervisor']);
    assert.equal(run('faculty@bracu.ac.bd','addAdmin',{email:'other@bracu.ac.bd'}).admins.length,3);
    assert.deepEqual(Array.from(run('other@bracu.ac.bd','session').roles),['admin','supervisor']);
    assert.equal(run('faculty@bracu.ac.bd','admins').admins.length,run('other@bracu.ac.bd','admins').admins.length);
    assert.throws(()=>run('faculty@bracu.ac.bd','removeAdmin',{email:'faculty@bracu.ac.bd'}),/cannot revoke your own/);
    // Every administrator has equal powers, including removing the original admin.
    const afterFounder=run('faculty@bracu.ac.bd','removeAdmin',{email:'partha.bhoumik@bracu.ac.bd'});
    assert.equal(afterFounder.admins.includes('partha.bhoumik@bracu.ac.bd'),false);
    assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','session'),/not authorized/i);
    assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','addAdmin',{email:'faculty@bracu.ac.bd'}),/not authorized/i);
    const removed=run('other@bracu.ac.bd','removeAdmin',{email:'faculty@bracu.ac.bd'});
    assert.equal(removed.admins.includes('faculty@bracu.ac.bd'),false);
    assert.equal(run('faculty@bracu.ac.bd','session').role,'supervisor');
    assert.throws(()=>run('other@bracu.ac.bd','removeAdmin',{email:'other@bracu.ac.bd'}),/cannot revoke your own/);
    assert.throws(()=>run('other@bracu.ac.bd','primeAdmins'),/Unknown API action/);
  }finally{context.LockService=oldLock;props.FACULTY_DIRECTORY_JSON=oldDirectory;delete props.ADMIN_ROLE_LIST_JSON;delete props.ADMIN_ROLE_AUDIT_JSON;}
});
test('previously delegated admin emails migrate as equal administrators on the first role edit',()=>{
  const previousDirectory=props.FACULTY_DIRECTORY_JSON,previousLock=context.LockService;
  context.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
  try{
    props.FACULTY_DIRECTORY_JSON=JSON.stringify([
      {email:'legacy@bracu.ac.bd',names:['Legacy Faculty'],initial:'LF'},
      {email:'new@bracu.ac.bd',names:['New Faculty'],initial:'NF'},
    ]);
    props.PRIME_ADMIN_EMAILS_JSON=JSON.stringify(['legacy@bracu.ac.bd']);
    props.ADMIN_EMAILS_JSON=JSON.stringify(['oldadmin@bracu.ac.bd']);
    assert.deepEqual(Array.from(run('legacy@bracu.ac.bd','session').roles),['admin','supervisor']);
    const granted=run('legacy@bracu.ac.bd','addAdmin',{email:'new@bracu.ac.bd'});
    assert.deepEqual(Array.from(granted.admins),['partha.bhoumik@bracu.ac.bd','oldadmin@bracu.ac.bd','legacy@bracu.ac.bd','new@bracu.ac.bd']);
    assert.deepEqual(JSON.parse(props.ADMIN_ROLE_LIST_JSON),['partha.bhoumik@bracu.ac.bd','oldadmin@bracu.ac.bd','legacy@bracu.ac.bd','new@bracu.ac.bd']);
    const revoked=run('new@bracu.ac.bd','removeAdmin',{email:'legacy@bracu.ac.bd'});
    assert.equal(revoked.admins.includes('legacy@bracu.ac.bd'),false);
    assert.throws(()=>run('legacy@bracu.ac.bd','admins'),/Not authorized/);
  }finally{
    context.LockService=previousLock;props.FACULTY_DIRECTORY_JSON=previousDirectory;
    delete props.PRIME_ADMIN_EMAILS_JSON;delete props.ADMIN_EMAILS_JSON;delete props.ADMIN_ROLE_LIST_JSON;delete props.ADMIN_ROLE_AUDIT_JSON;
  }
});
test('administrator listing and grant never read the student or group master',()=>{
  const oldStudents=context.students_,oldGroups=context.groups_,oldLock=context.LockService;
  const oldDirectory=props.FACULTY_DIRECTORY_JSON;
  context.students_=()=>{throw new Error('Full student master should not load');};
  context.groups_=()=>{throw new Error('Full group master should not load');};
  context.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
  props.FACULTY_DIRECTORY_JSON=JSON.stringify([{email:'faculty@bracu.ac.bd',names:['Faculty A'],initial:'FA'}]);
  try{
    assert.equal(run('partha.bhoumik@bracu.ac.bd','admins').admins.length,1);
    const granted=run('partha.bhoumik@bracu.ac.bd','addAdmin',{email:'faculty@bracu.ac.bd'});
    assert.equal(granted.admins.length,2);
    assert.equal(run('faculty@bracu.ac.bd','admins').admins.length,2);
  }finally{
    context.students_=oldStudents;context.groups_=oldGroups;context.LockService=oldLock;
    props.FACULTY_DIRECTORY_JSON=oldDirectory;delete props.ADMIN_ROLE_LIST_JSON;delete props.ADMIN_ROLE_AUDIT_JSON;
  }
});
test('faculty listing and overview counts skip student rows and keep distinct groups',()=>{
  const oldStudents=context.students_,oldGroups=context.groups_;
  context.students_=()=>{throw new Error('Full student master should not load');};
  context.groups_=()=>[...groups,{...groups[0]},{...groups[1],id:'T2530125',stage:'Completed'}];
  try{
    const listed=run('partha.bhoumik@bracu.ac.bd','facultyList');
    assert.equal(listed.faculty.find(f=>f.email==='faculty@bracu.ac.bd').groups,1);
    assert.equal(run('partha.bhoumik@bracu.ac.bd','overviewCounts').counts.P2,1);
    assert.equal(run('partha.bhoumik@bracu.ac.bd','overviewCounts').counts.Defense,1);
    assert.equal(run('partha.bhoumik@bracu.ac.bd','overviewCounts').counts.Completed,1);
    assert.throws(()=>run('faculty@bracu.ac.bd','overviewCounts'),/Not authorized/);
  }finally{context.students_=oldStudents;context.groups_=oldGroups;}
});
test('admin student search accepts bounded selectable page sizes',()=>{
  const result=run('partha.bhoumik@bracu.ac.bd','search',{q:'',limit:10,offset:0});
  assert.equal(result.total,2);
  assert.equal(result.rows.length,2);
  assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','search',{q:'',limit:500}),/Invalid search page size/);
});
test('blank indexed evaluator comments cannot override a master comment or conceal official marks',()=>{
  const blank=[...evaluations,{...evaluations[0],evaluator:'Judge C',comment:''}];
  context.comments_=()=>blank;
  const record=run('first@g.bracu.ac.bd','student').evaluations.find(e=>e.phase==='P1');
  assert.equal(record.score,4);
  assert.match(record.comment,/Revise methodology/);
  assert.doesNotMatch(record.comment,/Judge C/);
  context.comments_=()=>evaluations;
});
test('unregistered Workspace emails and consumer Gmail do not become portal users',()=>{
  assert.throws(()=>run('unknown@bracu.ac.bd','session'),/not authorized/);
  assert.throws(()=>run('first@gmail.com','session'),/verified BRAC identity/);
});
test('a shared email never authenticates to an arbitrary student ID',()=>{
  const previous=students[1].email;
  students[1].email='first@g.bracu.ac.bd';
  try{
    assert.equal(context.roles_('first@g.bracu.ac.bd',students).includes('student'),false);
    assert.throws(()=>run('first@g.bracu.ac.bd','student'),/not authorized/i);
    assert.throws(()=>run('first@g.bracu.ac.bd','session'),/not authorized/i);
  }finally{students[1].email=previous;}
});
test('obsolete academic publishing action cannot be called',()=>{
  context.comments_=()=>[{...evaluations[1],comment:''}];
  assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','release',{semester:'Summer 2026',phase:'P2',published:true}),/Unknown API action/);
  assert.equal(run('first@g.bracu.ac.bd','student').evaluations.find(e=>e.phase==='P2').score,8);
  context.comments_=()=>evaluations;
});
test('Admins cannot register panel links; registry is read only from Thesis Master',()=>{
  const sources=run('partha.bhoumik@bracu.ac.bd','registry').sources;
  assert.deepEqual(Array.from(sources,s=>s.semester),['Spring 2025','Summer 2026']);
  assert.equal(sources[1].spreadsheetId,'1Z882cDXwrQwuMgbSFF3CQmqyWXuAXq8U3Thn7569QTU');
  assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','registerSemester',{semester:'Fall 2026',spreadsheetId:'1Z882cDXwrQwuMgbSFF3CQmqyWXuAXq8U3Thn7569QTU'}),/Unknown API action/);
});
test('role preview type-ahead returns a verified student alias when their master email is not a Workspace address',()=>{
  const suggestions=run('partha.bhoumik@bracu.ac.bd','suggest',{q:'2210123',kind:'student'}).items;
  assert.equal(suggestions[0].id,'22101234');
  assert.equal(suggestions[0].email,'first@g.bracu.ac.bd');
  assert.throws(()=>run('faculty@bracu.ac.bd','suggest',{q:'2210123',kind:'student'}),/Not authorized/);
});
test('faculty preview directory is alphabetical, includes initials and preserves Dr. while omitting Mr. and Ms.',()=>{
  const previous=props.FACULTY_DIRECTORY_JSON;
  try{
    props.FACULTY_DIRECTORY_JSON=JSON.stringify([
      {email:'zara@bracu.ac.bd',names:['Ms. Zara Khan'],initial:'ZK'},
      {email:'arif@bracu.ac.bd',names:['Dr. Arif Rahman'],initial:'AR'},
      {email:'bithi@bracu.ac.bd',names:['Mr. Bithi Islam'],initial:'BI'},
    ]);
    const candidates=run('partha.bhoumik@bracu.ac.bd','previewCandidates').faculty;
    assert.deepEqual(Array.from(candidates,c=>c.name),['Dr. Arif Rahman','Bithi Islam','Zara Khan']);
    assert.deepEqual(Array.from(candidates,c=>c.initial),['AR','BI','ZK']);
    assert.equal(context.facultyDisplayName_('Mrs. Dr. Samira Rahman'),'Dr. Samira Rahman');
  }finally{props.FACULTY_DIRECTORY_JSON=previous;}
});
test('admin semester stats count synced students once, independent of manual publication',()=>{
  context.comments_=()=>[evaluations[0],{...evaluations[0],evaluator:'Second judge'}];
  const result=run('partha.bhoumik@bracu.ac.bd','summary').semesters;
  assert.equal(result[0].P1.students,1);
  assert.equal(result[0].P1.groups,1);
  assert.equal(result[1].P2.students,0); // No P2 indexed rows in this fixture.
  context.comments_=()=>[evaluations[0],{...evaluations[0],evaluator:'Second judge',comment:''}];
  assert.equal(run('partha.bhoumik@bracu.ac.bd','summary').semesters[0].P1.students,1);
  context.comments_=()=>evaluations;
  assert.equal(run('partha.bhoumik@bracu.ac.bd','summary').semesters[1].P2.students,1);
  context.comments_=()=>evaluations;
});
test('only administrators can preview another role, and previews are read only',()=>{
  assert.throws(()=>run('admin@bracu.ac.bd','previewCandidates'),/Not authorized/);
  const options=run('partha.bhoumik@bracu.ac.bd','previewCandidates');
  assert.equal(options.faculty[0].email,'faculty@bracu.ac.bd');
  assert.equal(options.faculty[0].name,'Faculty A');
  assert.throws(()=>run('admin@bracu.ac.bd','preview',{role:'student',email:'first@g.bracu.ac.bd'}),/not authorized/);
  assert.throws(()=>run('faculty@bracu.ac.bd','preview',{role:'student',email:'first@g.bracu.ac.bd'}),/Not authorized/);
  const student=run('partha.bhoumik@bracu.ac.bd','preview',{role:'student',email:'first@g.bracu.ac.bd'});
  assert.equal(student.role,'student');
  assert.equal(student.data.student.id,'22101234');
  assert.equal(student.data.evaluations.find(e=>e.phase==='P2').score,8);
  const supervisor=run('partha.bhoumik@bracu.ac.bd','preview',{role:'supervisor',email:'faculty@bracu.ac.bd'});
  assert.deepEqual(Array.from(supervisor.data.groups,g=>g.id),['T2530123']);
  assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','preview',{role:'prime_admin'}),/Invalid preview role/);
  const admin=run('partha.bhoumik@bracu.ac.bd','preview',{role:'admin'});
  assert.equal(admin.role,'admin');assert.equal(admin.data,null);
  assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','preview',{role:'student',email:'unknown@g.bracu.ac.bd'}),/No student record/);
  assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','preview',{role:'supervisor',email:'unknown@bracu.ac.bd'}),/Faculty email not in/);
});
test('Admin overview distinguishes actual master records from synchronized semester statistics',()=>{
  const previous=context.rows_;
  context.rows_=(id,tab,width)=>tab==='All student info'?[['','22101234','First','T2530123',''],['','22104567','Second','T2530124','']]:tab==='Group info'?[['','T2530123','Thesis','Pre-Thesis 2'],['','T2530124','Project','Final Thesis']]:previous(id,tab,width);
  try{
    const report=run('partha.bhoumik@bracu.ac.bd','overview');
    assert.equal(report.students,2);assert.equal(report.groups,2);
    assert.equal(report.recorded.P1,2);assert.equal(report.recorded.Defense,1);
    assert.equal(report.diagnostics.stageGroups.P2,1);
    assert.equal(report.diagnostics.stageGroups.Defense,1);
    assert.equal(report.diagnostics.unmatchedStudents,0);
    assert.equal(report.semesters[0].P1.students,1); // Spring 2025 is listed in master registry.
    assert.throws(()=>run('first@g.bracu.ac.bd','overview'),/Not authorized/);
  }finally{context.rows_=previous;}
});

test('faculty honorific normalization merges all verified assignments without granting ambiguous names',()=>{
  const old=props.FACULTY_DIRECTORY_JSON;
  try{
    props.FACULTY_DIRECTORY_JSON=JSON.stringify([{email:'partha.bhoumik@bracu.ac.bd',names:['Mr. Partha Bhoumik'],initial:'PB'}]);
    const list=Array.from({length:32},(_,i)=>({id:'T'+String(2530000+i),title:'Test',stage:'Pre-Thesis 1',type:'Thesis',primarySupervisor:i<20?'Mr. Partha Bhoumik':'  PARTHA   BHOUMIK  ',coSupervisor1:i===0?'Partha Bhoumik':''}));
    assert.equal(context.facultyKey_('Mrs.  Partha  Bhoumik'),'partha bhoumik');
    assert.equal(context.facultyGroups_('partha.bhoumik@bracu.ac.bd',list).length,32);
    assert.equal(context.facultyList_(list).find(f=>f.email==='partha.bhoumik@bracu.ac.bd').groups,32);
    assert.deepEqual(Array.from(context.groupAssignmentRoles_('partha.bhoumik@bracu.ac.bd',list[0],context.facultyDirectory_())),['Supervisor','Co-Supervisor']);
    // Two distinct directory email identities with the same normalized name are ambiguous.
    props.FACULTY_DIRECTORY_JSON=JSON.stringify([{email:'partha.bhoumik@bracu.ac.bd',names:['Mr. Partha Bhoumik']},{email:'other@bracu.ac.bd',names:['Partha Bhoumik']}]);
    assert.equal(context.facultyGroups_('partha.bhoumik@bracu.ac.bd',list).length,0);
    assert.equal(context.facultyList_(list).filter(f=>f.source.includes('ambiguous')).length,1);
  }finally{props.FACULTY_DIRECTORY_JSON=old;}
});
test('administrative searches paginate all registered students instead of hiding records after 100',()=>{
  const roster=Array.from({length:205},(_,i)=>({id:String(22000000+i),name:'Synthetic '+i,email:'',thesisId:'T2530123',aliases:[]}));
  const first=context.adminSearch_('','All stages','All types',roster,groups,0);
  const third=context.adminSearch_('','All stages','All types',roster,groups,200);
  assert.equal(first.total,205);assert.equal(first.rows.length,100);
  assert.equal(third.rows.length,5);assert.equal(third.rows[0].student.id,roster[200].id);
});
test('Admin type-ahead resolves partial student, faculty, and group queries safely',()=>{
  const old=props.FACULTY_DIRECTORY_JSON;
  try{
    props.FACULTY_DIRECTORY_JSON=JSON.stringify([{email:'partha.bhoumik@bracu.ac.bd',names:['Mr. Partha Bhoumik'],initial:'PB'}]);
    const roster=[
      {id:'22101234',name:'Ayesha Rahman',email:'ayesha@g.bracu.ac.bd',thesisId:'T2530123',aliases:[]},
      {id:'22104567',name:'Tahmid Islam',email:'tahmid@g.bracu.ac.bd',thesisId:'T2530124',aliases:[]},
    ];
    const assigned=[
      {id:'T2530123',title:'Secure Payment Systems',type:'Thesis',stage:'Pre-Thesis 1',primarySupervisor:'Partha Bhoumik'},
      {id:'T2530124',title:'Neural Research',type:'Thesis',stage:'Pre-Thesis 2',primarySupervisor:'Different Faculty'},
    ];
    const byStudent=context.suggestAcademic_('2210',roster,assigned).items;
    assert.equal(byStudent.filter(s=>s.kind==='student').length,2);
    const byName=context.suggestAcademic_('ayesh',roster,assigned).items;
    assert.equal(byName[0].id,'22101234');
    assert.equal(byName[0].email,'ayesha@g.bracu.ac.bd');
    assert.deepEqual(Array.from(context.suggestAcademic_('2210',roster,assigned,'faculty').items),[]);
    assert.deepEqual(Array.from(context.suggestAcademic_('ayesh',roster,assigned,'student').items,i=>i.email),['ayesha@g.bracu.ac.bd']);
    const byGroup=context.suggestAcademic_('T2530',roster,assigned).items;
    assert.ok(byGroup.some(s=>s.kind==='group'&&s.id==='T2530123'));
    const byFaculty=context.suggestAcademic_('par',roster,assigned).items;
    assert.ok(byFaculty.some(s=>s.kind==='faculty'&&s.id==='partha.bhoumik@bracu.ac.bd'));
    assert.equal(context.suggestAcademic_('par',roster,assigned,'faculty').items[0].email,'partha.bhoumik@bracu.ac.bd');
    const selection=context.adminSearch_('','All stages','All types',roster,assigned,0,'partha.bhoumik@bracu.ac.bd');
    assert.deepEqual(Array.from(selection.rows,r=>r.student.id),['22101234']);
    assert.throws(()=>context.adminSearch_('','All stages','All types',roster,assigned,0,'unverified@bracu.ac.bd'),/not verified/);
    assert.equal(context.suggestAcademic_('a',roster,assigned).items.length,0);
    assert.throws(()=>context.suggestAcademic_('a'.repeat(101),roster,assigned),/too long/);
    assert.throws(()=>run('admin@bracu.ac.bd','suggest',{q:'par'}),/not authorized/);
  }finally{props.FACULTY_DIRECTORY_JSON=old;}
});
test('faculty inline edits require Admin, reject conflicts, and audit exact source cells',()=>{
  const original={spreadsheet:context.SpreadsheetApp,lock:context.LockService};
  const source=[['Initial','Name','Designation','Status','Room','Email'],['FA','Faculty A','Lecturer','Active','4A20','faculty@bracu.ac.bd'],['FB','Faculty B','Professor','Active','4A21','other@bracu.ac.bd']];
  const auditRows=[];
  const sheetFor=(values)=>({
    getLastRow:()=>values.length,setName:()=>{},appendRow:r=>{values.push(r);},
    getRange:(row,column,height=1,width=1)=>({
      getDisplayValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>values[row+i-1]?.[column+j-1]||'')),
      setNumberFormat(){return this;},
      setValue:value=>{values[row-1][column-1]=value;},
      setValues:input=>{input.forEach((r,i)=>{values[row+i-1]=r;});},
    }),
  });
  const official=sheetFor(source),audit=sheetFor(auditRows);
  context.SpreadsheetApp={
    openById:id=>({getSheetByName:name=>id==='audit-test'&&name==='FacultyEdits'?audit:name==='Faculty Details'?official:null}),
    create:()=>({getId:()=> 'audit-test',getSheets:()=>[audit]}),
  };
  context.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
  try{
    const edit={email:'faculty@bracu.ac.bd',field:'designation',expected:'Lecturer',value:'Senior Lecturer'};
    assert.throws(()=>run('faculty@bracu.ac.bd','updateFaculty',edit),/Not authorized/);
    assert.throws(()=>run('admin@bracu.ac.bd','updateFaculty',edit),/not authorized/i);
    assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','updateFaculty',{...edit,expected:'Outdated'}),/changed since/);
    assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','updateFaculty',{...edit,field:'email',expected:'faculty@bracu.ac.bd',value:'other@bracu.ac.bd'}),/already belongs/);
    assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','updateFaculty',{...edit,field:'email',expected:'faculty@bracu.ac.bd',value:'faculty@gmail.com'}),/University faculty/);
    assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','updateFaculty',{...edit,field:'initial',expected:'FA',value:'FB'}),/already belongs/);
    const realAppend=audit.appendRow;
    audit.appendRow=()=>{throw new Error('Audit write unavailable');};
    assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','updateFaculty',edit),/Audit write unavailable/);
    assert.equal(source[1][2],'Lecturer');
    audit.appendRow=realAppend;
    const response=run('partha.bhoumik@bracu.ac.bd','updateFaculty',edit);
    assert.equal(response.updated,true);
    assert.equal(source[1][2],'Senior Lecturer');
    assert.equal(source[1][4],'4A20');
    assert.equal(auditRows.length,2);
    assert.equal(auditRows[1][1],'partha.bhoumik@bracu.ac.bd');
    assert.equal(auditRows[1][4],'designation');
    assert.equal(context.facultyDirectory_().find(f=>f.email==='faculty@bracu.ac.bd').designation,'Senior Lecturer');
  }finally{
    context.SpreadsheetApp=original.spreadsheet;context.LockService=original.lock;
    delete props.FACULTY_AUDIT_SHEET_ID;delete props.FACULTY_AUTO_PARTS;delete props.FACULTY_AUTO_UPDATED;
    for(const key of Object.keys(props))if(key.startsWith('FACULTY_AUTO_'))delete props[key];
  }
});
test('official Faculty Details rows populate the secure directory without manually entered emails',()=>{
  const previous=context.SpreadsheetApp;
  const values=[['Initial','Name','Designation','Status','Room','Email'],['FA','Faculty A','Lecturer','Full Time','4A20','faculty@bracu.ac.bd'],['FB','Faculty B','Senior Lecturer','Full Time','4A21','other@bracu.ac.bd']];
  context.SpreadsheetApp={openById:()=>({getSheetByName:tab=>tab==='Faculty Details'?{getLastRow:()=>values.length,getRange:()=>({getDisplayValues:()=>values})}:null})};
  try {
    const imported=context.refreshFacultyDirectory_(true);
    assert.equal(imported.length,2);
    const listing=run('partha.bhoumik@bracu.ac.bd','facultyList');
    assert.equal(listing.matched,2);
    const faculty=listing.faculty.find(row=>row.email==='faculty@bracu.ac.bd');
    assert.equal(faculty.name,'Faculty A');assert.equal(faculty.initial,'FA');
    assert.equal(faculty.designation,'Lecturer');assert.equal(faculty.room,'4A20');
    assert.equal(faculty.groups,1);
    assert.throws(()=>run('admin@bracu.ac.bd','facultyList'),/not authorized/i);
  } finally {
    context.SpreadsheetApp=previous;
    delete props.FACULTY_AUTO_PARTS;delete props.FACULTY_AUTO_UPDATED;
    for(const key of Object.keys(props))if(key.startsWith('FACULTY_AUTO_'))delete props[key];
  }
});
test('deadline source keeps general, P1 and early-defense deadlines and retains rich-text links',()=>{
  const previous=context.SpreadsheetApp;
  const rows=[['ALL','Information update','Monday','21 September','Expired','Click here'],['Pre-Thesis 1','Report submission','Friday','7 October','Expired','Click here'],['','Poster submission','Saturday','8 October','Reference','Link'],['Early Defense','Early Defense form','Tuesday','12 October','Expired','Link']];
  const rich=rows.map((row,i)=>row.map((_,j)=>({getLinkUrl:()=>j===5&&i===1?'https://forms.gle/example':null,getRuns:()=>[]})));
  context.SpreadsheetApp={openById:()=>({getSheetByName:()=>({getLastRow:()=>5,getRange:()=>({getDisplayValues:()=>rows,getRichTextValues:()=>rich})})})};
  try {
    const result=run('partha.bhoumik@bracu.ac.bd','deadlines').entries;
    assert.deepEqual(Array.from(result,x=>x.phase),['General','P1','P1','Defense']);
    assert.equal(result[1].url,'https://forms.gle/example');
    assert.match(result[3].title,/Early Defense/);
  } finally {context.SpreadsheetApp=previous;}
});

test('students see general and their own stage; faculty and admins see all deadlines',()=>{
  const old=context.academicInformation_;
  context.academicInformation_=()=>({deadlines:[
    {id:'g',phase:'General',title:'General reference'},
    {id:'p1',phase:'P1',title:'P1 submission'},
    {id:'p2',phase:'P2',title:'P2 submission'},
    {id:'ft',phase:'Defense',title:'Final defense'},
  ],resources:[{id:'r1',phase:'General',title:'Thesis template',url:'https://example.com'}]});
  try {
    assert.deepEqual(Array.from(run('first@g.bracu.ac.bd','deadlines').entries,x=>x.id),['g','p2']);
    assert.deepEqual(Array.from(run('second@g.bracu.ac.bd','deadlines').entries,x=>x.id),['g','ft']);
    assert.deepEqual(Array.from(run('faculty@bracu.ac.bd','deadlines').entries,x=>x.id),['g','p1','p2','ft']);
    assert.deepEqual(Array.from(run('partha.bhoumik@bracu.ac.bd','deadlines').entries,x=>x.id),['g','p1','p2','ft']);
    assert.equal(run('first@g.bracu.ac.bd','resources').items[0].title,'Thesis template');
  }finally{context.academicInformation_=old;}
});

test('administrator notices stay private until published; public feed never exposes draft or author details',()=>{
  const previous={spreadsheet:context.SpreadsheetApp,lock:context.LockService,cache:context.CacheService,util:context.Utilities,students:context.students_};
  const rows=[];
  const sheet={
    setName:()=>{},
    getLastRow:()=>rows.length,
    getRange:(r,c,height,width)=>({
      setNumberFormat(){return this;},
      setValues:values=>{
        for(let i=0;i<values.length;i++)rows[r-1+i]=values[i].map(String);
      },
      getDisplayValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>rows[r-1+i]?.[j]||'')),
    }),
  };
  const book={getSheets:()=>[sheet],getSheetByName:name=>name==='Announcements'?sheet:null,getId:()=> 'news-sheet'};
  const cache=new Map();
  context.SpreadsheetApp={create:()=>book,openById:id=>{assert.equal(id,'news-sheet');return book;}};
  context.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
  context.CacheService={getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,value)=>cache.set(key,value),remove:key=>cache.delete(key)})};
  let serial=0;
  context.Utilities={getUuid:()=>`test-uuid-${++serial}`};
  context.students_=()=>{throw new Error('An announcement request unexpectedly loaded master student records');};
  try {
    const item={kind:'Event',title:'Thesis Workshop',body:'Research methods workshop for thesis students',eventDate:'2026-11-16',location:'Annex 3',url:'https://www.bracu.ac.bd',pinned:true};
    assert.throws(()=>run('faculty@bracu.ac.bd','saveAnnouncement',{...item,status:'published'}),/Not authorized/);
    assert.throws(()=>run('first@g.bracu.ac.bd','saveAnnouncement',{...item,status:'published'}),/Not authorized/);
    assert.throws(()=>run('admin@bracu.ac.bd','saveAnnouncement',{...item,status:'published'}),/Not authorized/);
    assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','saveAnnouncement',{...item,url:'javascript:alert(1)',status:'published'}),/safe HTTPS/);
    const saved=run('partha.bhoumik@bracu.ac.bd','saveAnnouncement',{...item,status:'draft'}).item;
    assert.equal(saved.status,'draft');
    assert.equal(context.request_({action:'publicAnnouncements'}).items.length,0);
    assert.equal(run('partha.bhoumik@bracu.ac.bd','announcements').items.length,1);
    run('partha.bhoumik@bracu.ac.bd','statusAnnouncement',{id:saved.id,status:'published'});
    const publicItem=context.request_({action:'publicAnnouncements'}).items[0];
    assert.equal(publicItem.title,'Thesis Workshop');
    assert.equal(publicItem.pinned,true);
    assert.equal(publicItem.author,undefined);
    assert.equal(publicItem.status,undefined);
    assert.equal(publicItem.row,undefined);
    run('partha.bhoumik@bracu.ac.bd','statusAnnouncement',{id:saved.id,status:'archived'});
    assert.equal(context.request_({action:'publicAnnouncements'}).items.length,0);
  }finally{
    context.SpreadsheetApp=previous.spreadsheet;context.LockService=previous.lock;context.CacheService=previous.cache;
    context.Utilities=previous.util;context.students_=previous.students;
    delete props.ANNOUNCEMENTS_SHEET_ID;
  }
});
