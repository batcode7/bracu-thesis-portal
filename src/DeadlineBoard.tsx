import { useMemo, useState } from 'react';
import { ArrowUpRight, CalendarDays, ChevronRight, Search } from 'lucide-react';

export type PortalDeadline = { id: string; phase: string; title: string; day?:string;date: string; daysLeft?:string;status: string; action: string; url?: string;links?:Array<{label:string;url:string}> };
const phases = ['General','P1', 'P2', 'Defense'];
const names: Record<string,string> = {General:'All stages',P1:'Pre-Thesis 1',P2:'Pre-Thesis 2',Defense:'Final Defense'};

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
  const [query, setQuery] = useState('');
  const [tab,setTab]=useState('All');
  const visible = useMemo(() => entries.filter(item =>
    phases.includes(item.phase) && (studentStage!==undefined||tab==='All'||item.phase===tab) &&
    [item.title,item.day||'',item.action,item.date,item.phase,item.status].some(value => value.toLowerCase().includes(query.trim().toLowerCase()))
  ), [entries, query,tab,studentStage]);
  const grouping = phases.map(name => ({ name, items: visible.filter(item => item.phase === name) })).filter(group => !query.trim() || group.items.length);
  return <>
    <div className="deadline-board-controls">
      {studentStage===undefined?<div className="deadline-tabs" role="tablist" aria-label="Deadline categories">{['All',...phases].map(name=><button key={name} role="tab" type="button" aria-selected={tab===name} className={tab===name?'selected':''} onClick={()=>setTab(name)}>{name==='General'?'All stages':name}</button>)}</div>:<div className="deadline-phase-guide" aria-label="Academic deadline phases"><span>All stages</span>{studentStage&&<span>{studentStage}</span>}</div>}
      <label className="deadline-board-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find an event or form" aria-label="Search deadlines and forms"/></label>
    </div>
    <div className="deadline-board-summary"><span>{visible.length} {visible.length === 1 ? 'deadline' : 'deadlines'} listed</span><span>Remaining time is taken from the current university source</span></div>
    {grouping.length ? <div className="deadline-groups">{grouping.map(group => <section key={group.name} className="deadline-phase-section" aria-label={names[group.name] || group.name}>
      <div className="deadline-phase-heading"><div><span className="deadline-phase-marker"/><h3>{names[group.name] || group.name}</h3><span className="deadline-phase-count">{group.items.length} {group.items.length === 1 ? 'item' : 'items'}</span></div></div>
      <div className="deadline-event-list">{group.items.map(item => {
        const url = safeUrl(item.url);
        const statusClass = item.status.toLowerCase().includes('expir') ? 'expired' : item.status.toLowerCase().includes('person') ? 'onsite' : 'reference';
        return <article key={item.id} className="deadline-event">
          <div className="deadline-event-main"><strong>{item.title}</strong><span className="deadline-event-phase">{item.phase}</span></div>
          <div className="deadline-event-date"><CalendarDays size={14}/><span>{[item.day,item.date].filter(Boolean).join(' · ') || 'Date to be announced'}</span></div>
          <div className="deadline-event-action"><span className={`deadline-event-status ${statusClass}`}>{remaining(item)}</span><span className="deadline-event-links">{item.links?.length?item.links.map((link,index)=>{const href=safeUrl(link.url);return href?<a key={index} href={href} target="_blank" rel="noopener noreferrer">{link.label||'Submission'} <ArrowUpRight size={14}/></a>:null;}):url ? <a href={url} target="_blank" rel="noopener noreferrer">{item.action || 'Open form'} <ArrowUpRight size={14}/></a> : <span className="deadline-event-offline">{item.action || 'No submission link'} <ChevronRight size={13}/></span>}</span></div>
        </article>;
      })}{!group.items.length&&<p className="deadline-phase-empty">No deadlines are currently listed for this phase.</p>}</div>
    </section>)}</div> : <div className="card deadline-empty"><Search size={24}/><strong>No matching deadlines</strong><p>Try a different search.</p>{query && <button type="button" onClick={() => setQuery('')}>Clear search</button>}</div>}
  </>;
}
