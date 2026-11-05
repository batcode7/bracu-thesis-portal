import { useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, Check, ChevronRight, ClipboardCopy, GraduationCap, Mail, MapPin, ShieldCheck, Users, X } from 'lucide-react';
import type { Evaluation } from './data';
import type { StudentDashboard } from './portal-api';

type StudentPage = 'dashboard' | 'evaluations';
type StudentDestination = 'evaluations' | 'deadlines' | 'resources';
const phases = [
  { key: 'P1', title: 'Pre-Thesis 1', short: 'P1' },
  { key: 'P2', title: 'Pre-Thesis 2', short: 'P2' },
  { key: 'Defense', title: 'Final Thesis', short: 'Final' },
] as const;

export function studentPhase(stage: string): 'P1' | 'P2' | 'Defense' | null {
  const value = stage.trim().toLowerCase();
  if (/pre[\s-]*thesis[\s-]*1|^p1\b/.test(value)) return 'P1';
  if (/pre[\s-]*thesis[\s-]*2|^p2\b/.test(value)) return 'P2';
  if (value.includes('final') || value.includes('defense')) return 'Defense';
  return null;
}

function shortStatus(stage: string, index: number) {
  if (/deferred/i.test(stage)) return 'On hold';
  if (/completed/i.test(stage)) return 'Past stage';
  const active = phases.findIndex(phase => phase.key === studentPhase(stage));
  return active < 0 ? 'Not specified' : index < active ? 'Previous stage' : index === active ? 'Current stage' : 'Upcoming';
}

function CopyStudentId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <button className="student-copy" type="button" onClick={async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  }} aria-label="Copy thesis ID">{copied ? <Check size={15} /> : <ClipboardCopy size={15} />}{copied ? 'Copied' : 'Copy ID'}</button>;
}

function StudentOverview({ data, onNavigate }: { data: StudentDashboard; onNavigate: (destination: StudentDestination) => void }) {
  const { student, group } = data;
  const contacts = data.facultyContacts || [
    { slot: 'Supervisor 1', name: group.primarySupervisor, email: '', room: '', designation: '' },
    { slot: 'Supervisor 2', name: group.secondarySupervisor || '', email: '', room: '', designation: '' },
    { slot: 'Co-supervisor 1', name: group.coSupervisor1 || '', email: '', room: '', designation: '' },
    { slot: 'Co-supervisor 2', name: group.coSupervisor2 || '', email: '', room: '', designation: '' },
  ];
  const assigned = contacts.filter(contact => contact.name);
  const members = data.members || group.members.map(id => ({ id, name: id === student.id ? student.name : '' }));
  const currentPhase = studentPhase(group.stage);
  return <div className="student-stack">
    <section className="student-hero card">
      <div className="student-hero-top"><div><span className="eyebrow">MY THESIS WORKSPACE</span><p>Welcome back, {student.name.split(' ')[0]}.</p></div><span className="student-stage-badge"><GraduationCap size={14} /> {group.stage}</span></div>
      <h2>{group.title || 'Thesis title not yet recorded'}</h2>
      <div className="student-id-row"><div><span>Thesis / project ID</span><strong>{group.id}</strong></div><CopyStudentId value={group.id} /></div>
      <div className="student-hero-details"><div><small>Student ID</small><b>{student.id}</b></div><div><small>Research category</small><b>{group.type}</b></div><div><small>Group members</small><b>{members.length}</b></div></div>
    </section>

    <section className="card student-stage-panel"><div className="student-section-head"><div><span className="eyebrow">ACADEMIC PROGRESS</span><h3>Your current stage</h3></div><span className="student-section-caption">From your registered thesis group</span></div>
      <div className="student-phase-track">{phases.map((phase, index) => {
        const status = shortStatus(group.stage, index);
        return <div className={`student-phase ${status === 'Current stage' ? 'active' : ''}`} key={phase.key}><span className="student-phase-step">{String(index + 1).padStart(2, '0')}</span><div><b>{phase.title}</b><small>{status}</small></div>{status === 'Current stage' && <span className="student-current-dot" />}</div>;
      })}</div>
      {!currentPhase && <p className="student-stage-note">{group.stage === 'Completed' ? 'Your group is marked completed.' : group.stage === 'Deferred' ? 'Your group is currently deferred.' : 'No active thesis phase is available.'} Dates and results are tracked separately.</p>}
      <p className="student-stage-note">Stage labels describe group progression; evaluation marks appear only after official publication.</p>
      <div className="student-quick-actions"><button type="button" onClick={() => onNavigate('evaluations')}><ShieldCheck size={17} /> My evaluations <ArrowRight size={16} /></button><button type="button" onClick={() => onNavigate('deadlines')}><CalendarDays size={17} /> Stage deadlines <ArrowRight size={16} /></button><button type="button" onClick={() => onNavigate('resources')}><BookOpen size={17} /> Resources <ArrowRight size={16} /></button></div>
    </section>

    <section className="student-section"><div className="student-section-head"><div><span className="eyebrow">ACADEMIC GUIDANCE</span><h3>Your supervision team</h3></div><span className="student-section-caption">Official faculty directory when available</span></div>
      {assigned.length ? <div className="student-faculty-grid">{assigned.map(contact => <article key={contact.slot} className="card student-faculty-card"><span className="student-contact-role">{contact.slot}</span><h4>{contact.name}</h4>{contact.designation && <p>{contact.designation}</p>}<div className="student-contact-details">{contact.email && <a href={`mailto:${contact.email}`}><Mail size={15} /> {contact.email}</a>}{contact.room && <span><MapPin size={15} /> Room {contact.room}</span>}{!contact.email && !contact.room && <span>Contact details not listed in the faculty directory</span>}</div></article>)}</div> : <div className="card student-empty-card">No faculty assignment is recorded for this group.</div>}
    </section>

    <section className="student-section"><div className="student-section-head"><div><span className="eyebrow">RESEARCH GROUP</span><h3>Group members</h3></div><span className="student-section-caption">{members.length} {members.length === 1 ? 'member' : 'members'}</span></div>
      <div className="card student-members">{members.map(member => <div key={member.id}><span className="student-member-icon"><Users size={17} /></span><div><strong>{member.name || 'Group member'}</strong><small>{member.id}</small></div>{member.id === student.id && <span className="student-you">You</span>}</div>)}</div>
    </section>
  </div>;
}

function StudentEvaluations({ evaluations }: { evaluations: Evaluation[] }) {
  const [selected, setSelected] = useState<Evaluation | null>(null);
  const sorted = [...evaluations].sort((a,b) => ['P1','P2','Defense','Supervisor'].indexOf(a.phase) - ['P1','P2','Defense','Supervisor'].indexOf(b.phase));
  return <div className="student-stack"><section className="student-eval-intro"><span className="eyebrow">OFFICIAL FEEDBACK</span><h2>My evaluations</h2><p>Your individual marks and faculty comments appear here after they are formally released. Select any evaluation to inspect its details.</p></section>
    <div className="student-evaluation-grid">{sorted.map(item => {
      const published = item.publication === 'published' && !!item.comment?.trim() && item.score !== null;
      const title = item.phase === 'P1' ? 'Pre-Thesis 1' : item.phase === 'P2' ? 'Pre-Thesis 2' : item.phase === 'Defense' ? 'Final Defense' : 'Supervisor evaluation';
      return <button type="button" className="card student-eval-card" key={item.id} onClick={() => setSelected(item)}><div className="student-eval-top"><span>{item.semester}</span><span className={`student-result-tag ${published ? 'released' : ''}`}>{published ? 'Released' : 'Not released'}</span></div><h3>{title}</h3><div className="student-eval-mark">{published ? <><strong>{item.score}</strong><span>/ {item.maxScore}</span></> : <strong>—</strong>}</div><div className="student-eval-bottom"><span>{published ? 'View marks and faculty comments' : 'Evaluation details'}</span><span>Details <ChevronRight size={16} /></span></div></button>;
    })}</div>
    {selected && <div className="modaloverlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><section className="modalbox student-eval-modal" role="dialog" aria-modal="true" aria-label="Evaluation details"><div className="modalheader"><div><span className="eyebrow">{selected.semester}</span><h2>{selected.phase === 'P1' ? 'Pre-Thesis 1' : selected.phase === 'P2' ? 'Pre-Thesis 2' : selected.phase === 'Defense' ? 'Final Defense' : 'Supervisor'} evaluation</h2></div><button className="iconbtn" type="button" aria-label="Close evaluation details" onClick={() => setSelected(null)}><X size={19} /></button></div>
      {selected.publication === 'published' && !!selected.comment?.trim() && selected.score !== null ? <><div className="student-modal-score"><span>Released marks</span><strong>{selected.score} <small>/ {selected.maxScore}</small></strong></div>{selected.evaluator && <p className="student-modal-evaluator">Evaluated by {selected.evaluator}</p>}<h3>Faculty feedback</h3><blockquote className="live-feedback">{selected.comment}</blockquote></> : <div className="mutedbox">Marks and comments have not both been approved for release. Check back after the evaluation has been published.</div>}
    </section></div>}
  </div>;
}

export default function StudentExperience({ data, page, onNavigate }: { data: StudentDashboard; page: StudentPage; onNavigate: (destination: StudentDestination) => void }) {
  return page === 'evaluations' ? <StudentEvaluations evaluations={data.evaluations} /> : <StudentOverview data={data} onNavigate={onNavigate} />;
}
