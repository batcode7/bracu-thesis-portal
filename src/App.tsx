import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarDays, ChevronDown, ChevronRight, CircleHelp, ClipboardList, GraduationCap, LayoutDashboard, LockKeyhole, Menu, Search, Shield, ShieldCheck, TableProperties, Users, X } from 'lucide-react';
import { PHASE_NAMES, type Evaluation, type GroupStage, type Role, type SemesterSource, type Student } from './data';
import { demoApi, type StudentDashboard, type SupervisorDashboard } from './portal-api';
import { SOURCE_LOOKUP_RULES, VERIFIED_COMMENT_COLUMNS, VERIFIED_MASTER_COLUMNS } from './source-schema';
import { AdminOverview, AdminSearch } from './AdminWorkspace';
import { DeadlineLinks } from './DeadlineLinks';
import { PortalWelcome } from './PortalWelcome';
import { BrandLogo } from './BrandLogo';

type Page = 'dashboard' | 'evaluations' | 'students' | 'search' | 'semesters' | 'administrators' | 'deadlines' | 'profile';
const EXAMPLE_ADMIN_EMAIL = 'partha.bhoumik@bracu.ac.bd';
const LABELS: Record<Role, string> = { student: 'Student', supervisor: 'Supervisor', admin: 'Administrator' };

function Pill({ value, tone }: { value: string; tone?: 'green' | 'blue' | 'amber' | 'gray' }) {
  const actualTone = tone || (/published|completed|active|approved/i.test(value) ? 'green' : /pending|progress|deferred/i.test(value) ? 'amber' : 'blue');
  return <span className={`pill ${actualTone}`}>{value}</span>;
}

function SideNav({ role, page, setPage, close }: { role: Role; page: Page; setPage: (page: Page) => void; close: () => void }) {
  const nav: { key: Page; label: string; icon: typeof LayoutDashboard }[] = role === 'student'
    ? [{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }, { key: 'evaluations', label: 'My Evaluations', icon: ClipboardList }, { key: 'deadlines', label: 'Deadlines & Links', icon: CalendarDays }, { key: 'profile', label: 'Profile', icon: Users }]
    : role === 'supervisor'
      ? [{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }, { key: 'students', label: 'My Students', icon: Users }, { key: 'deadlines', label: 'Deadlines & Links', icon: CalendarDays }, { key: 'profile', label: 'Profile', icon: Users }]
      : [{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }, { key: 'search', label: 'Student Search', icon: Search }, { key: 'semesters', label: 'Semester Sources', icon: TableProperties }, { key: 'deadlines', label: 'Deadlines & Links', icon: CalendarDays }, { key: 'administrators', label: 'Administrators', icon: Shield }, { key: 'profile', label: 'Profile', icon: Users }];
  return <>
    <div className="brand"><BrandLogo/><div><strong>BRAC University</strong><small>Thesis Evaluation Portal</small></div></div>
    <div><div className="navlabel">WORKSPACE</div><nav className="nav">{nav.map(({ key, label, icon: Icon }) => <button key={key} className={page === key ? 'selected' : ''} onClick={() => { setPage(key); close(); }}><Icon size={17} strokeWidth={1.9} />{label}</button>)}</nav></div>
  </>;
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="stat card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function FeedbackModal({ item, close }: { item: Evaluation | null; close: () => void }) {
  useEffect(() => {
    if (!item) return;
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [item, close]);
  if (!item) return null;
  return <div className="modaloverlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }} role="presentation"><section className="modalbox" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modalheader"><div><span className="eyebrow">{item.semester}</span><h2 id="modal-title">{PHASE_NAMES[item.phase]}</h2></div><button className="iconbtn" aria-label="Close feedback" onClick={close}><X size={20} /></button></div><div className="modalmeta"><Pill value={item.publication === 'published' ? 'Published' : 'Pending'} />{item.score !== null && <span>{item.score} / {item.maxScore} marks</span>}</div><h4>Faculty comments</h4>{item.publication === 'published' && item.comment ? <blockquote>{item.comment}</blockquote> : <div className="mutedbox">Evaluation marks and comments are not published yet.</div>}<p className="smallmuted">{item.publication === 'published' ? `Evaluator: ${item.evaluator}` : 'Scores will be available after marks and mandatory comments are released.'}</p></section></div>;
}

function StudentArea({ page, data }: { page: Page; data: StudentDashboard }) {
  const [selected, setSelected] = useState<Evaluation | null>(null);
  const { student, group, evaluations } = data;
  if (page === 'profile') return <section className="card profilecard"><div className="eyebrow">STUDENT RECORD</div><h2>{student.name}</h2><p>{student.email}</p><div className="detailgrid"><Info label="Student ID" value={student.id} /><Info label="Thesis ID" value={group.id} /><Info label="Thesis type" value={group.type} /><Info label="Current stage" value={group.stage} /></div></section>;
  return <>
    {page === 'dashboard' && <><section className="card thesishero"><div className="eyebrow">MY RESEARCH GROUP</div><h2>{group.title}</h2><Pill value={group.stage} tone="blue" /><div className="detailgrid"><Info label="Thesis ID" value={group.id} /><Info label="Student" value={student.name} /><Info label="Supervisor" value={group.primarySupervisor} /><Info label="Thesis type" value={group.type} /></div></section><section className="statgrid"><Stat label="P1 marks" value={showScore(evaluations, 'P1')} detail="Spring 2025" /><Stat label="P2 marks" value={showScore(evaluations, 'P2')} detail="Summer 2026" /><Stat label="Final defense" value="Pending" detail="Awaiting publication" /><Stat label="Current status" value={group.stage} detail="From Group info" /></section></>}
    <div className="sectionheading"><h3>{page === 'evaluations' ? 'Evaluation history' : 'My evaluations'}</h3><span>Select a card to view faculty feedback</span></div>
    <div className="evaluationgrid">{evaluations.map(item => <button className="card evaluation" key={item.id} onClick={() => setSelected(item)}><div className="evaluationtop"><span className="eyebrow">{item.semester}</span><Pill value={item.publication === 'published' ? 'Published' : 'Pending'} /></div><h4>{PHASE_NAMES[item.phase]}</h4><div className="mark">{item.score === null ? '—' : item.score}<small>{item.score === null ? '' : ` / ${item.maxScore}`}</small></div><div className="evaluationbottom"><span>{item.publication === 'published' ? 'Faculty feedback available' : 'Awaiting publication'}</span><span className="textlink">{item.publication === 'published' ? 'View comments' : 'View details'} <ChevronRight size={14} /></span></div></button>)}</div>
    <div className="infobar"><CircleHelp size={17} /> Evaluations may come from different semesters. Scores and comments remain hidden until both are published together.</div>
    <FeedbackModal item={selected} close={() => setSelected(null)} />
  </>;
}
function showScore(items: Evaluation[], phase: Evaluation['phase']) { const item = items.find(x => x.phase === phase); return item?.score !== null && item?.score !== undefined ? `${item.score} / ${item.maxScore}` : 'Pending'; }
function Info({ label, value }: { label: string; value: string }) { return <div className="info"><small>{label}</small><strong>{value}</strong></div>; }

function SupervisorArea({ data }: { data: SupervisorDashboard }) {
  const [term, setTerm] = useState('');
  const [stage, setStage] = useState('all');
  const [selected, setSelected] = useState<Student | null>(null);
  const rows = useMemo(() => data.students.map(student => ({ student, group: data.groups.find(x => x.id === student.thesisId)! })).filter(x => x.group && (stage === 'all' || x.group.stage === stage) && [x.student.id, x.student.name, x.group.id, x.group.title].some(v => v.toLowerCase().includes(term.toLowerCase()))), [data, stage, term]);
  const count = (stage: GroupStage) => data.students.filter(s => data.groups.find(g => g.id === s.thesisId)?.stage === stage).length;
  return <><div className="statgrid"><Stat label="Assigned students" value={String(data.students.length).padStart(2, '0')} detail={`Across ${data.groups.length} groups`} /><Stat label="Pre-Thesis 1" value={String(count('Pre-Thesis 1')).padStart(2, '0')} detail="Currently in P1" /><Stat label="Pre-Thesis 2" value={String(count('Pre-Thesis 2')).padStart(2, '0')} detail="Currently in P2" /><Stat label="Completed" value={String(count('Completed')).padStart(2, '0')} detail="Thesis complete" /></div><div className="sectionheading"><h3>Student database</h3><span>Status from Group info</span></div><section className="card tablecard"><div className="filters"><label className="searchbox"><Search size={16} /><input value={term} onChange={e => setTerm(e.target.value)} placeholder="Search name, student ID, group or thesis…" aria-label="Search students" /></label><select value={stage} onChange={e => setStage(e.target.value)} aria-label="Filter thesis stage"><option value="all">All stages</option><option>Pre-Thesis 1</option><option>Pre-Thesis 2</option><option>Final Thesis</option><option>Completed</option><option>Deferred</option></select></div><div className="tableoverflow"><table><thead><tr><th>Student</th><th>Thesis group</th><th>Current stage</th><th></th></tr></thead><tbody>{rows.length ? rows.map(({ student, group }) => <tr key={student.id}><td><b>{student.name}</b><small>{student.id}</small></td><td><b>{group.id}</b><small>{group.title}</small></td><td><Pill value={group.stage} /></td><td><button className="lightbtn" onClick={() => setSelected(student)}>View</button></td></tr>) : <tr><td colSpan={4} className="noresults">No students match your filters.</td></tr>}</tbody></table></div></section>{selected && <div className="modaloverlay" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}><section className="modalbox" role="dialog" aria-modal="true" aria-labelledby="student-title"><div className="modalheader"><div><div className="eyebrow">STUDENT RECORD</div><h2 id="student-title">{selected.name}</h2></div><button className="iconbtn" onClick={() => setSelected(null)} aria-label="Close"><X size={20} /></button></div><div className="detailgrid"><Info label="Student ID" value={selected.id} /><Info label="Thesis ID" value={selected.thesisId} /><Info label="Stage" value={data.groups.find(g => g.id === selected.thesisId)?.stage || 'Unknown'} /><Info label="Email" value={selected.email} /></div><div className="mutedbox">{data.groups.find(g => g.id === selected.thesisId)?.title}</div></section></div>}</>;
}

function AdminArea({ page, sources }: { page: Page; sources: SemesterSource[] }) {
  const [draft, setDraft] = useState('');
  const [demoItems, setDemoItems] = useState<string[]>([]);
  const [showMapping, setShowMapping] = useState(false);
  if (page === 'administrators') return <><div className="sectionheading"><h3>Administrator management</h3><span>All administrators have equal permissions</span></div><section className="card admincard"><div className="adminrow"><div><b>{EXAMPLE_ADMIN_EMAIL}</b><small>Administrator · Demo only</small></div><Pill value="Active" /></div>{demoItems.map(email => <div className="adminrow" key={email}><div><b>{email}</b><small>Administrator · Demo only</small></div><button className="lightbtn" onClick={() => setDemoItems(items => items.filter(item => item !== email))}>Remove demo</button></div>)}<form className="addform" onSubmit={e => { e.preventDefault(); const email = draft.trim().toLowerCase(); if (email.endsWith('@bracu.ac.bd') && email !== EXAMPLE_ADMIN_EMAIL && !demoItems.includes(email)) { setDemoItems(x => [...x, email]); setDraft(''); } }}><label htmlFor="adminemail">Preview adding an administrator</label><div className="formrow"><input id="adminemail" value={draft} onChange={e => setDraft(e.target.value)} placeholder="faculty@bracu.ac.bd" type="email" required /><button type="submit" className="primarybtn">Add demo</button></div><p>Demo-only list; no real account is created. Any verified administrator can grant another faculty member admin access when the backend is connected.</p></form></section></>;
  const connected = sources.filter(s => s.status === 'Schema verified').length;
  return <>
    <div className="statgrid"><Stat label="Verified semester" value={String(connected).padStart(2, '0')} detail="Summer 2026 mapped" /><Stat label="Awaiting source" value={String(sources.length - connected).padStart(2, '0')} detail="Historical links still needed" /><Stat label="Master workbook" value="Verified" detail="Three core tabs inspected" /><Stat label="Portal mode" value="Read-only" detail="Demo records, no live API" /></div>
    <div className="sectionheading"><h3>Source registry</h3><span>One permanent master · separate semester managers</span></div>
    <section className="card master-source"><div className="sourceicon"><TableProperties size={20} /></div><div className="sourcecontent"><b>Thesis Master</b><small>Permanent source · All student info, Group info, Marks</small></div><Pill value="Schema verified" tone="green" /></section>
    <div className="card sourcelist">{sources.map(source => <div className="sourcerow" key={source.semester}><div className="sourceicon"><BookOpen size={20} /></div><div className="sourcecontent"><b>{source.semester}</b><small>{source.description}</small><div className="phasechips">{source.phases.map(phase => <span key={phase}>{phase === 'Defense' ? 'Defense' : phase}</span>)}</div></div><Pill value={source.status} tone={source.status === 'Schema verified' ? 'green' : 'amber'} /></div>)}</div>
    <div className="maphead"><div><h3>Verified sheet mapping</h3><p>Read-only field definitions inspected in the connected Google spreadsheets.</p></div><button type="button" className="lightbtn" onClick={() => setShowMapping(value => !value)} aria-expanded={showMapping}>{showMapping ? 'Hide mapping' : 'Show mapping'} <ChevronDown size={14} /></button></div>
    {showMapping && <div className="mappingstack"><section className="card mappingsheet"><h4>Master workbook</h4><div className="tableoverflow"><table><thead><tr><th>Tab</th><th>Lookup</th><th>Used fields</th></tr></thead><tbody>{VERIFIED_MASTER_COLUMNS.map(item => <tr key={item.tab}><td><b>{item.tab}</b></td><td>{item.lookup}</td><td>{item.fields}</td></tr>)}</tbody></table></div></section><section className="card mappingsheet"><h4>Summer 2026 evaluator workbooks</h4><div className="tableoverflow"><table><thead><tr><th>Phase</th><th>Sheet path</th><th>Student match</th><th>Mark</th><th>Feedback</th></tr></thead><tbody>{VERIFIED_COMMENT_COLUMNS.map(item => <tr key={item.phase}><td><b>{item.phase}</b></td><td>{item.source}</td><td>{item.member}</td><td>{item.score}</td><td>{item.comment}</td></tr>)}</tbody></table></div><p className="mappingnote">Columns are based on representative evaluator files. The semester manager stores evaluator spreadsheet links in each phase’s panel tab.</p></section><section className="card mappingsheet"><h4>Lookup and publication rules</h4><ol className="mappingrules">{SOURCE_LOOKUP_RULES.map(rule => <li key={rule}>{rule}</li>)}</ol></section></div>}
    <div className="infobar"><ShieldCheck size={17} /> Spreadsheet structure has been verified. This private UI preview still uses fictional records; Google Workspace authentication and the protected data API have not been deployed.</div>
    <div className="sectionheading"><h3>Access management</h3></div><section className="card admincard"><div className="adminrow"><div><b>{EXAMPLE_ADMIN_EMAIL}</b><small>Administrator · Demo only</small></div><Pill value="Active" /></div><div className="infobar"><ShieldCheck size={16} />Every administrator can appoint or remove other administrators.</div></section>
  </>;
}

function Profile({ role }: { role: Role }) { return <section className="card profilecard"><div className="eyebrow">DEMO ACCOUNT</div><h2>{LABELS[role]}</h2><p>Fictional preview account</p><div className="infobar"><LockKeyhole size={16} /> Google Workspace login is not connected yet. This account is a mock preview identity.</div></section>; }

export default function App() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [role, setRole] = useState<Role>('student');
  const [page, setPage] = useState<Page>('dashboard');
  const [drawer, setDrawer] = useState(false);
  const [studentData, setStudentData] = useState<StudentDashboard | null>(null);
  const [supervisorData, setSupervisorData] = useState<SupervisorDashboard | null>(null);
  const [sources, setSources] = useState<SemesterSource[]>([]);
  useEffect(() => { let live = true; Promise.all([demoApi.studentDashboard(), demoApi.supervisorDashboard(), demoApi.semesterRegistry()]).then(([s, f, x]) => { if (live) { setStudentData(s); setSupervisorData(f); setSources(x); } }); return () => { live = false; }; }, []);
  const heading: [string, string] = page === 'profile' ? ['My profile', 'Your account and academic access.'] : page === 'deadlines' ? ['Deadlines & submission links', 'University submission schedules and academic resources.'] : role === 'student' ? [page === 'evaluations' ? 'Evaluation history' : 'My thesis overview', 'Your research journey, evaluation marks and faculty feedback.'] : role === 'supervisor' ? ['My students', 'Assigned thesis students and current progress.'] : page === 'search' ? ['Search academic records', 'Locate detailed student, thesis, project or internship information.'] : page === 'semesters' ? ['Semester sources', 'Verified data structures and historical source registry.'] : page === 'administrators' ? ['Manage administrators', 'Administrator access.'] : ['Evaluation overview', 'Semester-wise student and group completion statistics.'];
  const changeRole = (value: Role) => { setRole(value); setPage('dashboard'); setDrawer(false); };
  if (!previewOpen) return <PortalWelcome isDemo><div className="welcome-demo-alert"><LockKeyhole size={17}/><span>Google sign-in will be available on your configured Cloudflare Pages deployment. This design preview is not connected to academic records.</span></div><button className="welcome-demo-button" type="button" onClick={() => setPreviewOpen(true)}>Explore interface preview <ChevronRight size={16}/></button><p className="welcome-demo-hint">View sample student, faculty and administrator screens with fictional data.</p></PortalWelcome>;
  return <div className="application"><aside className={`sidebar ${drawer ? 'open' : ''}`}><SideNav role={role} page={page} setPage={setPage} close={() => setDrawer(false)} /></aside>{drawer && <button className="scrim" onClick={() => setDrawer(false)} aria-label="Close menu" />}<div className="main"><header className="topbar"><button className="menuicon" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={22} /></button><span className="breadcrumbs">Academic Portal <ChevronRight size={13} /> <b>{page[0].toUpperCase() + page.slice(1)}</b></span><div className="topright"><button className="demo-exit" type="button" onClick={() => setPreviewOpen(false)}>Back to sign-in</button><span className="demoindicator">DEMO BUILD</span><span className="avatar">{({ student: 'ST', supervisor: 'SU', admin: 'AD' })[role]}</span></div></header><main className="content"><div className="pageheading"><div><span className="eyebrow">{role === 'student' ? 'STUDENT WORKSPACE' : role === 'supervisor' ? 'FACULTY WORKSPACE' : 'ADMINISTRATION'}</span><h1>{heading[0]}</h1><p>{heading[1]}</p></div><label className="roleswitch">Preview as <span><select value={role} onChange={e => changeRole(e.target.value as Role)}><option value="student">Student</option><option value="supervisor">Supervisor</option><option value="admin">Administrator</option></select><ChevronDown size={14} /></span></label></div>{!studentData || !supervisorData ? <section className="card loading">Preparing demo workspace…</section> : page === 'profile' ? <Profile role={role} /> : page === 'deadlines' ? <DeadlineLinks /> : role === 'student' ? <StudentArea page={page} data={studentData} /> : role === 'supervisor' ? <SupervisorArea data={supervisorData} /> : page === 'search' ? <AdminSearch /> : page === 'dashboard' ? <AdminOverview openSearch={() => setPage('search')} /> : <AdminArea page={page} sources={sources} />}<footer className="footer"><GraduationCap size={16} /> © {new Date().getFullYear()} UG Thesis Committee. All rights reserved.<span>BRAC University Thesis Evaluation Portal · Demo</span></footer></main></div></div>;
}
