import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, BriefcaseBusiness, CalendarDays, Check, ChevronDown, ChevronRight, ClipboardList, Eye, GraduationCap, LayoutDashboard, LockKeyhole, LogOut, Mail, MapPin, Megaphone, Menu, Search, ShieldCheck, TableProperties, Users, X } from 'lucide-react';
import { GOOGLE_CLIENT_ID, liveRequest, cachedLiveRequest, clearLiveCache, invalidateLiveCache, subscribePortalActivity, type Session } from './live-api';
import PortalLoading from './PortalLoading';
import { PortalWelcome } from './PortalWelcome';
import { DeadlineBoard } from './DeadlineBoard';
import { PrimeFacultyList, PrimeOverview, PrimePreviewDialog, PrimeSearch, type RolePreview } from './PrimeAdminExperience';
import { AdminAnnouncements } from './Announcements';
import StudentExperience from './StudentExperience';
import SupervisorExperience from './SupervisorExperience';
import type { Evaluation } from './data';
import type { StudentDashboard, SupervisorDashboard } from './portal-api';

type LivePage = 'dashboard' | 'evaluations' | 'students' | 'search' | 'deadlines' | 'resources' | 'sources' | 'admins' | 'faculty' | 'announcements';
type DirectoryRow = { student: {id:string;name:string;email:string;thesisId:string}; group: {id:string;title:string;type:string;stage:string;primarySupervisor:string;secondarySupervisor?:string} };
type Detail = DirectoryRow & {members:Array<{id:string;name:string;email:string}>;marks:Record<string,number|string|null>;evaluations:Evaluation[]};
type Completion = { students:number; groups:number };
type SummaryRow = {semester:string;students:number;groups:number;P1:Completion;P2:Completion;Defense:Completion};
type Source = {semester:string;spreadsheetId:string};
type Deadline = {id:string;phase:string;title:string;day:string;date:string;daysLeft?:string;status:string;action:string;url:string;links?:Array<{label:string;url:string}>};
type Resource = {id:string;phase:string;audience:string;title:string;detail:string;url:string};
const SAVED_PAGE_PREFIX='bracu-thesis-portal-page:';
function allowedPageForSession(session:Session,page:string):page is LivePage {
  if(session.role==='student')return ['dashboard','evaluations','deadlines','resources'].includes(page);
  if(session.role==='supervisor')return ['dashboard','deadlines','resources'].includes(page);
  return ['dashboard','search','sources','deadlines','resources','announcements','faculty','admins'].includes(page);
}
function restoredPage(session:Session):LivePage {
  try{const stored=window.sessionStorage.getItem(SAVED_PAGE_PREFIX+session.email)||'';return allowedPageForSession(session,stored)?stored:'dashboard';}
  catch{return 'dashboard';}
}
function rememberPage(session:Session,page:LivePage){try{window.sessionStorage.setItem(SAVED_PAGE_PREFIX+session.email,page);}catch{/* The portal also works when sessionStorage is unavailable. */}}
type GoogleLoginResponse = {credential:string};
type GoogleAccount = {id:{initialize:(options:{client_id:string;callback:(response:GoogleLoginResponse)=>void;auto_select:boolean})=>void;renderButton:(element:HTMLElement,options:Record<string,unknown>)=>void;disableAutoSelect:()=>void}};
declare global { interface Window {google?: {accounts:GoogleAccount}} }

function LiveLogin({onToken}:{onToken:(token:string)=>Promise<void>}) {
  const buttonElement=useRef<HTMLDivElement>(null),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
  const [signingIn,setSigningIn]=useState(false),loginPending=useRef(false);
  const configured=!!GOOGLE_CLIENT_ID;
  useEffect(()=>{
    if(!configured)return;
    let active=true;
    const timeout=window.setTimeout(()=>{if(active&&!window.google?.accounts?.id)setError('Google sign-in is taking longer than expected. Check your connection and reload the page to try again.');},20000);
    const prepare=()=>{if(active&&window.google?.accounts?.id){setLoaded(true);setError('');window.clearTimeout(timeout);}};
    const script=document.querySelector<HTMLScriptElement>('script[data-google-identity]');
    if(script){script.addEventListener('load',prepare);prepare();return ()=>{active=false;window.clearTimeout(timeout);script.removeEventListener('load',prepare);};}
    const next=document.createElement('script');next.src='https://accounts.google.com/gsi/client';next.async=true;next.defer=true;next.dataset.googleIdentity='true';next.addEventListener('load',prepare);next.addEventListener('error',()=>{if(active)setError('Google sign-in could not load. Check your connection.');});document.head.appendChild(next);
    return ()=>{active=false;window.clearTimeout(timeout);next.removeEventListener('load',prepare);};
  },[configured]);
  useEffect(()=>{if(!loaded||!buttonElement.current||!window.google?.accounts?.id)return;window.google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:(response)=>{
    if(loginPending.current)return;
    loginPending.current=true;setSigningIn(true);setError('');
    onToken(response.credential).catch(e=>setError(e.message||'Sign-in failed')).finally(()=>{loginPending.current=false;setSigningIn(false);});
  },auto_select:false});window.google.accounts.id.renderButton(buttonElement.current,{theme:'outline',size:'large',shape:'rectangular',text:'signin_with',width:300});},[loaded,onToken]);
  return <PortalWelcome><div className="live-login-control" aria-busy={signingIn}>{configured?<div ref={buttonElement} style={{pointerEvents:signingIn?'none':undefined,opacity:signingIn?.55:1}}/>:<div className="live-config-alert"><LockKeyhole size={18}/> Google Workspace authentication is not configured. The portal remains locked until the administrator completes deployment.</div>}</div>{configured&&!loaded&&!error&&<PortalLoading compact label="Preparing Google sign-in" detail="Connecting to your university authentication provider…"/>}{signingIn&&<PortalLoading compact label="Verifying your BRAC University account" detail="Checking your role and creating a secure session…"/>}{error&&<div className="live-error" role="alert">{error}</div>}</PortalWelcome>;
}

const roleLabel = (value:string) => ({prime_admin:'Prime Admin',supervisor:'Supervisor / Faculty',student:'Student'} as Record<string,string>)[value]||value;
function AccountMenu({session,role,onSwitch,onSignOut,loggingOut}:{session:Session;role:string;onSwitch:(role:Session['role'])=>void;onSignOut:()=>void;loggingOut:boolean}){
  const [open,setOpen]=useState(false),container=useRef<HTMLDivElement>(null);
  const roles=(session.roles?.length?session.roles:[session.role]).filter(r=>r!=='admin');
  useEffect(()=>{
    if(!open)return;
    const close=(event:PointerEvent)=>{if(!container.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};
  },[open]);
  return <div className="portal-account" ref={container}>
    <button className="portal-account-name" aria-label="Account details and roles" aria-expanded={open} aria-haspopup="menu" onClick={()=>setOpen(value=>!value)}>{session.name?.trim()||session.email}<ChevronDown size={14}/></button>
    {open&&<div className="portal-account-dropdown" role="menu" aria-label="Account details">
      <div className="account-dropdown-head"><span className="eyebrow">VERIFIED ACCOUNT</span><strong>{session.name?.trim()||session.email}</strong><small><Mail size={13}/>{session.email}</small>
        {session.designation&&<small><BriefcaseBusiness size={13}/>{session.designation}</small>}
        {session.room&&<small><MapPin size={13}/>Room {session.room}</small>}
      </div>
      {roles.length>1&&<div className="account-roles"><span className="eyebrow">SWITCH MY ROLE</span>{roles.map(next=><button key={next} className={role===next?'account-role-active':''} role="menuitem" onClick={()=>{onSwitch(next);setOpen(false);}}>{roleLabel(next)}{role===next&&<Check size={16}/>}</button>)}</div>}
      <button className="account-signout" role="menuitem" disabled={loggingOut} onClick={()=>{setOpen(false);onSignOut();}}><LogOut size={16}/>{loggingOut?'Signing out…':'Sign out'}</button>
    </div>}
  </div>;
}

function LiveSearch({token}:{token:string}) {
  const [offset,setOffset]=useState(0),[total,setTotal]=useState(0);
  const [q,setQ]=useState(''),[stage,setStage]=useState('All stages'),[kind,setKind]=useState('All types');
  const [rows,setRows]=useState<DirectoryRow[]>([]),[selected,setSelected]=useState<Detail|null>(null);
  const [busy,setBusy]=useState(true),[detailBusy,setDetailBusy]=useState(false),[error,setError]=useState('');
  const requestId=useRef(0);
  const run=async(nextOffset=0)=>{
    const request=++requestId.current;setBusy(true);setError('');
    try{
      const result=await liveRequest<{rows:DirectoryRow[];total:number;offset:number}>(token,'search',{q,stage,type:kind,offset:nextOffset});
      if(request===requestId.current){setRows(result.rows);setTotal(result.total);setOffset(result.offset);}
    }catch(e){if(request===requestId.current){setError(String(e instanceof Error?e.message:e));setRows([]);}}
    finally{if(request===requestId.current)setBusy(false);}
  };
  useEffect(()=>{void run();return()=>{requestId.current++;};},[token]);
  const detail=async(studentId:string)=>{
    setError('');setSelected(null);setDetailBusy(true);
    try{setSelected(await liveRequest<Detail>(token,'detail',{studentId}));}
    catch(e){setError(String(e instanceof Error?e.message:e));}
    finally{setDetailBusy(false);}
  };
  return <>
    <section className="card admin-query"><div className="admin-query-main"><label>Find academic records</label><div className="searchbox"><Search size={18}/><input aria-label="Search academic records" placeholder="Student ID, thesis ID, supervisor initials, name…" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void run();}}/></div></div>
      <div className="query-filters"><select aria-label="Current stage" value={stage} onChange={e=>setStage(e.target.value)}>{['All stages','Pre-Thesis 1','Pre-Thesis 2','Final Thesis','Completed','Deferred'].map(x=><option key={x}>{x}</option>)}</select><select aria-label="Research category" value={kind} onChange={e=>setKind(e.target.value)}>{['All types','Thesis','Project','Internship'].map(x=><option key={x}>{x}</option>)}</select><button className="primarybtn" onClick={()=>void run()} disabled={busy}>{busy?'Searching…':'Search'}</button></div>
    </section>
    {error&&<div className="live-error" role="alert">{error}</div>}
    <div className="sectionheading"><h3>Results</h3><span>{total} matching students · 100 per page</span></div>
    {busy?<PortalLoading label="Searching academic records" detail="Checking registered students and thesis groups…"/>:
      <section className="card admin-results"><div className="tableoverflow"><table><thead><tr><th>Student</th><th>Group</th><th>Supervisor</th><th>Stage</th><th></th></tr></thead><tbody>{rows.map(({student,group})=><tr key={student.id}><td><b>{student.name}</b><small>{student.id}</small></td><td><b>{group.id}</b><small>{group.type}</small></td><td>{group.primarySupervisor}</td><td>{group.stage}</td><td><button className="lightbtn" onClick={()=>void detail(student.id)} disabled={detailBusy}>Details</button></td></tr>)}{!rows.length&&<tr><td colSpan={5} className="noresults">No records found.</td></tr>}</tbody></table></div></section>}
    {total>100&&<div className="formrow" role="navigation" aria-label="Search pages"><button className="lightbtn" disabled={busy||offset===0} onClick={()=>void run(Math.max(0,offset-100))}>Previous</button><span>Page {Math.floor(offset/100)+1} of {Math.ceil(total/100)}</span><button className="lightbtn" disabled={busy||offset+100>=total} onClick={()=>void run(offset+100)}>Next</button></div>}
    {detailBusy&&<div className="modaloverlay" role="presentation"><section className="modalbox" role="status"><PortalLoading label="Opening student details" detail="Retrieving the verified group record…"/></section></div>}
    {selected&&!detailBusy&&<div className="modaloverlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><section className="modalbox admin-detail" role="dialog" aria-modal="true" aria-label="Detailed student record"><div className="modalheader"><div><div className="eyebrow">STUDENT RECORD</div><h2>{selected.student.name}</h2></div><button className="iconbtn" aria-label="Close" onClick={()=>setSelected(null)}><X size={18}/></button></div><div className="detail-pairs"><div><small>Student ID</small><b>{selected.student.id}</b></div><div><small>Thesis / project ID</small><b>{selected.group.id}</b></div><div><small>Email</small><b>{selected.student.email}</b></div><div><small>Stage</small><b>{selected.group.stage}</b></div><div><small>Supervisor</small><b>{selected.group.primarySupervisor}</b></div><div><small>Title</small><b>{selected.group.title}</b></div></div><div className="detail-section"><h3>Group members</h3><div className="memberlist">{selected.members.map(member=><div key={member.id}><Users size={15}/><span>{member.name}</span><small>{member.id}</small></div>)}</div></div><div className="detail-section"><h3>Recorded marks</h3><div className="mark-summary">{(['p1','p2','defense','supervisor'] as const).map(field=><div key={field}><span>{field.toUpperCase()}</span><strong>{selected.marks?.[field]??'Pending'}</strong></div>)}</div></div><div className="detail-section"><h3>Panel comments from Thesis Master</h3>{selected.evaluations.filter(item=>['P1','P2','Defense'].includes(item.phase)).map(item=><div key={item.id} className="admin-phase-comment"><strong>{item.phase==='Defense'?'Defense':item.phase}</strong>{item.semester!=='Semester not recorded'&&<small>{item.semester}</small>}<p>{item.comment?.trim()||'No comments recorded for this phase.'}</p></div>)}</div></section></div>}
  </>;
}

function LiveSummary({token}:{token:string}) {
  const [rows,setRows]=useState<SummaryRow[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;setLoading(true);cachedLiveRequest<{semesters:SummaryRow[]}>(token,'summary',{},60000).then(data=>{if(active)setRows(data.semesters);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[token]);
  return <><div className="infobar"><CircleHelpIcon/> Semester counts reflect indexed evaluator records linked to verified students with available marks or comments. Master-only marks have no semester attribution.</div>{error&&<div className="live-error">{error}</div>}{loading?<PortalLoading label="Loading semester results" detail="Checking synchronized evaluation summaries…"/>:<section className="card admin-results"><div className="tableoverflow"><table><thead><tr><th>Semester</th><th>Students</th><th>Groups</th><th>P1 (students / groups)</th><th>P2 (students / groups)</th><th>Defense (students / groups)</th></tr></thead><tbody>{rows.map(r=><tr key={r.semester}><td><b>{r.semester}</b></td><td>{r.students}</td><td>{r.groups}</td><td>{r.P1.students} / {r.P1.groups}</td><td>{r.P2.students} / {r.P2.groups}</td><td>{r.Defense.students} / {r.Defense.groups}</td></tr>)}{!rows.length&&<tr><td colSpan={6} className="noresults">No synchronized semester statistics yet.</td></tr>}</tbody></table></div></section>}</>;
}
function CircleHelpIcon(){return <ShieldCheck size={16}/>;}

function deadlineStage(stage:string){
  const value=stage.toLowerCase().replace(/[\s_-]/g,'');
  if(/^(prethesis1|p1|pre1)$/.test(value))return 'P1';
  if(/^(prethesis2|p2|pre2)$/.test(value))return 'P2';
  if(/(final|defense|defence|ft)/.test(value))return 'Defense';
  return '';
}
function LiveDeadlines({token,studentStage}:{token:string;studentStage?:string}) {
  const [rows,setRows]=useState<Deadline[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [refreshId,setRefreshId]=useState(0);
  useEffect(()=>{let active=true;setLoading(true);cachedLiveRequest<{entries:Deadline[]}>(token,'deadlines',{},90000).then(x=>{if(active){setRows(x.entries);setError('');}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[token,refreshId]);
  const phase=studentStage!==undefined?deadlineStage(studentStage):'';
  const entries=rows.filter(item=>['General','P1','P2','Defense'].includes(item.phase)&&
    (studentStage===undefined||item.phase==='General'||item.phase===phase));
  return <><div className="deadline-view-heading"><div><span className="eyebrow">ACADEMIC CALENDAR</span><h2>Submission deadlines</h2></div><button type="button" className="lightbtn" disabled={loading} onClick={()=>{invalidateLiveCache('deadlines');setRefreshId(n=>n+1);}}>Refresh</button></div>
    {error&&<div className="live-error" role="alert">The live deadline source could not be loaded: {error}</div>}
    {loading?<PortalLoading label="Loading submission deadlines" detail="Reading the current university submission schedule…"/>:!error?<DeadlineBoard entries={entries} studentStage={studentStage!==undefined?phase:undefined}/>:null}
  </>;
}

function LiveResources({token}:{token:string}) {
  const [items,setItems]=useState<Resource[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;setLoading(true);cachedLiveRequest<{items:Resource[]}>(token,'resources',{},60000).then(result=>{if(active){setItems(result.items);setError('');}}).catch(e=>{if(active)setError(e.message||String(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[token,revision]);
  const safe=(raw:string)=>{try{const url=new URL(raw);return url.protocol==='https:'?url.href:'';}catch{return '';}};
  return <div className="resources-hub"><div className="resources-hub-banner"><div><span className="eyebrow">RESOURCE LIBRARY</span><h2>Departmental resources</h2><p>Current guides, forms, templates and seminar material from the university source.</p></div><span className="resources-hub-count"><BookOpen size={19}/> {items.length} resources</span></div>
    <div className="resources-hub-toolbar"><span>Links are read from the university's current resource list.</span><button className="lightbtn" onClick={()=>{invalidateLiveCache('resources');setRevision(x=>x+1);}} disabled={loading}>Refresh</button></div>
    {error&&<div className="live-error" role="alert">Unable to read live resources: {error}</div>}
    {loading?<PortalLoading label="Loading departmental resources" detail="Retrieving updated documents and links…"/>:<div className="resources-hub-grid">{items.map((item,index)=>{
      const Icon=[GraduationCap,ShieldCheck,ClipboardList,BookOpen][index]||BookOpen;
      const url=safe(item.url);
      const content=<><span className="resources-hub-icon"><Icon size={22}/></span><span className="resources-hub-card-body"><small>{item.phase==='P1'?'PRE-THESIS 1':item.phase==='P2'?'PRE-THESIS 2':item.phase==='Defense'?'FINAL DEFENSE':'FOR ALL STAGES'}</small><strong>{item.title}</strong><span>{item.detail}</span>{!url&&<span className="resource-unavailable">No accessible link is recorded in the source.</span>}</span><span className="resources-hub-arrow"><ArrowUpRight size={17}/></span></>;
      return url?<a className="resources-hub-card" href={url} target="_blank" rel="noopener noreferrer" key={item.id}>{content}</a>:<div className="resources-hub-card resource-without-link" key={item.id}>{content}</div>;
    })}{!items.length&&!error&&<p>No resources are currently listed in the university source.</p>}</div>}
  </div>;
}

function LiveSources({token,readOnly=false}:{token:string;readOnly?:boolean}) {
  const [sources,setSources]=useState<Source[]>([]),[semester,setSemester]=useState(''),[phase,setPhase]=useState('P1'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [registryBusy,setRegistryBusy]=useState(true);
  const [progress,setProgress]=useState<{semester:string;phase:string;processed:number;total:number;complete:boolean;errors:string[]} | null>(null);
  const cancelRef=useRef(false),runningRef=useRef(false);
  const refresh=()=>{setRegistryBusy(true);return liveRequest<{sources:Source[]}>(token,'registry').then(x=>{setSources(x.sources);setSemester(current=>current||x.sources[0]?.semester||'');}).catch(e=>setMessage(e.message)).finally(()=>setRegistryBusy(false));};
  useEffect(()=>{refresh();return()=>{cancelRef.current=true;};},[token]);
  const runSync=async()=>{
    if(runningRef.current||readOnly||!semester)return;
    runningRef.current=true;cancelRef.current=false;setBusy(true);setProgress(null);setMessage('');
    const activeSemester=semester,activePhase=phase;
    let previous=-1;
    try{
      for(let batch=0;batch<1000;batch++){
        if(cancelRef.current){setMessage('Synchronization paused between batches. Select Sync to resume.');break;}
        let next:{complete:boolean;processed:number;total:number;errors?:string[];imported?:number}|undefined;
        for(let attempt=0;attempt<3;attempt++){
          try{next=await liveRequest(token,'sync',{semester:activeSemester,phase:activePhase});break;}
          catch(error){
            if(attempt===2)throw error;
            await new Promise(resolve=>window.setTimeout(resolve,(attempt+1)*700));
          }
        }
        if(!next)throw new Error('Synchronization returned no progress');
        const errors=next.errors||[];
        setProgress({semester:activeSemester,phase:activePhase,processed:next.processed,total:next.total,complete:next.complete,errors});
        if(next.complete){setMessage('Legacy index synchronization completed: '+next.processed+' / '+next.total+' evaluator sheets, '+(next.imported||0)+' records. Academic feedback in student and supervisor views is read directly from Thesis Master → Group info.');await refresh();break;}
        if(errors.length){setMessage('Synchronization paused due to evaluator errors. Resolve them, then restart the import. The previous index remains intact.');break;}
        if(next.processed<=previous){setMessage('Synchronization stalled. Please review the evaluator sources before retrying.');break;}
        previous=next.processed;
        if(batch===999)setMessage('Synchronization stopped at the safety limit. You may resume.');
      }
    }catch(error){setMessage('Synchronization paused: '+String(error instanceof Error?error.message:error)+'. You can safely retry.');}
    finally{runningRef.current=false;setBusy(false);}
  };
  const pct=progress?(progress.total?Math.round(progress.processed/progress.total*100):100):0;
  return <>
    <section className="card admincard"><h3>Semester panel managers</h3><p className="smallmuted">Managed in Thesis Master → Panel Manager Links. Add or change links in that sheet; the portal reads them automatically.</p>{registryBusy?<PortalLoading compact label="Loading semester registry" detail="Reading Panel Manager Links in Thesis Master…"/>:<div className="source-live-list">{sources.map(s=><div key={s.semester}><b>{s.semester}</b><small>Spreadsheet ending …{s.spreadsheetId.slice(-6)}</small></div>)}</div>}</section>
    <section className="card admincard" style={{marginTop:16}}><h3>Historical feedback index</h3><p className="smallmuted">{readOnly?'Read-only preview of configured evaluation sources.':'Optional legacy synchronization for semester statistics. Student, supervisor and Prime Admin comment views now read Group info directly, so syncing is not needed to display those comments.'}</p>
      <div className="formrow"><select aria-label="Semester" disabled={busy} value={semester} onChange={e=>setSemester(e.target.value)}>{sources.map(s=><option key={s.semester}>{s.semester}</option>)}</select><select aria-label="Evaluation phase" disabled={busy} value={phase} onChange={e=>setPhase(e.target.value)}><option>P1</option><option>P2</option><option value="Defense">Defense</option></select>{!readOnly&&<><button className="lightbtn" disabled={busy||!sources.some(s=>s.semester===semester)} onClick={()=>void runSync()}>{busy?'Syncing…':'Sync all batches'}</button>{busy&&<button type="button" className="lightbtn" onClick={()=>{cancelRef.current=true;}}>Pause after current batch</button>}</>}</div>
      {progress&&<div className="sync-progress" role="status" aria-live="polite"><div className="sync-progress-heading">{busy&&<span className="sync-spinner" aria-hidden="true"/>}<strong>{progress.complete?'Feedback import complete':'Synchronizing '+progress.phase+' evaluations'}</strong><span>{progress.semester}</span></div><p>Processed: <b>{progress.processed} / {progress.total}</b> evaluator sheets · {pct}%</p><progress max="100" value={pct} aria-label="Feedback synchronization progress"/><small>{progress.complete?'Feedback index updated. Verify the imported results in each role view.':'Retrieving evaluator feedback…'}</small>{progress.errors.length>0&&<><ul>{progress.errors.map((err,i)=><li key={i}>{err}</li>)}</ul>{!readOnly&&<button type="button" className="lightbtn" disabled={busy} onClick={()=>{if(window.confirm('Discard the incomplete staged import and restart this semester/phase?')){void liveRequest(token,'restartSync',{semester:progress.semester,phase:progress.phase}).then(()=>{setProgress(null);setMessage('Incomplete staging cleared. You may start sync again.');}).catch(err=>setMessage(String(err instanceof Error?err.message:err)));}}}>Restart incomplete import</button>}</>}</div>}
    </section>
    {message&&<div className="infobar" role="status">{message}</div>}
  </>;
}

function LiveAdmins({token}:{token:string}) {
  const [admins,setAdmins]=useState<string[]>([]),[protectedEmail,setProtectedEmail]=useState(''),[email,setEmail]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(true);
  const load=()=>{setLoading(true);return liveRequest<{admins:string[];protected:string}>(token,'primeAdmins').then(x=>{setAdmins(x.admins);setProtectedEmail(x.protected);}).catch(e=>setMessage(e.message)).finally(()=>setLoading(false));};
  useEffect(()=>{load();},[token]);
  const act=async(action:string,payload:Record<string,unknown>)=>{try{const result=await liveRequest<{admins?:string[]}>(token,action,payload);if(result.admins)setAdmins(result.admins);setMessage('Prime Admin access updated. With D1 enabled, allow up to one synchronization interval before the new role appears at sign-in.');}catch(e){setMessage(String(e instanceof Error?e.message:e));}};
  return <><section className="card admincard"><h3>Prime Admin access</h3><p className="smallmuted">Every Prime Admin can appoint another Prime Admin. These accounts have the same administrative privileges. There is no separate regular Admin role.</p>{loading?<PortalLoading label="Loading Prime Administrators" detail="Verifying privileged accounts…"/>:<>{admins.map(name=><div className="adminrow" key={name}><div><b>{name}</b><small>{name===protectedEmail?'Protected founding Prime Admin':'Prime Admin'}</small></div>{name===protectedEmail?<span className="pill green">Protected</span>:<button className="lightbtn" onClick={()=>{if(window.confirm('Revoke Prime Admin access for '+name+'?'))void act('removePrimeAdmin',{email:name});}}>Revoke</button>}</div>)}<form className="addform" onSubmit={e=>{e.preventDefault();void act('addPrimeAdmin',{email});setEmail('');}}><label>Add a Prime Admin</label><div className="formrow"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="faculty@bracu.ac.bd" required/><button className="primarybtn">Grant Prime Admin access</button></div></form></>}</section>{message&&<div className="infobar" role="status">{message}</div>}</>;
}

export default function LivePortal() {
  const [token,setToken]=useState('');
  const [session,setSession]=useState<Session|null>(null);
  const [selectedRole,setSelectedRole]=useState<Session['role']>('student');
  const [restoring,setRestoring]=useState(true);
  const [loggingOut,setLoggingOut]=useState(false);
  const [networkCount,setNetworkCount]=useState(0),[networkVisible,setNetworkVisible]=useState(false);
  const [dataBusy,setDataBusy]=useState(true),[dataAttempt,setDataAttempt]=useState(0);
  const [page,setPage]=useState<LivePage>('dashboard');
  const [drawer,setDrawer]=useState(false);
  const [data,setData]=useState<StudentDashboard|SupervisorDashboard|null>(null);
  const [preview,setPreview]=useState<RolePreview|null>(null);
  const [previewDialog,setPreviewDialog]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>subscribePortalActivity(setNetworkCount),[]);
  useEffect(()=>{
    if(networkCount===0){setNetworkVisible(false);return;}
    const timer=window.setTimeout(()=>setNetworkVisible(true),160);
    return()=>window.clearTimeout(timer);
  },[networkCount]);
  useEffect(()=>{let active=true;liveRequest<Session>('','session').then(verified=>{
    if(!active)return;clearLiveCache();setPage(restoredPage(verified));setToken('session');setSession(verified);setSelectedRole(verified.role);
  }).catch(()=>{/* No valid browser session; Google sign-in is required. */}).finally(()=>{if(active)setRestoring(false);});return()=>{active=false;};},[]);
  const login=async(idToken:string)=>{
    const verified=await liveRequest<Session>(idToken,'login');
    try{window.sessionStorage.removeItem(SAVED_PAGE_PREFIX+verified.email);}catch{/* Optional UI preference only. */}
    clearLiveCache();setToken('session');setSession(verified);setSelectedRole(verified.role);setData(null);setPreview(null);setPage('dashboard');setError('');
  };
  const logout=async()=>{
    if(loggingOut)return;
    setLoggingOut(true);
    try{await liveRequest<{signedOut:boolean}>('','logout');}catch(e){setError('Unable to end your session. Please retry while connected.');setLoggingOut(false);return;}
    window.google?.accounts?.id.disableAutoSelect();clearLiveCache();setToken('');setSession(null);
    setData(null);setPreview(null);setPreviewDialog(false);setPage('dashboard');setLoggingOut(false);
  };
  const role=preview?.role||selectedRole;
  const switchRole=(next:Session['role'])=>{
    if(!session||next==='admin'||!(session.roles||[session.role]).includes(next))return;
    clearLiveCache();setSelectedRole(next);setPreview(null);setData(null);setDataBusy(true);setPage('dashboard');setError('');
  };
  useEffect(()=>{if(session&&!preview)rememberPage(session,page);},[session,preview,page]);
  const actualPrime=!!session&&(session.roles||[session.role]).includes('prime_admin');
  const showPrimeControls=actualPrime&&!preview&&role==='prime_admin';
  const nav=useMemo(()=>role==='student'?
    [['dashboard','Dashboard',LayoutDashboard],['evaluations','My Evaluations',ClipboardList],['deadlines','Deadlines',CalendarDays],['resources','Resources',BookOpen]]:
    role==='supervisor'?
      [['dashboard','My Groups',Users],['deadlines','Deadlines',CalendarDays],['resources','Resources',BookOpen]]:
      [['dashboard','Overview',LayoutDashboard],['search','Student Search',Search],['rolepreview','View as another role',Eye],['deadlines','Deadlines',CalendarDays],['resources','Resources',BookOpen],['sources','Semester Sources',TableProperties],['announcements','News & Events',Megaphone],
        ...(showPrimeControls?[['faculty','Faculty List',Users],['admins','Prime Admins',ShieldCheck]]:[])],
    [role,showPrimeControls]);
  useEffect(()=>{
    if(!session||!token||preview)return;
    const action=role==='student'?'student':role==='supervisor'?'supervisor':null;
    if(!action)return;
    let active=true;setDataBusy(true);setData(null);setError('');
    liveRequest<StudentDashboard|SupervisorDashboard>(token,action).then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setDataBusy(false);});
    return()=>{active=false;};
  },[session,token,dataAttempt,role,preview]);
  if(restoring)return <PortalLoading fullPage label="Restoring your university session" detail="Verifying your secure sign-in and access permissions…"/>;
  if(!session)return <LiveLogin onToken={login}/>;
  const displayData=preview?preview.data:data;
  const heading=({dashboard:role==='student'?'My thesis overview':role==='supervisor'?'My groups':'Academic overview',evaluations:'My evaluations',students:'My students',search:'Search academic records',deadlines:'Deadlines',resources:'Resources',sources:'Semester sources',admins:'Prime Admins',faculty:'Faculty list',announcements:'News & events'})[page];
  const exitPreview=()=>{clearLiveCache();setPreview(null);setPage('dashboard');setError('');};
  const awaitingData=dataBusy?<PortalLoading label="Loading your academic workspace" detail="Fetching records assigned to your verified university account…"/>:<section className="card"><p>We could not load your academic records. Please retry.</p><button className="lightbtn" type="button" onClick={()=>setDataAttempt(value=>value+1)}>Retry loading</button></section>;
  return <div className={`application ${role==='student'?'student-mode':role==='supervisor'?'supervisor-mode':''}`}>
    {networkVisible&&<div className="portal-request-bar" role="status" aria-label="Loading portal data"><span/></div>}
    <aside className={`sidebar ${drawer?'open':''}`}>
      <div className="brand"><span className="brand-symbol">B</span><div><strong>BRAC University</strong><small>Thesis Evaluation Portal</small></div></div>
      <div><div className="navlabel">WORKSPACE</div><nav className="nav">{nav.map(([key,label,Icon])=><button key={key as string} className={page===key?'selected':''} onClick={()=>{if(key==='rolepreview')setPreviewDialog(true);else setPage(key as LivePage);setDrawer(false);}}><Icon size={17}/>{label as string}</button>)}</nav></div>
      <div className="sidebarfoot"><LockKeyhole size={15}/><span>Authenticated university portal<br/><small>{preview?'Prime Admin support preview':'Role-restricted access'}</small></span></div>
    </aside>
    {drawer&&<button className="scrim" aria-label="Close menu" onClick={()=>setDrawer(false)}/>}
    <div className="main">
      <header className="topbar"><button className="menuicon" aria-label="Open menu" onClick={()=>setDrawer(true)}><Menu size={22}/></button><span className="breadcrumbs">Academic Portal <ChevronRight size={13}/>{heading}</span><div className="topright"><span className="live-role">{roleLabel(role)}</span><AccountMenu session={session} role={role} onSwitch={switchRole} onSignOut={()=>void logout()} loggingOut={loggingOut}/></div></header>
      <main className="content">
        {preview&&<div className="prime-preview-banner" role="status"><div><Eye size={18}/><span><strong>Read-only role preview · {role?.replace('_',' ')}</strong><small>{preview.email} · You remain signed in as {session.email}</small></span></div><button onClick={exitPreview}>Exit preview</button></div>}
        <div className="pageheading"><div><span className="eyebrow">{roleLabel(role).toUpperCase()}{preview?' · PREVIEW':''}</span><h1>{heading}</h1><p>{preview?`Viewing ${preview.email} · Read-only`:session.email}</p></div><div className="prime-heading-actions">{preview&&<button className="prime-view-btn" onClick={()=>setPreviewDialog(true)}><Eye size={15}/> Change preview</button>}</div></div>
        {error&&<div className="live-error" role="alert">{error} <button className="lightbtn" onClick={logout}>Sign in again</button></div>}
        {page==='deadlines'?<LiveDeadlines token={token} studentStage={role==='student'?(displayData as StudentDashboard|null)?.group?.stage||'':undefined}/>:
          page==='resources'?<LiveResources token={token}/>:
          role==='student'?displayData?<StudentExperience data={displayData as StudentDashboard} page={page==='evaluations'?'evaluations':'dashboard'} onNavigate={setPage}/>:awaitingData:
          role==='supervisor'?displayData?<SupervisorExperience data={displayData as SupervisorDashboard}/>:awaitingData:
          page==='dashboard'?(showPrimeControls?<PrimeOverview token={token} onNavigate={setPage} onPreview={()=>setPreviewDialog(true)}/>:<LiveSummary token={token}/>):
          page==='search'?(showPrimeControls?<PrimeSearch token={token}/>:<LiveSearch token={token}/>):
          page==='sources'?<LiveSources token={token} readOnly={!!preview}/>:
          page==='announcements'?<AdminAnnouncements token={token} readOnly={!!preview}/>:
          page==='faculty'&&showPrimeControls?<PrimeFacultyList token={token}/>:
          page==='admins'&&showPrimeControls?<LiveAdmins token={token}/>:null}
        <footer className="footer"><GraduationCap size={16}/> BRAC University Thesis Evaluation Portal<span>Authorized access only</span></footer>
      </main>
    </div>
    {(role==='student'||role==='supervisor')&&<nav className="student-mobile-nav" aria-label={`${role==='student'?'Student':'Supervisor'} quick navigation`}>{(role==='student'?([
      ['dashboard','Dashboard',LayoutDashboard],['evaluations','Evaluations',ClipboardList],['deadlines','Deadlines',CalendarDays],['resources','Resources',BookOpen],
    ] as const):([
      ['dashboard','Groups',Users],['deadlines','Deadlines',CalendarDays],['resources','Resources',BookOpen],
    ] as const)).map(([key,label,Icon])=><button key={key} type="button" aria-current={page===key?'page':undefined} className={page===key?'selected':''} onClick={()=>{setPage(key);setDrawer(false);}}><Icon size={19}/><span>{label}</span></button>)}</nav>}
    {previewDialog&&actualPrime&&<PrimePreviewDialog token={token} onClose={()=>setPreviewDialog(false)} onStart={result=>{clearLiveCache();setPreview(result);setPage('dashboard');setError('');}}/>}
  </div>;
}
