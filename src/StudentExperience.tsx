import { useState } from 'react';
import { Check, ChevronRight, ClipboardCopy, GraduationCap, Mail, MapPin, X } from 'lucide-react';
import type { Evaluation } from './data';
import type { StudentDashboard } from './portal-api';

type StudentPage = 'dashboard' | 'evaluations';
type StudentDestination = 'evaluations' | 'deadlines' | 'resources';
export function studentPhase(stage: string): 'P1' | 'P2' | 'Defense' | null {
  const value = stage.trim().toLowerCase();
  if (/pre[\s-]*thesis[\s-]*1|^p1\b/.test(value)) return 'P1';
  if (/pre[\s-]*thesis[\s-]*2|^p2\b/.test(value)) return 'P2';
  if (value.includes('final') || /\bdef(?:ense|ence)?\b/.test(value)) return 'Defense';
  return null;
}

function CopyStudentId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <button className="student-copy" type="button" onClick={async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  }} aria-label="Copy research group ID">{copied ? <Check size={15} /> : <ClipboardCopy size={15} />}{copied ? 'Copied' : 'Copy ID'}</button>;
}

function StudentOverview({ data }: { data: StudentDashboard }) {
  const { student, group } = data;
  const contacts = data.facultyContacts || [
    { slot: 'Supervisor 1', name: group.primarySupervisor, email: '', room: '', designation: '' },
    { slot: 'Supervisor 2', name: group.secondarySupervisor || '', email: '', room: '', designation: '' },
    { slot: 'Co-supervisor 1', name: group.coSupervisor1 || '', email: '', room: '', designation: '' },
    { slot: 'Co-supervisor 2', name: group.coSupervisor2 || '', email: '', room: '', designation: '' },
  ];
  const assigned = contacts.filter(contact => contact.name);
  const members = data.members || group.members.map(id => ({ id, name: id === student.id ? student.name : '', email: '' }));
  return <div className="student-stack">
    <section className="student-hero card">
      <div className="student-hero-top"><div><span className="eyebrow">MY THESIS WORKSPACE</span><p>Welcome back, {student.name.split(' ')[0]}.</p></div><span className="student-stage-badge"><GraduationCap size={14} /> {group.stage}</span></div>
      <h2>{group.title || 'Thesis title not yet recorded'}</h2>
      <div className="student-id-row"><div><span>{group.type} ID</span><strong>{group.id}</strong></div><CopyStudentId value={group.id} /></div>
      <div className="student-hero-details"><div><small>Student ID</small><b>{student.id}</b></div><div><small>Research category</small><b>{group.type}</b></div><div><small>Group members</small><b>{members.length}</b></div></div>
    </section>

    <section className="student-section"><div className="student-section-head"><div><span className="eyebrow">RESEARCH GROUP</span><h3>Group members</h3></div><span className="student-section-caption">{members.length} {members.length === 1 ? 'member' : 'members'}</span></div>
      <div className="card student-members"><div className="tableoverflow"><table className="student-member-table"><thead><tr><th>Student name</th><th>Student ID</th><th>Email</th></tr></thead><tbody>{members.map(member=><tr key={member.id}><td><strong>{member.name||'Group member'}</strong>{member.id===student.id&&<span className="student-you">You</span>}</td><td>{member.id}</td><td>{member.email||'Not listed'}</td></tr>)}</tbody></table></div></div>
    </section>
    <section className="student-section"><div className="student-section-head"><div><span className="eyebrow">ACADEMIC GUIDANCE</span><h3>Your supervision team</h3></div><span className="student-section-caption">Official faculty directory when available</span></div>
      {assigned.length ? <div className="student-faculty-grid">{assigned.map(contact => <article key={contact.slot} className="card student-faculty-card"><span className="student-contact-role">{contact.slot}</span><h4>{contact.name}</h4>{contact.designation && <p>{contact.designation}</p>}<div className="student-contact-details">{contact.email && <a href={`mailto:${contact.email}`}><Mail size={15} /> {contact.email}</a>}{contact.room && <span><MapPin size={15} /> Room {contact.room}</span>}{!contact.email && !contact.room && <span>Contact details not listed in the faculty directory</span>}</div></article>)}</div> : <div className="card student-empty-card">No faculty assignment is recorded for this group.</div>}
    </section>
  </div>;
}

function StudentEvaluations({ evaluations }: { evaluations: Evaluation[] }) {
  const [selected, setSelected] = useState<Evaluation | null>(null);
  const sorted = [...evaluations].sort((a,b) => ['P1','P2','Defense','Supervisor'].indexOf(a.phase) - ['P1','P2','Defense','Supervisor'].indexOf(b.phase));
  return <div className="student-stack"><section className="student-eval-intro"><span className="eyebrow">OFFICIAL FEEDBACK</span><h2>My evaluations</h2><p>Available marks from the permanent master and recorded panel comments are shown independently. Select an evaluation to see its details.</p></section>
    <div className="student-evaluation-grid">{sorted.map(item => {
      const hasScore=item.score!==null;
      const hasComment=!!item.comment?.trim();
      const title = item.phase === 'P1' ? 'Pre-Thesis 1' : item.phase === 'P2' ? 'Pre-Thesis 2' : item.phase === 'Defense' ? 'Final Defense' : 'Supervisor evaluation';
      return <button type="button" className="card student-eval-card" key={item.id} onClick={() => setSelected(item)}><div className="student-eval-top"><span>{item.semester}</span><span className={`student-result-tag ${hasScore||hasComment?'available':''}`}>{hasScore&&hasComment?'Marks & comments':hasScore?'Mark recorded':hasComment?'Comment recorded':'Not recorded'}</span></div><h3>{title}</h3><div className="student-eval-mark">{hasScore ? <><strong>{item.score}</strong><span>/ {item.maxScore}</span></> : <strong>—</strong>}</div><div className="student-eval-bottom"><span>{hasScore||hasComment?'View available evaluation details':'No evaluation data yet'}</span><span>Details <ChevronRight size={16} /></span></div></button>;
    })}</div>
    {selected && <div className="modaloverlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><section className="modalbox student-eval-modal" role="dialog" aria-modal="true" aria-label="Evaluation details"><div className="modalheader"><div><span className="eyebrow">{selected.semester}</span><h2>{selected.phase === 'P1' ? 'Pre-Thesis 1' : selected.phase === 'P2' ? 'Pre-Thesis 2' : selected.phase === 'Defense' ? 'Final Defense' : 'Supervisor'} evaluation</h2></div><button className="iconbtn" type="button" aria-label="Close evaluation details" onClick={() => setSelected(null)}><X size={19} /></button></div>
      {selected.score!==null&&<div className="student-modal-score"><span>Recorded mark</span><strong>{selected.score} <small>/ {selected.maxScore}</small></strong></div>}
      {selected.comment?.trim()&&<>{selected.evaluator&&<p className="student-modal-evaluator">Evaluated by {selected.evaluator}</p>}<h3>Faculty feedback</h3><blockquote className="live-feedback">{selected.comment}</blockquote></>}
      {selected.score===null&&!selected.comment?.trim()&&<div className="mutedbox">No mark or faculty comment is recorded for this evaluation yet.</div>}
    </section></div>}
  </div>;
}

export default function StudentExperience({ data, page, onNavigate }: { data: StudentDashboard; page: StudentPage; onNavigate: (destination: StudentDestination) => void }) {
  void onNavigate;
  return page === 'evaluations' ? <StudentEvaluations evaluations={data.evaluations} /> : <StudentOverview data={data} />;
}
