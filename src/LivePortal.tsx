import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, CalendarDays, ChevronRight, ClipboardList, Clock3, Eye, GraduationCap, LayoutDashboard, LockKeyhole, LogOut, Megaphone, Menu, Search, ShieldCheck, TableProperties, Users, X } from 'lucide-react';
import { GOOGLE_CLIENT_ID, liveRequest, type Session } from './live-api';
import { PortalWelcome } from './PortalWelcome';
import { DeadlineBoard } from './DeadlineBoard';
import { deadlineEntries, resourceLinks } from './deadlines-data';
import { PrimeFacultyList, PrimeOverview, PrimePreviewDialog, PrimeSearch, type RolePreview } from './PrimeAdminExperience';
import { AdminAnnouncements } from './Announcements';
import type { Evaluation } from './data';
import type { StudentDashboard, SupervisorDashboard } from './portal-api';

type LivePage = 'dashboard' | 'evaluations' | 'students' | 'search' | 'deadlines' | 'sources' | 'admins' | 'faculty' | 'announcements' | 'profile';
type DirectoryRow = { student: {id:string;name:string;email:string;thesisId:string}; group: {id:string;title:string;type:string;stage:string;primarySupervisor:string;secondarySupervisor?:string} };
type Detail = DirectoryRow & {members:Array<{id:string;name:string;email:string}>;marks:Record<string,number|string|null>;evaluations:Evaluation[]};
type Completion = { students:number; groups:number };
type SummaryRow = {semester:string;students:number;groups:number;P1:Completion;P2:Completion;Defense:Completion};
type Source = {semester:string;spreadsheetId:string};
type Deadline = {id:string;phase:string;title:string;day:string;date:string;status:string;action:string;url:string};
type GoogleLoginResponse = {credential:string};
type GoogleAccount = {id:{initialize:(options:{client_id:string;callback:(response:GoogleLoginResponse)=>void;auto_select:boolean})=>void;renderButton:(element:HTMLElement,options:Record<string,unknown>)=>void;disableAutoSelect:()=>void}};
declare global { interface Window {google?: {accounts:GoogleAccount}} }

function LiveLogin({onToken}:{onToken:(token:string)=>Promise<void>}) {
  const buttonElement=useRef<HTMLDivElement>(null),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
  const configured=!!GOOGLE_CLIENT_ID;
  useEffect(()=>{
    if(!configured)return;
    let active=true;
    const prepare=()=>{if(active&&window.google?.accounts?.id)setLoaded(true);};
    const script=document.querySelector<HTMLScriptElement>('script[data-google-identity]');
    if(script){script.addEventListener('load',prepare);prepare();return ()=>{active=false;script.removeEventListener('load',prepare);};}
    const next=document.createElement('script');next.src='https://accounts.google.com/gsi/client';next.async=true;next.defer=true;next.dataset.googleIdentity='true';next.addEventListener('load',prepare);next.addEventListener('error',()=>{if(active)setError('Google sign-in could not load. Check your connection.');});document.head.appendChild(next);
    return ()=>{active=false;next.removeEventListener('load',prepare);};
  },[configured]);
  useEffect(()=>{if(!loaded||!buttonElement.current||!window.google?.accounts?.id)return;window.google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:(response)=>{setError('');onToken(response.credential).catch(e=>setError(e.message||'Sign-in failed'));},auto_select:false});window.google.accounts.id.renderButton(buttonElement.current,{theme:'outline',size:'large',shape:'rectangular',text:'signin_with',width:300});},[loaded,onToken]);
  return <PortalWelcome><div className="live-login-control">{configured?<div ref={buttonElement}/>:<div className="live-config-alert"><LockKeyhole size={18}/> Google Workspace authentication is not configured. The portal remains locked until the administrator completes deployment.</div>}</div>{error&&<div className="live-error" role="alert">{error}</div>}</PortalWelcome>;
}

function LiveStudent({data,page}:{data:StudentDashboard;page:LivePage}) {
  const [selected,setSelected]=useState<Evaluation|null>(null);
  const {student,group,evaluations}=data;
  return <>
    {page==='dashboard'&&<><section className="card thesishero"><div className="eyebrow">MY THESIS / PROJECT</div><h2>{group.title}</h2><span className="pill blue">{group.stage}</span><div className="detailgrid"><div className="info"><small>Thesis ID</small><strong>{group.id}</strong></div><div className="info"><small>Student ID</small><strong>{student.id}</strong></div><div className="info"><small>Supervisor</small><strong>{group.primarySupervisor}</strong></div><div className="info"><small>Category</small><strong>{group.type}</strong></div></div></section></>}
    <div className="sectionheading"><h3>Evaluation history</h3><span>Only released results are visible</span></div><div className="evaluationgrid">{evaluations.map(item=><button className="card evaluation" key={item.id} onClick={()=>setSelected(item)}><div className="evaluationtop"><span className="eyebrow">{item.semester}</span><span className={`pill ${item.publication==='published'?'green':'amber'}`}>{item.publication==='published'?'Published':'Pending'}</span></div><h4>{({P1:'Pre-Thesis 1',P2:'Pre-Thesis 2',Defense:'Final Defense',Supervisor:'Supervisor Evaluation'})[item.phase]}</h4><div className="mark">{item.publication==='published'&&item.comment?.trim()&&item.score!==null?`${item.score} / ${item.maxScore}`:'—'}</div><div className="evaluationbottom"><span>{item.publication==='published'&&item.comment?.trim()?'Comments available':'Not released'}</span><span className="textlink">View details <ChevronRight size={14}/></span></div></button>)}</div>
    {selected&&<div className="modaloverlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><section className="modalbox" role="dialog" aria-modal="true" aria-label="Faculty feedback"><div className="modalheader"><div><div className="eyebrow">{selected.semester}</div><h2>{selected.phase} feedback</h2></div><button className="iconbtn" onClick={()=>setSelected(null)} aria-label="Close"><X size={19}/></button></div>{selected.publication==='published'&&selected.comment?.trim()?<><p className="smallmuted">Score: {selected.score} / {selected.maxScore}</p><blockquote className="live-feedback">{selected.comment}</blockquote></>:<div className="mutedbox">Marks and comments have not both been approved for release.</div>}</section></div>}
  </>;
}

function LiveSupervisor({data}:{data:SupervisorDashboard}) {
  const [q,setQ]=useState('');const [selected,setSelected]=useState<string|null>(null);
  const groups=new Map(data.groups.map(group=>[group.id,group]));
  const rows=data.students.filter(student=>[student.id,student.name,student.thesisId,groups.get(student.thesisId)?.title||''].some(v=>v.toLowerCase().includes(q.toLowerCase())));
  const current=data.students.find(s=>s.id===selected);
  const PhaseChip=({done,label}:{done?:boolean;label:string})=><span className={`pill ${done?'green':'gray'}`}>{label}: {done?'Recorded':'Pending'}</span>;
  return <>
    <div className="statgrid"><div className="card stat"><span>Assigned students</span><strong>{data.students.length}</strong><small>Verified supervisor assignment</small></div><div className="card stat"><span>Groups</span><strong>{data.groups.length}</strong><small>Assigned research groups</small></div></div>
    <section className="card tablecard"><div className="filters"><label className="searchbox"><Search size={16}/><input placeholder="Search assigned students…" value={q} onChange={e=>setQ(e.target.value)}/></label></div><div className="tableoverflow"><table><thead><tr><th>Student</th><th>Group</th><th>Current stage</th><th>P1</th><th>P2</th><th>Defense</th><th></th></tr></thead><tbody>
      {rows.map(student=><tr key={student.id}><td><b>{student.name}</b><small>{student.id}</small></td><td><b>{student.thesisId}</b><small>{groups.get(student.thesisId)?.title||'—'}</small></td><td>{groups.get(student.thesisId)?.stage||'—'}</td><td><PhaseChip done={student.progress?.p1} label="P1"/></td><td><PhaseChip done={student.progress?.p2} label="P2"/></td><td><PhaseChip done={student.progress?.defense} label="DEF"/></td><td><button className="lightbtn" onClick={()=>setSelected(student.id)}>Details</button></td></tr>)}
      {!rows.length&&<tr><td colSpan={7} className="noresults">No assigned students match this search.</td></tr>}
    </tbody></table></div></section>
    {current&&<div className="modaloverlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><section className="modalbox" role="dialog" aria-modal="true" aria-label="Assigned student details"><div className="modalheader"><h2>{current.name}</h2><button className="iconbtn" onClick={()=>setSelected(null)} aria-label="Close"><X size={18}/></button></div><div className="detail-pairs"><div><small>ID</small><b>{current.id}</b></div><div><small>Thesis group</small><b>{current.thesisId}</b></div><div><small>Current stage</small><b>{groups.get(current.thesisId)?.stage}</b></div><div><small>Research title</small><b>{groups.get(current.thesisId)?.title}</b></div></div><div className="phase-row"><PhaseChip done={current.progress?.p1} label="P1"/><PhaseChip done={current.progress?.p2} label="P2"/><PhaseChip done={current.progress?.defense} label="Defense"/></div></section></div>}
  </>;
}

function LiveSearch({token}:{token:string}) {
  const [q,setQ]=useState(''),[stage,setStage]=useState('All stages'),[kind,setKind]=useState('All types'),[rows,setRows]=useState<DirectoryRow[]>([]),[selected,setSelected]=useState<Detail|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const run=async()=>{setBusy(true);setError('');try{const result=await liveRequest<{rows:DirectoryRow[]}>(token,'search',{q,stage,type:kind});setRows(result.rows);}catch(e){setError(String(e instanceof Error?e.message:e));}finally{setBusy(false);}};
  useEffect(()=>{run();/* initial first page */},[]);
  const detail=async(studentId:string)=>{setError('');try{setSelected(await liveRequest<Detail>(token,'detail',{studentId}));}catch(e){setError(String(e instanceof Error?e.message:e));}};
  return <><section className="card admin-query"><div className="admin-query-main"><label>Find academic records</label><div className="searchbox"><Search size={18}/><input placeholder="Student ID, thesis/project/internship ID, supervisor initials, name…" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')run();}}/></div></div><div className="query-filters"><select value={stage} onChange={e=>setStage(e.target.value)}>{['All stages','Pre-Thesis 1','Pre-Thesis 2','Final Thesis','Completed','Deferred'].map(x=><option key={x}>{x}</option>)}</select><select value={kind} onChange={e=>setKind(e.target.value)}>{['All types','Thesis','Project','Internship'].map(x=><option key={x}>{x}</option>)}</select><button className="primarybtn" onClick={run} disabled={busy}>{busy?'Searching…':'Search'}</button></div></section>{error&&<div className="live-error" role="alert">{error}</div>}<div className="sectionheading"><h3>Results</h3><span>Up to 100 matched students per search</span></div><section className="card admin-results"><div className="tableoverflow"><table><thead><tr><th>Student</th><th>Group</th><th>Supervisor</th><th>Stage</th><th></th></tr></thead><tbody>{rows.map(({student,group})=><tr key={student.id}><td><b>{student.name}</b><small>{student.id}</small></td><td><b>{group.id}</b><small>{group.type}</small></td><td>{group.primarySupervisor}</td><td>{group.stage}</td><td><button className="lightbtn" onClick={()=>detail(student.id)}>Details</button></td></tr>)}{rows.length===0&&<tr><td colSpan={5} className="noresults">No records found.</td></tr>}</tbody></table></div></section>{selected&&<div className="modaloverlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><section className="modalbox admin-detail" role="dialog" aria-modal="true" aria-label="Detailed student record"><div className="modalheader"><div><div className="eyebrow">STUDENT RECORD</div><h2>{selected.student.name}</h2></div><button className="iconbtn" aria-label="Close" onClick={()=>setSelected(null)}><X size={18}/></button></div><div className="detail-pairs"><div><small>Student ID</small><b>{selected.student.id}</b></div><div><small>Thesis / project ID</small><b>{selected.group.id}</b></div><div><small>Email</small><b>{selected.student.email}</b></div><div><small>Stage</small><b>{selected.group.stage}</b></div><div><small>Supervisor</small><b>{selected.group.primarySupervisor}</b></div><div><small>Title</small><b>{selected.group.title}</b></div></div><div className="detail-section"><h3>Group members</h3><div className="memberlist">{selected.members.map(member=><div key={member.id}><Users size={15}/><span>{member.name}</span><small>{member.id}</small></div>)}</div></div><div className="detail-section"><h3>Recorded marks</h3><div className="mark-summary">{(['p1','p2','defense','supervisor'] as const).map(field=><div key={field}><span>{field.toUpperCase()}</span><strong>{selected.marks?.[field]??'Pending'}</strong></div>)}</div></div></section></div>}</>;
}

function LiveSummary({token}:{token:string}) {
  const [rows,setRows]=useState<SummaryRow[]>([]),[error,setError]=useState('');
  useEffect(()=>{liveRequest<{semesters:SummaryRow[]}>(token,'summary').then(data=>setRows(data.semesters)).catch(e=>setError(e.message));},[token]);
  return <><div className="infobar"><CircleHelpIcon/> Counts reflect synchronized, released evaluations with marks and required comments. A zero may mean a semester has not been synchronized or published.</div>{error&&<div className="live-error">{error}</div>}<section className="card admin-results"><div className="tableoverflow"><table><thead><tr><th>Semester</th><th>Students</th><th>Groups</th><th>P1 (students / groups)</th><th>P2 (students / groups)</th><th>Defense (students / groups)</th></tr></thead><tbody>{rows.map(r=><tr key={r.semester}><td><b>{r.semester}</b></td><td>{r.students}</td><td>{r.groups}</td><td>{r.P1.students} / {r.P1.groups}</td><td>{r.P2.students} / {r.P2.groups}</td><td>{r.Defense.students} / {r.Defense.groups}</td></tr>)}{!rows.length&&<tr><td colSpan={6} className="noresults">No synchronized semester statistics yet.</td></tr>}</tbody></table></div></section></>;
}
function CircleHelpIcon(){return <ShieldCheck size={16}/>;}

function LiveDeadlines({token}:{token:string}) {
  const [rows,setRows]=useState<Deadline[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;setLoading(true);liveRequest<{entries:Deadline[]}>(token,'deadlines').then(x=>{if(active)setRows(x.entries);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[token]);
  const reference=!loading&&!rows.length;
  return <><div className="deadline-source-note"><Clock3 size={16}/><span>Deadlines and links are taken from the university's source workbook. Verify dates and availability before submitting.</span></div>
    {error&&<div className="live-error" role="alert">The live deadline source could not be loaded: {error}</div>}
    {reference&&<div className="prime-deadline-status"><BookOpen size={17}/><span>Showing a clearly labeled reference snapshot from 5 November 2026 because the live feed has no available entries. Dates may be outdated.</span></div>}
    {loading?<section className="card loading">Loading deadlines and academic resources…</section>:<DeadlineBoard entries={reference?deadlineEntries:rows.map(r=>({...r,date:[r.day,r.date].filter(Boolean).join(' · ')}))}/>}
    <section className="prime-resources"><div className="sectionheading"><h3>Academic resources</h3><span>Reference documents and useful forms</span></div><div className="prime-resource-grid">{resourceLinks.map(item=><a href={item.url} target="_blank" rel="noopener noreferrer" key={item.title}><BookOpen size={18}/><span><b>{item.title}</b><small>{item.detail}</small></span><ArrowUpRight size={15}/></a>)}</div></section>
  </>;
}

function LiveSources({token,readOnly=false}:{token:string;readOnly?:boolean}) {
  const [sources,setSources]=useState<Source[]>([]),[releases,setReleases]=useState<Record<string,boolean>>({}),[semester,setSemester]=useState(''),[spreadsheetId,setSpreadsheetId]=useState(''),[phase,setPhase]=useState('P1'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const refresh=()=>liveRequest<{sources:Source[];releases:Record<string,boolean>}>(token,'registry').then(x=>{setSources(x.sources);setReleases(x.releases);if(!semester&&x.sources[0])setSemester(x.sources[0].semester);}).catch(e=>setMessage(e.message));
  useEffect(()=>{refresh();},[token]);
  const act=async(action:string,payload:Record<string,unknown>)=>{setBusy(true);setMessage('');try{const value=await liveRequest<Record<string,unknown>>(token,action,payload);setMessage(action==='sync'?`Sync: ${JSON.stringify(value)}`:'Saved successfully.');refresh();}catch(e){setMessage(String(e instanceof Error?e.message:e));}finally{setBusy(false);}};
  return <><section className="card admincard"><h3>Registered semester managers</h3><div className="source-live-list">{sources.map(s=><div key={s.semester}><b>{s.semester}</b><small>Spreadsheet ending …{s.spreadsheetId.slice(-6)}</small></div>)}</div>{!readOnly&&<form className="addform" onSubmit={e=>{e.preventDefault();act('registerSemester',{semester:semester.trim(),spreadsheetId:spreadsheetId.trim()});}}><label>Register or update a semester source</label><div className="formrow"><input placeholder="Fall 2026" value={semester} onChange={e=>setSemester(e.target.value)} required/><input placeholder="Google spreadsheet ID" value={spreadsheetId} onChange={e=>setSpreadsheetId(e.target.value)} required/><button disabled={busy} className="primarybtn">Save source</button></div></form>}</section><section className="card admincard" style={{marginTop:16}}><h3>Feedback synchronization and publication</h3><p className="smallmuted">{readOnly?'Read-only preview of publication status. Editing is disabled.':'Choose a registered semester and phase. Sync evaluator sheets in batches. Publishing still hides any individual result without the required faculty comment.'}</p><div className="formrow"><select value={semester} onChange={e=>setSemester(e.target.value)}>{sources.map(s=><option key={s.semester}>{s.semester}</option>)}</select><select value={phase} onChange={e=>setPhase(e.target.value)}><option>P1</option><option>P2</option><option value="Defense">Defense</option></select>{!readOnly&&<><button className="lightbtn" disabled={busy||!sources.some(s=>s.semester===semester)} onClick={()=>act('sync',{semester,phase})}>Sync / continue</button><button className="primarybtn" disabled={busy||!sources.some(s=>s.semester===semester)} onClick={()=>act('release',{semester,phase,published:!releases[semester+'|'+phase]})}>{releases[semester+'|'+phase]?'Unpublish':'Publish'} {phase}</button></>}</div><p className="smallmuted">Currently {releases[semester+'|'+phase]?'published':'unpublished'} for {semester} / {phase}.</p></section>{message&&<div className="infobar" role="status">{message}</div>}</>;
}

function LiveAdmins({token}:{token:string}) {
  const [admins,setAdmins]=useState<string[]>([]),[email,setEmail]=useState(''),[message,setMessage]=useState('');
  const load=()=>liveRequest<{admins:string[]}>(token,'admins').then(x=>setAdmins(x.admins)).catch(e=>setMessage(e.message));
  useEffect(()=>{load();},[token]);
  const act=async(action:string,payload:Record<string,unknown>)=>{try{const result=await liveRequest<{admins?:string[]}>(token,action,payload);if(result.admins)setAdmins(result.admins);setMessage('Change saved.');}catch(e){setMessage(String(e instanceof Error?e.message:e));}};
  return <><section className="card admincard"><h3>Administrator access</h3><p className="smallmuted">Only the Prime Administrator can grant or revoke regular administrative access. Faculty records are managed automatically in Faculty List.</p><div className="adminrow"><div><b>partha.bhoumik@bracu.ac.bd</b><small>Protected Prime Administrator</small></div><span className="pill green">Prime</span></div>{admins.map(name=><div className="adminrow" key={name}><b>{name}</b><button className="lightbtn" onClick={()=>act('removeAdmin',{email:name})}>Revoke</button></div>)}<form className="addform" onSubmit={e=>{e.preventDefault();act('addAdmin',{email});setEmail('');}}><label>Add regular administrator</label><div className="formrow"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="faculty@bracu.ac.bd" required/><button className="primarybtn">Grant access</button></div></form></section>{message&&<div className="infobar" role="status">{message}</div>}</>;
}

export default function LivePortal() {
  const [token,setToken]=useState('');
  const [session,setSession]=useState<Session|null>(null);
  const [page,setPage]=useState<LivePage>('dashboard');
  const [drawer,setDrawer]=useState(false);
  const [data,setData]=useState<StudentDashboard|SupervisorDashboard|null>(null);
  const [preview,setPreview]=useState<RolePreview|null>(null);
  const [previewDialog,setPreviewDialog]=useState(false);
  const [error,setError]=useState('');
  const login=async(idToken:string)=>{
    const verified=await liveRequest<Session>(idToken,'session');
    setToken(idToken);setSession(verified);setPreview(null);setPage('dashboard');setError('');
  };
  const logout=()=>{
    window.google?.accounts?.id.disableAutoSelect();setToken('');setSession(null);
    setData(null);setPreview(null);setPreviewDialog(false);setPage('dashboard');
  };
  const role=preview?.role||session?.role;
  const actualPrime=session?.role==='prime_admin';
  const showPrimeControls=actualPrime&&!preview;
  const nav=useMemo(()=>role==='student'?
    [['dashboard','Dashboard',LayoutDashboard],['evaluations','My Evaluations',ClipboardList],['deadlines','Deadlines & Links',CalendarDays],['profile','Profile',Users]]:
    role==='supervisor'?
      [['dashboard','My Students',Users],['deadlines','Deadlines & Links',CalendarDays],['profile','Profile',Users]]:
      [['dashboard','Overview',LayoutDashboard],['search','Student Search',Search],['sources','Semester Sources',TableProperties],['deadlines','Deadlines & Links',CalendarDays],['announcements','News & Events',Megaphone],
        ...(showPrimeControls?[['faculty','Faculty List',Users],['admins','Administrators',ShieldCheck]]:[]),['profile','Profile',Users]],
    [role,showPrimeControls]);
  useEffect(()=>{
    if(!session||!token)return;
    const action=session.role==='student'?'student':session.role==='supervisor'?'supervisor':null;
    if(!action)return;
    let active=true;
    liveRequest<StudentDashboard|SupervisorDashboard>(token,action).then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[session,token]);
  if(!session)return <LiveLogin onToken={login}/>;
  const displayData=preview?preview.data:data;
  const heading=({dashboard:role==='student'?'My thesis overview':role==='supervisor'?'My students':'Academic overview',evaluations:'My evaluations',students:'My students',search:'Search academic records',deadlines:'Deadlines & links',sources:'Semester sources',admins:'Administrator management',faculty:'Faculty list',announcements:'News & events',profile:'My profile'})[page];
  const exitPreview=()=>{setPreview(null);setPage('dashboard');setError('');};
  return <div className="application">
    <aside className={`sidebar ${drawer?'open':''}`}>
      <div className="brand"><span className="brand-symbol">B</span><div><strong>BRAC University</strong><small>Thesis Evaluation Portal</small></div></div>
      <div><div className="navlabel">WORKSPACE</div><nav className="nav">{nav.map(([key,label,Icon])=><button key={key as string} className={page===key?'selected':''} onClick={()=>{setPage(key as LivePage);setDrawer(false);}}><Icon size={17}/>{label as string}</button>)}</nav></div>
      <div className="sidebarfoot"><LockKeyhole size={15}/><span>Authenticated university portal<br/><small>{preview?'Prime Admin support preview':'Role-restricted access'}</small></span></div>
    </aside>
    {drawer&&<button className="scrim" aria-label="Close menu" onClick={()=>setDrawer(false)}/>}
    <div className="main">
      <header className="topbar"><button className="menuicon" aria-label="Open menu" onClick={()=>setDrawer(true)}><Menu size={22}/></button><span className="breadcrumbs">Academic Portal <ChevronRight size={13}/>{heading}</span><div className="topright"><span className="live-role">{role?.replace('_',' ')}</span><span className="avatar">{session.email.substring(0,2).toUpperCase()}</span></div></header>
      <main className="content">
        {preview&&<div className="prime-preview-banner" role="status"><div><Eye size={18}/><span><strong>Read-only role preview · {role?.replace('_',' ')}</strong><small>{preview.email} · You remain signed in as {session.email}</small></span></div><button onClick={exitPreview}>Exit preview</button></div>}
        <div className="pageheading"><div><span className="eyebrow">{role?.replace('_',' ').toUpperCase()}{preview?' · PREVIEW':''}</span><h1>{heading}</h1><p>{preview?`Viewing ${preview.email} · Read-only`:session.email}</p></div><div className="prime-heading-actions">{showPrimeControls&&<button className="prime-view-btn" onClick={()=>setPreviewDialog(true)}><Eye size={15}/> View as another role</button>}{preview&&<button className="prime-view-btn" onClick={()=>setPreviewDialog(true)}><Eye size={15}/> Change preview</button>}<button className="lightbtn live-logout" onClick={logout}><LogOut size={15}/> Sign out</button></div></div>
        {error&&<div className="live-error" role="alert">{error} <button className="lightbtn" onClick={logout}>Sign in again</button></div>}
        {page==='profile'?<section className="card profilecard"><div className="eyebrow">{preview?'ADMINISTRATIVE PREVIEW':'VERIFIED GOOGLE WORKSPACE ACCOUNT'}</div><h2>{preview?preview.email:session.name}</h2><p>{preview?'Read-only view; not a separate Google login':session.email}</p><p>Role: {role}</p></section>:
          page==='deadlines'?<LiveDeadlines token={token}/>:
          role==='student'?displayData?<LiveStudent data={displayData as StudentDashboard} page={page}/>:<section className="card loading">Loading student details…</section>:
          role==='supervisor'?displayData?<LiveSupervisor data={displayData as SupervisorDashboard}/>:<section className="card loading">Loading assigned groups…</section>:
          page==='dashboard'?(showPrimeControls?<PrimeOverview token={token} onNavigate={setPage}/>:<LiveSummary token={token}/>):
          page==='search'?(showPrimeControls?<PrimeSearch token={token}/>:<LiveSearch token={token}/>):
          page==='sources'?<LiveSources token={token} readOnly={!!preview}/>:
          page==='announcements'?<AdminAnnouncements token={token} readOnly={!!preview}/>:
          page==='faculty'&&showPrimeControls?<PrimeFacultyList token={token}/>:
          page==='admins'&&showPrimeControls?<LiveAdmins token={token}/>:null}
        <footer className="footer"><GraduationCap size={16}/> BRAC University Thesis Evaluation Portal<span>Authorized access only</span></footer>
      </main>
    </div>
    {previewDialog&&actualPrime&&<PrimePreviewDialog token={token} onClose={()=>setPreviewDialog(false)} onStart={result=>{setPreview(result);setPage('dashboard');setError('');}}/>}
  </div>;
}
