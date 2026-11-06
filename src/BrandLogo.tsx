/** Locally bundled official BRAC University emblem from its Media Center. */
export function BrandLogo({landing=false}:{landing?:boolean}) {
  return <span className={`${landing?'welcome-mark':'brand-symbol'} bracu-logo-mark`}>
    <img src="/bracu-logo.png" alt="BRAC University logo" width="48" height="48" />
  </span>;
}
