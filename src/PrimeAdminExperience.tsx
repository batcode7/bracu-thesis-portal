import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, ClipboardCopy, Clock3, Eye, LoaderCircle, Search, Users, X } from 'lucide-react';
import { cachedLiveRequest, clearLiveCache, liveRequest } from './live-api';
import PortalLoading from './PortalLoading';
import { Pagination, type PageSize } from './Pagination';
import type { StudentDashboard, SupervisorDashboard } from './portal-api';

type DirectoryRow = { student: { id: string; name: string; email: string; thesisId: string }; group: ThesisGroup };
type ThesisGroup = { id: string; title: string; type: string; stage: string; primarySupervisor: string; secondarySupervisor?: string; coSupervisor1?: string; coSupervisor2?: string };
type Detail = DirectoryRow & { members: Array<{ id: string; name: string; email: string }>; marks: Record<string, number | string | null>; evaluations:Array<{id:string;phase:string;semester:string;comment:string|null}> };
type FacultyRow = { name: string; email: string; initial: string; designation: string; status: string; room: string; aliases: string[]; groups: number; source: string };
type FacultyResult = { faculty: FacultyRow[]; total: number; offset: number; matched: number; missing: number; updatedAt: string; warning?: string };
type AcademicSuggestion = {kind:'student'|'faculty'|'group';id:string;label:string;detail:string;email?:string};
export type RolePreview = { role: 'admin' | 'student' | 'supervisor'; email: string; data: StudentDashboard | SupervisorDashboard | null };

const friendlyDate = (value: string) => {
  if (!value) return 'No completed synchronization recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short' });
};

function LoadingLines({ label = 'Retrieving academic records' }: { label?: string }) {
  return <PortalLoading label={label} detail="Retrieving verified university information…"/>;
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
  const [pageSize,setPageSize]=useState<PageSize>(10);
  const [busy, setBusy] = useState(false), [detailBusy, setDetailBusy] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState('');
  const searchSequence=useRef(0);
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
  const run = async (nextOffset=0,selection:AcademicSuggestion|null=picked,limit:PageSize=pageSize) => {
    const sequence=++searchSequence.current;
    setBusy(true); setError('');
    try { const result = await liveRequest<{ rows: DirectoryRow[];total:number;offset:number }>(token, 'search', { q:selection?.kind==='faculty'?'':selection?.id||query.trim(),facultyEmail:selection?.kind==='faculty'?selection.id:'', stage, type: kind, offset:nextOffset,limit }); if(sequence===searchSequence.current){setRows(result.rows);setOffset(result.offset);setTotal(result.total);setLoaded(true);} }
    catch (err) { if(sequence===searchSequence.current)setError(err instanceof Error ? err.message : String(err)); }
    finally { if(sequence===searchSequence.current)setBusy(false); }
  };
  useEffect(()=>{
    // Make the first ten results available as soon as the directory opens.
    // Further pages and detailed records are fetched only when requested.
    let active=true;
    const sequence=++searchSequence.current;
    setBusy(true);
    liveRequest<{rows:DirectoryRow[];total:number;offset:number}>(token,'search',{q:'',stage:'All stages',type:'All types',offset:0,limit:10})
      .then(result=>{if(active&&sequence===searchSequence.current){setRows(result.rows);setTotal(result.total);setOffset(result.offset);setLoaded(true);}})
      .catch(err=>{if(active&&sequence===searchSequence.current)setError(err instanceof Error?err.message:String(err));})
      .finally(()=>{if(active&&sequence===searchSequence.current)setBusy(false);});
    return()=>{active=false;};
  },[token]);
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
    <section className="card prime-search-results"><div className="prime-panel-heading"><div><h3>{loaded ? `${total} matching students` : 'Search results'}</h3><p>{loaded ? `Showing ${total?offset+1:0}–${offset+rows.length} of ${total} matching records.` : 'Start a search to explore verified records.'}</p></div></div>
      {busy&&loaded&&<div className="prime-suggest-status" role="status"><LoaderCircle size={14} className="prime-spin"/> Updating results…</div>}
      {loaded ? <div className="tableoverflow"><table className="prime-table"><thead><tr><th>Student</th><th>Thesis / project ID</th><th>Primary supervisor</th><th>Stage</th><th></th></tr></thead><tbody>{rows.map(({ student, group }) => <tr key={student.id}><td><b>{student.name}</b><small>{student.id}</small></td><td><b>{group.id}</b><small>{group.type}</small></td><td>{group.primarySupervisor || 'Not assigned'}</td><td><span className="search-status">{group.stage}</span></td><td><button type="button" className="lightbtn" onClick={() => void detail(student.id)} disabled={detailBusy}>Details <ChevronRight size={14} /></button></td></tr>)}{rows.length === 0 && <tr><td colSpan={5} className="noresults">No records match this search. Try a different student or thesis ID.</td></tr>}</tbody></table></div> : busy ? <LoadingLines label="Looking through student and group records"/> : <div className="prime-empty-search"><Search size={27} /><b>Ready when you are.</b><p>Enter a query to retrieve academic records securely.</p></div>}
    </section>
    {loaded&&<Pagination label="Student search" total={total} page={Math.floor(offset/pageSize)} pageSize={pageSize} disabled={busy} onPageChange={page=>void run(page*pageSize)} onPageSizeChange={size=>{setPageSize(size);void run(0,picked,size);}}/>}
    {detailBusy && <div className="modaloverlay" role="presentation"><section className="modalbox prime-detail-loading" role="status" aria-live="polite"><LoadingLines label="Loading student and thesis details" /></section></div>}
    {selected && !detailBusy && <div className="modaloverlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><section className="modalbox admin-detail prime-detail" role="dialog" aria-modal="true" aria-label="Detailed student record"><div className="modalheader"><div><span className="eyebrow">ACADEMIC RECORD</span><h2>{selected.student.name}</h2><p className="detail-subtitle">Student ID {selected.student.id} · {selected.student.email}</p></div><button className="iconbtn" aria-label="Close student details" onClick={() => setSelected(null)}><X size={19} /></button></div>
      <div className="prime-id-band"><div><small>{selected.group.type} ID</small><strong>{selected.group.id}</strong></div><CopyValue value={selected.group.id} label="Copy ID" /></div>
      <div className="detail-pairs"><div><small>Research title</small><b>{selected.group.title || 'Not listed'}</b></div><div><small>Current stage</small><b>{selected.group.stage || 'Not listed'}</b></div><div><small>Submission type</small><b>{selected.group.type || 'Not listed'}</b></div><div><small>Student email</small><b>{selected.student.email || 'Not listed'}</b></div></div>
      <div className="detail-section"><h3>Supervision team</h3><div className="prime-supervisor-grid">{[
        ['Supervisor 1', selected.group.primarySupervisor], ['Supervisor 2', selected.group.secondarySupervisor],
        ['Co-supervisor 1', selected.group.coSupervisor1], ['Co-supervisor 2', selected.group.coSupervisor2],
      ].map(([label, name]) => <div key={label}><small>{label}</small><strong className={!name ? 'prime-muted' : ''}>{name || 'Not assigned'}</strong></div>)}</div></div>
      <div className="detail-section"><h3>Group members</h3><div className="memberlist">{selected.members.map(member => <div key={member.id}><Users size={15} /><span>{member.name}</span><small>{member.id}</small></div>)}</div></div>
      <div className="detail-section"><h3>Recorded marks</h3><p className="prime-footnote">Marks come from the permanent master. Group-wide comments also appear in the verified student's workspace directly from Group info.</p><div className="mark-summary">{(['p1', 'p2', 'defense', 'supervisor'] as const).map(field => <div key={field}><span>{field.toUpperCase()}</span><strong>{selected.marks?.[field] ?? 'Pending'}</strong></div>)}</div></div>
      <div className="detail-section"><h3>Group panel comments</h3>{selected.evaluations.filter(item=>['P1','P2','Defense'].includes(item.phase)).map(item=><div className="admin-phase-comment" key={item.id}><strong>{item.phase}</strong>{item.semester!=='Semester not recorded'&&<small>{item.semester}</small>}<p>{item.comment?.trim()||'No Comments. Please reach out to your respective panel members for feedback.'}</p></div>)}</div>
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
  const [page,setPage]=useState(0),[pageSize,setPageSize]=useState<PageSize>(10);
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;
    const timer=window.setTimeout(()=>{
      setBusy(true);
      liveRequest<FacultyResult>(token,'facultyList',{q:query.trim(),filter,offset:page*pageSize,limit:pageSize})
        .then(result=>{if(active){setData(result);setError('');}})
        .catch(err=>{if(active)setError(err instanceof Error?err.message:String(err));})
        .finally(()=>{if(active)setBusy(false);});
    },query.trim()?220:0);
    return()=>{active=false;window.clearTimeout(timer);};
  },[token,query,filter,page,pageSize,revision]);
  const save=async(row:FacultyRow,field:EditableFacultyField,value:string,expected:string)=>{
    await liveRequest(token,'updateFaculty',{email:row.email,field,value,expected});
    clearLiveCache();
    // D1 is a synchronized replica: show the successful edit immediately,
    // without replacing it with an older snapshot from the next read.
    setData(current=>current?{...current,faculty:current.faculty.map(item=>item.email===row.email?{...item,[field]:value}:item)}:current);
    setSuccess(row.name+': '+field+' saved. The directory index updates on the next synchronization.');setError('');
  };
  useEffect(()=>setPage(0),[query,filter,pageSize]);
  const visible=data?.faculty||[];
  return <div className="prime-stack"><section className="prime-intro"><div><span className="eyebrow">FACULTY DIRECTORY</span><h2>Faculty directory</h2><p>Verified names and contacts from the official Faculty Details sheet. Double-click an editable cell to update it.</p></div><button type="button" className="lightbtn" disabled={busy} onClick={()=>setRevision(value=>value+1)}>Refresh</button></section>
    {error&&<div className="live-error" role="alert">{error}</div>}{success&&<div className="infobar" role="status">{success}</div>}
    {data?.warning&&<div className="infobar">{data.warning}</div>}
    {data&&<div className="prime-directory-stats"><div><b>{data.matched}</b><span>Verified faculty</span></div><div><b>{data.missing}</b><span>Unmatched or ambiguous names</span></div><div><Clock3 size={17}/><span>Updated: {friendlyDate(data.updatedAt)}</span></div></div>}
    <section className="card prime-panel"><div className="prime-directory-controls"><label className="searchbox"><Search size={17}/><input placeholder="Search names, initials or emails…" aria-label="Search faculty directory" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Faculty identity filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All faculty</option><option value="verified">Verified directory</option><option value="missing">Unmatched names</option></select></div>
      {busy&&<div className="prime-suggest-status" role="status"><LoaderCircle size={14} className="prime-spin"/> Loading faculty records…</div>}
      {data?<div className="tableoverflow"><table className="prime-table faculty-table"><thead><tr><th>Initial</th><th>Faculty name</th><th>Designation</th><th>Status</th><th>Room</th><th>University email</th><th>Groups</th></tr></thead><tbody>{visible.map((row,index)=><tr key={row.email||row.name+'-'+index}>
        <td><FacultyEditCell row={row} field="initial" onSave={save}/></td><td><b>{row.name}</b>{!row.email&&<small className="faculty-unmatched">{row.source}</small>}{row.aliases.length>0&&<small>Also known as: {row.aliases.join(', ')}</small>}</td><td><FacultyEditCell row={row} field="designation" onSave={save}/></td><td>{row.status||'—'}</td><td><FacultyEditCell row={row} field="room" onSave={save}/></td><td><FacultyEditCell row={row} field="email" onSave={save}/></td><td><b>{row.groups}</b></td>
      </tr>)}{!visible.length&&<tr><td colSpan={7} className="noresults">No matching faculty records.</td></tr>}</tbody></table></div>:<LoadingLines label="Loading the first faculty records"/>}
      {data&&<Pagination label="Faculty directory" total={data.total} page={page} pageSize={pageSize} disabled={busy} onPageChange={setPage} onPageSizeChange={setPageSize}/>}
      <p className="prime-footnote">Edits require administrator permissions and are verified against the current source row. Ambiguous names never grant access. Updates are audited in a private edit log.</p>
    </section></div>;
}

export function PrimePreviewPage({ token, onStart }: { token: string; onStart: (preview: RolePreview | null) => void }) {
  const [role, setRole] = useState<RolePreview['role']>('student'), [email, setEmail] = useState(''), [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [facultyOptions, setFacultyOptions] = useState<Array<{email:string;name:string;initial:string;room:string;designation:string}>>([]);
  const [facultyBusy, setFacultyBusy] = useState(false);
  const [facultySearch,setFacultySearch]=useState('');
  const [suggestions,setSuggestions]=useState<AcademicSuggestion[]>([]),[suggestBusy,setSuggestBusy]=useState(false),[suggestOpen,setSuggestOpen]=useState(false),[activeIndex,setActiveIndex]=useState(0);
  useEffect(() => {
    if (role !== 'supervisor') return;
    let active = true;
    setFacultyBusy(true);
    liveRequest<{faculty:Array<{email:string;name:string;initial:string;room:string;designation:string}>}>(token,'previewCandidates')
      .then(result => { if(active) setFacultyOptions(result.faculty); })
      .catch(err => { if(active) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if(active) setFacultyBusy(false); });
    return () => { active = false; };
  },[token,role]);
  useEffect(()=>{
    if(role!=='student'||email||query.trim().length<2){setSuggestions([]);setSuggestBusy(false);return;}
    let active=true;
    setSuggestBusy(true);
    const timer=window.setTimeout(()=>{
      liveRequest<{items:AcademicSuggestion[]}>(token,'suggest',{q:query.trim(),kind:'student'})
        .then(result=>{if(active){setSuggestions(result.items.filter(item=>item.kind==='student'));setActiveIndex(0);}})
        .catch(err=>{if(active){setSuggestions([]);setError(err instanceof Error?err.message:String(err));}})
        .finally(()=>{if(active)setSuggestBusy(false);});
    },220);
    return()=>{active=false;window.clearTimeout(timer);};
  },[token,role,query,email]);
  useEffect(()=>{
    if(suggestOpen&&suggestions[activeIndex]){
      document.getElementById('prime-preview-suggestion-'+activeIndex)?.scrollIntoView({block:'nearest'});
    }
  },[activeIndex,suggestOpen,suggestions]);
  const sortedFaculty=useMemo(()=>[...facultyOptions].sort((a,b)=>a.name.replace(/^(?:(?:dr|prof|professor)\.?\s+)+/i,'').localeCompare(b.name.replace(/^(?:(?:dr|prof|professor)\.?\s+)+/i,''),undefined,{sensitivity:'base'})||a.email.localeCompare(b.email)),[facultyOptions]);
  const filteredFaculty=useMemo(()=>{
    const text=facultySearch.toLowerCase().trim();
    return text?sortedFaculty.filter(item=>[item.initial,item.name,item.email].some(value=>value.toLowerCase().includes(text))):sortedFaculty;
  },[sortedFaculty,facultySearch]);
  const targetEmail=email||query.trim();
  const validFaculty = role !== 'supervisor' || facultyOptions.some(item => item.email.toLowerCase() === targetEmail.toLowerCase());
  const validTarget=role==='admin'||(/^[a-z0-9._%+\-]+@(?:g\.)?bracu\.ac\.bd$/i.test(targetEmail)&&validFaculty);
  const chooseFaculty=(faculty:{email:string;name:string;initial:string})=>{
    setEmail(faculty.email);setQuery(faculty.email);setFacultySearch(faculty.name);setError('');
  };
  const choose=(item:AcademicSuggestion)=>{
    if(!item.email){setError('No university email is linked to this record.');return;}
    setEmail(item.email);setQuery(`${item.label} · ${item.email}`);setSuggestions([]);setSuggestOpen(false);setError('');
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validTarget) { setError('Select a matching account from the search results or enter its full verified Workspace email.'); return; }
    setBusy(true); setError('');
    try { const result = await liveRequest<RolePreview>(token, 'preview', { role, email: targetEmail }); onStart(role === 'admin' ? null : result); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  return <section className="card prime-preview-page" aria-labelledby="prime-preview-title"><div className="prime-preview-page-header"><div><span className="eyebrow">READ-ONLY PREVIEW</span><h2 id="prime-preview-title">Choose an experience</h2><p className="detail-subtitle">Inspect the experience without changing your authenticated identity.</p></div></div>
    <form className="prime-preview-form" onSubmit={event => void submit(event)}><label>Portal experience</label><select value={role} onChange={event => { setRole(event.target.value as RolePreview['role']); setEmail(''); setQuery('');setFacultySearch('');setSuggestions([]);setSuggestOpen(false); setError(''); }}><option value="admin">Admin (return to my workspace)</option><option value="supervisor">Supervisor / Faculty</option><option value="student">Student</option></select>
      {role==='supervisor'&&<><label htmlFor="prime-preview-faculty-search">Choose a verified faculty member</label><input id="prime-preview-faculty-search" type="search" placeholder="Type faculty initials (e.g., PB), name or email…" value={facultySearch} disabled={facultyBusy} onChange={event=>{setFacultySearch(event.target.value);setEmail('');setQuery('');setError('');}} onKeyDown={event=>{if(event.key==='Enter'&&filteredFaculty.length===1){event.preventDefault();chooseFaculty(filteredFaculty[0]);}}}/><select aria-label="Select a verified faculty member" value={filteredFaculty.some(item=>item.email===targetEmail)?targetEmail:''} disabled={facultyBusy} onChange={event=>{const found=facultyOptions.find(item=>item.email===event.target.value);if(found)chooseFaculty(found);}}><option value="">{facultyBusy?'Loading verified faculty…':`Select faculty from the directory (${filteredFaculty.length})`}</option>{filteredFaculty.map(item=><option value={item.email} key={item.email}>{item.initial?item.initial+' · ':''}{item.name}</option>)}</select><p className="prime-preview-hint">{facultyOptions.length?`${facultyOptions.length} verified faculty accounts, sorted alphabetically. Type initials or a name to narrow the list, then choose a result.`:facultyBusy?'Loading the official faculty directory…':'No verified faculty records found. Check Faculty List.'}</p><label htmlFor="prime-preview-faculty-email">Verified faculty Google Workspace email</label><input id="prime-preview-faculty-email" name="preview-faculty-email" type="email" autoComplete="off" placeholder="faculty@bracu.ac.bd" value={query} onChange={event=>{setQuery(event.target.value);setEmail('');setError('');}}/>{targetEmail.includes('@')&&!validFaculty&&!facultyBusy&&<p className="prime-preview-warning">This email is not in the verified Faculty Details directory.</p>}</>}
      {role==='student'&&<><label htmlFor="prime-preview-email">Find student by name, ID or Workspace email</label><div className="prime-search-autocomplete prime-preview-autocomplete"><input id="prime-preview-email" name="preview-target-account" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={suggestOpen&&suggestions.length>0} aria-controls="prime-preview-suggestions" aria-activedescendant={suggestOpen&&suggestions[activeIndex]?'prime-preview-suggestion-'+activeIndex:undefined} placeholder="Start typing a student name, ID or email…" value={query} onChange={event => {setQuery(event.target.value);setEmail('');setError('');setSuggestOpen(true);setActiveIndex(0);}} onFocus={()=>{if(query.trim().length>=2)setSuggestOpen(true);}} onBlur={()=>window.setTimeout(()=>setSuggestOpen(false),140)} onKeyDown={event=>{
        if(event.key==='Escape'){setSuggestOpen(false);return;}
        if((event.key==='ArrowDown'||event.key==='ArrowUp')&&suggestions.length){event.preventDefault();setSuggestOpen(true);setActiveIndex(index=>(index+(event.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length);}
        if(event.key==='Enter'&&suggestOpen&&suggestions[activeIndex]){event.preventDefault();choose(suggestions[activeIndex]);}
      }}/>{suggestOpen&&!email&&query.trim().length>=2&&<div id="prime-preview-suggestions" className="prime-suggest-menu" role="listbox" aria-label="Matching student accounts">{suggestBusy?<div className="prime-suggest-status"><LoaderCircle size={14} className="prime-spin"/> Searching university records…</div>:suggestions.length===0?<div className="prime-suggest-status">No matching students found.</div>:suggestions.map((item,index)=><button key={item.kind+item.id} type="button" id={'prime-preview-suggestion-'+index} className={'prime-suggest-item'+(index===activeIndex?' selected':'')} role="option" aria-selected={index===activeIndex} disabled={!item.email} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActiveIndex(index)} onClick={()=>choose(item)}><span className="prime-suggest-kind student">Student</span><span className="prime-suggest-text"><strong>{item.label}</strong><small>{item.email||'Workspace email unavailable'} · {item.detail}</small></span><ChevronRight size={15}/></button>)}</div>}</div><p className="prime-preview-hint">Select a matching student or enter their complete Workspace email.</p></>}
      <div className="prime-preview-safety"><Eye size={17} /><span>Read-only support preview. Every request uses your verified administrator account; the selected email is never accepted as a new login.</span></div>
      {error && <div className="live-error" role="alert">{error}</div>}
      <button className="primarybtn" type="submit" disabled={busy || (role==='supervisor'&&facultyBusy) || !validTarget}>{busy ? <><LoaderCircle size={16} className="prime-spin" /> Preparing view…</> : <>Open preview <ArrowRight size={16} /></>}</button>
    </form>
  </section>;
}
