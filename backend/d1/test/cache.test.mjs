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
  makeRecord('admin','prime@bracu.ac.bd',{email:'prime@bracu.ac.bd'},{email:'prime@bracu.ac.bd'}),
  makeRecord('faculty','faculty@bracu.ac.bd',{email:'faculty@bracu.ac.bd',name:'Dr. Faculty A',designation:'Professor',room:'4A21'},{email:'faculty@bracu.ac.bd'}),
  makeRecord('faculty_list','faculty@bracu.ac.bd',{email:'faculty@bracu.ac.bd',name:'Dr. Faculty A',initial:'FA',aliases:[],designation:'Professor',room:'4A21',status:'Active',groups:1,source:'Faculty Details'},{email:'faculty@bracu.ac.bd',name:'Dr. Faculty A'}),
  makeRecord('group','T2530001',groupA,{thesisId:'T2530001',stage:groupA.stage}),
  makeRecord('group','T2530002',groupB,{thesisId:'T2530002',stage:groupB.stage}),
  makeRecord('student','22100001',{id:'22100001',name:'Student A',email:'a@g.bracu.ac.bd',thesisId:'T2530001',marks:{p1:0,p2:9}},{thesisId:'T2530001',name:'Student A'}),
  makeRecord('student','22100002',{id:'22100002',name:'Student B',email:'b@g.bracu.ac.bd',thesisId:'T2530002',marks:{p1:4}},{thesisId:'T2530002',name:'Student B'}),
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
    assert.deepEqual((await readD1Action('session',{email:'prime@bracu.ac.bd'},env)).data.roles,['admin']);
    assert.deepEqual((await readD1Action('overviewCounts',{email:'prime@bracu.ac.bd'},env)).data.counts,{P1:0,P2:1,Defense:1,Completed:0});
    await assert.rejects(readD1Action('overviewCounts',{email:'faculty@bracu.ac.bd'},env),/Administrator access required/);
    await assert.rejects(readD1Action('overviewCounts',{email:'a@g.bracu.ac.bd'},env),/Administrator access required/);
    assert.equal((await readD1Action('deadlines',{email:'prime@bracu.ac.bd'},env)).data.entries.length,3);
    assert.equal((await readD1Action('resources',{email:'b@g.bracu.ac.bd'},env)).data.items.length,1);
    await assert.rejects(readD1Action('student',{email:'faculty@bracu.ac.bd'},env),/Student record/);
    await assert.rejects(readD1Action('supervisor',{email:'a@g.bracu.ac.bd'},env),/Faculty record/);
    await assert.rejects(readD1Action('student',{email:'unknown@g.bracu.ac.bd'},env),/Not registered for thesis yet/);
    const initialSearch=(await readD1Action('search',{email:'prime@bracu.ac.bd'},env,{limit:10})).data;
    assert.equal(initialSearch.total,2);
    assert.equal(initialSearch.rows.length,2);
  }finally{db.close();}
});

test('D1 serves paginated faculty directory, student searches and details without expanding permissions',async()=>{
  const db=makeDB(),env={DB:db,D1_SYNC_SECRET:secret,D1_ENABLED:'true'};
  try{
    await sync(env,[...seed,makeRecord('faculty_list','unmatched-2',
      {name:'Unmatched Professor',email:'',initial:'',aliases:[],designation:'',room:'',status:'',groups:2,source:'Group info · not matched'},
      {name:'Unmatched Professor'})]);
    const principal={email:'prime@bracu.ac.bd'};
    const first=(await readD1Action('facultyList',principal,env,{limit:10,offset:0})).data;
    assert.equal(first.total,2);assert.equal(first.matched,1);assert.equal(first.missing,1);
    const filtered=(await readD1Action('facultyList',principal,env,{q:'faculty a',filter:'verified',limit:10})).data;
    assert.equal(filtered.total,1);assert.equal(filtered.faculty[0].email,'faculty@bracu.ac.bd');
    assert.equal((await readD1Action('facultyList',principal,env,{filter:'missing',limit:10})).data.total,1);
    assert.equal((await readD1Action('facultyList',principal,env,{limit:10,offset:10})).data.faculty.length,0);
    const byName=(await readD1Action('search',principal,env,{q:'student a',limit:10})).data;
    assert.equal(byName.total,1);assert.equal(byName.rows[0].student.id,'22100001');
    const byStage=(await readD1Action('search',principal,env,{stage:'Pre-Thesis 2',limit:10})).data;
    assert.equal(byStage.total,1);
    const byFaculty=(await readD1Action('search',principal,env,{facultyEmail:'faculty@bracu.ac.bd',limit:10})).data;
    assert.equal(byFaculty.total,1);
    const byInitial=(await readD1Action('search',principal,env,{q:'fa',limit:10})).data;
    assert.equal(byInitial.total,1);
    const details=(await readD1Action('detail',principal,env,{studentId:'22100001'})).data;
    assert.equal(details.group.id,'T2530001');assert.equal(details.marks.p1,0);
    assert.equal(details.evaluations.find(item=>item.phase==='P2').comment,'Add tests');
    assert.equal((await readD1Action('suggest',principal,env,{q:'student a'})).data.items[0].id,'22100001');
    await assert.rejects(readD1Action('search',{email:'faculty@bracu.ac.bd'},env,{q:'student'}),/Administrator access required/);
    await assert.rejects(readD1Action('detail',{email:'a@g.bracu.ac.bd'},env,{studentId:'22100002'}),/Administrator access required/);
    await assert.rejects(readD1Action('facultyList',{email:'faculty@bracu.ac.bd'},env),/Administrator access required/);
    await assert.rejects(readD1Action('search',principal,env,{limit:999}),/Invalid page/);
  }finally{db.close();}
});

test('D1 faculty pagination sends only visible groups and prefetched abstracts remain scoped',async()=>{
  const db=makeDB(),env={DB:db,D1_SYNC_SECRET:secret,D1_ENABLED:'true'};
  try{
    const withAbstract=seed.map(record=>record.kind==='group'&&record.key==='T2530001'?
      {...record,data:{...record.data,abstract:'Long and detailed abstract from Group info'}}:record);
    await sync(env,withAbstract);
    const faculty={email:'faculty@bracu.ac.bd'};
    const first=(await readD1Action('supervisor',faculty,env,{limit:10,offset:0,stage:'all',type:'all',myRole:'all'})).data;
    assert.equal(first.totalGroups,1);assert.equal(first.totalStudents,1);
    assert.equal(first.groups.length,1);assert.equal(first.students.length,1);
    assert.equal(first.groups[0].abstract,undefined);
    assert.equal((await readD1Action('supervisor',faculty,env,{limit:10,stage:'P1'})).data.totalGroups,0);
    assert.equal((await readD1Action('supervisor',faculty,env,{limit:10,stage:'P2'})).data.totalGroups,1);
    assert.equal((await readD1Action('supervisor',faculty,env,{limit:10,offset:10})).data.groups.length,0);
    const abstracts=(await readD1Action('groupAbstracts',faculty,env,{groupIds:['T2530001']})).data.abstracts;
    assert.equal(abstracts.T2530001,'Long and detailed abstract from Group info');
    assert.equal((await readD1Action('groupAbstract',faculty,env,{groupId:'T2530001'})).data.abstract,abstracts.T2530001);
    await assert.rejects(readD1Action('groupAbstracts',faculty,env,{groupIds:['T2530002']}),/Not authorized/);
    await assert.rejects(readD1Action('groupAbstract',{email:'a@g.bracu.ac.bd'},env,{groupId:'T2530002'}),/Not authorized/);
    assert.equal((await readD1Action('groupAbstracts',{email:'prime@bracu.ac.bd'},env,{groupIds:['T2530001','T2530002']})).data.abstracts.T2530002,'');
  }finally{db.close();}
});

test('D1 directory pagination transfers ten records first and the remainder on demand',async()=>{
  const db=makeDB(),env={DB:db,D1_SYNC_SECRET:secret,D1_ENABLED:'true'};
  try{
    const more=Array.from({length:13},(_,index)=>makeRecord('faculty_list','unmatched-'+index,
      {name:'Unmatched faculty '+String(index).padStart(2,'0'),email:'',aliases:[],initial:'',designation:'',status:'',room:'',groups:1,source:'Group info'},
      {name:'Unmatched faculty '+String(index).padStart(2,'0')}));
    await sync(env,[...seed,...more]);
    const admin={email:'prime@bracu.ac.bd'};
    const first=(await readD1Action('facultyList',admin,env,{limit:10,offset:0})).data;
    const second=(await readD1Action('facultyList',admin,env,{limit:10,offset:10})).data;
    assert.equal(first.total,14);assert.equal(first.faculty.length,10);
    assert.equal(second.faculty.length,4);
    assert.equal(new Set([...first.faculty,...second.faculty].map(x=>x.name)).size,14);
  }finally{db.close();}
});

test('D1 separates Early Defense deadlines from Final Defense for students',async()=>{
  const db=makeDB(),env={DB:db,D1_SYNC_SECRET:secret,D1_ENABLED:'true'};
  const earlyGroup={id:'T2530003',title:'Early Defense Group',type:'Thesis',stage:'Early Def'};
  const records=[...seed,
    makeRecord('group',earlyGroup.id,earlyGroup,{thesisId:earlyGroup.id,stage:earlyGroup.stage}),
    makeRecord('student','22100003',{id:'22100003',name:'Early Student',thesisId:earlyGroup.id},{thesisId:earlyGroup.id}),
    makeRecord('student_email','early@g.bracu.ac.bd',{studentId:'22100003'},{email:'early@g.bracu.ac.bd',thesisId:earlyGroup.id}),
    makeRecord('deadline','5',{id:'5',phase:'Early Defense',title:'Early draft'}),
    makeRecord('deadline','6',{id:'6',phase:'Defense',title:'Early Defense — Legacy slide'}),
  ];
  try{
    assert.equal((await sync(env,records,'generationEarlyDefense123')).status,200);
    const ids=async email=>(await readD1Action('deadlines',{email},env)).data.entries.map(item=>item.id);
    assert.deepEqual(await ids('early@g.bracu.ac.bd'),['2','5','6']);
    assert.deepEqual(await ids('b@g.bracu.ac.bd'),['2','4']);
    assert.deepEqual(await ids('a@g.bracu.ac.bd'),['2','3']);
    assert.deepEqual(await ids('faculty@bracu.ac.bd'),['2','3','4','5','6']);
    assert.deepEqual(await ids('prime@bracu.ac.bd'),['2','3','4','5','6']);
    assert.deepEqual((await readD1Action('overviewCounts',{email:'prime@bracu.ac.bd'},env)).data.counts,{P1:0,P2:1,Defense:2,Completed:0});
  }finally{db.close();}
});

test('D1 maps legacy Prime Admin cache records to the same ordinary admin role',async()=>{
  const db=makeDB(),env={DB:db,D1_SYNC_SECRET:secret,D1_ENABLED:'true'};
  try{
    const oldSeed=seed.map(record=>record.kind==='admin'?{...record,kind:'prime_admin'}:record);
    assert.equal((await sync(env,oldSeed,'legacyGeneration123456789')).status,200);
    const migrated=(await readD1Action('session',{email:'prime@bracu.ac.bd'},env)).data;
    assert.deepEqual(migrated.roles,['admin']);
    assert.equal(migrated.role,'admin');
    assert.equal((await readD1Action('deadlines',{email:'prime@bracu.ac.bd'},env)).data.entries.length,3);
  }finally{db.close();}
});

test('An explicitly enabled but empty D1 does not flood Google Apps Script with read fallbacks',async()=>{
  const db=makeDB();
  try{
    await assert.rejects(readD1Action('student',{email:'a@g.bracu.ac.bd'},{DB:db,D1_ENABLED:'true'}),/not completed/);
    assert.equal(await readD1Action('student',{email:'a@g.bracu.ac.bd'},{DB:db,D1_ENABLED:'false'}),null);
  }finally{db.close();}
});
