import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronRight, ClipboardCopy, Clock3, Database, Eye, FileSearch, GraduationCap, LoaderCircle, Search, ShieldCheck, Users, X } from 'lucide-react';
import { liveRequest } from './live-api';
import type { StudentDashboard, SupervisorDashboard } from './portal-api';

type Phase = 'P1' | 'P2' | 'Defense';
type Completion = { students: number; groups: number };
type SemesterSummary = { semester: string; students: number; groups: number; P1: Completion; P2: Completion; Defense: Completion };
type SemesterStatus = { semester: string; phases: Array<{ phase: Phase; published: boolean; indexed: boolean }> };
type Overview = { students: number; groups: number; recorded: Record<Phase, number>; semesters: SemesterSummary[]; sourceStatus: SemesterStatus[]; lastSyncedAt: string };
type DirectoryRow = { student: { id: string; name: string; email: string; thesisId: string }; group: ThesisGroup };
type ThesisGroup = { id: string; title: string; type: string; stage: string; primarySupervisor: string; secondarySupervisor?: string; coSupervisor1?: string; coSupervisor2?: string };
type Detail = DirectoryRow & { members: Array<{ id: string; name: string; email: string }>; marks: Record<string, number | string | null> };
type FacultyRow = { name: string; email: string; initial: string; designation: string; status: string; room: string; aliases: string[]; groups: number; source: string };
type FacultyResult = { faculty: FacultyRow[]; matched: number; missing: number; updatedAt: string; warning?: string };
export type RolePreview = { role: 'prime_admin' | 'admin' | 'student' | 'supervisor'; email: string; data: StudentDashboard | SupervisorDashboard | null };

const phaseNames: Record<Phase, string> = { P1: 'Pre-Thesis 1', P2: 'Pre-Thesis 2', Defense: 'Final Defense' };
const friendlyDate = (value: string) => {
  if (!value) return 'No completed synchronization recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short' });
};

function LoadingLines({ label = 'Retrieving academic records' }: { label?: string }) {
  return <div className="prime-loading" role="status" aria-live="polite">
    <div className="prime-loading-message"><LoaderCircle size={18} className="prime-spin" /><span>{label}<span className="prime-ellipsis" aria-hidden="true">...</span></span></div>
    <div className="prime-skeleton" /><div className="prime-skeleton shorter" /><div className="prime-skeleton" />
  </div>;
}

function Metric({ title, count, description, icon: Icon }: { title: string; count: number; description: string; icon: typeof Users }) {
  return <div className="prime-metric"><span className="prime-metric-icon"><Icon size={18} /></span><span className="prime-metric-title">{title}</span><strong>{count.toLocaleString()}</strong><small>{description}</small></div>;
}

export function PrimeOverview({ token, onNavigate }: { token: string; onNavigate: (page: 'search' | 'sources' | 'deadlines') => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [semester, setSemester] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const reload = () => {
    setBusy(true); setError('');
    liveRequest<Overview>(token, 'overview').then(data => {
      setOverview(data); setSemester(current => current && data.semesters.some(x => x.semester === current) ? current : data.semesters.at(-1)?.semester || '');
    }).catch(err => setError(err instanceof Error ? err.message : String(err))).finally(() => setBusy(false));
  };
  useEffect(() => { reload(); }, [token]);
  const current = overview?.semesters.find(row => row.semester === semester);
  const status = overview?.sourceStatus.find(row => row.semester === semester);
  const pending = overview?.sourceStatus.reduce((count, row) => count + row.phases.filter(p => !p.published).length, 0) || 0;
  return <div className="prime-stack">
    <section className="prime-intro">
      <div><span className="eyebrow">ACADEMIC SNAPSHOT</span><h2>A clearer view of thesis activity.</h2><p>Registered records, recorded marks, publication readiness, and shortcuts in one place.</p></div>
      <button className="lightbtn" type="button" onClick={reload} disabled={busy}><Activity size={15} /> Refresh overview</button>
    </section>
    {error && <div className="live-error" role="alert">{error}</div>}
    {!overview && busy ? <LoadingLines label="Preparing your academic overview" /> : overview && <>
      <div className="prime-metrics">
        <Metric title="Students in master" count={overview.students} description="All validated student records" icon={Users} />
        <Metric title="Research groups" count={overview.groups} description="Distinct thesis / project IDs" icon={GraduationCap} />
        <Metric title="P1 marks recorded" count={overview.recorded.P1} description="Not necessarily published" icon={CheckCircle2} />
        <Metric title="P2 marks recorded" count={overview.recorded.P2} description="Not necessarily published" icon={CheckCircle2} />
        <Metric title="Defense marks recorded" count={overview.recorded.Defense} description="Not necessarily published" icon={ShieldCheck} />
        <Metric title="Phases awaiting release" count={pending} description="Across registered semesters" icon={Clock3} />
      </div>
      <div className="prime-two-column">
        <section className="card prime-panel">
          <div className="prime-panel-heading"><div><h3>Evaluation publication</h3><p>Only synchronized and formally released results count below.</p></div><select aria-label="Select reporting semester" value={semester} onChange={event => setSemester(event.target.value)}>{overview.semesters.map(row => <option key={row.semester}>{row.semester}</option>)}</select></div>
          <div className="prime-phase-list">
            {(['P1', 'P2', 'Defense'] as Phase[]).map(phase => {
              const phaseStatus = status?.phases.find(p => p.phase === phase);
              return <div className="prime-phase" key={phase}>
                <div><span className="prime-phase-dot" /><div><b>{phaseNames[phase]}</b><small>{current?.[phase].students || 0} students · {current?.[phase].groups || 0} groups with released results</small></div></div>
                <span className={`prime-state ${phaseStatus?.published ? 'is-ready' : phaseStatus?.indexed ? 'is-waiting' : ''}`}>{phaseStatus?.published ? 'Published' : phaseStatus?.indexed ? 'Awaiting publication' : 'Not synchronized'}</span>
              </div>;
            })}
          </div>
          <button className="prime-panel-link" onClick={() => onNavigate('sources')}>Manage semester sources <ArrowRight size={15} /></button>
        </section>
        <section className="card prime-panel prime-activity">
          <div className="prime-panel-heading"><div><h3>Workspace health</h3><p>Clear status, without guessing at missing data.</p></div><Database size={19} /></div>
          <div className="prime-health-item"><span className="prime-health-icon"><CheckCircle2 size={17} /></span><div><b>Master records available</b><small>{overview.students} validated students linked to {overview.groups} groups</small></div></div>
          <div className="prime-health-item"><span className="prime-health-icon"><Clock3 size={17} /></span><div><b>Last evaluation index update</b><small>{friendlyDate(overview.lastSyncedAt)}</small></div></div>
          <div className="prime-health-item"><span className="prime-health-icon"><CalendarDays size={17} /></span><div><b>Deadlines & resources</b><small>Review current submissions and academic links.</small></div></div>
          <button className="prime-panel-link" onClick={() => onNavigate('deadlines')}>Open deadlines <ArrowRight size={15} /></button>
        </section>
      </div>
      <section className="card prime-panel">
        <div className="prime-panel-heading"><div><h3>Semester summary</h3><p>Distinct students and groups with released evaluation records.</p></div><span className="prime-subtle-tag">Live data</span></div>
        <div className="tableoverflow"><table className="prime-table"><thead><tr><th>Semester</th><th>Students</th><th>Groups</th><th>Pre-Thesis 1</th><th>Pre-Thesis 2</th><th>Final Defense</th></tr></thead><tbody>{overview.semesters.map(row => <tr key={row.semester}><td><b>{row.semester}</b></td><td>{row.students}</td><td>{row.groups}</td><td>{row.P1.students} / {row.P1.groups}</td><td>{row.P2.students} / {row.P2.groups}</td><td>{row.Defense.students} / {row.Defense.groups}</td></tr>)}{!overview.semesters.length && <tr><td colSpan={6}>No semester managers registered yet.</td></tr>}</tbody></table></div>
        <p className="prime-footnote">Counts in the top cards refer to the entire permanent master. Semester figures refer only to released, synchronized evaluations; they are not semester enrollment totals.</p>
      </section>
      <button className="prime-quick-search" onClick={() => onNavigate('search')}><span><FileSearch size={21} /></span><div><b>Need a particular record?</b><small>Find a student, group, thesis title, or supervisor.</small></div><ChevronRight size={19} /></button>
    </>}
  </div>;
}

function CopyValue({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  };
  return <button className="prime-copy" type="button" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`} title={`Copy ${label.toLowerCase()}`}>{copied ? <Check size={14} /> : <ClipboardCopy size={14} />}{copied ? 'Copied' : label}</button>;
}

export function PrimeSearch({ token }: { token: string }) {
  const [query, setQuery] = useState(''), [stage, setStage] = useState('All stages'), [kind, setKind] = useState('All types');
  const [rows, setRows] = useState<DirectoryRow[]>([]), [selected, setSelected] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false), [detailBusy, setDetailBusy] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState('');
  const run = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { const result = await liveRequest<{ rows: DirectoryRow[] }>(token, 'search', { q: query.trim(), stage, type: kind }); setRows(result.rows); setLoaded(true); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  const detail = async (studentId: string) => {
    setDetailBusy(true); setError('');
    try { setSelected(await liveRequest<Detail>(token, 'detail', { studentId })); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setDetailBusy(false); }
  };
  return <div className="prime-stack">
    <section className="card prime-search-form"><div><span className="eyebrow">STUDENT DIRECTORY</span><h2>Find a student or research group</h2><p>Search by name, student ID, thesis ID, research title, or supervising faculty.</p></div>
      <form onSubmit={event => { event.preventDefault(); void run(); }}>
        <label className="searchbox prime-main-input"><Search size={19} /><input aria-label="Search academic records" placeholder="Search academic records…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <select aria-label="Current stage" value={stage} onChange={event => setStage(event.target.value)}>{['All stages', 'Pre-Thesis 1', 'Pre-Thesis 2', 'Final Thesis', 'Completed', 'Deferred'].map(value => <option key={value}>{value}</option>)}</select>
        <select aria-label="Submission type" value={kind} onChange={event => setKind(event.target.value)}>{['All types', 'Thesis', 'Project', 'Internship'].map(value => <option key={value}>{value}</option>)}</select>
        <button className="primarybtn" disabled={busy} type="submit">{busy ? <><LoaderCircle size={15} className="prime-spin" /> Searching</> : <><Search size={15} /> Search</>}</button>
      </form>
    </section>
    {error && <div className="live-error" role="alert">{error}</div>}
    <section className="card prime-search-results"><div className="prime-panel-heading"><div><h3>{loaded ? `${rows.length} matching students` : 'Search results'}</h3><p>{loaded ? 'Open a record to see all four supervision slots and student details.' : 'Start a search to explore verified records.'}</p></div><span className="prime-subtle-tag">Maximum 100 results</span></div>
      {busy ? <LoadingLines label="Looking through student and group records" /> : loaded ? <div className="tableoverflow"><table className="prime-table"><thead><tr><th>Student</th><th>Thesis / project ID</th><th>Primary supervisor</th><th>Stage</th><th></th></tr></thead><tbody>{rows.map(({ student, group }) => <tr key={student.id}><td><b>{student.name}</b><small>{student.id}</small></td><td><b>{group.id}</b><small>{group.type}</small></td><td>{group.primarySupervisor || 'Not assigned'}</td><td><span className="search-status">{group.stage}</span></td><td><button type="button" className="lightbtn" onClick={() => void detail(student.id)} disabled={detailBusy}>Details <ChevronRight size={14} /></button></td></tr>)}{rows.length === 0 && <tr><td colSpan={5} className="noresults">No records match this search. Try a different student or thesis ID.</td></tr>}</tbody></table></div> : <div className="prime-empty-search"><Search size={27} /><b>Ready when you are.</b><p>Enter a query to retrieve academic records securely.</p></div>}
    </section>
    {detailBusy && <div className="modaloverlay" role="presentation"><section className="modalbox prime-detail-loading" role="status" aria-live="polite"><LoadingLines label="Loading student and thesis details" /></section></div>}
    {selected && !detailBusy && <div className="modaloverlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><section className="modalbox admin-detail prime-detail" role="dialog" aria-modal="true" aria-label="Detailed student record"><div className="modalheader"><div><span className="eyebrow">ACADEMIC RECORD</span><h2>{selected.student.name}</h2><p className="detail-subtitle">Student ID {selected.student.id} · {selected.student.email}</p></div><button className="iconbtn" aria-label="Close student details" onClick={() => setSelected(null)}><X size={19} /></button></div>
      <div className="prime-id-band"><div><small>Thesis / project ID</small><strong>{selected.group.id}</strong></div><CopyValue value={selected.group.id} label="Copy ID" /></div>
      <div className="detail-pairs"><div><small>Research title</small><b>{selected.group.title || 'Not listed'}</b></div><div><small>Current stage</small><b>{selected.group.stage || 'Not listed'}</b></div><div><small>Submission type</small><b>{selected.group.type || 'Not listed'}</b></div><div><small>Student email</small><b>{selected.student.email || 'Not listed'}</b></div></div>
      <div className="detail-section"><h3>Supervision team</h3><div className="prime-supervisor-grid">{[
        ['Supervisor 1', selected.group.primarySupervisor], ['Supervisor 2', selected.group.secondarySupervisor],
        ['Co-supervisor 1', selected.group.coSupervisor1], ['Co-supervisor 2', selected.group.coSupervisor2],
      ].map(([label, name]) => <div key={label}><small>{label}</small><strong className={!name ? 'prime-muted' : ''}>{name || 'Not assigned'}</strong></div>)}</div></div>
      <div className="detail-section"><h3>Group members</h3><div className="memberlist">{selected.members.map(member => <div key={member.id}><Users size={15} /><span>{member.name}</span><small>{member.id}</small></div>)}</div></div>
      <div className="detail-section"><h3>Recorded marks</h3><p className="prime-footnote">Administrative records only. Publication to students follows separate release and feedback checks.</p><div className="mark-summary">{(['p1', 'p2', 'defense', 'supervisor'] as const).map(field => <div key={field}><span>{field.toUpperCase()}</span><strong>{selected.marks?.[field] ?? 'Pending'}</strong></div>)}</div></div>
    </section></div>}
  </div>;
}

export function PrimeFacultyList({ token }: { token: string }) {
  const [data, setData] = useState<FacultyResult | null>(null), [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(true), [error, setError] = useState('');
  useEffect(() => { let active = true; liveRequest<FacultyResult>(token, 'facultyList').then(result => { if (active) setData(result); }).catch(err => { if (active) setError(err instanceof Error ? err.message : String(err)); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, [token]);
  const rows = useMemo(() => (data?.faculty || []).filter(row => (filter === 'all' || (filter === 'verified' ? !!row.email : !row.email)) && [row.name, row.email, row.initial, row.designation, row.room, ...row.aliases].some(value => value.toLowerCase().includes(query.toLowerCase().trim()))), [data, query, filter]);
  return <div className="prime-stack"><section className="prime-intro"><div><span className="eyebrow">FACULTY DIRECTORY</span><h2>Faculty names and university emails</h2><p>Automatically sourced from Thesis Master → Faculty Details. No manual email-mapping form.</p></div></section>
    {error && <div className="live-error" role="alert">{error}</div>}
    {data?.warning && <div className="infobar">{data.warning}</div>}
    {data && <div className="prime-directory-stats"><div><b>{data.matched}</b><span>Email available</span></div><div><b>{data.missing}</b><span>Names without verified email</span></div><div><Clock3 size={17} /><span>Last refreshed: {friendlyDate(data.updatedAt)}</span></div></div>}
    <section className="card prime-panel"><div className="prime-directory-controls"><label className="searchbox"><Search size={17} /><input placeholder="Search faculty name or email…" aria-label="Search faculty directory" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="Faculty email availability" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All faculty</option><option value="verified">Email available</option><option value="missing">Email unavailable</option></select></div>
      {busy ? <LoadingLines label="Preparing the faculty directory" /> : <div className="tableoverflow"><table className="prime-table"><thead><tr><th>Faculty member</th><th>Designation / status</th><th>Room</th><th>Official email</th><th>Groups</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.email || row.name}-${index}`}><td><b>{row.name}</b><small>{row.initial || 'Initial unavailable'}</small>{row.aliases.length > 0 && <small>Also recorded as: {row.aliases.join(', ')}</small>}</td><td>{row.designation || '—'}<small>{row.status || ''}</small></td><td>{row.room || '—'}</td><td>{row.email ? <span className="prime-email-cell">{row.email}<CopyValue value={row.email} /></span> : <span className="prime-state">Not available</span>}</td><td>{row.groups}</td></tr>)}{rows.length === 0 && <tr><td colSpan={5} className="noresults">No matching faculty records.</td></tr>}</tbody></table></div>}
      <p className="prime-footnote">Faculty emails and initials come from the official Faculty Details tab. Names assigned in Group info but not exactly matched to that directory are shown separately and are not automatically granted supervisor access.</p>
    </section></div>;
}

export function PrimePreviewDialog({ token, onClose, onStart }: { token: string; onClose: () => void; onStart: (preview: RolePreview | null) => void }) {
  const [role, setRole] = useState<RolePreview['role']>('student'), [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [facultyOptions, setFacultyOptions] = useState<Array<{email:string;name:string;room:string;designation:string}>>([]);
  const [facultyBusy, setFacultyBusy] = useState(false);
  useEffect(() => {
    if (role !== 'supervisor') return;
    let active = true;
    setFacultyBusy(true);
    liveRequest<{faculty:Array<{email:string;name:string;room:string;designation:string}>}>(token,'previewCandidates')
      .then(result => { if(active) setFacultyOptions(result.faculty); })
      .catch(err => { if(active) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if(active) setFacultyBusy(false); });
    return () => { active = false; };
  },[token,role]);
  const validFaculty = role !== 'supervisor' || facultyOptions.some(item => item.email.toLowerCase() === email.trim().toLowerCase());
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validFaculty) { setError('Choose an email from the verified Faculty Details directory.'); return; }
    setBusy(true); setError('');
    try { const result = await liveRequest<RolePreview>(token, 'preview', { role, email: email.trim() }); onStart(role === 'prime_admin' ? null : result); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  return <div className="modaloverlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modalbox prime-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="prime-preview-title"><div className="modalheader"><div><span className="eyebrow">PRIME ADMIN ONLY</span><h2 id="prime-preview-title">View as another role</h2><p className="detail-subtitle">Inspect the experience without changing your authenticated identity.</p></div><button className="iconbtn" aria-label="Close preview" onClick={onClose}><X size={19} /></button></div>
    <form className="prime-preview-form" onSubmit={event => void submit(event)}><label>Portal experience</label><select value={role} onChange={event => { setRole(event.target.value as RolePreview['role']); setEmail(''); setError(''); }}><option value="prime_admin">Prime Admin (return to my workspace)</option><option value="admin">Regular Administrator</option><option value="supervisor">Supervisor / Faculty</option><option value="student">Student</option></select>
      {role === 'supervisor' && <><label htmlFor="prime-preview-faculty">Choose a verified faculty member</label><select id="prime-preview-faculty" value={facultyOptions.some(f => f.email === email) ? email : ''} disabled={facultyBusy || facultyOptions.length === 0} onChange={event => { setEmail(event.target.value); setError(''); }}><option value="">{facultyBusy ? 'Loading verified faculty…' : 'Select faculty from the official directory'}</option>{facultyOptions.map(item => <option value={item.email} key={item.email}>{item.name} · {item.email}</option>)}</select><p className="prime-preview-hint">{facultyOptions.length ? `${facultyOptions.length} verified faculty accounts available. You may also enter one of these emails below.` : facultyBusy ? 'Checking the verified faculty list…' : 'No verified faculty emails are available. Check Faculty List and run the directory sync.'}</p></>}
      {(role === 'student' || role === 'supervisor') && <><label htmlFor="prime-preview-email">{role === 'student' ? 'Student Google Workspace email' : 'Verified faculty Google Workspace email'}</label><input id="prime-preview-email" name="preview-target-account" autoComplete="off" type="email" placeholder={role === 'student' ? 'student@g.bracu.ac.bd' : 'faculty@bracu.ac.bd'} value={email} onChange={event => { setEmail(event.target.value); setError(''); }} required />{role === 'supervisor' && email && !validFaculty && !facultyBusy && <p className="prime-preview-warning">This email is not in Faculty Details. Choose a verified faculty account before previewing.</p>}</>}
      <div className="prime-preview-safety"><Eye size={17} /><span>Read-only support preview. Every request uses your verified Prime Admin account; the selected email is never accepted as a new login.</span></div>
      {error && <div className="live-error" role="alert">{error}</div>}
      <button className="primarybtn" type="submit" disabled={busy || facultyBusy || !validFaculty}>{busy ? <><LoaderCircle size={16} className="prime-spin" /> Preparing view…</> : <>Open preview <ArrowRight size={16} /></>}</button>
    </form>
  </section></div>;
}
