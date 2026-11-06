import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, GraduationCap } from 'lucide-react';
import { cachedLiveRequest, invalidateLiveCache } from './live-api';
import PortalLoading from './PortalLoading';

type StageCounts = { counts: { P1:number; P2:number; Defense:number; Completed:number } };

export default function SimpleOverview({token}:{token:string}){
  const [counts,setCounts]=useState<StageCounts['counts']|null>(null);
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;setBusy(true);setError('');
    cachedLiveRequest<StageCounts>(token,'overviewCounts',{},60000)
      .then(data=>{if(active)setCounts(data.counts);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));})
      .finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[token,revision]);
  const refresh=()=>{invalidateLiveCache('overviewCounts');setRevision(x=>x+1);};
  const items=[
    {key:'P1',title:'Pre-Thesis 1',description:'Current groups'},
    {key:'P2',title:'Pre-Thesis 2',description:'Current groups'},
    {key:'Defense',title:'Final Thesis',description:'Current groups'},
    {key:'Completed',title:'Completed',description:'Finished groups'},
  ] as const;
  return <div className="prime-stack">
    <section className="prime-intro"><div><span className="eyebrow">CURRENT STAGES</span><h2>Thesis groups at a glance</h2></div>
      <button className="lightbtn" type="button" disabled={busy} onClick={refresh}><Activity size={15}/> Refresh</button>
    </section>
    {error&&<div className="live-error" role="alert">{error}</div>}
    {busy&&!counts?<PortalLoading label="Loading thesis group counts" detail="Reading the current academic cache…"/>:counts&&<div className="prime-metrics prime-overview-four">
      {items.map(item=><div key={item.key} className="prime-metric"><span className="prime-metric-icon">{item.key==='Completed'?<CheckCircle2 size={18}/>:<GraduationCap size={18}/>}</span><span className="prime-metric-title">{item.title}</span><strong>{counts[item.key].toLocaleString()}</strong><small>{item.description}</small></div>)}
    </div>}
  </div>;
}
