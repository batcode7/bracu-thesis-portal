import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZES = [10, 20, 50, 100] as const;
export type PageSize = typeof PAGE_SIZES[number];

export function Pagination({total, page, pageSize, onPageChange, onPageSizeChange, disabled=false, label='Records'}:{
  total:number;
  page:number;
  pageSize:PageSize;
  onPageChange:(page:number)=>void;
  onPageSizeChange:(size:PageSize)=>void;
  disabled?:boolean;
  label?:string;
}){
  const pageCount=Math.max(1,Math.ceil(total/pageSize));
  const safePage=Math.max(0,Math.min(page,pageCount-1));
  const first=total===0?0:safePage*pageSize+1;
  const last=Math.min(total,(safePage+1)*pageSize);
  return <nav className="portal-pagination" aria-label={`${label} pagination`}>
    <span className="portal-page-range">{first}–{last} of {total}</span>
    <label className="portal-page-size">Rows per page
      <select aria-label={`${label} per page`} value={pageSize} disabled={disabled} onChange={event=>onPageSizeChange(Number(event.target.value) as PageSize)}>
        {PAGE_SIZES.map(size=><option key={size} value={size}>{size}</option>)}
      </select>
    </label>
    <div className="portal-page-buttons">
      <button type="button" disabled={disabled||safePage===0} onClick={()=>onPageChange(safePage-1)} aria-label={`Previous ${label.toLowerCase()} page`}><ChevronLeft size={16}/> Previous</button>
      <span>Page {safePage+1} of {pageCount}</span>
      <button type="button" disabled={disabled||safePage+1>=pageCount} onClick={()=>onPageChange(safePage+1)} aria-label={`Next ${label.toLowerCase()} page`}>Next <ChevronRight size={16}/></button>
    </div>
  </nav>;
}
