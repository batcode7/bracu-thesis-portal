/**
 * Authenticated, indexed D1 read model. Authentication happens at the Pages
 * gateway, never in this module. The caller MUST provide its verified Google
 * principal (or a server-signed session), never an email from the request body.
 */
const FAST_ACTIONS = new Set(['session','student','supervisor','deadlines','resources','overviewCounts',
  'facultyList','search','detail','suggest','groupAbstract','groupAbstracts']);
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
  if(/early/.test(v)&&/(def|final|thesis)/.test(v))return 'Defense';
  if(/(final|defense|defence|ft)/.test(v))return 'Defense';
  return '';
};
const deadlineStage = value => {
  const v=normalized(value).replace(/[\s_-]+/g,'');
  return /early/.test(v)&&/(def|final|thesis)/.test(v)?'Early Defense':stage(value);
};
const deadlinePhase = item => item.phase==='Early Defense'||
  (item.phase==='Defense'&&/^\s*early\s*(?:defen[cs]e|def|final)/i.test(item.title||''))?
  'Early Defense':item.phase;
const countStage = value => {
  const v=normalized(value).replace(/[\s_-]+/g,'');
  if(/(complete|finished|graduat)/.test(v))return 'Completed';
  return stage(value);
};
const comment = value => {
  const v=String(value||'').trim();
  return v&&!/^(no comments\b|panel manager link missing\b|#(?:REF!|N\/A|VALUE!|ERROR!|NAME\?|DIV\/0!))/i.test(v)?v:'';
};
const validPage = (input,allowed=[10,20,50,100]) => {
  const limit=input.limit===undefined?10:Number(input.limit);
  const offset=input.offset===undefined?0:Number(input.offset);
  if(!allowed.includes(limit)||!Number.isInteger(offset)||offset<0||offset>100000)fail(400,'Invalid page size or offset');
  return {limit,offset};
};
const searchText = value => String(value||'').trim().toLowerCase();
const matchField = (value,needle) => searchText(value).includes(needle);
const isMatchingStage = (value,filter) => {
  if(!filter||filter==='all')return true;
  const current=countStage(value);
  return filter==='Completed'||filter==='Deferred' ? searchText(value)===searchText(filter) : current===filter;
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
function rolesFor(admin,faculty,student){
  return [...(admin?['admin']:[]),...(faculty?['supervisor']:[]),...(student?['student']:[])];
}

/** Returns {handled,data} or null. Never bypass a missing active D1 snapshot. */
export async function readD1Action(action,principal,env,params={}){
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
  const [admin,legacyAdmin,faculty,alias]=await Promise.all([
    indexed(env.DB,gen,'admin',email),
    // Active D1 generations created before this change used prime_admin.
    // Map their members to the new single admin role until the next sync.
    indexed(env.DB,gen,'prime_admin',email),
    indexed(env.DB,gen,'faculty',email),
    indexed(env.DB,gen,'student_email',email),
  ]);
  const isAdmin=!!(admin||legacyAdmin);
  const roles=rolesFor(isAdmin,faculty,alias);
  if(!roles.length)fail(403,email.endsWith('@g.bracu.ac.bd')?'Not registered for thesis yet':'Account is not authorized');
  if(action==='session')return {handled:true,data:{role:roles[0],roles,email,
    name:String(principal.name||faculty?.name||email).slice(0,120),
    designation:faculty?.designation||'',room:faculty?.room||''}};

  if(action==='overviewCounts'){
    if(!isAdmin)fail(403,'Administrator access required');
    const counts={P1:0,P2:0,Defense:0,Completed:0};
    const stages=await rows(env.DB,"SELECT stage,COUNT(*) AS total FROM portal_cache WHERE generation=? AND kind='group' GROUP BY stage",gen);
    for(const row of stages){const key=countStage(row.stage);if(Object.hasOwn(counts,key))counts[key]+=Number(row.total)||0;}
    return {handled:true,data:{counts}};
  }

  if(action==='facultyList'){
    if(!isAdmin)fail(403,'Administrator access required');
    const {limit,offset}=validPage(params);
    const filter=String(params.filter||'all');
    const needle=searchText(params.q);
    if(needle.length>120||!['all','verified','missing'].includes(filter))fail(400,'Invalid faculty directory filter');
    const countRows=await rows(env.DB,"SELECT COUNT(*) AS total, SUM(CASE WHEN email<>'' THEN 1 ELSE 0 END) AS verified FROM portal_cache WHERE generation=? AND kind='faculty_list'",gen);
    const count=Number(countRows[0]?.total||0),matched=Number(countRows[0]?.verified||0);
    if(count===0)fail(503,'Faculty directory index is unavailable. Run the updated D1 synchronization.');
    const where=["generation=?","kind='faculty_list'"];
    const bind=[gen];
    if(filter!=='all')where.push(filter==='verified'?"email<>''":"email=''");
    if(needle){where.push("(LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(data_json) LIKE ?)");const like='%'+needle+'%';bind.push(like,like,like);}
    const clause=where.join(' AND ');
    const [totalRow,items]=await Promise.all([
      q(env.DB,`SELECT COUNT(*) AS total FROM portal_cache WHERE ${clause}`,...bind).first(),
      rows(env.DB,`SELECT data_json FROM portal_cache WHERE ${clause} ORDER BY name COLLATE NOCASE, item_key LIMIT ? OFFSET ?`,...bind,limit,offset),
    ]);
    return {handled:true,data:{faculty:items.map(decode),total:Number(totalRow?.total||0),offset,matched,missing:count-matched,updatedAt:active.updated_at,warning:''}};
  }

  if(action==='search'){
    if(!isAdmin)fail(403,'Administrator access required');
    const {limit,offset}=validPage(params);
    const needle=searchText(params.q),stageFilter=String(params.stage||''),typeFilter=String(params.type||'');
    const facultyEmail=searchText(params.facultyEmail);
    if(needle.length>120)fail(400,'Search text too long');
    if(facultyEmail&&!(await indexed(env.DB,gen,'faculty',facultyEmail)))fail(400,'Faculty selection not verified');
    const predicates=["s.generation=?","s.kind='student'"],bindings=[gen];
    if(stageFilter&&stageFilter!=='All stages'){predicates.push("json_extract(g.data_json,'$.stage')=?");bindings.push(stageFilter);}
    if(typeFilter&&typeFilter!=='All types'){predicates.push("json_extract(g.data_json,'$.type')=?");bindings.push(typeFilter);}
    if(facultyEmail){
      predicates.push("EXISTS (SELECT 1 FROM portal_cache a WHERE a.generation=s.generation AND a.kind='assignment' AND a.thesis_id=g.item_key AND a.email=?)");bindings.push(facultyEmail);
    }
    if(needle){
      const fields=['s.item_key','s.name',"json_extract(s.data_json,'$.email')",'g.item_key','g.name',
        "json_extract(g.data_json,'$.primarySupervisor')","json_extract(g.data_json,'$.secondarySupervisor')",
        "json_extract(g.data_json,'$.coSupervisor1')","json_extract(g.data_json,'$.coSupervisor2')"];
      predicates.push('('+fields.map(field=>`LOWER(COALESCE(${field},'')) LIKE ?`).join(' OR ')+
        " OR EXISTS (SELECT 1 FROM portal_cache a JOIN portal_cache f ON f.generation=a.generation AND f.kind='faculty' AND f.email=a.email WHERE a.generation=s.generation AND a.kind='assignment' AND a.thesis_id=g.item_key AND LOWER(json_extract(f.data_json,'$.initial'))=?) )");
      bindings.push(...fields.map(()=>'%'+needle+'%'),needle);
    }
    const from="FROM portal_cache s JOIN portal_cache g ON g.generation=s.generation AND g.kind='group' AND g.item_key=s.thesis_id";
    const where=' WHERE '+predicates.join(' AND ');
    const [totalResult,result]=await Promise.all([
      q(env.DB,`SELECT COUNT(*) AS total ${from}${where}`,...bindings).first(),
      rows(env.DB,`SELECT s.data_json AS student_json,g.item_key AS group_id,g.name AS group_title,
        json_extract(g.data_json,'$.type') AS group_type,json_extract(g.data_json,'$.stage') AS group_stage,
        json_extract(g.data_json,'$.primarySupervisor') AS supervisor ${from}${where} ORDER BY s.item_key LIMIT ? OFFSET ?`,...bindings,limit,offset),
    ]);
    return {handled:true,data:{total:Number(totalResult?.total||0),offset,rows:result.map(row=>{
      const s=JSON.parse(row.student_json);
      return {student:{id:s.id,name:s.name,email:s.email,thesisId:s.thesisId},
        group:{id:row.group_id,title:row.group_title||'',type:row.group_type||'',stage:row.group_stage||'',primarySupervisor:row.supervisor||''}};
    })}};
  }

  if(action==='detail'){
    if(!isAdmin)fail(403,'Administrator access required');
    const id=String(params.studentId||'').trim();if(!id||id.length>80)fail(400,'Invalid student ID');
    const student=await indexed(env.DB,gen,'student',id);if(!student)fail(400,'Student ID not found');
    const group=await indexed(env.DB,gen,'group',student.thesisId);if(!group)fail(400,'Group not found');
    const members=(await memberRecords(env.DB,gen,[group.id])).map(s=>({id:s.id,name:s.name,email:s.email}));
    return {handled:true,data:{student:{id:student.id,name:student.name,email:student.email,thesisId:student.thesisId},
      group,members,marks:student.marks||{},evaluations:evaluations(student,group)}};
  }

  if(action==='suggest'){
    if(!isAdmin)fail(403,'Administrator access required');
    const needle=searchText(params.q),kind=String(params.kind||'');
    if(needle.length>100||kind&&!['student','faculty','group'].includes(kind))fail(400,'Invalid academic suggestion query');
    if(needle.length<2)return {handled:true,data:{items:[]}};
    const kinds=kind?[kind]:['student','faculty','group'];
    const matches=[];
    // The index is bounded; only matching candidates are transferred from D1.
    for(const itemKind of kinds){
      const fields=itemKind==='group'?['item_key','name']:itemKind==='student'?
        ['item_key','name',"json_extract(data_json,'$.email')","json_extract(data_json,'$.aliases')"]:
        ['item_key','name',"json_extract(data_json,'$.initial')","json_extract(data_json,'$.names')"];
      const found=await rows(env.DB,`SELECT item_key,data_json FROM portal_cache WHERE generation=? AND kind=? AND (${fields.map(field=>`LOWER(COALESCE(${field},'')) LIKE ?`).join(' OR ')}) LIMIT 60`,gen,itemKind,...fields.map(()=>'%'+needle+'%'));
      for(const item of found){
        const record=JSON.parse(item.data_json);
        if(itemKind==='student')matches.push({kind:'student',id:record.id,label:record.name||record.id,detail:'Student ID '+record.id+(record.thesisId?' · '+record.thesisId:''),email:record.email||''});
        if(itemKind==='faculty')matches.push({kind:'faculty',id:record.email,label:record.name||record.email,detail:'Faculty · '+(record.initial||record.email),email:record.email});
        if(itemKind==='group')matches.push({kind:'group',id:record.id,label:record.id,detail:'Research group · '+(record.title||'Title not listed'),email:''});
      }
    }
    const score=item=>{
      const text=[item.id,item.label,item.detail,item.email].map(searchText);
      return text.some(s=>s===needle)?0:text.some(s=>s.startsWith(needle))?1:text.some(s=>s.split(/\s+/).some(word=>word.startsWith(needle)))?2:3;
    };
    matches.sort((a,b)=>score(a)-score(b)||['student','faculty','group'].indexOf(a.kind)-['student','faculty','group'].indexOf(b.kind)||a.label.localeCompare(b.label));
    return {handled:true,data:{items:matches.slice(0,12)}};
  }

  if(action==='groupAbstract'){
    const groupId=String(params.groupId||'').trim();if(!groupId||groupId.length>100)fail(400,'Invalid group ID');
    if(!isAdmin){
      const assigned=faculty?await indexed(env.DB,gen,'assignment',email+'|'+groupId):null;
      const student=alias?await indexed(env.DB,gen,'student',alias.studentId):null;
      if(!assigned&&student?.thesisId!==groupId)fail(403,'Not authorized for this group');
    }
    const group=await indexed(env.DB,gen,'group',groupId);
    if(!group)fail(404,'Group not found');
    return {handled:true,data:{groupId,abstract:String(group.abstract||'')}};
  }
  if(action==='groupAbstracts'){
    const groupIds=params.groupIds;
    if(!Array.isArray(groupIds)||groupIds.length>20||groupIds.some(id=>typeof id!=='string'||!id||id.length>100))fail(400,'Invalid group IDs');
    const unique=[...new Set(groupIds)];if(!unique.length)return {handled:true,data:{abstracts:{}}};
    let authorized=unique;
    if(!isAdmin){
      const assigned=faculty?(await rows(env.DB,`SELECT thesis_id FROM portal_cache WHERE generation=? AND kind='assignment' AND email=? AND thesis_id IN (${unique.map(()=>'?').join(',')})`,gen,email,...unique)).map(x=>x.thesis_id):[];
      const registered=alias?await indexed(env.DB,gen,'student',alias.studentId):null;
      authorized=unique.filter(id=>assigned.includes(id)||registered?.thesisId===id);
      if(authorized.length!==unique.length)fail(403,'Not authorized for one or more groups');
    }
    const result=await rows(env.DB,`SELECT item_key,json_extract(data_json,'$.abstract') AS abstract FROM portal_cache WHERE generation=? AND kind='group' AND item_key IN (${authorized.map(()=>'?').join(',')})`,gen,...authorized);
    const abstracts={};for(const row of result)abstracts[row.item_key]=String(row.abstract||'');
    return {handled:true,data:{abstracts}};
  }

  if(action==='resources'){
    const result=(await rows(env.DB,"SELECT data_json FROM portal_cache WHERE generation=? AND kind='resource' ORDER BY CAST(item_key AS INTEGER)",gen)).map(decode);
    return {handled:true,data:{items:result}};
  }
  if(action==='deadlines'){
    let selectedStage='';
    if(!isAdmin&&!faculty&&alias){
      const registered=await indexed(env.DB,gen,'student',alias.studentId);
      const group=registered?.thesisId?await indexed(env.DB,gen,'group',registered.thesisId):null;
      selectedStage=deadlineStage(group?.stage);
    }
    const result=(await rows(env.DB,"SELECT data_json FROM portal_cache WHERE generation=? AND kind='deadline' ORDER BY CAST(item_key AS INTEGER)",gen)).map(decode)
      .filter(item=>isAdmin||faculty||item.phase==='General'||deadlinePhase(item)===selectedStage);
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
      rows(env.DB,`SELECT ${params.limit===undefined?'g.data_json':"json_remove(g.data_json,'$.abstract')"} AS data_json FROM portal_cache a JOIN portal_cache g ON g.generation=a.generation AND g.kind='group' AND g.item_key=a.thesis_id WHERE a.generation=? AND a.kind='assignment' AND a.email=?`,gen,email).then(result=>result.map(decode)),
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
    if(params.limit===undefined)return {handled:true,data:{supervisorEmail:email,students,groups}};
    const {limit,offset}=validPage(params);
    const needle=searchText(params.q),stageFilter=String(params.stage||'all'),typeFilter=String(params.type||'all'),roleFilter=String(params.myRole||'all');
    if(needle.length>120||!['all','P1','P2','Defense','Completed','Deferred'].includes(stageFilter)||
      !['all','Thesis','Project','Internship'].includes(typeFilter)||!['all','Supervisor','Co-Supervisor'].includes(roleFilter))fail(400,'Invalid group filter');
    const byGroup=new Map();for(const student of students){const list=byGroup.get(student.thesisId)||[];list.push(student);byGroup.set(student.thesisId,list);}
    const filtered=groups.filter(group=>isMatchingStage(group.stage,stageFilter)&&
      (typeFilter==='all'||group.type===typeFilter)&&(roleFilter==='all'||group.myRoles?.includes(roleFilter))&&
      (!needle||[group.id,group.title,group.type,group.stage,group.primarySupervisor,group.secondarySupervisor,group.coSupervisor1,group.coSupervisor2,
        ...(byGroup.get(group.id)||[]).flatMap(s=>[s.id,s.name,s.email])].some(value=>matchField(value,needle)))).sort((a,b)=>a.id.localeCompare(b.id));
    const selected=filtered.slice(offset,offset+limit);
    const selectedIds=new Set(selected.map(g=>g.id));
    const slimGroups=selected.map(({abstract,...group})=>group);
    const uniqueStudents=new Set(filtered.flatMap(g=>(byGroup.get(g.id)||[]).map(s=>s.id))).size;
    return {handled:true,data:{supervisorEmail:email,groups:slimGroups,students:students.filter(s=>selectedIds.has(s.thesisId)),
      totalGroups:filtered.length,totalStudents:uniqueStudents,offset}};
  }
  return null;
}
