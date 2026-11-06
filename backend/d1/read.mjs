/**
 * Authenticated, indexed D1 read model. Authentication happens at the Pages
 * gateway, never in this module. The caller MUST provide its verified Google
 * principal (or a server-signed session), never an email from the request body.
 */
const FAST_ACTIONS = new Set(['session','student','supervisor','deadlines','resources']);
const PHASES = {
  P1:{field:'p1',max:5},P2:{field:'p2',max:10},
  Defense:{field:'defense',max:30},Supervisor:{field:'supervisor',max:55},
};

const normalized = value => String(value||'').trim().toLowerCase();
const fail = (status,message) => {const error=new Error(message);error.status=status;throw error;};
const decode = row => row ? JSON.parse(row.data_json) : null;
const q = (db,statement,...bind) => db.prepare(statement).bind(...bind);
const stage = value => {
  const v=normalized(value).replace(/[\s_-]+/g,'');
  if(/^(prethesis1|p1|pre1)$/.test(v))return 'P1';
  if(/^(prethesis2|p2|pre2)$/.test(v))return 'P2';
  if(/(final|defense|defence|ft)/.test(v))return 'Defense';
  return '';
};
const comment = value => {
  const v=String(value||'').trim();
  return v&&!/^(no comments\b|panel manager link missing\b|#(?:REF!|N\/A|VALUE!|ERROR!|NAME\?|DIV\/0!))/i.test(v)?v:'';
};
async function rows(db,sql,...bind){
  const result=await q(db,sql,...bind).all();return result.results||[];
}
async function indexed(db,generation,kind,key){
  return decode(await q(db,'SELECT data_json FROM portal_cache WHERE generation=? AND kind=? AND item_key=?',generation,kind,key).first());
}
async function memberRecords(db,generation,thesisIds){
  if(!thesisIds.length)return [];
  const output=[];
  for(let i=0;i<thesisIds.length;i+=75){
    const ids=thesisIds.slice(i,i+75);
    const statement=`SELECT data_json FROM portal_cache WHERE generation=? AND kind='student' AND thesis_id IN (${ids.map(()=>'?').join(',')})`;
    output.push(...(await rows(db,statement,generation,...ids)).map(decode));
  }
  return output;
}
function evaluations(student,group){
  const marks=student.marks||{};
  return Object.entries(PHASES).map(([phase,cfg])=>{
    const score=marks[cfg.field]??null;
    const feedback=phase==='Supervisor'?'':comment(group.phaseComments?.[phase]);
    const semester=phase==='Supervisor'?'Permanent master':String(group.phaseSemesters?.[phase]||'').trim()||'Semester not recorded';
    return {id:student.id+'|'+phase,studentId:student.id,phase,semester,score,maxScore:cfg.max,
      comment:feedback||null,evaluator:'',publication:score!==null||!!feedback?'published':'pending'};
  });
}
async function currentSnapshot(db){
  const active=await q(db,'SELECT generation,updated_at FROM portal_active WHERE id=1').first();
  if(!active?.generation)fail(503,'Academic cache has not completed its first synchronization');
  return active;
}
function rolesFor(prime,faculty,student){
  return [...(prime?['prime_admin']:[]),...(faculty?['supervisor']:[]),...(student?['student']:[])];
}

/** Returns {handled,data} or null. Never bypass a missing active D1 snapshot. */
export async function readD1Action(action,principal,env){
  if(!FAST_ACTIONS.has(action)||env.D1_ENABLED!=='true')return null;
  if(!env.DB)fail(503,'Academic cache binding DB is missing');
  const email=normalized(principal?.email);
  if(!/^[a-z0-9._%+\-]+@(?:g\.)?bracu\.ac\.bd$/.test(email))fail(401,'University identity required');
  let active;
  try{active=await currentSnapshot(env.DB);}catch(error){
    if(error.status)throw error;
    fail(503,'Academic cache is unavailable; contact the portal administrator');
  }
  const gen=active.generation;
  const [prime,faculty,alias]=await Promise.all([
    indexed(env.DB,gen,'prime_admin',email),
    indexed(env.DB,gen,'faculty',email),
    indexed(env.DB,gen,'student_email',email),
  ]);
  const roles=rolesFor(prime,faculty,alias);
  if(!roles.length)fail(403,'Account is not authorized');
  if(action==='session')return {handled:true,data:{role:roles[0],roles,email,
    name:String(principal.name||faculty?.name||email).slice(0,120),
    designation:faculty?.designation||'',room:faculty?.room||''}};

  if(action==='resources'){
    const result=(await rows(env.DB,"SELECT data_json FROM portal_cache WHERE generation=? AND kind='resource' ORDER BY CAST(item_key AS INTEGER)",gen)).map(decode);
    return {handled:true,data:{items:result}};
  }
  if(action==='deadlines'){
    let selectedStage='';
    if(!prime&&!faculty&&alias){
      const registered=await indexed(env.DB,gen,'student',alias.studentId);
      const group=registered?.thesisId?await indexed(env.DB,gen,'group',registered.thesisId):null;
      selectedStage=stage(group?.stage);
    }
    const result=(await rows(env.DB,"SELECT data_json FROM portal_cache WHERE generation=? AND kind='deadline' ORDER BY CAST(item_key AS INTEGER)",gen)).map(decode)
      .filter(item=>prime||faculty||item.phase==='General'||item.phase===selectedStage);
    return {handled:true,data:{entries:result}};
  }

  if(action==='student'){
    if(!alias)fail(403,'Student record does not match your verified account');
    const student=await indexed(env.DB,gen,'student',alias.studentId);
    if(!student)fail(403,'Verified student record is unavailable');
    const group=await indexed(env.DB,gen,'group',student.thesisId);
    if(!group)fail(403,'Thesis group is not registered');
    const peers=(await memberRecords(env.DB,gen,[group.id])).map(x=>({id:x.id,name:x.name,email:x.email}));
    const ownGroup={id:group.id,title:group.title,type:group.type,stage:group.stage,
      primarySupervisor:group.primarySupervisor,secondarySupervisor:group.secondarySupervisor,
      coSupervisor1:group.coSupervisor1,coSupervisor2:group.coSupervisor2,members:peers.map(x=>x.id)};
    return {handled:true,data:{student:{id:student.id,name:student.name,email,thesisId:student.thesisId},
      group:ownGroup,members:peers,facultyContacts:group.facultyContacts||[],evaluations:evaluations(student,group)}};
  }

  if(action==='supervisor'){
    if(!faculty)fail(403,'Faculty record does not match your verified account');
    const assignments=await rows(env.DB,"SELECT data_json FROM portal_cache WHERE generation=? AND kind='assignment' AND email=?",gen,email);
    const rolesByGroup=new Map(assignments.map(row=>{const a=decode(row);return [a.thesisId,a.myRoles||[]];}));
    const ids=[...rolesByGroup.keys()];
    if(!ids.length)return {handled:true,data:{supervisorEmail:email,students:[],groups:[]}};
    const [groupRecords,studentRecords]=await Promise.all([
      Promise.all(ids.map(id=>indexed(env.DB,gen,'group',id))),
      memberRecords(env.DB,gen,ids),
    ]);
    const groups=groupRecords.filter(Boolean).map(group=>{
      const feedback=['P1','P2','Defense'].map(phase=>({phase,
        semester:String(group.phaseSemesters?.[phase]||'').trim(),evaluator:'Panel feedback',
        comment:comment(group.phaseComments?.[phase]),students:[]})).filter(x=>x.comment);
      return {...group,myRoles:rolesByGroup.get(group.id)||[],feedback};
    });
    const students=studentRecords.map(student=>{
      const m=student.marks||{};
      return {id:student.id,name:student.name,email:student.email,thesisId:student.thesisId,
        marks:{p1:m.p1??null,p2:m.p2??null,defense:m.defense??null,supervisor:m.supervisor??null},
        progress:{p1:m.p1!==null&&m.p1!==undefined,p2:m.p2!==null&&m.p2!==undefined,
          defense:m.defense!==null&&m.defense!==undefined}};
    });
    return {handled:true,data:{supervisorEmail:email,students,groups}};
  }
  return null;
}
