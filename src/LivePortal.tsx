import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, CalendarDays, ChevronRight, ClipboardList, Clock3, Eye, GraduationCap, LayoutDashboard, LockKeyhole, LogOut, Megaphone, Menu, Search, ShieldCheck, TableProperties, Users, X } from 'lucide-react';
import { GOOGLE_CLIENT_ID, liveRequest, cachedLiveRequest, clearLiveCache, invalidateLiveCache, subscribePortalActivity, type Session } from './live-api';
import PortalLoading from './PortalLoading';
import { PortalWelcome } from './PortalWelcome';
import { DeadlineBoard } from './DeadlineBoard';
import { deadlineEntries, resourceLinks } from './deadlines-data';
import { PrimeFacultyList, PrimeOverview, PrimePreviewDialog, PrimeSearch, type RolePreview } from './PrimeAdminExperience';
import { AdminAnnouncements } from './Announcements';
import StudentExperience, { studentPhase } from './StudentExperience';
import SupervisorExperience from './SupervisorExperience';
import type { Evaluation } from './data';
import type { StudentDashboard, SupervisorDashboard } from './portal-api';

type LivePage = 'dashboard' | 'evaluations' | 'students' | 'search' | 'deadlines' | 'resources' | 'sources' | 'admins' | 'faculty' | 'announcements' | 'profile';
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
    {selected&&!detailBusy&&<div className="modaloverlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><section className="modalbox admin-detail" role="dialog" aria-modal="true" aria-label="Detailed student record"><div className="modalheader"><div><div className="eyebrow">STUDENT RECORD</div><h2>{selected.student.name}</h2></div><button className="iconbtn" aria-label="Close" onClick={()=>setSelected(null)}><X size={18}/></button></div><div className="detail-pairs"><div><small>Student ID</small><b>{selected.student.id}</b></div><div><small>Thesis / project ID</small><b>{selected.group.id}</b></div><div><small>Email</small><b>{selected.student.email}</b></div><div><small>Stage</small><b>{selected.group.stage}</b></div><div><small>Supervisor</small><b>{selected.group.primarySupervisor}</b></div><div><small>Title</small><b>{selected.group.title}</b></div></div><div className="detail-section"><h3>Group members</h3><div className="memberlist">{selected.members.map(member=><div key={member.id}><Users size={15}/><span>{member.name}</span><small>{member.id}</small></div>)}</div></div><div className="detail-section"><h3>Recorded marks</h3><div className="mark-summary">{(['p1','p2','defense','supervisor'] as const).map(field=><div key={field}><span>{field.toUpperCase()}</span><strong>{selected.marks?.[field]??'Pending'}</strong></div>)}</div></div></section></div>}
  </>;
}

function LiveSummary({token}:{token:string}) {
  const [rows,setRows]=useState<SummaryRow[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;setLoading(true);cachedLiveRequest<{semesters:SummaryRow[]}>(token,'summary',{},60000).then(data=>{if(active)setRows(data.semesters);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[token]);
  return <><div className="infobar"><CircleHelpIcon/> Counts reflect synchronized, released evaluations with marks and required comments. A zero may mean a semester has not been synchronized or published.</div>{error&&<div className="live-error">{error}</div>}{loading?<PortalLoading label="Loading semester results" detail="Checking released evaluation summaries…"/>:<section className="card admin-results"><div className="tableoverflow"><table><thead><tr><th>Semester</th><th>Students</th><th>Groups</th><th>P1 (students / groups)</th><th>P2 (students / groups)</th><th>Defense (students / groups)</th></tr></thead><tbody>{rows.map(r=><tr key={r.semester}><td><b>{r.semester}</b></td><td>{r.students}</td><td>{r.groups}</td><td>{r.P1.students} / {r.P1.groups}</td><td>{r.P2.students} / {r.P2.groups}</td><td>{r.Defense.students} / {r.Defense.groups}</td></tr>)}{!rows.length&&<tr><td colSpan={6} className="noresults">No synchronized semester statistics yet.</td></tr>}</tbody></table></div></section>}</>;
}
function CircleHelpIcon(){return <ShieldCheck size={16}/>;}

function LiveDeadlines({token,stageScope,allowedPhases}:{token:string;stageScope?:string;allowedPhases?:string[]}) {
  const [rows,setRows]=useState<Deadline[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [refreshId,setRefreshId]=useState(0);
  useEffect(()=>{let active=true;setLoading(true);cachedLiveRequest<{entries:Deadline[]}>(token,'deadlines',{},90000).then(x=>{if(active){setRows(x.entries);setError('');}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[token,refreshId]);
  const phase=stageScope?studentPhase(stageScope):null;
  const reference=!loading&&!rows.length&&!stageScope&&!allowedPhases;
  const entries=(reference?deadlineEntries:rows.map(r=>({...r,date:[r.day,r.date].filter(Boolean).join(' · ')}))).filter(item=>stageScope?!!phase&&item.phase===phase:allowedPhases?allowedPhases.includes(item.phase):true);
  return <><div className="deadline-source-note"><Clock3 size={16}/><span>{stageScope?`Showing only ${stageScope} deadlines assigned to your thesis stage. Verify dates before submitting.`:allowedPhases?'Showing deadlines for the active stages of your assigned research groups. Verify dates before submitting.':'Submission deadlines come from the university source workbook. Verify dates and availability before submitting.'}</span><button type="button" className="lightbtn" disabled={loading} onClick={()=>{invalidateLiveCache('deadlines');setRefreshId(n=>n+1);}}>Refresh</button></div>
    {error&&<div className="live-error" role="alert">The live deadline source could not be loaded: {error}</div>}
    {reference&&<div className="prime-deadline-status"><BookOpen size={17}/><span>Showing a clearly labeled reference snapshot from 5 November 2026 because the live feed has no available entries. Dates may be outdated.</span></div>}
    {loading?<PortalLoading label="Loading relevant deadlines" detail="Reading stage-specific dates and submission information…"/>:<DeadlineBoard entries={entries} lockedPhase={stageScope?(phase||'No active stage'):undefined} availablePhases={allowedPhases}/>}
  </>;
}

function LiveResources({stageScope,allowedPhases}:{stageScope?:string;allowedPhases?:string[]}) {
  const phase=stageScope?studentPhase(stageScope):null;
  const links=resourceLinks.filter(item=>!item.phase||(stageScope?item.phase===phase:allowedPhases?allowedPhases.includes(item.phase):true));
  return <div className="student-resources-view"><div className="student-eval-intro"><span className="eyebrow">ACADEMIC MATERIALS</span><h2>Useful resources</h2><p>Important departmental guides, templates, and reference documents. {stageScope?'Materials unrelated to your current stage are hidden.':allowedPhases?'Showing common guides and materials relevant to your assigned groups.':'Browse the resources used throughout the thesis process.'}</p></div>
    <div className="prime-resource-grid student-resource-list">{links.map(item=><a href={item.url} target="_blank" rel="noopener noreferrer" key={item.title}><BookOpen size={20}/><span><b>{item.title}</b><small>{item.detail}</small></span><ArrowUpRight size={16}/></a>)}</div>
  </div>;
}

function LiveSources({token,readOnly=false}:{token:string;readOnly?:boolean}) {
  const [sources,setSources]=useState<Source[]>([]),[releases,setReleases]=useState<Record<string,boolean>>({}),[semester,setSemester]=useState(''),[spreadsheetId,setSpreadsheetId]=useState(''),[phase,setPhase]=useState('P1'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [registryBusy,setRegistryBusy]=useState(true);
  const [progress,setProgress]=useState<{semester:string;phase:string;processed:number;total:number;complete:boolean;errors:string[]} | null>(null);
  const cancelRef=useRef(false),runningRef=useRef(false);
  const refresh=()=>{setRegistryBusy(true);return liveRequest<{sources:Source[];releases:Record<string,boolean>}>(token,'registry').then(x=>{setSources(x.sources);setReleases(x.releases);setSemester(current=>current||x.sources[0]?.semester||'');}).catch(e=>setMessage(e.message)).finally(()=>setRegistryBusy(false));};
  useEffect(()=>{refresh();return()=>{cancelRef.current=true;};},[token]);
  const act=async(action:string,payload:Record<string,unknown>)=>{
    if(runningRef.current)return;
    setBusy(true);setMessage('');
    try{await liveRequest(token,action,payload);setMessage('Saved successfully.');await refresh();}
    catch(e){setMessage(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  };
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
        if(next.complete){setMessage('Synchronization completed: '+next.processed+' / '+next.total+' evaluator sheets, '+(next.imported||0)+' feedback records imported. Results remain unpublished.');await refresh();break;}
        if(errors.length){setMessage('Synchronization paused due to evaluator errors. Resolve them, then restart the import. No partial snapshot was published.');break;}
        if(next.processed<=previous){setMessage('Synchronization stalled. Please review the evaluator sources before retrying.');break;}
        previous=next.processed;
        if(batch===999)setMessage('Synchronization stopped at the safety limit. You may resume.');
      }
    }catch(error){setMessage('Synchronization paused: '+String(error instanceof Error?error.message:error)+'. You can safely retry.');}
    finally{runningRef.current=false;setBusy(false);}
  };
  const pct=progress?(progress.total?Math.round(progress.processed/progress.total*100):100):0;
  return <>
    <section className="card admincard"><h3>Registered semester managers</h3>{registryBusy?<PortalLoading compact label="Loading semester registry" detail="Checking configured evaluation sources…"/>:<div className="source-live-list">{sources.map(s=><div key={s.semester}><b>{s.semester}</b><small>Spreadsheet ending …{s.spreadsheetId.slice(-6)}</small></div>)}</div>}{!readOnly&&<form className="addform" onSubmit={e=>{e.preventDefault();void act('registerSemester',{semester:semester.trim(),spreadsheetId:spreadsheetId.trim()});}}><label>Register or update a semester source</label><div className="formrow"><input placeholder="Fall 2026" value={semester} onChange={e=>setSemester(e.target.value)} required/><input placeholder="Google spreadsheet ID" value={spreadsheetId} onChange={e=>setSpreadsheetId(e.target.value)} required/><button disabled={busy||registryBusy} className="primarybtn">Save source</button></div></form>}</section>
    <section className="card admincard" style={{marginTop:16}}><h3>Feedback synchronization and publication</h3><p className="smallmuted">{readOnly?'Read-only preview of publication status. Editing is disabled.':'Choose a registered semester and phase. Sync automatically retrieves evaluator sheets in batches; publication remains a separate, explicit action.'}</p>
      <div className="formrow"><select aria-label="Semester" disabled={busy} value={semester} onChange={e=>setSemester(e.target.value)}>{sources.map(s=><option key={s.semester}>{s.semester}</option>)}</select><select aria-label="Evaluation phase" disabled={busy} value={phase} onChange={e=>setPhase(e.target.value)}><option>P1</option><option>P2</option><option value="Defense">Defense</option></select>{!readOnly&&<><button className="lightbtn" disabled={busy||!sources.some(s=>s.semester===semester)} onClick={()=>void runSync()}>{busy?'Syncing…':'Sync all batches'}</button>{busy&&<button type="button" className="lightbtn" onClick={()=>{cancelRef.current=true;}}>Pause after current batch</button>}<button className="primarybtn" disabled={busy||!sources.some(s=>s.semester===semester)} onClick={()=>void act('release',{semester,phase,published:!releases[semester+'|'+phase]})}>{releases[semester+'|'+phase]?'Unpublish':'Publish'} {phase}</button></>}</div>
      <p className="smallmuted">Currently {releases[semester+'|'+phase]?'published':'unpublished'} for {semester} / {phase}.</p>
      {progress&&<div className="sync-progress" role="status" aria-live="polite"><div className="sync-progress-heading">{busy&&<span className="sync-spinner" aria-hidden="true"/>}<strong>{progress.complete?'Feedback import complete':'Synchronizing '+progress.phase+' evaluations'}</strong><span>{progress.semester}</span></div><p>Processed: <b>{progress.processed} / {progress.total}</b> evaluator sheets · {pct}%</p><progress max="100" value={pct} aria-label="Feedback synchronization progress"/><small>{progress.complete?'Review before publishing.':'Retrieving evaluator feedback…'}</small>{progress.errors.length>0&&<><ul>{progress.errors.map((err,i)=><li key={i}>{err}</li>)}</ul>{!readOnly&&<button type="button" className="lightbtn" disabled={busy} onClick={()=>{if(window.confirm('Discard the incomplete staged import and restart this semester/phase?')){void liveRequest(token,'restartSync',{semester:progress.semester,phase:progress.phase}).then(()=>{setProgress(null);setMessage('Incomplete staging cleared. You may start sync again.');}).catch(err=>setMessage(String(err instanceof Error?err.message:err)));}}}>Restart incomplete import</button>}</>}</div>}
    </section>
    {message&&<div className="infobar" role="status">{message}</div>}
  </>;
}

function LiveAdmins({token}:{token:string}) {
  const [admins,setAdmins]=useState<string[]>([]),[email,setEmail]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(true);
  const load=()=>{setLoading(true);return liveRequest<{admins:string[]}>(token,'admins').then(x=>setAdmins(x.admins)).catch(e=>setMessage(e.message)).finally(()=>setLoading(false));};
  useEffect(()=>{load();},[token]);
  const act=async(action:string,payload:Record<string,unknown>)=>{try{const result=await liveRequest<{admins?:string[]}>(token,action,payload);if(result.admins)setAdmins(result.admins);setMessage('Change saved.');}catch(e){setMessage(String(e instanceof Error?e.message:e));}};
  return <><section className="card admincard"><h3>Administrator access</h3><p className="smallmuted">Only the Prime Administrator can grant or revoke regular administrative access. Faculty records are managed automatically in Faculty List.</p>{loading?<PortalLoading label="Loading administrator list" detail="Verifying privileged accounts…"/>:<><div className="adminrow"><div><b>partha.bhoumik@bracu.ac.bd</b><small>Protected Prime Administrator</small></div><span className="pill green">Prime</span></div>{admins.map(name=><div className="adminrow" key={name}><b>{name}</b><button className="lightbtn" onClick={()=>act('removeAdmin',{email:name})}>Revoke</button></div>)}<form className="addform" onSubmit={e=>{e.preventDefault();act('addAdmin',{email});setEmail('');}}><label>Add regular administrator</label><div className="formrow"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="faculty@bracu.ac.bd" required/><button className="primarybtn">Grant access</button></div></form></>}</section>{message&&<div className="infobar" role="status">{message}</div>}</>;
}

export default function LivePortal() {
  const [token,setToken]=useState('');
  const [session,setSession]=useState<Session|null>(null);
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
    if(!active)return;clearLiveCache();setToken('session');setSession(verified);
  }).catch(()=>{/* No valid browser session; Google sign-in is required. */}).finally(()=>{if(active)setRestoring(false);});return()=>{active=false;};},[]);
  const login=async(idToken:string)=>{
    const verified=await liveRequest<Session>(idToken,'login');
    clearLiveCache();setToken('session');setSession(verified);setData(null);setPreview(null);setPage('dashboard');setError('');
  };
  const logout=async()=>{
    if(loggingOut)return;
    setLoggingOut(true);
    try{await liveRequest<{signedOut:boolean}>('','logout');}catch(e){setError('Unable to end your session. Please retry while connected.');setLoggingOut(false);return;}
    window.google?.accounts?.id.disableAutoSelect();clearLiveCache();setToken('');setSession(null);
    setData(null);setPreview(null);setPreviewDialog(false);setPage('dashboard');setLoggingOut(false);
  };
  const role=preview?.role||session?.role;
  const actualPrime=session?.role==='prime_admin';
  const showPrimeControls=actualPrime&&!preview;
  const nav=useMemo(()=>role==='student'?
    [['dashboard','Dashboard',LayoutDashboard],['evaluations','My Evaluations',ClipboardList],['deadlines','Deadlines',CalendarDays],['resources','Resources',BookOpen]]:
    role==='supervisor'?
      [['dashboard','My Groups',Users],['deadlines','Deadlines',CalendarDays],['resources','Resources',BookOpen]]:
      [['dashboard','Overview',LayoutDashboard],['search','Student Search',Search],['sources','Semester Sources',TableProperties],['deadlines','Deadlines',CalendarDays],['resources','Resources',BookOpen],['announcements','News & Events',Megaphone],
        ...(showPrimeControls?[['faculty','Faculty List',Users],['admins','Administrators',ShieldCheck]]:[]),['profile','Profile',Users]],
    [role,showPrimeControls]);
  useEffect(()=>{
    if(!session||!token)return;
    const action=session.role==='student'?'student':session.role==='supervisor'?'supervisor':null;
    if(!action)return;
    let active=true;setDataBusy(true);setData(null);setError('');
    liveRequest<StudentDashboard|SupervisorDashboard>(token,action).then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setDataBusy(false);});
    return()=>{active=false;};
  },[session,token,dataAttempt]);
  if(restoring)return <PortalLoading fullPage label="Restoring your university session" detail="Verifying your secure sign-in and access permissions…"/>;
  if(!session)return <LiveLogin onToken={login}/>;
  const displayData=preview?preview.data:data;
  const supervisorPhases=role==='supervisor'&&displayData?[...new Set((displayData as SupervisorDashboard).groups.map(group=>studentPhase(group.stage)).filter((phase):phase is 'P1'|'P2'|'Defense'=>!!phase))]:undefined;
  const heading=({dashboard:role==='student'?'My thesis overview':role==='supervisor'?'My groups':'Academic overview',evaluations:'My evaluations',students:'My students',search:'Search academic records',deadlines:'Deadlines',resources:'Resources',sources:'Semester sources',admins:'Administrator management',faculty:'Faculty list',announcements:'News & events',profile:'My profile'})[page];
  const exitPreview=()=>{clearLiveCache();setPreview(null);setPage('dashboard');setError('');};
  const awaitingData=dataBusy?<PortalLoading label="Loading your academic workspace" detail="Fetching records assigned to your verified university account…"/>:<section className="card"><p>We could not load your academic records. Please retry.</p><button className="lightbtn" type="button" onClick={()=>setDataAttempt(value=>value+1)}>Retry loading</button></section>;
  return <div className={`application ${role==='student'?'student-mode':role==='supervisor'?'supervisor-mode':''}`}>
    {networkVisible&&<div className="portal-request-bar" role="status" aria-label="Loading portal data"><span/></div>}
    <aside className={`sidebar ${drawer?'open':''}`}>
      <div className="brand"><span className="brand-symbol">B</span><div><strong>BRAC University</strong><small>Thesis Evaluation Portal</small></div></div>
      <div><div className="navlabel">WORKSPACE</div><nav className="nav">{nav.map(([key,label,Icon])=><button key={key as string} className={page===key?'selected':''} onClick={()=>{setPage(key as LivePage);setDrawer(false);}}><Icon size={17}/>{label as string}</button>)}</nav></div>
      {role==='student'||role==='supervisor'?<div className="student-sidebar-exit"><button onClick={logout} disabled={loggingOut}><LogOut size={17}/> {loggingOut?'Signing out…':'Sign out'}</button></div>:<div className="sidebarfoot"><LockKeyhole size={15}/><span>Authenticated university portal<br/><small>{preview?'Prime Admin support preview':'Role-restricted access'}</small></span></div>}
    </aside>
    {drawer&&<button className="scrim" aria-label="Close menu" onClick={()=>setDrawer(false)}/>}
    <div className="main">
      <header className="topbar"><button className="menuicon" aria-label="Open menu" onClick={()=>setDrawer(true)}><Menu size={22}/></button><span className="breadcrumbs">Academic Portal <ChevronRight size={13}/>{heading}</span><div className="topright"><span className="live-role">{role?.replace('_',' ')}</span><span className="avatar">{session.email.substring(0,2).toUpperCase()}</span></div></header>
      <main className="content">
        {preview&&<div className="prime-preview-banner" role="status"><div><Eye size={18}/><span><strong>Read-only role preview · {role?.replace('_',' ')}</strong><small>{preview.email} · You remain signed in as {session.email}</small></span></div><button onClick={exitPreview}>Exit preview</button></div>}
        <div className="pageheading"><div><span className="eyebrow">{role?.replace('_',' ').toUpperCase()}{preview?' · PREVIEW':''}</span><h1>{heading}</h1><p>{preview?`Viewing ${preview.email} · Read-only`:session.email}</p></div><div className="prime-heading-actions">{showPrimeControls&&<button className="prime-view-btn" onClick={()=>setPreviewDialog(true)}><Eye size={15}/> View as another role</button>}{preview&&<button className="prime-view-btn" onClick={()=>setPreviewDialog(true)}><Eye size={15}/> Change preview</button>}<button className="lightbtn live-logout" disabled={loggingOut} onClick={logout}><LogOut size={15}/> {loggingOut?'Signing out…':'Sign out'}</button></div></div>
        {error&&<div className="live-error" role="alert">{error} <button className="lightbtn" onClick={logout}>Sign in again</button></div>}
        {page==='profile'?<section className="card profilecard"><div className="eyebrow">{preview?'ADMINISTRATIVE PREVIEW':'VERIFIED GOOGLE WORKSPACE ACCOUNT'}</div><h2>{preview?preview.email:session.name}</h2><p>{preview?'Read-only view; not a separate Google login':session.email}</p><p>Role: {role}</p></section>:
          page==='deadlines'?((role==='student'||role==='supervisor')&&!displayData?awaitingData:<LiveDeadlines token={token} stageScope={role==='student'?(displayData as StudentDashboard).group.stage:undefined} allowedPhases={supervisorPhases}/> ):
          page==='resources'?((role==='student'||role==='supervisor')&&!displayData?awaitingData:<LiveResources stageScope={role==='student'?(displayData as StudentDashboard).group.stage:undefined} allowedPhases={supervisorPhases}/> ):
          role==='student'?displayData?<StudentExperience data={displayData as StudentDashboard} page={page==='evaluations'?'evaluations':'dashboard'} onNavigate={setPage}/>:awaitingData:
          role==='supervisor'?displayData?<SupervisorExperience data={displayData as SupervisorDashboard}/>:awaitingData:
          page==='dashboard'?(showPrimeControls?<PrimeOverview token={token} onNavigate={setPage}/>:<LiveSummary token={token}/>):
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
