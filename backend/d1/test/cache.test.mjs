import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import {readD1Action} from '../read.mjs';
import {handleD1Sync} from '../sync.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const makeDB=()=>{
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const wrap=(statement,bind=[])=>({
    bind:(...next)=>wrap(statement,next),
    first:async()=>sqlite.prepare(statement).get(...bind)||null,
    all:async()=>({results:sqlite.prepare(statement).all(...bind)}),
    run:async()=>sqlite.prepare(statement).run(...bind),
  });
  return {
    prepare:statement=>wrap(statement),
    batch:async statements=>{
      sqlite.exec('BEGIN TRANSACTION');
      try{
        const results=[];for(const statement of statements)results.push(await statement.run());
        sqlite.exec('COMMIT');return results;
      }catch(error){sqlite.exec('ROLLBACK');throw error;}
    },
    close:()=>sqlite.close(),
  };
};
const secret='test-secret-this-is-longer-than-32-characters';
const makeRecord=(kind,key,data,{email='',thesisId='',stage='',name=''}={})=>({kind,key,data,email,thesisId,stage,name});
const groupA={id:'T2530001',title:'Group A',type:'Thesis',stage:'Pre-Thesis 2',primarySupervisor:'Dr. Faculty A',
  phaseSemesters:{P1:'Spring26',P2:'Summer26',Defense:''},phaseComments:{P1:'Improve methods',P2:'Add tests',Defense:''},
  facultyContacts:[{slot:'Supervisor 1',name:'Dr. Faculty A',email:'faculty@bracu.ac.bd',room:'4A21',designation:'Professor'}]};
const groupB={id:'T2530002',title:'Group B',type:'Thesis',stage:'Final Thesis',phaseSemesters:{},phaseComments:{Defense:'Secret B feedback'}};
const seed=[
  makeRecord('prime_admin','prime@bracu.ac.bd',{email:'prime@bracu.ac.bd'},{email:'prime@bracu.ac.bd'}),
  makeRecord('faculty','faculty@bracu.ac.bd',{email:'faculty@bracu.ac.bd',name:'Dr. Faculty A',designation:'Professor',room:'4A21'},{email:'faculty@bracu.ac.bd'}),
  makeRecord('group','T2530001',groupA,{thesisId:'T2530001'}),
  makeRecord('group','T2530002',groupB,{thesisId:'T2530002'}),
  makeRecord('student','22100001',{id:'22100001',name:'Student A',email:'a@g.bracu.ac.bd',thesisId:'T2530001',marks:{p1:0,p2:9}},{thesisId:'T2530001'}),
  makeRecord('student','22100002',{id:'22100002',name:'Student B',email:'b@g.bracu.ac.bd',thesisId:'T2530002',marks:{p1:4}},{thesisId:'T2530002'}),
  makeRecord('student_email','a@g.bracu.ac.bd',{studentId:'22100001'},{email:'a@g.bracu.ac.bd',thesisId:'T2530001'}),
  makeRecord('student_email','b@g.bracu.ac.bd',{studentId:'22100002'},{email:'b@g.bracu.ac.bd',thesisId:'T2530002'}),
  makeRecord('assignment','faculty@bracu.ac.bd|T2530001',{email:'faculty@bracu.ac.bd',thesisId:'T2530001',myRoles:['Supervisor']},{email:'faculty@bracu.ac.bd',thesisId:'T2530001'}),
  makeRecord('deadline','2',{id:'2',phase:'General',title:'General Deadline'}),
  makeRecord('deadline','3',{id:'3',phase:'P2',title:'P2 Submission'}),
  makeRecord('deadline','4',{id:'4',phase:'Defense',title:'Defense Submission'}),
  makeRecord('resource','5',{id:'5',phase:'General',title:'Thesis Template',url:'https://example.org/template'}),
];
async function sync(env,records,generation='generation123456789',checksum='a'.repeat(64)){
  const send=async body=>{
    const response=await handleD1Sync(new Request('https://portal.example.org/internal/d1-sync',{method:'POST',
      headers:{'x-d1-sync-secret':secret},body:JSON.stringify({...body,generation})}),env);
    return {status:response.status,data:await response.json()};
  };
  assert.equal((await send({mode:'start',checksum,expectedCount:records.length})).status,200);
  assert.equal((await send({mode:'batch',records})).status,200);
  return send({mode:'commit'});
}

test('D1 synchronization publishes complete generations only, keeping the previous snapshot during partial imports',async()=>{
  const db=makeDB(),env={DB:db,D1_SYNC_SECRET:secret,D1_ENABLED:'true'};
  try{
    const bad=await handleD1Sync(new Request('https://portal.example.org/internal/d1-sync',{method:'POST',
      headers:{'x-d1-sync-secret':'forged-secret'},body:'{}'}),env);
    assert.equal(bad.status,403);
    assert.equal((await sync(env,seed)).status,200);
    const before=await readD1Action('resources',{email:'a@g.bracu.ac.bd'},env);
    assert.equal(before.data.items[0].title,'Thesis Template');
    const second=seed.map(entry=>entry.kind==='resource'?{...entry,data:{...entry.data,title:'New Template'}}:entry);
    const generation='generationNew123456789';
    const send=async body=>handleD1Sync(new Request('https://portal.example.org/internal/d1-sync',{
      method:'POST',headers:{'x-d1-sync-secret':secret},body:JSON.stringify({...body,generation})}),env);
    assert.equal((await send({mode:'start',checksum:'b'.repeat(64),expectedCount:second.length})).status,200);
    assert.equal((await send({mode:'batch',records:second.slice(0,2)})).status,200);
    assert.equal((await send({mode:'commit'})).status,400);
    assert.equal((await readD1Action('resources',{email:'a@g.bracu.ac.bd'},env)).data.items[0].title,'Thesis Template');
    assert.equal((await send({mode:'batch',records:second.slice(2)})).status,200);
    assert.equal((await send({mode:'commit'})).status,200);
    assert.equal((await readD1Action('resources',{email:'a@g.bracu.ac.bd'},env)).data.items[0].title,'New Template');
  }finally{db.close();}
});

test('D1 respects verified student and faculty scopes and preserves master comments, marks, and deadline phases',async()=>{
  const db=makeDB(),env={DB:db,D1_SYNC_SECRET:secret,D1_ENABLED:'true'};
  try{
    await sync(env,seed);
    const session=(await readD1Action('session',{email:'faculty@bracu.ac.bd',name:'Faculty A'},env)).data;
    assert.deepEqual(session.roles,['supervisor']);assert.equal(session.designation,'Professor');assert.equal(session.room,'4A21');
    const student=(await readD1Action('student',{email:'a@g.bracu.ac.bd'},env)).data;
    assert.equal(student.student.id,'22100001');assert.equal(student.members.length,1);
    assert.equal(student.evaluations.find(item=>item.phase==='P1').score,0);
    assert.equal(student.evaluations.find(item=>item.phase==='P2').comment,'Add tests');
    const supervisor=(await readD1Action('supervisor',{email:'faculty@bracu.ac.bd'},env)).data;
    assert.deepEqual(supervisor.groups.map(group=>group.id),['T2530001']);
    assert.deepEqual(supervisor.students.map(item=>item.id),['22100001']);
    assert.equal(supervisor.groups[0].feedback.length,2);
    assert.deepEqual((await readD1Action('deadlines',{email:'a@g.bracu.ac.bd'},env)).data.entries.map(item=>item.phase),['General','P2']);
    assert.equal((await readD1Action('deadlines',{email:'faculty@bracu.ac.bd'},env)).data.entries.length,3);
    assert.equal((await readD1Action('resources',{email:'b@g.bracu.ac.bd'},env)).data.items.length,1);
    await assert.rejects(readD1Action('student',{email:'faculty@bracu.ac.bd'},env),/Student record/);
    await assert.rejects(readD1Action('supervisor',{email:'a@g.bracu.ac.bd'},env),/Faculty record/);
    await assert.rejects(readD1Action('student',{email:'unknown@g.bracu.ac.bd'},env),/not authorized/);
    assert.equal(await readD1Action('search',{email:'prime@bracu.ac.bd'},env),null);
  }finally{db.close();}
});

test('An explicitly enabled but empty D1 does not flood Google Apps Script with read fallbacks',async()=>{
  const db=makeDB();
  try{
    await assert.rejects(readD1Action('student',{email:'a@g.bracu.ac.bd'},{DB:db,D1_ENABLED:'true'}),/not completed/);
    assert.equal(await readD1Action('student',{email:'a@g.bracu.ac.bd'},{DB:db,D1_ENABLED:'false'}),null);
  }finally{db.close();}
});
