import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const script=readFileSync(new URL('../Code.gs',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../D1Sync.gs',import.meta.url),'utf8');
const props={D1_SYNC_URL:'https://bracu-thesis-portal.pages.dev/internal/d1-sync',
  D1_SYNC_SECRET:'example-test-sync-secret-longer-than-32-chars'};
const calls=[];
const fakeRecords=new Map(),fakeJobs=new Map();
let fakeActiveChecksum='';
const identity=item=>item.kind+'|'+item.key;
const fakeHash=item=>createHash('sha256').update(JSON.stringify(item)).digest('hex');
let syncNumber=0,feedback='Review experimental methodology';
const lock={tryLock:()=>true,releaseLock:()=>{}};
const ctx=vm.createContext({
  console,Logger:{log:()=>{}},LockService:{getScriptLock:()=>lock},
  PropertiesService:{getScriptProperties:()=>({
    getProperty:key=>props[key]||null,setProperty:(key,value)=>{props[key]=value;},
    getProperties:()=>({...props}),deleteProperty:key=>{delete props[key];},
  })},
  Utilities:{
    getUuid:()=>`d1-generation-${String(++syncNumber).padStart(8,'0')}`,
    DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
    computeDigest:(_algo,value)=>[...createHash('sha256').update(value).digest()].map(x=>x>127?x-256:x),
  },
  UrlFetchApp:{fetch:(_url,request)=>{
    const item=JSON.parse(request.payload);calls.push(item);
    let response={ok:true};
    if(item.mode==='start'){
      response.skip=fakeActiveChecksum===item.checksum;
      if(!response.skip){
        if(!fakeJobs.has(item.generation))fakeJobs.set(item.generation,{upserts:new Map(),removals:new Set()});
        response.existingCount=fakeRecords.size;
      }
    }else if(item.mode==='index'){
      const entries=[...fakeRecords.values()].map(row=>({kind:row.kind,key:row.key,hash:fakeHash(row)}))
        .sort((a,b)=>(a.kind+'|'+a.key).localeCompare(b.kind+'|'+b.key));
      response.rows=entries.filter(row=>row.kind>item.afterKind||
        (row.kind===item.afterKind&&row.key>item.afterKey)).slice(0,1000);
    }else if(item.mode==='batch'){
      for(const row of item.records)fakeJobs.get(item.generation).upserts.set(identity(row),row);
    }else if(item.mode==='remove'){
      for(const key of item.keys)fakeJobs.get(item.generation).removals.add(identity(key));
    }else if(item.mode==='commit'){
      const job=fakeJobs.get(item.generation);
      assert.equal(job.upserts.size,item.upserts);
      assert.equal(job.removals.size,item.deletes);
      for(const id of job.removals)fakeRecords.delete(id);
      for(const [id,row] of job.upserts)fakeRecords.set(id,row);
      fakeActiveChecksum=calls.findLast(call=>call.generation===item.generation&&call.mode==='start').checksum;
      fakeJobs.delete(item.generation);
    }
    return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(response)};
  }},
});
vm.runInContext(script,ctx);
const original={
  refreshFacultyDirectory_:ctx.refreshFacultyDirectory_,facultyDirectory_:ctx.facultyDirectory_,
  students_:ctx.students_,groups_:ctx.groups_,marks_:ctx.marks_,academicInformation_:ctx.academicInformation_,
};
ctx.refreshFacultyDirectory_=()=>{};
ctx.facultyDirectory_=()=>[{email:'faculty@bracu.ac.bd',names:['Dr. Faculty A'],initial:'FA',designation:'Professor',room:'4A21'}];
ctx.students_=()=>[{id:'22100001',name:'Student A',email:'a@g.bracu.ac.bd',aliases:[],thesisId:'T2530001'}];
ctx.groups_=()=>[{id:'T2530001',title:'Thesis A',stage:'Pre-Thesis 2',primarySupervisor:'Dr. Faculty A',secondarySupervisor:'',coSupervisor1:'',coSupervisor2:'',
  phaseSemesters:{P1:'Spring26',P2:'Summer26'},phaseComments:{P1:'Good',P2:feedback}}];
ctx.marks_=()=>({'22100001':{p1:5,p2:8}});
ctx.academicInformation_=()=>({deadlines:[{id:'1',phase:'P2',title:'Report Submission',url:'https://example.org'}],
  resources:[{id:'2',phase:'General',title:'Template',url:'https://example.org'}]});

test('Apps Script D1 snapshots index verified assignments, student email and master comments',()=>{
  const records=ctx.d1Snapshot_();
  assert.equal(records.find(r=>r.kind==='student_email').data.studentId,'22100001');
  assert.equal(records.find(r=>r.kind==='group').data.phaseComments.P2,'Review experimental methodology');
  assert.deepEqual(Array.from(records.find(r=>r.kind==='assignment').data.myRoles),['Supervisor']);
  const facultyPage=records.find(r=>r.kind==='faculty_list');
  assert.equal(facultyPage.data.email,'faculty@bracu.ac.bd');
  assert.equal(facultyPage.data.groups,1);
  assert.equal(records.find(r=>r.kind==='resource').data.title,'Template');
  assert.ok(records.find(r=>r.kind==='admin'&&r.key==='partha.bhoumik@bracu.ac.bd'));
});

test('D1 sync keeps unique Student IDs but quarantines an email shared by different students',()=>{
  const old=ctx.students_;
  ctx.students_=()=>[
    {id:'22301367',name:'Maksuratun Nessa',email:'shared@g.bracu.ac.bd',aliases:[],thesisId:'T2530001'},
    {id:'21201049',name:'Simanta Hasan Kollol',email:'shared@g.bracu.ac.bd',aliases:[],thesisId:'T2530001'},
    {id:'22201485',name:'Another Student',email:'other@g.bracu.ac.bd',aliases:[],thesisId:'T2530001'},
  ];
  try {
    const records=ctx.d1Snapshot_();
    assert.deepEqual(Array.from(records.filter(r=>r.kind==='student'),r=>r.key).sort(),['21201049','22201485','22301367']);
    assert.equal(records.some(r=>r.kind==='student_email'&&r.key==='shared@g.bracu.ac.bd'),false);
    assert.equal(records.find(r=>r.kind==='student_email'&&r.key==='other@g.bracu.ac.bd').data.studentId,'22201485');
    assert.equal(props.D1_EMAIL_COLLISION_COUNT,'1');
    assert.deepEqual(JSON.parse(props.D1_EMAIL_COLLISIONS_JSON),[
      {email:'shared@g.bracu.ac.bd',studentIds:['22301367','21201049']},
    ]);
    assert.equal(ctx.syncD1Now().synced,true);
  }finally{ctx.students_=old;}
});

test('D1 sync still refuses duplicate Student IDs, even when emails differ',()=>{
  const old=ctx.students_;
  ctx.students_=()=>[
    {id:'22100001',name:'First',email:'first@g.bracu.ac.bd',aliases:[],thesisId:'T2530001'},
    {id:'22100001',name:'Duplicate',email:'second@g.bracu.ac.bd',aliases:[],thesisId:'T2530001'},
  ];
  try{assert.throws(()=>ctx.d1Snapshot_(),/Duplicate student key in master: 22100001/);}
  finally{ctx.students_=old;}
});

test('a large snapshot checkpoints and resumes without starting another generation',()=>{
  const oldStudents=ctx.students_,oldDate=ctx.Date;
  ctx.students_=()=>Array.from({length:90},(_,i)=>{
    const id=String(23000000+i);
    return {id,name:'Student '+i,email:'student'+i+'@g.bracu.ac.bd',aliases:[],thesisId:'T2530001'};
  });
  let timeCalls=0;
  ctx.Date=class extends Date {
    static now(){return (timeCalls++)*245000;}
  };
  const startAt=calls.length;
  try{
    const first=ctx.syncD1Now();
    assert.equal(first.pending,true);
    assert.equal(first.synced,false);
    const initialGeneration=props.D1_PENDING_GENERATION;
    assert.equal(initialGeneration,first.generation);
    assert.ok(Number(props.D1_PENDING_CURSOR)>0);
    let result=first;
    for(let attempt=0;attempt<10&&result.pending;attempt++)result=ctx.syncD1Now();
    assert.equal(result.synced,true);
    assert.equal(props.D1_PENDING_GENERATION,undefined);
    assert.equal(props.D1_PENDING_CURSOR,undefined);
    assert.equal(props.D1_PENDING_CHECKSUM,undefined);
    const theseCalls=calls.slice(startAt);
    assert.ok(theseCalls.filter(item=>item.mode==='start').length>1);
    assert.equal(theseCalls.filter(item=>item.mode==='commit').length,1);
    assert.ok(theseCalls.every(item=>item.generation===initialGeneration));
  }finally{
    ctx.students_=oldStudents;
    if(oldDate===undefined)delete ctx.Date;
    else ctx.Date=oldDate;
    for(const key of ['D1_PENDING_GENERATION','D1_PENDING_CHECKSUM','D1_PENDING_CURSOR','D1_PENDING_DELETE_CURSOR'])delete props[key];
  }
});

test('long thesis titles are shortened only in D1 name index, preserving full group data and checksum',()=>{
  const oldGroups=ctx.groups_;
  const longTitle='Extended thesis title '.repeat(20);
  ctx.groups_=()=>oldGroups().map(g=>({...g,title:longTitle}));
  const callsBefore=calls.length;
  try{
    const expectedChecksum=ctx.d1Hash_(JSON.stringify(ctx.d1Snapshot_()));
    const result=ctx.syncD1Now();
    assert.equal(result.synced,true);
    const latestCalls=calls.slice(callsBefore);
    assert.equal(latestCalls[0].checksum,expectedChecksum);
    const group=latestCalls.flatMap(x=>x.records||[]).find(r=>r.kind==='group');
    assert.equal(group.name.length,250);
    assert.equal(group.data.title,longTitle);
    assert.equal(latestCalls.at(-1).mode,'commit');
  }finally{ctx.groups_=oldGroups;}
});

test('Apps Script sync publishes changed older rows, with manifest, batches and commit',()=>{
  const startCalls=calls.length;
  const first=ctx.syncD1Now();
  assert.equal(first.changed,true);assert.ok(first.count>0);
  assert.equal(calls[startCalls].mode,'start');
  assert.equal(calls.at(-1).mode,'commit');
  const firstChanges=calls.slice(startCalls).flatMap(item=>item.records||[]);
  assert.equal(firstChanges.find(item=>item.kind==='group').data.phaseComments.P2,'Review experimental methodology');
  const old=ctx.groups_;
  ctx.groups_=()=>old().map(group=>({...group,phaseComments:{...group.phaseComments,P2:'Updated feedback in an old row'}}));
  try{
    const secondStart=calls.length;
    const second=ctx.syncD1Now();assert.equal(second.changed,true);
    const latest=calls.slice(secondStart).flatMap(item=>item.records||[]);
    assert.equal(latest.find(item=>item.kind==='group').data.phaseComments.P2,'Updated feedback in an old row');
    assert.equal(latest.length,1,'only the modified group must be uploaded');
    assert.notEqual(calls[startCalls].checksum,calls[secondStart].checksum);
  }finally{ctx.groups_=old;}
});

test('unchanged source data performs no D1 row writes and starts no new generation',()=>{
  ctx.syncD1Now(); // Restore the normal fixture after the changed-feedback test.
  const startAt=calls.length;
  const result=ctx.syncD1Now();
  assert.equal(result.synced,true);
  assert.equal(result.changed,false);
  assert.deepEqual(calls.slice(startAt).map(call=>call.mode),['start']);
  assert.equal(props.D1_PENDING_GENERATION,undefined);
  assert.equal(props.D1_PENDING_DELETE_CURSOR,undefined);
});

test('removed source students are deleted through the delta rather than copied into a new generation',()=>{
  const originalStudents=ctx.students_;
  const startAt=calls.length;
  ctx.students_=()=>[];
  try{
    const response=ctx.syncD1Now();
    assert.equal(response.changed,true);
    const updates=calls.slice(startAt).flatMap(call=>call.records||[]);
    const removals=calls.slice(startAt).flatMap(call=>call.keys||[]);
    assert.equal(updates.length,0,'unchanged faculty and groups should not be rewritten');
    assert.deepEqual(removals.map(key=>key.kind).sort(),['student','student_email']);
    assert.equal(calls.at(-1).upserts,0);
    assert.equal(calls.at(-1).deletes,2);
    assert.equal([...fakeRecords.values()].some(record=>record.kind==='student'),false);
  }finally{ctx.students_=originalStudents;}
});
