import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, CircleHelp, Filter, Search, Users, X } from 'lucide-react';
import { demoMarksByStudent, semesterSummaries } from './admin-data';
import { groups, students, type Student, type ThesisGroup } from './data';

const maxMarks = { p1: 5, p2: 10, defense: 30, supervisor: 55 } as const;

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="card adminmetric"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}

export function AdminOverview({ openSearch }: { openSearch: () => void }) {
  const [semester, setSemester] = useState('Summer 2026');
  const selected = semesterSummaries.find(x => x.semester === semester)!;
  const phases = [{ label: 'Pre-Thesis 1', value: selected.p1 }, { label: 'Pre-Thesis 2', value: selected.p2 }, { label: 'Final Defense', value: selected.defense }];
  return <>
    <div className="admin-intro"><div><h2>Thesis evaluation summary</h2><p>Student and group completion counts, organized by academic semester.</p></div><label>Semester <select aria-label="Select semester" value={semester} onChange={event => setSemester(event.target.value)}>{semesterSummaries.map(row => <option key={row.semester}>{row.semester}</option>)}</select></label></div>
    <div className="demo-alert"><CircleHelp size={17} /><span><b>Sample statistics</b> · These counts are invented for UI testing, not calculated from university records. Real totals will require verified phase outcomes and semester history.</span></div>
    <div className="admin-metrics"><Metric label="Students (distinct)" value={String(selected.students)} hint="Sample semester population"/><Metric label="Groups (distinct)" value={String(selected.groups)} hint="Sample semester population"/><Metric label="P1 completed" value={String(selected.p1.students)} hint={`${selected.p1.groups} groups`}/><Metric label="P2 completed" value={String(selected.p2.students)} hint={`${selected.p2.groups} groups`}/><Metric label="Defense completed" value={String(selected.defense.students)} hint={`${selected.defense.groups} groups`}/></div>
    <section className="card admin-summary"><div className="summary-top"><div><h3>Evaluation completion</h3><p>{selected.semester} · students and groups finishing each phase</p></div><span className="sample-tag">SAMPLE DATA</span></div><div className="phase-bars">{phases.map(row => <div className="phase-bar-row" key={row.label}><div className="phase-bar-name"><b>{row.label}</b><small>{row.value.students} students · {row.value.groups} groups</small></div><div className="phase-bar-track"><span style={{ width: `${Math.round(row.value.students / Math.max(selected.p1.students,selected.p2.students,selected.defense.students) * 100)}%` }} /></div></div>)}</div></section>
    <div className="sectionheading"><h3>Semester comparison</h3><span>Students / groups completed</span></div><section className="card admin-summary-table"><div className="tableoverflow"><table><thead><tr><th>Semester</th><th>Distinct students</th><th>Distinct groups</th><th>P1</th><th>P2</th><th>Defense</th></tr></thead><tbody>{semesterSummaries.map(row => <tr key={row.semester} className={row.semester === selected.semester ? 'highlighted-row' : ''}><td><b>{row.semester}</b></td><td>{row.students}</td><td>{row.groups}</td><td><b>{row.p1.students}</b><small>{row.p1.groups} groups</small></td><td><b>{row.p2.students}</b><small>{row.p2.groups} groups</small></td><td><b>{row.defense.students}</b><small>{row.defense.groups} groups</small></td></tr>)}</tbody></table></div><p className="admin-footnote">A student or group may appear in different evaluation phases. Phase counts should not be added together to calculate distinct totals.</p></section>
    <button type="button" className="admin-search-cta" onClick={openSearch}><div><b>Find a student or research group</b><small>Search by student ID, thesis/project/internship ID, or supervisor initial.</small></div><span>Open record search <ChevronRight size={16}/></span></button>
  </>;
}

const clean = (value: string) => value.trim().toLocaleLowerCase();
function allMatches(student: Student, group: ThesisGroup, term: string) {
  if (!term) return true;
  return [student.id, student.name, student.email, group.id, group.title, group.primarySupervisor, group.primarySupervisorInitial, group.secondarySupervisor || '', group.secondarySupervisorInitial || ''].some(value => clean(value).includes(term));
}

function StudentDetail({ student, group, onClose }: { student: Student; group: ThesisGroup; onClose: () => void }) {
  useEffect(() => { const closeOnEscape = (event: KeyboardEvent) => { if(event.key === 'Escape') onClose(); }; window.addEventListener('keydown', closeOnEscape); return () => window.removeEventListener('keydown', closeOnEscape); }, [onClose]);
  const marks = demoMarksByStudent[student.id];
  const members = students.filter(item => item.thesisId === group.id);
  return <div className="modaloverlay" role="presentation" onMouseDown={e => {if(e.target === e.currentTarget) onClose();}}><section className="modalbox admin-detail" role="dialog" aria-modal="true" aria-labelledby="admin-detail-title"><div className="modalheader"><div><div className="eyebrow">STUDENT DATABASE · SAMPLE RECORD</div><h2 id="admin-detail-title">{student.name}</h2><p className="detail-subtitle">{student.id} · {student.email}</p></div><button className="iconbtn" aria-label="Close record" onClick={onClose}><X size={19}/></button></div><div className="detail-pairs"><div><small>Thesis / project ID</small><b>{group.id}</b></div><div><small>Current level</small><b>{group.stage}</b></div><div><small>Submission type</small><b>{group.type}</b></div><div><small>Supervisor</small><b>{group.primarySupervisor} ({group.primarySupervisorInitial})</b></div>{group.secondarySupervisor && <div><small>Second supervisor</small><b>{group.secondarySupervisor} ({group.secondarySupervisorInitial})</b></div>}</div><div className="detail-section"><h3>Research title</h3><p>{group.title}</p></div><div className="detail-section"><h3>Group members</h3><div className="memberlist">{members.map(person => <div key={person.id}><Users size={15}/><span>{person.name}</span><small>{person.id}</small></div>)}</div></div><div className="detail-section"><h3>Individual marks</h3><div className="mark-summary">{(Object.keys(maxMarks) as Array<keyof typeof maxMarks>).map(phase => <div key={phase}><span>{({p1:'P1',p2:'P2',defense:'Defense',supervisor:'Supervisor'})[phase]}</span><strong>{marks?.[phase] === null || marks?.[phase] === undefined ? 'Pending' : `${marks[phase]} / ${maxMarks[phase]}`}</strong></div>)}</div>{marks?.grade && <p className="detail-grade">Example recorded grade: <b>{marks.grade}</b></p>}<p className="admin-footnote">Marks are fictional and for layout review only. Publication checks and original evaluator comments will come from the secure backend.</p></div></section></div>;
}

export function AdminSearch() {
  const [term,setTerm] = useState('');
  const [stage,setStage] = useState('All stages');
  const [type,setType] = useState('All types');
  const [selected,setSelected] = useState<Student|null>(null);
  const rows = useMemo(() => students.map(student => ({student,group:groups.find(group=>group.id===student.thesisId)!})).filter(({student,group}) => group && allMatches(student,group,clean(term)) && (stage === 'All stages' || group.stage === stage) && (type === 'All types' || group.type === type)), [term,stage,type]);
  const chosenGroup = selected ? groups.find(x=>x.id===selected.thesisId) : null;
  return <>
    <div className="demo-alert"><CircleHelp size={17}/><span><b>Demonstration records only.</b> Search and detailed views work, but no real student data is available until Google Workspace authentication and backend permissions are installed.</span></div>
    <section className="card admin-query"><div className="admin-query-main"><label htmlFor="admin-search-term">Search academic records</label><div className="searchbox"><Search size={19}/><input id="admin-search-term" placeholder="Student ID, group ID (T/P/I…), supervisor initials (e.g. AK)…" value={term} onChange={event=>setTerm(event.target.value)}/></div><p>Search works across student IDs, thesis/project/internship IDs, supervisor initials, names and research titles.</p></div><div className="query-filters"><Filter size={17}/><select aria-label="Filter by current stage" value={stage} onChange={event=>setStage(event.target.value)}>{['All stages','Pre-Thesis 1','Pre-Thesis 2','Final Thesis','Completed','Deferred'].map(x=><option key={x}>{x}</option>)}</select><select aria-label="Filter by work type" value={type} onChange={event=>setType(event.target.value)}>{['All types','Thesis','Project','Internship'].map(x=><option key={x}>{x}</option>)}</select></div></section>
    <div className="sectionheading"><h3>Matching students <span className="countbadge">{rows.length}</span></h3><span>Click a record for detailed information</span></div>
    <section className="card admin-results"><div className="tableoverflow"><table><thead><tr><th>Student</th><th>Thesis / project ID</th><th>Supervisor</th><th>Current stage</th><th></th></tr></thead><tbody>{rows.length ? rows.map(({student,group})=><tr key={student.id}><td><b>{student.name}</b><small>{student.id}</small></td><td><b>{group.id}</b><small>{group.type}</small></td><td><b>{group.primarySupervisorInitial}</b><small>{group.primarySupervisor}</small></td><td><span className="search-status">{group.stage}</span></td><td><button className="lightbtn" onClick={()=>setSelected(student)}>Details <ChevronRight size={13}/></button></td></tr>) : <tr><td colSpan={5} className="noresults">No matching records. Try a different student ID, group ID or supervisor initial.</td></tr>}</tbody></table></div></section>
    {selected && chosenGroup && <StudentDetail student={selected} group={chosenGroup} onClose={()=>setSelected(null)}/>}
  </>;
}
