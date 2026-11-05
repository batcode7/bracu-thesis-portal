import { useMemo, useState } from 'react';
import { ArrowUpRight, CalendarDays, ChevronRight, Search } from 'lucide-react';

export type PortalDeadline = { id: string; phase: string; title: string; date: string; status: string; action: string; url?: string };
const phases = ['All', 'General', 'P1', 'P2', 'Defense', 'Early Defense'];
const names: Record<string,string> = { General:'General submissions',P1:'Pre-Thesis 1',P2:'Pre-Thesis 2',Defense:'Final Defense','Early Defense':'Early Defense' };

function safeUrl(value?: string) {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : undefined; } catch { return undefined; }
}

/** The same organized view powers snapshot/demo and authenticated live data. */
export function DeadlineBoard({ entries, lockedPhase, availablePhases }: { entries: PortalDeadline[]; lockedPhase?: string; availablePhases?: string[] }) {
  const [phase, setPhase] = useState('All');
  const [query, setQuery] = useState('');
  const selectedPhase = lockedPhase || phase;
  const visible = useMemo(() => entries.filter(item =>
    (selectedPhase === 'All' || selectedPhase === item.phase) &&
    [item.title, item.action, item.date, item.phase, item.status].some(value => value.toLowerCase().includes(query.trim().toLowerCase()))
  ), [entries, selectedPhase, query]);
  const grouping = phases.slice(1).map(name => ({ name, items: visible.filter(item => item.phase === name) })).filter(group => group.items.length);
  const extra = visible.filter(item => !phases.includes(item.phase));
  if (extra.length) grouping.push({ name: 'Other', items: extra });
  return <>
    <div className="deadline-board-controls">
      <div className="deadline-filter-group" role="group" aria-label="Filter submissions by stage">
        {(lockedPhase ? [lockedPhase] : availablePhases ? ['All',...phases.slice(1).filter(item=>availablePhases.includes(item))] : phases).map(item => <button type="button" key={item} disabled={!!lockedPhase} aria-pressed={selectedPhase === item} className={selectedPhase === item ? 'selected' : ''} onClick={() => setPhase(item)}>{item}{item === 'All' ? <span>{entries.length}</span> : null}</button>)}
      </div>
      <label className="deadline-board-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find an event or form" aria-label="Search deadlines and forms"/></label>
    </div>
    <div className="deadline-board-summary"><span>{visible.length} {visible.length === 1 ? 'item' : 'items'} {selectedPhase === 'All' ? 'across all phases' : `for ${selectedPhase}`}</span><span>Dates shown as listed in source</span></div>
    {grouping.length ? <div className="deadline-groups">{grouping.map(group => <section key={group.name} className="deadline-phase-section" aria-label={names[group.name] || group.name}>
      <div className="deadline-phase-heading"><div><span className="deadline-phase-marker"/><h3>{names[group.name] || group.name}</h3><span className="deadline-phase-count">{group.items.length} {group.items.length === 1 ? 'item' : 'items'}</span></div></div>
      <div className="deadline-event-list">{group.items.map(item => {
        const url = safeUrl(item.url);
        const statusClass = item.status.toLowerCase().includes('expir') ? 'expired' : item.status.toLowerCase().includes('person') ? 'onsite' : 'reference';
        return <article key={item.id} className="deadline-event">
          <div className="deadline-event-main"><strong>{item.title}</strong><span className="deadline-event-phase">{item.phase}</span></div>
          <div className="deadline-event-date"><CalendarDays size={14}/><span>{item.date || 'Not specified'}</span></div>
          <div className="deadline-event-action"><span className={`deadline-event-status ${statusClass}`}>{item.status}</span>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{item.action || 'Open form'} <ArrowUpRight size={14}/></a> : <span className="deadline-event-offline">{item.action || 'No link'} <ChevronRight size={13}/></span>}</div>
        </article>;
      })}</div>
    </section>)}</div> : <div className="card deadline-empty"><Search size={24}/><strong>{lockedPhase ? 'No deadlines listed for your stage' : 'No matching deadlines'}</strong><p>{lockedPhase ? 'Only deadlines for your current thesis stage appear here. Check with the thesis office for updates.' : 'Try a different search or choose another evaluation phase.'}</p>{query && <button type="button" onClick={() => { setPhase('All'); setQuery(''); }}>Clear search</button>}</div>}
  </>;
}
