import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronRight, ClipboardCopy, GraduationCap, Mail, MapPin, Search, Users, X } from 'lucide-react';
import type { SupervisorDashboard } from './portal-api';
import type { ThesisGroup } from './data';
import { studentPhase } from './StudentExperience';

type StageFilter = 'all' | 'P1' | 'P2' | 'Defense' | 'Completed' | 'Deferred';
type TypeFilter = 'all' | 'Thesis' | 'Project' | 'Internship';
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

function Progress({ done, label }: {done?:boolean;label:string}) {
  return <span className={`supervisor-record-pill ${done?'recorded':''}`}>{label}: {done?'Recorded':'Pending'}</span>;
}

function GroupDetails({group,students,onClose}:{group:GroupRecord;students:AssignedStudent[];onClose:()=>void}) {
  const [copied,setCopied]=useState(false);
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[onClose]);
  const team=[
    {role:'Supervisor 1',name:group.primarySupervisor},
    {role:'Supervisor 2',name:group.secondarySupervisor},
    {role:'Co-supervisor 1',name:group.coSupervisor1},
    {role:'Co-supervisor 2',name:group.coSupervisor2},
  ];
  return <div className="modaloverlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="modalbox supervisor-detail" role="dialog" aria-modal="true" aria-labelledby="supervisor-dialog-heading">
      <div className="modalheader"><div><span className="eyebrow">ASSIGNED RESEARCH GROUP</span><h2 id="supervisor-dialog-heading">{group.id}</h2><p className="supervisor-modal-title">{group.title||'Research title not listed'}</p></div><button type="button" className="iconbtn" aria-label="Close group details" onClick={onClose}><X size={20}/></button></div>
      <div className="supervisor-modal-summary"><span><b>Stage</b>{group.stage}</span><span><b>Type</b>{group.type}</span><span><b>Students</b>{students.length}</span></div>
      <div className="supervisor-modal-id"><span>Thesis / project / internship ID</span><strong>{group.id}</strong><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(group.id);setCopied(true);window.setTimeout(()=>setCopied(false),1800);}catch{setCopied(false);}}} aria-label="Copy group ID">{copied?<Check size={15}/>:<ClipboardCopy size={15}/>} {copied?'Copied':'Copy ID'}</button></div>
      <div className="supervisor-detail-section"><h3>Supervision team</h3><div className="supervisor-team-grid">{team.map(item=>{
        const contact=group.facultyContacts?.find(f=>f.slot===item.role);
        return <div key={item.role}><small>{item.role}</small><strong className={!item.name?'supervisor-unassigned':''}>{item.name||'Not assigned'}</strong>{contact?.email&&<a className="supervisor-faculty-contact" href={`mailto:${contact.email}`}><Mail size={13}/>{contact.email}</a>}{contact?.room&&<span className="supervisor-faculty-contact"><MapPin size={13}/>Room {contact.room}</span>}</div>;
      })}</div></div>
      <div className="supervisor-detail-section"><div className="supervisor-section-title"><h3>Group students</h3><small>{students.length} {students.length===1?'student':'students'}</small></div>
        {students.length?<div className="supervisor-modal-students">{students.map(student=><article key={student.id} className="supervisor-student-card"><div className="supervisor-student-head"><span className="supervisor-student-avatar"><Users size={17}/></span><div><strong>{student.name}</strong><small>Student ID · {student.id}</small></div></div>{student.email&&<div className="supervisor-student-email"><Mail size={14}/><span>{student.email}</span></div>}<div className="supervisor-student-records"><Progress done={student.progress?.p1} label="P1"/><Progress done={student.progress?.p2} label="P2"/><Progress done={student.progress?.defense} label="Defense"/></div></article>)}</div>:<p className="supervisor-no-members">No students are currently linked to this group in the master records.</p>}
        <p className="supervisor-detail-note">Recorded means a mark exists in the permanent master. It does not mean that mark has been published to the student.</p>
      </div>
    </section>
  </div>;
}

export default function SupervisorExperience({data}:{data:SupervisorDashboard}) {
  const [query,setQuery]=useState('');
  const [stage,setStage]=useState<StageFilter>('all');
  const [type,setType]=useState<TypeFilter>('all');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const distinctGroups=useMemo(()=>Array.from(new Map(data.groups.map(group=>[group.id,group])).values()),[data.groups]);
  const studentMap=useMemo(()=>{
    const map=new Map<string,AssignedStudent[]>();
    data.students.forEach(student=>{const list=map.get(student.thesisId)||[];list.push(student);map.set(student.thesisId,list);});
    return map;
  },[data.students]);
  const groups=useMemo(()=>[...distinctGroups].sort((a,b)=>a.id.localeCompare(b.id)).filter(group=>{
    if(!matchesStage(group,stage)||type!=='all'&&group.type!==type)return false;
    const text=query.toLowerCase().trim();
    const students=studentMap.get(group.id)||[];
    return !text||[group.id,group.title,group.type,group.stage,group.primarySupervisor,group.secondarySupervisor,group.coSupervisor1,group.coSupervisor2,...students.flatMap(s=>[s.id,s.name,s.email])].some(value=>String(value||'').toLowerCase().includes(text));
  }),[distinctGroups,studentMap,query,stage,type]);
  const selected=distinctGroups.find(group=>group.id===selectedId);
  const reset=()=>{setQuery('');setStage('all');setType('all');};
  return <div className="supervisor-workspace">
    <section className="supervisor-intro"><div><span className="eyebrow">ASSIGNED RESEARCH</span><h2>Groups under your supervision</h2><p>One group per record. Open a group to see its full roster, all supervisors, and recorded phase progress.</p></div></section>
    <div className="supervisor-stats"><div className="card"><span><Users size={17}/> Assigned students</span><strong>{data.students.length}</strong><small>Across your supervised groups</small></div><div className="card"><span><GraduationCap size={17}/> Research groups</span><strong>{distinctGroups.length}</strong><small>Verified faculty assignment</small></div><div className="card"><span>Completed groups</span><strong>{distinctGroups.filter(g=>g.stage.toLowerCase()==='completed').length}</strong><small>As recorded in the master</small></div></div>
    <section className="card supervisor-groups-panel"><div className="supervisor-filters"><label className="supervisor-search"><Search size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search group ID, title or student…" aria-label="Search supervised groups" /></label><div className="supervisor-filter-fields"><label><span>Current stage</span><select value={stage} onChange={event=>setStage(event.target.value as StageFilter)}>{stageFilters.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>Research type</span><select value={type} onChange={event=>setType(event.target.value as TypeFilter)}><option value="all">All types</option><option value="Thesis">Thesis</option><option value="Project">Project</option><option value="Internship">Internship</option></select></label></div></div>
      <div className="supervisor-list-heading"><h3>{groups.length} {groups.length===1?'group':'groups'}</h3><span>{stage!=='all'||type!=='all'||query?'Filtered from your assigned groups':'Only groups assigned to your verified faculty identity'}</span></div>
      {groups.length?<div className="supervisor-group-list"><div className="supervisor-column-head"><span>Thesis / group</span><span>Students</span><span>Current status</span><span>Type</span><span></span></div>{groups.map(group=><article key={group.id} className="supervisor-group-row"><div className="supervisor-group-primary"><strong>{group.id}</strong><small>{group.title||'Research title not recorded'}</small></div><div className="supervisor-group-count"><Users size={15}/><strong>{studentMap.get(group.id)?.length||0}</strong><span className="supervisor-mobile-caption">students</span></div><div><span className={`supervisor-stage-badge ${group.stage.toLowerCase()==='completed'?'complete':''}`}>{group.stage}</span></div><div><span className="supervisor-type-badge">{group.type}</span></div><button type="button" className="supervisor-view-button" onClick={()=>setSelectedId(group.id)}>View <ChevronRight size={16}/></button></article>)}</div>:<div className="supervisor-no-results"><Search size={24}/><strong>No groups match these filters</strong><p>Try a different stage, type, or search term.</p><button type="button" onClick={reset}>Clear filters <ArrowRight size={14}/></button></div>}
    </section>
    {selected&&<GroupDetails key={selected.id} group={selected} students={studentMap.get(selected.id)||[]} onClose={()=>setSelectedId(null)}/>}
  </div>;
}
