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
    setProperty:(key,value)=>{props[key]=value;},
    deleteProperty:key=>{delete props[key];},
  })},
});
vm.runInContext(source,context);
const students=[
  {id:'22101234',name:'First',thesisId:'T2530123',email:'first@gmail.com',aliases:['first@g.bracu.ac.bd']},
  {id:'22104567',name:'Second',thesisId:'T2530124',email:'second@gmail.com',aliases:['second@g.bracu.ac.bd']},
];
const groups=[
  {id:'T2530123',title:'Research A',type:'Thesis',stage:'Pre-Thesis 2',primarySupervisor:'Faculty A'},
  {id:'T2530124',title:'Research B',type:'Thesis',stage:'Final Thesis',primarySupervisor:'Faculty B'},
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
  assert.equal(result.evaluations.find(e=>e.phase==='P1').score,4);
  assert.equal(result.evaluations.find(e=>e.phase==='P2').score,null);
  assert.throws(()=>run('first@g.bracu.ac.bd','search',{q:'22104567'}),/Not authorized/);
  assert.throws(()=>run('first@g.bracu.ac.bd','detail',{studentId:'22104567'}),/Not authorized/);
});
test('supervisor receives only the group matched by trusted email/name mapping',()=>{
  const result=run('faculty@bracu.ac.bd','supervisor');
  assert.deepEqual(Array.from(result.students,s=>s.id),['22101234']);
  assert.deepEqual(Array.from(result.groups,g=>g.id),['T2530123']);
  assert.equal(result.students[0].progress.p1,true);
  assert.throws(()=>run('faculty@bracu.ac.bd','detail',{studentId:'22104567'}),/Not authorized/);
});
test('only the protected prime administrator can grant ordinary admin rights',()=>{
  assert.throws(()=>run('faculty@bracu.ac.bd','addAdmin',{email:'admin@bracu.ac.bd'}),/Not authorized/);
  const result=run('partha.bhoumik@bracu.ac.bd','addAdmin',{email:'admin@bracu.ac.bd'});
  assert.deepEqual(Array.from(result.admins),['admin@bracu.ac.bd']);
  assert.equal(run('admin@bracu.ac.bd','session').role,'admin');
  assert.throws(()=>run('admin@bracu.ac.bd','addAdmin',{email:'other@bracu.ac.bd'}),/Not authorized/);
  assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','addAdmin',{email:'partha.bhoumik@bracu.ac.bd'}),/Invalid administrator/);
});
test('blank evaluator comments fail closed even when phase is released',()=>{
  const blank=[...evaluations,{...evaluations[0],evaluator:'Judge C',comment:''}];
  context.comments_=()=>blank;
  assert.equal(run('first@g.bracu.ac.bd','student').evaluations.find(e=>e.phase==='P1').score,null);
  context.comments_=()=>evaluations;
});
test('unregistered Workspace emails and consumer Gmail do not become portal users',()=>{
  assert.throws(()=>run('unknown@bracu.ac.bd','session'),/not authorized/);
  assert.throws(()=>run('first@gmail.com','session'),/verified BRAC identity/);
});
test('phase release rejects incomplete evaluated records',()=>{
  context.comments_=()=>[{...evaluations[1],comment:''}];
  assert.throws(()=>run('partha.bhoumik@bracu.ac.bd','release',{semester:'Summer 2026',phase:'P2',published:true}),/comment before phase publication/);
  context.comments_=()=>evaluations;
});
test('admin semester stats count complete students once, not one per evaluator',()=>{
  props.SEMESTER_SOURCES_JSON=JSON.stringify([{semester:'Spring 2025',spreadsheetId:'oldsource'},{semester:'Summer 2026',spreadsheetId:'newsource'}]);
  context.comments_=()=>[evaluations[0],{...evaluations[0],evaluator:'Second judge'}];
  const result=run('partha.bhoumik@bracu.ac.bd','summary').semesters;
  assert.equal(result[0].P1.students,1);
  assert.equal(result[0].P1.groups,1);
  assert.equal(result[1].P2.students,0);
  context.comments_=()=>[evaluations[0],{...evaluations[0],evaluator:'Second judge',comment:''}];
  assert.equal(run('partha.bhoumik@bracu.ac.bd','summary').semesters[0].P1.students,0);
  context.comments_=()=>evaluations;
  delete props.SEMESTER_SOURCES_JSON;
});
