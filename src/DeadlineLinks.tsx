import { Clock3, ExternalLink, FileText, Link2 } from 'lucide-react';
import { deadlineEntries, resourceLinks } from './deadlines-data';
import { DeadlineBoard } from './DeadlineBoard';

export function DeadlineLinks() {
  return <>
    <div className="deadline-source-note"><Clock3 size={16}/><span><strong>Reference snapshot.</strong> Dates and links were checked on 5 November 2026. They are not live-synced; the source omits years and marks the listed deadlines expired. Verify availability before submitting.</span></div>
    <DeadlineBoard entries={deadlineEntries}/>
    <div className="sectionheading"><h3>Reference materials</h3><span>External university resources</span></div><div className="resource-grid">{resourceLinks.map(item=><a href={item.url} key={item.title} target="_blank" rel="noopener noreferrer" className="card resource-card"><span className="resource-icon">{item.title.includes('policy') ? <FileText size={20}/> : <Link2 size={20}/>}</span><span><b>{item.title}</b><small>{item.detail}</small></span><ExternalLink size={15}/></a>)}</div>
    <p className="deadline-source">Source: <a href="https://docs.google.com/spreadsheets/d/1SkyO77YFde-N4bpxQ5lb07FH24hFINyR4JBgD47Xamk/edit?gid=760084043#gid=760084043" target="_blank" rel="noopener noreferrer">Thesis Registration [Student View] · Deadlines and Links</a>. Access to linked forms depends on their current permissions and availability.</p>
  </>;
}
