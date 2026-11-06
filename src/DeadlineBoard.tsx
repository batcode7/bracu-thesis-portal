import { useMemo, useState } from 'react';
import { ArrowUpRight, CalendarDays, ChevronRight } from 'lucide-react';

export type PortalDeadline = { id: string; phase: string; title: string; day?:string;date: string; daysLeft?:string;status: string; action: string; url?: string;links?:Array<{label:string;url:string}> };
const phases = ['General','P1','P2','Early Defense','Defense'];
const names: Record<string,string> = {General:'All stages',P1:'Pre-Thesis 1',P2:'Pre-Thesis 2','Early Defense':'Early Defense',Defense:'Final Defense'};
const earlyPrefix=/^\s*early\s*(?:defen[cs]e|def|final)\s*[—–:-]\s*/i;

// Earlier D1 snapshots stored Early Defense inside Defense with a title prefix.
// Recognize those until the next five-minute sync publishes separate phases.
function deadlinePhase(item:PortalDeadline) {
  return item.phase==='Early Defense'||(item.phase==='Defense'&&earlyPrefix.test(item.title))?'Early Defense':item.phase;
}
function deadlineTitle(item:PortalDeadline) {
  return deadlinePhase(item)==='Early Defense'?item.title.replace(earlyPrefix,''):item.title;
}

function safeUrl(value?: string) {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : undefined; } catch { return undefined; }
}

/** The same organized view powers snapshot/demo and authenticated live data. */
function remaining(item:PortalDeadline){
  const source=String(item.daysLeft||item.status||'').trim();
  if(/^-?\d+$/.test(source)){
    const count=Number(source);
    return count<0?'Expired':count===0?'Due today':`${count} ${count===1?'day':'days'} left`;
  }
  return source||'Not specified';
}
export function DeadlineBoard({ entries,studentStage }: { entries: PortalDeadline[];studentStage?:string }) {
  const [tab,setTab]=useState('All');
  const visible = useMemo(() => entries.filter(item => {
    const phase=deadlinePhase(item);
    if(!phases.includes(phase))return false;
    if(studentStage!==undefined)return phase==='General'||phase===studentStage;
    return tab==='All'||phase===tab||(tab==='Defense'&&phase==='Early Defense');
  }), [entries,tab,studentStage]);
  const grouping = phases.map(name => ({ name, items: visible.filter(item => deadlinePhase(item) === name) })).filter(group => group.items.length);
  return <>
    <div className="deadline-board-controls">
      {studentStage===undefined?<div className="deadline-tabs" role="tablist" aria-label="Deadline categories">{['All','P1','P2','Defense'].map(name=><button key={name} role="tab" type="button" aria-selected={tab===name} className={tab===name?'selected':''} onClick={()=>setTab(name)}>{name}</button>)}</div>:<div className="deadline-phase-guide" aria-label="Your academic deadline phase"><span>University-wide</span>{studentStage&&<span>{names[studentStage]||studentStage}</span>}</div>}
    </div>
    <div className="deadline-board-summary"><span>{visible.length} {visible.length === 1 ? 'deadline' : 'deadlines'} listed</span></div>
    {grouping.length ? <div className="deadline-groups">{grouping.map(group => <section key={group.name} className="deadline-phase-section" aria-label={names[group.name] || group.name}>
      <div className="deadline-phase-heading"><div><span className="deadline-phase-marker"/><h3>{names[group.name] || group.name}</h3><span className="deadline-phase-count">{group.items.length} {group.items.length === 1 ? 'item' : 'items'}</span></div></div>
      <div className="deadline-table-wrap"><table className="deadline-events-table"><thead><tr><th scope="col">Submission</th><th scope="col">Date</th><th scope="col">Status</th><th scope="col">Link</th></tr></thead><tbody>{group.items.map(item => {
        const url = safeUrl(item.url);
        const statusClass = item.status.toLowerCase().includes('expir') ? 'expired' : item.status.toLowerCase().includes('person') ? 'onsite' : 'reference';
        return <tr key={item.id}>
          <td className="deadline-table-title"><strong>{deadlineTitle(item)}</strong></td>
          <td><span className="deadline-event-date"><CalendarDays size={14}/><span>{[item.day,item.date].filter(Boolean).join(' · ') || 'Date to be announced'}</span></span></td>
          <td><span className={`deadline-event-status ${statusClass}`}>{remaining(item)}</span></td>
          <td><span className="deadline-event-links">{item.links?.length?item.links.map((link,index)=>{const href=safeUrl(link.url);return href?<a key={index} href={href} target="_blank" rel="noopener noreferrer">{link.label||'Submission'} <ArrowUpRight size={14}/></a>:null;}):url ? <a href={url} target="_blank" rel="noopener noreferrer">{item.action || 'Open form'} <ArrowUpRight size={14}/></a> : <span className="deadline-event-offline">{item.action || 'No submission link'} <ChevronRight size={13}/></span>}</span></td>
        </tr>;
      })}</tbody></table></div>
    </section>)}</div> : <div className="card deadline-empty"><CalendarDays size={24}/><strong>No deadlines listed for this stage</strong><p>Check back when the university publishes an update.</p></div>}
  </>;
}
