import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, FileText, Megaphone, Newspaper, Pin, Plus, Save, Search, X } from 'lucide-react';
import { liveRequest } from './live-api';
import PortalLoading from './PortalLoading';
import { Pagination, type PageSize } from './Pagination';

type AnnouncementKind = 'Notice' | 'Event' | 'News' | 'Deadline';
type AnnouncementStatus = 'draft' | 'published' | 'archived';
type PublicItem = {
  id: string; kind: AnnouncementKind; title: string; body: string; eventDate: string;
  location: string; url: string; pinned: boolean; updatedAt: string;
};
type AdminItem = PublicItem & { status: AnnouncementStatus; createdAt: string; author: string };
type FormState = Pick<PublicItem, 'kind' | 'title' | 'body' | 'eventDate' | 'location' | 'url' | 'pinned'> & { id: string };
const emptyForm: FormState = { id: '', kind: 'Notice', title: '', body: '', eventDate: '', location: '', url: '', pinned: false };

function safeLink(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
const niceDate = (value: string) => {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-BD', { day: 'numeric', month: 'short', year: 'numeric' });
};

function AnnouncementCard({ item }: { item: PublicItem }) {
  const url = safeLink(item.url);
  return <article className="welcome-news-card">
    <div className="welcome-news-meta"><span className={`welcome-news-kind kind-${item.kind.toLowerCase()}`}>{item.kind}</span>{item.pinned && <span className="welcome-news-pinned"><Pin size={12} /> Featured</span>}</div>
    <h3>{item.title}</h3>
    <p>{item.body}</p>
    {(item.eventDate || item.location) && <div className="welcome-news-detail"><CalendarDays size={14} /><span>{[niceDate(item.eventDate), item.location].filter(Boolean).join(' · ')}</span></div>}
    {url && <a href={url} target="_blank" rel="noopener noreferrer">More details <ArrowUpRight size={14} /></a>}
  </article>;
}

export function PublicAnnouncements({ isDemo }: { isDemo: boolean }) {
  const [items, setItems] = useState<PublicItem[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(!isDemo);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (isDemo) return;
    const controller = new AbortController();
    fetch('/v1/announcements', { signal: controller.signal }).then(async response => {
      const value = await response.json();
      if (!response.ok || value?.ok !== true || !Array.isArray(value?.data?.items)) throw new Error('Feed unavailable');
      setItems(value.data.items);
    }).catch(error => { if (error?.name !== 'AbortError') setUnavailable(true); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [isDemo]);
  return <section className="welcome-news" aria-labelledby="welcome-news-heading">
    <div className="welcome-news-heading"><div><span className="welcome-kicker"><span className="welcome-kicker-dot" /> STAY INFORMED</span><h2 id="welcome-news-heading">News & events</h2><p>Academic announcements and upcoming thesis activities, shared by the portal administrators.</p></div><span className="welcome-news-public"><Megaphone size={15} /> Public updates</span></div>
    {busy ? <><PortalLoading compact label="Loading news and events" detail="Checking published university announcements…"/><div className="welcome-news-grid" aria-hidden="true"><div className="welcome-news-skeleton" /><div className="welcome-news-skeleton" /><div className="welcome-news-skeleton" /></div></> :
      items.length ? <><div className="welcome-news-grid">{items.slice(0, showAll ? 6 : 3).map(item => <AnnouncementCard key={item.id} item={item} />)}</div>{items.length > 3 && <button className="welcome-news-toggle" type="button" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show fewer updates' : `View all ${items.length} updates`} <ArrowRight size={15} /></button>}</> :
      <div className="welcome-news-empty"><div className="welcome-news-empty-icon"><Newspaper size={20} /></div><div><strong>{unavailable ? 'Updates are temporarily unavailable' : 'No announcements published yet'}</strong><p>{unavailable ? 'You can still sign in and access your academic records.' : 'When the department publishes an event or notice, it will appear here.'}</p></div></div>}
  </section>;
}

export function AdminAnnouncements({ token, readOnly = false }: { token: string; readOnly?: boolean }) {
  const [items, setItems] = useState<AdminItem[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [query, setQuery] = useState('');
  const [page,setPage]=useState(0),[pageSize,setPageSize]=useState<PageSize>(10);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = async () => {
    setBusy(true);
    try { const result = await liveRequest<{ items: AdminItem[] }>(token, 'announcements'); setItems(result.items); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, [token]);
  const filtered = useMemo(() => items.filter(item => [item.title, item.kind, item.body, item.status].some(value => value.toLowerCase().includes(query.toLowerCase().trim()))).sort((a,b) => Number(b.pinned)-Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)), [items, query]);
  useEffect(()=>setPage(0),[query,pageSize]);
  const save = async (status: 'draft' | 'published') => {
    if (saving || readOnly) return;
    if (form.title.trim().length < 4 || form.body.trim().length < 10) { setError('Enter a title (4+ characters) and a description (10+ characters).'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await liveRequest<{ item: AdminItem }>(token, 'saveAnnouncement', { ...form, status });
      setForm({ id: result.item.id, kind: result.item.kind, title: result.item.title, body: result.item.body, eventDate: result.item.eventDate, location: result.item.location, url: result.item.url, pinned: result.item.pinned });
      setMessage(status === 'published' ? 'Announcement published. It may take up to 90 seconds to appear on the landing page.' : 'Draft saved. It is not visible publicly.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setSaving(false); }
  };
  const changeStatus = async (id: string, status: AnnouncementStatus) => {
    if (saving || readOnly) return;
    setSaving(true); setError(''); setMessage('');
    try { await liveRequest(token, 'statusAnnouncement', { id, status }); setMessage(status === 'published' ? 'Published successfully.' : status === 'draft' ? 'Unpublished and saved as draft.' : 'Announcement archived.'); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setSaving(false); }
  };
  const edit = (item: AdminItem) => { setForm({ id: item.id, kind: item.kind, title: item.title, body: item.body, eventDate: item.eventDate, location: item.location, url: item.url, pinned: item.pinned }); setError(''); setMessage(''); };
  return <div className="news-admin-layout">
    <div className="news-admin-intro"><span className="eyebrow">PUBLIC COMMUNICATIONS</span><h2>Landing page news & events</h2><p>Publish notices without changing your website code. Everything marked “Published” is visible to visitors before login; never include student records or confidential details.</p></div>
    {error && <div className="live-error" role="alert">{error}</div>}
    {message && <div className="infobar" role="status"><CheckCircle2 size={16} /> {message}</div>}
    <div className="news-admin-columns">
      <section className="card news-admin-list"><div className="news-admin-list-head"><div><h3>Announcements</h3><span>{items.length} total · {items.filter(item => item.status === 'published').length} published</span></div>{!readOnly && <button className="lightbtn" onClick={() => { setForm(emptyForm); setError(''); }}><Plus size={15} /> New</button>}</div>
        <label className="searchbox"><Search size={16} /><input placeholder="Find an announcement…" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search announcements" /></label>
        {busy ? <PortalLoading compact label="Loading announcements" detail="Fetching your saved notices and publication status…"/> : filtered.length ? <div className="news-admin-items">{filtered.slice(page*pageSize,(page+1)*pageSize).map(item => <article key={item.id} className={`news-admin-item ${form.id === item.id ? 'selected' : ''}`}><div className="news-admin-item-main"><div><span className="welcome-news-kind">{item.kind}</span><span className={`news-status status-${item.status}`}>{item.status}</span>{item.pinned && <Pin size={13} />}</div><h4>{item.title}</h4><p>{item.body}</p><small>Updated {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('en-BD') : '—'}</small></div><div className="news-admin-actions">{!readOnly && <button className="lightbtn" type="button" onClick={() => edit(item)}>Edit</button>}{!readOnly && item.status !== 'published' && <button className="lightbtn" type="button" disabled={saving} onClick={() => void changeStatus(item.id, 'published')}>Publish</button>}{!readOnly && item.status === 'published' && <button className="lightbtn" type="button" disabled={saving} onClick={() => void changeStatus(item.id, 'draft')}>Unpublish</button>}{!readOnly && item.status !== 'archived' && <button className="lightbtn" type="button" disabled={saving} onClick={() => void changeStatus(item.id, 'archived')}>Archive</button>}</div></article>)}</div> : <div className="news-admin-blank"><Megaphone size={21} /><strong>No announcements found</strong><p>Create your first public notice or try another search.</p></div>}
        {!busy&&<Pagination label="Announcements" total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} disabled={saving}/>}
      </section>
      {!readOnly && <section className="card news-admin-editor"><div className="news-admin-editor-title"><div><span className="eyebrow">{form.id ? 'EDIT ANNOUNCEMENT' : 'NEW ANNOUNCEMENT'}</span><h3>{form.id ? 'Update an announcement' : 'Create an announcement'}</h3></div>{form.id && <button className="iconbtn" aria-label="Clear editor" onClick={() => setForm(emptyForm)}><X size={17}/></button>}</div>
        <form onSubmit={event => { event.preventDefault(); void save('draft'); }}>
          <label>Category<select value={form.kind} onChange={event => setForm({...form,kind:event.target.value as AnnouncementKind})}><option>Notice</option><option>Event</option><option>News</option><option>Deadline</option></select></label>
          <label>Title<input value={form.title} onChange={event => setForm({...form,title:event.target.value})} placeholder="e.g. Pre-Thesis 1 seminar" maxLength={160} required /></label>
          <label>Description<textarea value={form.body} onChange={event => setForm({...form,body:event.target.value})} placeholder="What should students and faculty know?" rows={5} maxLength={1200} required /><small>{form.body.length} / 1200 characters</small></label>
          <div className="news-admin-form-row"><label>Date (optional)<input type="date" value={form.eventDate} onChange={event => setForm({...form,eventDate:event.target.value})}/></label><label>Location (optional)<input value={form.location} onChange={event => setForm({...form,location:event.target.value})} placeholder="Room or online" maxLength={160}/></label></div>
          <label>More information link (optional)<input type="url" value={form.url} onChange={event => setForm({...form,url:event.target.value})} placeholder="https://…" /></label>
          <label className="news-pin-label"><input type="checkbox" checked={form.pinned} onChange={event => setForm({...form,pinned:event.target.checked})}/><Pin size={15}/> Feature this announcement first</label>
          <div className="news-admin-save"><button type="submit" className="lightbtn" disabled={saving}><Save size={15}/> Save draft</button><button type="button" className="primarybtn" disabled={saving} onClick={() => void save('published')}><Megaphone size={15}/> {form.id ? 'Save & publish' : 'Publish now'} <ArrowRight size={15}/></button></div>
        </form>
      </section>}
    </div>
    {readOnly && <div className="prime-preview-safety"><FileText size={16}/> Read-only role preview: announcement editing is disabled.</div>}
  </div>;
}
