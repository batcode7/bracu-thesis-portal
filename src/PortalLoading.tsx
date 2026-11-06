type LoadingProps={label:string;detail?:string;compact?:boolean;fullPage?:boolean};

/** A consistent, accessible wait state for authenticated portal data. */
export default function PortalLoading({label,detail='Retrieving verified university records…',compact=false,fullPage=false}:LoadingProps){
  return <section className={`portal-loading ${compact?'is-compact':''} ${fullPage?'is-fullpage':''}`} role="status" aria-live="polite" aria-busy="true">
    {fullPage&&<div className="portal-loading-brand"><span>B</span><div><strong>BRAC University</strong><small>Thesis Evaluation Portal</small></div></div>}
    <div className="portal-loading-message"><span className="portal-loading-spinner" aria-hidden="true"/><div><strong>{label}</strong>{detail&&<p>{detail}</p>}</div></div>
    {!compact&&<div className="portal-loading-skeleton" aria-hidden="true"><span/><span/><span/></div>}
  </section>;
}
