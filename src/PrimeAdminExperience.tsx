import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronRight, ClipboardCopy, Clock3, Database, Eye, FileSearch, GraduationCap, LoaderCircle, Search, Users, X } from 'lucide-react';
import { cachedLiveRequest, clearLiveCache, liveRequest } from './live-api';
import PortalLoading from './PortalLoading';
import type { StudentDashboard, SupervisorDashboard } from './portal-api';

type Phase = 'P1' | 'P2' | 'Defense';
type Completion = { students: number; groups: number };
type SemesterSummary = { semester: string; students: number; groups: number; P1: Completion; P2: Completion; Defense: Completion };
type SemesterStatus = { semester: string; phases: Array<{ phase: Phase; indexed: boolean }> };
type Overview = { students: number; groups: number; recorded: Record<Phase, number>; semesters: SemesterSummary[]; sourceStatus: SemesterStatus[]; lastSyncedAt: string;
  diagnostics?:{sourceStudents:number;sourceGroups:number;validStudents:number;validGroups:number;invalidStudentIds:number;invalidGroupIds:number;unmatchedStudents:number;stageGroups:Record<string,number>;stageStudents:Record<string,number>;types:Record<string,number>} };
type DirectoryRow = { student: { id: string; name: string; email: string; thesisId: string }; group: ThesisGroup };
type ThesisGroup = { id: string; title: string; type: string; stage: string; primarySupervisor: string; secondarySupervisor?: string; coSupervisor1?: string; coSupervisor2?: string };
type Detail = DirectoryRow & { members: Array<{ id: string; name: string; email: string }>; marks: Record<string, number | string | null> };
type FacultyRow = { name: string; email: string; initial: string; designation: string; status: string; room: string; aliases: string[]; groups: number; source: string };
type FacultyResult = { faculty: FacultyRow[]; matched: number; missing: number; updatedAt: string; warning?: string };
type AcademicSuggestion = {kind:'student'|'faculty'|'group';id:string;label:string;detail:string};
export type RolePreview = { role: 'prime_admin' | 'admin' | 'student' | 'supervisor'; email: string; data: StudentDashboard | SupervisorDashboard | null };

const phaseNames: Record<Phase, string> = { P1: 'Pre-Thesis 1', P2: 'Pre-Thesis 2', Defense: 'Final Defense' };
const friendlyDate = (value: string) => {
  if (!value) return 'No completed synchronization recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short' });
};

function LoadingLines({ label = 'Retrieving academic records' }: { label?: string }) {
  return <PortalLoading label={label} detail="Retrieving verified university information…"/>;
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
  const indexedPhases = overview?.sourceStatus.reduce((count, row) => count + row.phases.filter(p => p.indexed).length, 0) || 0;
  return <div className="prime-stack">
    <section className="prime-intro">
      <div><span className="eyebrow">ACADEMIC SNAPSHOT</span><h2>A clearer view of thesis activity.</h2><p>Registered records, recorded marks, panel feedback, and shortcuts in one place.</p></div>
      <button className="lightbtn" type="button" onClick={reload} disabled={busy}><Activity size={15} /> Refresh overview</button>
    </section>
    {error && <div className="live-error" role="alert">{error}</div>}
    {overview&&busy&&<PortalLoading compact label="Refreshing academic overview" detail="Updating student and group totals…"/>}
    {!overview && busy ? <LoadingLines label="Preparing your academic overview" /> : overview && <>
      <div className="prime-metrics">
        <Metric title="Students in master" count={overview.students} description="All validated student records" icon={Users} />
        <Metric title="Research groups" count={overview.groups} description="Distinct thesis / project IDs" icon={GraduationCap} />
        <Metric title="Groups in P1" count={overview.diagnostics?.stageGroups.P1||0} description="All registered groups" icon={GraduationCap} />
        <Metric title="Groups in P2" count={overview.diagnostics?.stageGroups.P2||0} description="All registered groups" icon={GraduationCap} />
        <Metric title="Final thesis / defense" count={overview.diagnostics?.stageGroups.Defense||0} description="All registered groups" icon={GraduationCap} />
        <Metric title="Completed groups" count={overview.diagnostics?.stageGroups.Completed||0} description="All registered groups" icon={CheckCircle2} />
        <Metric title="Indexed evaluation phases" count={indexedPhases} description="Across registered semesters" icon={Clock3} />
      </div>
      <div className="prime-two-column">
        <section className="card prime-panel">
          <div className="prime-panel-heading"><div><h3>Evaluation records</h3><p>Synchronized panel feedback and available master marks are shown directly.</p></div><select aria-label="Select reporting semester" value={semester} onChange={event => setSemester(event.target.value)}>{overview.semesters.map(row => <option key={row.semester}>{row.semester}</option>)}</select></div>
          <div className="prime-phase-list">
            {(['P1', 'P2', 'Defense'] as Phase[]).map(phase => {
              const phaseStatus = status?.phases.find(p => p.phase === phase);
              return <div className="prime-phase" key={phase}>
                <div><span className="prime-phase-dot" /><div><b>{phaseNames[phase]}</b><small>{current?.[phase].students || 0} students · {current?.[phase].groups || 0} groups with indexed records</small></div></div>
                <span className={`prime-state ${phaseStatus?.indexed ? 'is-ready' : ''}`}>{phaseStatus?.indexed ? 'Indexed' : 'Not synchronized'}</span>
              </div>;
            })}
          </div>
          <button className="prime-panel-link" onClick={() => onNavigate('sources')}>Manage semester sources <ArrowRight size={15} /></button>
        </section>
        <section className="card prime-panel prime-activity">
          <div className="prime-panel-heading"><div><h3>Workspace health</h3><p>Clear status, without guessing at missing data.</p></div><Database size={19} /></div>
          <div className="prime-health-item"><span className="prime-health-icon"><CheckCircle2 size={17} /></span><div><b>Master records available</b><small>{overview.students} students and {overview.groups} groups loaded directly from the master</small></div></div>
          {overview.diagnostics&&<div className="prime-health-item"><span className="prime-health-icon"><FileSearch size={17}/></span><div><b>Data reconciliation</b><small>{overview.diagnostics.sourceStudents} source student rows · {overview.diagnostics.sourceGroups} source group rows · {overview.diagnostics.unmatchedStudents} students without a matching group · {overview.diagnostics.invalidStudentIds} invalid student IDs · {overview.diagnostics.invalidGroupIds} unusual group IDs</small></div></div>}
          <div className="prime-health-item"><span className="prime-health-icon"><Clock3 size={17} /></span><div><b>Last evaluation index update</b><small>{friendlyDate(overview.lastSyncedAt)}</small></div></div>
          <div className="prime-health-item"><span className="prime-health-icon"><CalendarDays size={17} /></span><div><b>Deadlines & resources</b><small>Review current submissions and academic links.</small></div></div>
          <button className="prime-panel-link" onClick={() => onNavigate('deadlines')}>Open deadlines <ArrowRight size={15} /></button>
        </section>
      </div>
      <section className="card prime-panel">
        <div className="prime-panel-heading"><div><h3>Semester summary</h3><p>Distinct students and groups with synchronized marks or feedback.</p></div><span className="prime-subtle-tag">Live data</span></div>
        <div className="tableoverflow"><table className="prime-table"><thead><tr><th>Semester</th><th>Students</th><th>Groups</th><th>Pre-Thesis 1</th><th>Pre-Thesis 2</th><th>Final Defense</th></tr></thead><tbody>{overview.semesters.map(row => <tr key={row.semester}><td><b>{row.semester}</b></td><td>{row.students}</td><td>{row.groups}</td><td>{row.P1.students} / {row.P1.groups}</td><td>{row.P2.students} / {row.P2.groups}</td><td>{row.Defense.students} / {row.Defense.groups}</td></tr>)}{!overview.semesters.length && <tr><td colSpan={6}>No semester managers registered yet.</td></tr>}</tbody></table></div>
        <p className="prime-footnote">Counts in the top cards refer to the entire permanent master. Semester figures require indexed evaluator records and are not semester enrollment totals.</p>
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
  const [suggestions,setSuggestions]=useState<AcademicSuggestion[]>([]),[suggestOpen,setSuggestOpen]=useState(false),[suggestLoading,setSuggestLoading]=useState(false);
  const [activeIndex,setActiveIndex]=useState(0),[picked,setPicked]=useState<AcademicSuggestion|null>(null);
  const [suggestError,setSuggestError]=useState('');
  const [rows, setRows] = useState<DirectoryRow[]>([]), [selected, setSelected] = useState<Detail | null>(null);
  const [offset,setOffset]=useState(0),[total,setTotal]=useState(0);
  const [busy, setBusy] = useState(false), [detailBusy, setDetailBusy] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState('');
  useEffect(()=>{
    const text=query.trim();
    if(picked||text.length<2){setSuggestions([]);setSuggestLoading(false);setSuggestError('');return;}
    let active=true;
    const timeout=window.setTimeout(()=>{
      setSuggestLoading(true);
      cachedLiveRequest<{items:AcademicSuggestion[]}>(token,'suggest',{q:text},120000)
        .then(result=>{if(active){setSuggestions(result.items);setActiveIndex(0);setSuggestOpen(true);setSuggestError('');}})
        .catch(err=>{if(active){setSuggestions([]);setSuggestError(err instanceof Error?err.message:'Suggestions unavailable');}})
        .finally(()=>{if(active)setSuggestLoading(false);});
    },320);
    return()=>{active=false;window.clearTimeout(timeout);};
  },[token,query,picked]);
  const run = async (nextOffset=0,selection:AcademicSuggestion|null=picked) => {
    if (busy) return;
    setBusy(true); setError('');setLoaded(false);
    try { const result = await liveRequest<{ rows: DirectoryRow[];total:number;offset:number }>(token, 'search', { q:selection?.kind==='faculty'?'':selection?.id||query.trim(),facultyEmail:selection?.kind==='faculty'?selection.id:'', stage, type: kind, offset:nextOffset }); setRows(result.rows);setOffset(result.offset);setTotal(result.total); setLoaded(true); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  const detail = async (studentId: string) => {
    setDetailBusy(true); setError('');setSelected(null);
    try { setSelected(await liveRequest<Detail>(token, 'detail', { studentId })); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setDetailBusy(false); }
  };
  const pickSuggestion=(suggestion:AcademicSuggestion)=>{
    setPicked(suggestion);setQuery(suggestion.kind==='faculty'?suggestion.label:suggestion.id);setSuggestions([]);setSuggestOpen(false);
    void run(0,suggestion);
  };
  const onSearchKey=(event:React.KeyboardEvent<HTMLInputElement>)=>{
    if(event.key==='Escape'){setSuggestOpen(false);return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      if(!suggestions.length)return;
      event.preventDefault();setSuggestOpen(true);
      setActiveIndex(index=>(index+(event.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length);
    }
    if(event.key==='Enter'&&suggestOpen&&suggestions[activeIndex]){event.preventDefault();pickSuggestion(suggestions[activeIndex]);}
  };
  useEffect(()=>{if(suggestOpen)document.getElementById('prime-suggestion-'+activeIndex)?.scrollIntoView({block:'nearest'});},[activeIndex,suggestOpen]);
  return <div className="prime-stack">
    <section className="card prime-search-form"><div><span className="eyebrow">STUDENT DIRECTORY</span><h2>Find a student or research group</h2><p>Search by name, student ID, thesis ID, research title, or supervising faculty.</p></div>
      <form onSubmit={event => { event.preventDefault(); setSuggestOpen(false); void run(); }}>
        <div className="prime-search-autocomplete">
          <label className="searchbox prime-main-input"><Search size={19}/><input role="combobox" aria-label="Search students, faculty or thesis groups" aria-autocomplete="list" aria-expanded={suggestOpen&&suggestions.length>0} aria-controls="prime-academic-suggestions" aria-activedescendant={suggestOpen&&suggestions[activeIndex]?'prime-suggestion-'+activeIndex:undefined} autoComplete="off" placeholder="Name, faculty initial, student ID or thesis ID…" value={query} onChange={event=>{setQuery(event.target.value);setPicked(null);setSuggestions([]);setSuggestLoading(event.target.value.trim().length>=2);setSuggestOpen(true);setActiveIndex(0);}} onKeyDown={onSearchKey} onFocus={()=>{if(suggestions.length)setSuggestOpen(true);}} onBlur={()=>window.setTimeout(()=>setSuggestOpen(false),120)}/></label>
          {suggestOpen&&!picked&&query.trim().length>=2&&<div className="prime-suggest-menu" id="prime-academic-suggestions" role="listbox" aria-label="Matching academic records">
            {suggestLoading&&<div className="prime-suggest-status"><LoaderCircle size={14} className="prime-spin"/> Finding matches…</div>}
            {!suggestLoading&&suggestError&&<div className="prime-suggest-status" role="status">{suggestError}. Press Enter to search normally.</div>}
            {!suggestLoading&&!suggestError&&suggestions.length===0&&<div className="prime-suggest-status">No suggestions yet. Press Enter for full search.</div>}
            {!suggestLoading&&suggestions.map((item,index)=><button key={item.kind+item.id} type="button" id={'prime-suggestion-'+index} role="option" aria-selected={index===activeIndex} className={'prime-suggest-item'+(index===activeIndex?' selected':'')} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActiveIndex(index)} onClick={()=>pickSuggestion(item)}><span className={'prime-suggest-kind '+item.kind}>{item.kind==='student'?'Student':item.kind==='faculty'?'Faculty':'Thesis group'}</span><span className="prime-suggest-text"><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={15}/></button>)}
          </div>}
        </div>
        <select aria-label="Current stage" value={stage} onChange={event => setStage(event.target.value)}>{['All stages', 'Pre-Thesis 1', 'Pre-Thesis 2', 'Final Thesis', 'Completed', 'Deferred'].map(value => <option key={value}>{value}</option>)}</select>
        <select aria-label="Submission type" value={kind} onChange={event => setKind(event.target.value)}>{['All types', 'Thesis', 'Project', 'Internship'].map(value => <option key={value}>{value}</option>)}</select>
        <button className="primarybtn" disabled={busy} type="submit">{busy ? <><LoaderCircle size={15} className="prime-spin" /> Searching</> : <><Search size={15} /> Search</>}</button>
      </form>
    </section>
    {error && <div className="live-error" role="alert">{error}</div>}
    <section className="card prime-search-results"><div className="prime-panel-heading"><div><h3>{loaded ? `${total} matching students` : 'Search results'}</h3><p>{loaded ? `Showing ${offset+1}–${offset+rows.length} of ${total} matching records.` : 'Start a search to explore verified records.'}</p></div><span className="prime-subtle-tag">100 per page</span></div>
      {busy ? <LoadingLines label="Looking through student and group records" /> : loaded ? <div className="tableoverflow"><table className="prime-table"><thead><tr><th>Student</th><th>Thesis / project ID</th><th>Primary supervisor</th><th>Stage</th><th></th></tr></thead><tbody>{rows.map(({ student, group }) => <tr key={student.id}><td><b>{student.name}</b><small>{student.id}</small></td><td><b>{group.id}</b><small>{group.type}</small></td><td>{group.primarySupervisor || 'Not assigned'}</td><td><span className="search-status">{group.stage}</span></td><td><button type="button" className="lightbtn" onClick={() => void detail(student.id)} disabled={detailBusy}>Details <ChevronRight size={14} /></button></td></tr>)}{rows.length === 0 && <tr><td colSpan={5} className="noresults">No records match this search. Try a different student or thesis ID.</td></tr>}</tbody></table></div> : <div className="prime-empty-search"><Search size={27} /><b>Ready when you are.</b><p>Enter a query to retrieve academic records securely.</p></div>}
    </section>
    {loaded&&total>100&&<div className="formrow" role="navigation" aria-label="Student search pages"><button className="lightbtn" disabled={busy||offset===0} onClick={()=>void run(Math.max(0,offset-100))}>Previous 100</button><span className="smallmuted">Page {Math.floor(offset/100)+1} of {Math.ceil(total/100)}</span><button className="lightbtn" disabled={busy||offset+100>=total} onClick={()=>void run(offset+100)}>Next 100</button></div>}
    {detailBusy && <div className="modaloverlay" role="presentation"><section className="modalbox prime-detail-loading" role="status" aria-live="polite"><LoadingLines label="Loading student and thesis details" /></section></div>}
    {selected && !detailBusy && <div className="modaloverlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><section className="modalbox admin-detail prime-detail" role="dialog" aria-modal="true" aria-label="Detailed student record"><div className="modalheader"><div><span className="eyebrow">ACADEMIC RECORD</span><h2>{selected.student.name}</h2><p className="detail-subtitle">Student ID {selected.student.id} · {selected.student.email}</p></div><button className="iconbtn" aria-label="Close student details" onClick={() => setSelected(null)}><X size={19} /></button></div>
      <div className="prime-id-band"><div><small>{selected.group.type} ID</small><strong>{selected.group.id}</strong></div><CopyValue value={selected.group.id} label="Copy ID" /></div>
      <div className="detail-pairs"><div><small>Research title</small><b>{selected.group.title || 'Not listed'}</b></div><div><small>Current stage</small><b>{selected.group.stage || 'Not listed'}</b></div><div><small>Submission type</small><b>{selected.group.type || 'Not listed'}</b></div><div><small>Student email</small><b>{selected.student.email || 'Not listed'}</b></div></div>
      <div className="detail-section"><h3>Supervision team</h3><div className="prime-supervisor-grid">{[
        ['Supervisor 1', selected.group.primarySupervisor], ['Supervisor 2', selected.group.secondarySupervisor],
        ['Co-supervisor 1', selected.group.coSupervisor1], ['Co-supervisor 2', selected.group.coSupervisor2],
      ].map(([label, name]) => <div key={label}><small>{label}</small><strong className={!name ? 'prime-muted' : ''}>{name || 'Not assigned'}</strong></div>)}</div></div>
      <div className="detail-section"><h3>Group members</h3><div className="memberlist">{selected.members.map(member => <div key={member.id}><Users size={15} /><span>{member.name}</span><small>{member.id}</small></div>)}</div></div>
      <div className="detail-section"><h3>Recorded marks</h3><p className="prime-footnote">Values come from the permanent master. Available marks and indexed comments also appear in the verified student's workspace.</p><div className="mark-summary">{(['p1', 'p2', 'defense', 'supervisor'] as const).map(field => <div key={field}><span>{field.toUpperCase()}</span><strong>{selected.marks?.[field] ?? 'Pending'}</strong></div>)}</div></div>
    </section></div>}
  </div>;
}

type EditableFacultyField = 'initial' | 'email' | 'designation' | 'room';
function FacultyEditCell({row,field,onSave}:{row:FacultyRow;field:EditableFacultyField;onSave:(row:FacultyRow,field:EditableFacultyField,value:string,expected:string)=>Promise<void>}) {
  const [editing,setEditing]=useState(false),[value,setValue]=useState(row[field]),[saving,setSaving]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(!editing)setValue(row[field]);},[row[field],editing]);
  const cancel=()=>{if(saving)return;setValue(row[field]);setEditing(false);setError('');};
  const save=async()=>{
    const submitted=value.trim();if(submitted===row[field]){cancel();return;}
    setSaving(true);setError('');
    try{await onSave(row,field,submitted,row[field]);setEditing(false);}
    catch(err){setError(err instanceof Error?err.message:String(err));}
    finally{setSaving(false);}
  };
  if(!row.email)return <span className="prime-muted">—</span>;
  return editing?<div className="faculty-cell-editor">
    <input autoFocus aria-label={`Edit ${field} for ${row.name}`} type={field==='email'?'email':'text'} value={value} disabled={saving} onChange={e=>setValue(field==='initial'?e.target.value.toUpperCase():e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void save();}if(e.key==='Escape')cancel();}}/>
    <span className="faculty-editor-actions"><button type="button" disabled={saving} onClick={()=>void save()}>{saving?<><LoaderCircle size={13} className="prime-spin"/> Saving…</>:'Save'}</button><button type="button" disabled={saving} onClick={cancel}>Cancel</button></span>
    {error&&<small role="alert" className="faculty-cell-error">{error}</small>}
  </div>:<span className="faculty-editable" title="Double-click to edit" tabIndex={0} role="button" aria-label={`Edit ${field} for ${row.name}`} onDoubleClick={()=>setEditing(true)} onKeyDown={e=>{if(e.key==='Enter')setEditing(true);}}>{row[field]||'—'}<small>Double-click to edit</small></span>;
}

export function PrimeFacultyList({ token }: { token: string }) {
  const [data,setData]=useState<FacultyResult|null>(null),[query,setQuery]=useState(''),[filter,setFilter]=useState('all');
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const refresh=async()=>{const result=await liveRequest<FacultyResult>(token,'facultyList');setData(result);};
  useEffect(()=>{let active=true;liveRequest<FacultyResult>(token,'facultyList').then(result=>{if(active)setData(result);}).catch(err=>{if(active)setError(err instanceof Error?err.message:String(err));}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[token]);
  const save=async(row:FacultyRow,field:EditableFacultyField,value:string,expected:string)=>{
    await liveRequest(token,'updateFaculty',{email:row.email,field,value,expected});
    clearLiveCache();
    await refresh();setSuccess(row.name+': '+field+' saved to Faculty Details.');setError('');
  };
  const rows=useMemo(()=>(data?.faculty||[]).filter(row=>(filter==='all'||(filter==='verified'?!!row.email:!row.email))&&[row.name,row.email,row.initial,row.designation,row.room,...row.aliases].some(value=>value.toLowerCase().includes(query.toLowerCase().trim()))),[data,query,filter]);
  return <div className="prime-stack"><section className="prime-intro"><div><span className="eyebrow">FACULTY DIRECTORY</span><h2>Faculty directory</h2><p>Verified names and contacts from the official Faculty Details sheet. Double-click an editable cell to update it.</p></div><button type="button" className="lightbtn" disabled={busy} onClick={()=>{setBusy(true);void refresh().catch(e=>setError(String(e))).finally(()=>setBusy(false));}}>Refresh</button></section>
    {error&&<div className="live-error" role="alert">{error}</div>}{success&&<div className="infobar" role="status">{success}</div>}
    {data?.warning&&<div className="infobar">{data.warning}</div>}
    {data&&<div className="prime-directory-stats"><div><b>{data.matched}</b><span>Verified faculty</span></div><div><b>{data.missing}</b><span>Unmatched or ambiguous names</span></div><div><Clock3 size={17}/><span>Updated: {friendlyDate(data.updatedAt)}</span></div></div>}
    <section className="card prime-panel"><div className="prime-directory-controls"><label className="searchbox"><Search size={17}/><input placeholder="Search names, initials or emails…" aria-label="Search faculty directory" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Faculty identity filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All faculty</option><option value="verified">Verified directory</option><option value="missing">Unmatched names</option></select></div>
      {busy?<LoadingLines label="Refreshing the faculty directory"/>:<div className="tableoverflow"><table className="prime-table faculty-table"><thead><tr><th>Initial</th><th>Faculty name</th><th>Designation</th><th>Status</th><th>Room</th><th>University email</th><th>Groups</th></tr></thead><tbody>{rows.map((row,index)=><tr key={row.email||row.name+'-'+index}>
        <td><FacultyEditCell row={row} field="initial" onSave={save}/></td><td><b>{row.name}</b>{!row.email&&<small className="faculty-unmatched">{row.source}</small>}{row.aliases.length>0&&<small>Also known as: {row.aliases.join(', ')}</small>}</td><td><FacultyEditCell row={row} field="designation" onSave={save}/></td><td>{row.status||'—'}</td><td><FacultyEditCell row={row} field="room" onSave={save}/></td><td><FacultyEditCell row={row} field="email" onSave={save}/></td><td><b>{row.groups}</b></td>
      </tr>)}{!rows.length&&<tr><td colSpan={7} className="noresults">No matching faculty records.</td></tr>}</tbody></table></div>}
      <p className="prime-footnote">Edits require Prime Admin permissions and are verified against the current source row. Ambiguous names never grant access. Updates are audited in a private edit log.</p>
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
