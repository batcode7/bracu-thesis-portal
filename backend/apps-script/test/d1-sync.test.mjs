import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const script=readFileSync(new URL('../Code.gs',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../D1Sync.gs',import.meta.url),'utf8');
const props={D1_SYNC_URL:'https://bracu-thesis-portal.pages.dev/internal/d1-sync',
  D1_SYNC_SECRET:'example-test-sync-secret-longer-than-32-chars'};
const calls=[];
let syncNumber=0,feedback='Review experimental methodology';
const lock={tryLock:()=>true,releaseLock:()=>{}};
const ctx=vm.createContext({
  console,LockService:{getScriptLock:()=>lock},
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
    return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,skip:false})};
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
  assert.equal(records.find(r=>r.kind==='resource').data.title,'Template');
  assert.ok(records.find(r=>r.kind==='prime_admin'&&r.key==='partha.bhoumik@bracu.ac.bd'));
});

test('Apps Script sync publishes changed older rows, with manifest, batches and commit',()=>{
  const startCalls=calls.length;
  const first=ctx.syncD1Now();
  assert.equal(first.changed,true);assert.ok(first.count>0);
  assert.deepEqual(Array.from(calls.slice(startCalls),call=>call.mode),['start','batch','commit']);
  assert.equal(calls[startCalls+1].records.find(item=>item.kind==='group').data.phaseComments.P2,'Review experimental methodology');
  const old=ctx.groups_;
  ctx.groups_=()=>old().map(group=>({...group,phaseComments:{...group.phaseComments,P2:'Updated feedback in an old row'}}));
  try{
    const second=ctx.syncD1Now();assert.equal(second.changed,true);
    assert.equal(calls.at(-2).records.find(item=>item.kind==='group').data.phaseComments.P2,'Updated feedback in an old row');
    assert.notEqual(calls[startCalls].checksum,calls.at(-3).checksum);
  }finally{ctx.groups_=old;}
});
