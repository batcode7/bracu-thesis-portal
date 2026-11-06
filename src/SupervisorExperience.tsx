import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronRight, ClipboardCopy, GraduationCap, Mail, MapPin, MessageSquareText, Search, Users, X } from 'lucide-react';
import type { SupervisorDashboard } from './portal-api';
import type { ThesisGroup } from './data';
import { studentPhase } from './StudentExperience';
import { Pagination, type PageSize } from './Pagination';

type StageFilter = 'all' | 'P1' | 'P2' | 'Defense' | 'Completed' | 'Deferred';
type TypeFilter = 'all' | 'Thesis' | 'Project' | 'Internship';
type RoleFilter = 'all' | 'Supervisor' | 'Co-Supervisor';
type AssignedStudent = SupervisorDashboard['students'][number];
type GroupRecord = SupervisorDashboard['groups'][number];
const stageFilters: Array<{value:StageFilter;label:string}> = [
  {value:'all',label:'All stages'}, {value:'P1',label:'P1'}, {value:'P2',label:'P2'},
  {value:'Defense',label:'Final Defense'}, {value:'Completed',label:'Completed'}, {value:'Deferred',label:'Deferred'},
];

function matchesStage(group: ThesisGroup, filter: StageFilter) {
  if (filter === 'all') return true;
  if (filter === 'Completed' || filter === 'Deferred') return group.stage.toLowerCase() === filter.toLowerCase();
  return studentPhase(group.stage) === filter;
}

function Progress({ score, done, label, maximum }: {score?:number|null;done?:boolean;label:string;maximum:number}) {
  const available=score!==null&&score!==undefined;
  return <span className={`supervisor-record-pill ${available||done?'recorded':''}`}>{label}: {available?`${score} / ${maximum}`:done?'Recorded':'—'}</span>;
}

function visiblePhases(stage:string):Array<'P1'|'P2'|'Defense'> {
  const all:Array<'P1'|'P2'|'Defense'>=['P1','P2','Defense'];
  if(/(complet|finished|graduat)/i.test(stage))return all;
  const current=studentPhase(stage);
  return current?all.slice(0,all.indexOf(current)+1):[];
}

function GroupDetails({group,students,onClose}:{group:GroupRecord;students:AssignedStudent[];onClose:()=>void}) {
  const [copied,setCopied]=useState(false),[emailsCopied,setEmailsCopied]=useState(false),[copyError,setCopyError]=useState('');
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[onClose]);
  const team=[
    {role:'Supervisor 1',name:group.primarySupervisor},
    {role:'Supervisor 2',name:group.secondarySupervisor},
    {role:'Co-supervisor 1',name:group.coSupervisor1},
    {role:'Co-supervisor 2',name:group.coSupervisor2},
  ].filter(item=>!!item.name?.trim()&&!/^(?:not assigned|n\/?a|none|-+)$/i.test(item.name.trim()));
  const studentEmails=[...new Set(students.map(student=>student.email?.trim()).filter((address):address is string=>!!address).map(address=>address.toLowerCase()))];
  const feedback=group.feedback||[];
  const shownPhases=visiblePhases(group.stage);
  return <div className="modaloverlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="modalbox supervisor-detail" role="dialog" aria-modal="true" aria-labelledby="supervisor-dialog-heading">
      <div className="modalheader"><div><span className="eyebrow">ASSIGNED RESEARCH GROUP</span><h2 id="supervisor-dialog-heading">{group.title||'Research title not listed'}</h2></div><button type="button" className="iconbtn" aria-label="Close group details" onClick={onClose}><X size={20}/></button></div>
      <section className="supervisor-abstract"><h3>Abstract</h3><p>{group.abstract?.trim()||'No abstract has been recorded for this group yet.'}</p></section>
      <div className="supervisor-modal-id"><span>{group.type} ID</span><strong>{group.id}</strong><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(group.id);setCopied(true);window.setTimeout(()=>setCopied(false),1800);}catch{setCopied(false);}}} aria-label="Copy group ID">{copied?<Check size={15}/>:<ClipboardCopy size={15}/>} {copied?'Copied':'Copy ID'}</button></div>
      <div className="supervisor-modal-summary"><span><b>Stage</b>{group.stage}</span><span><b>Type</b>{group.type}</span><span><b>Students</b>{students.length}</span></div>
      <div className="supervisor-detail-section"><h3>Supervision team</h3><div className="supervisor-team-grid">{team.map(item=>{
        const contact=group.facultyContacts?.find(f=>f.slot===item.role);
        return <div key={item.role}><small>{item.role}</small><strong>{contact?.name||item.name}</strong>{contact?.email&&<a className="supervisor-faculty-contact" href={`mailto:${contact.email}`}><Mail size={13}/>{contact.email}</a>}{contact?.room&&<span className="supervisor-faculty-contact"><MapPin size={13}/>Room {contact.room}</span>}</div>;
      })}</div></div>
      <div className="supervisor-detail-section"><div className="supervisor-section-title"><h3>Group students</h3><div className="supervisor-roster-actions"><small>{students.length} {students.length===1?'student':'students'}</small><button className="supervisor-copy-emails" type="button" disabled={!studentEmails.length} onClick={async()=>{try{await navigator.clipboard.writeText(studentEmails.join(', '));setEmailsCopied(true);setCopyError('');window.setTimeout(()=>setEmailsCopied(false),1800);}catch{setCopyError('Could not copy the email list. Check browser clipboard permissions.');}}}>{emailsCopied?<Check size={14}/>:<ClipboardCopy size={14}/>} {emailsCopied?'Emails copied':'Copy all emails'}</button></div></div>
        {copyError&&<p className="supervisor-copy-error" role="alert">{copyError}</p>}
        {students.length?<div className="supervisor-modal-students">{students.map(student=><article key={student.id} className="supervisor-student-card"><div className="supervisor-student-head"><span className="supervisor-student-avatar"><Users size={17}/></span><div><strong>{student.name}</strong><small>Student ID · {student.id}</small></div></div>{student.email&&<div className="supervisor-student-email"><Mail size={14}/><span>{student.email}</span></div>}{shownPhases.length>0&&<div className="supervisor-student-records">{shownPhases.includes('P1')&&<Progress score={student.marks?.p1} done={student.progress?.p1} label="P1" maximum={5}/>} {shownPhases.includes('P2')&&<Progress score={student.marks?.p2} done={student.progress?.p2} label="P2" maximum={10}/>} {shownPhases.includes('Defense')&&<Progress score={student.marks?.defense} done={student.progress?.defense} label="Defense" maximum={30}/>} {shownPhases.includes('Defense')&&student.marks?.supervisor!==undefined&&student.marks?.supervisor!==null&&<Progress score={student.marks.supervisor} label="Supervisor" maximum={55}/>}</div>}</article>)}</div>:<p className="supervisor-no-members">No students are currently linked to this group in the master records.</p>}
      </div>
      <div className="supervisor-detail-section"><div className="supervisor-section-title"><h3>Panel feedback</h3></div>
        {shownPhases.length===0&&<p className="supervisor-no-feedback">No active evaluation stage for this group.</p>}
        <div className="supervisor-feedback-phases">{shownPhases.map(phase=>{
          const phaseComments=feedback.filter(item=>item.phase===phase);
          return <section className="supervisor-feedback-phase" key={phase}><div className="supervisor-feedback-heading"><MessageSquareText size={16}/><strong>{phase==='Defense'?'Final Defense':phase}</strong><span>{phaseComments.length} {phaseComments.length===1?'comment':'comments'}</span></div>
            {phaseComments.length?phaseComments.map((item,index)=><article className="supervisor-feedback-card" key={`${phase}-${item.semester}-${index}`}><div className="supervisor-feedback-meta"><strong>{item.evaluator}</strong><span>{item.semester}</span></div><p>{item.comment}</p>{item.students.length>0&&<small>For: {item.students.join(', ')}</small>}</article>):<p className="supervisor-no-feedback">No Comments. Please reach out to your respective panel members for feedback.</p>}
          </section>;
        })}</div>
      </div>
    </section>
  </div>;
}

export default function SupervisorExperience({data}:{data:SupervisorDashboard}) {
  const [query,setQuery]=useState('');
  const [stage,setStage]=useState<StageFilter>('all');
  const [type,setType]=useState<TypeFilter>('all');
  const [myRole,setMyRole]=useState<RoleFilter>('all');
  const [page,setPage]=useState(0),[pageSize,setPageSize]=useState<PageSize>(10);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const distinctGroups=useMemo(()=>Array.from(new Map(data.groups.map(group=>[group.id,group])).values()),[data.groups]);
  const studentMap=useMemo(()=>{
    const map=new Map<string,AssignedStudent[]>();
    data.students.forEach(student=>{const list=map.get(student.thesisId)||[];list.push(student);map.set(student.thesisId,list);});
    return map;
  },[data.students]);
  const groups=useMemo(()=>[...distinctGroups].sort((a,b)=>a.id.localeCompare(b.id)).filter(group=>{
    if(!matchesStage(group,stage)||type!=='all'&&group.type!==type||myRole!=='all'&&!group.myRoles?.includes(myRole))return false;
    const text=query.toLowerCase().trim();
    const students=studentMap.get(group.id)||[];
    return !text||[group.id,group.title,group.type,group.stage,group.primarySupervisor,group.secondarySupervisor,group.coSupervisor1,group.coSupervisor2,...students.flatMap(s=>[s.id,s.name,s.email])].some(value=>String(value||'').toLowerCase().includes(text));
  }),[distinctGroups,studentMap,query,stage,type,myRole]);
  const matchingStudents=new Set(groups.flatMap(group=>(studentMap.get(group.id)||[]).map(s=>s.id))).size;
  useEffect(()=>setPage(0),[query,stage,type,myRole,pageSize]);
  const visibleGroups=groups.slice(page*pageSize,(page+1)*pageSize);
  const selected=distinctGroups.find(group=>group.id===selectedId);
  const reset=()=>{setQuery('');setStage('all');setType('all');setMyRole('all');};
  return <div className="supervisor-workspace">
    <section className="supervisor-intro"><div><span className="eyebrow">ASSIGNED RESEARCH</span><h2>Groups under your supervision</h2></div></section>
    <div className="supervisor-stats"><div className="card"><span><GraduationCap size={17}/> Total groups</span><strong>{groups.length}</strong></div><div className="card"><span><Users size={17}/> Total students</span><strong>{matchingStudents}</strong></div></div>
    <section className="card supervisor-groups-panel"><div className="supervisor-filters"><label className="supervisor-search"><Search size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search group ID, title or student…" aria-label="Search supervised groups" /></label><div className="supervisor-filter-fields"><label><span>Current stage</span><select value={stage} onChange={event=>setStage(event.target.value as StageFilter)}>{stageFilters.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>Research type</span><select value={type} onChange={event=>setType(event.target.value as TypeFilter)}><option value="all">All types</option><option value="Thesis">Thesis</option><option value="Project">Project</option><option value="Internship">Internship</option></select></label><label><span>My role</span><select value={myRole} onChange={event=>setMyRole(event.target.value as RoleFilter)}><option value="all">All roles</option><option value="Supervisor">Supervisor</option><option value="Co-Supervisor">Co-Supervisor</option></select></label></div></div>
      {groups.length?<div className="supervisor-group-list"><div className="supervisor-column-head"><span>Thesis / group</span><span>Students</span><span>Current stage</span><span>Type</span><span>My role</span><span></span></div>{visibleGroups.map(group=><article key={group.id} className="supervisor-group-row"><div className="supervisor-group-primary"><strong>{group.id}</strong><small>{group.title||'Research title not recorded'}</small></div><div className="supervisor-group-count"><Users size={15}/><strong>{new Set((studentMap.get(group.id)||[]).map(s=>s.id)).size}</strong><span className="supervisor-mobile-caption">students</span></div><div><span className={`supervisor-stage-badge ${group.stage.toLowerCase()==='completed'?'complete':''}`}>{group.stage}</span></div><div><span className="supervisor-type-badge">{group.type}</span></div><div className="supervisor-my-role">{group.myRoles?.join(' & ')||'—'}</div><button type="button" className="supervisor-view-button" onClick={()=>setSelectedId(group.id)}>Details <ChevronRight size={16}/></button></article>)}</div>:<div className="supervisor-no-results"><Search size={24}/><strong>No groups match these filters</strong><p>Try a different stage, type, role, or search term.</p><button type="button" onClick={reset}>Clear filters <ArrowRight size={14}/></button></div>}
      <Pagination label="Supervised groups" total={groups.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize}/>
    </section>
    {selected&&<GroupDetails key={selected.id} group={selected} students={studentMap.get(selected.id)||[]} onClose={()=>setSelectedId(null)}/>}
  </div>;
}
