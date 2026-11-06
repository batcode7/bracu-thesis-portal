import type { ReactNode } from 'react';
import { BookOpenCheck, CheckCircle2, GraduationCap, LockKeyhole, ShieldCheck } from 'lucide-react';
import { PublicAnnouncements } from './Announcements';
import { BrandLogo } from './BrandLogo';

export function PortalWelcome({ children, isDemo = false }: { children: ReactNode; isDemo?: boolean }) {
  return <div className="portal-welcome">
    <header className="welcome-header">
      <div className="welcome-brand"><BrandLogo landing/><div><strong>BRAC University</strong><small>CSE · Thesis Evaluation Portal</small></div></div>
      <span className="welcome-security"><LockKeyhole size={13}/> University access</span>
    </header>
    <main className="welcome-main">
      <section className="welcome-overview" aria-label="Portal introduction">
        <div className="welcome-kicker"><span className="welcome-kicker-dot"/> ACADEMIC PROGRESS, SIMPLIFIED</div>
        <h1>Your thesis journey, <em>all in one place.</em></h1>
        <p>A quiet, secure space to follow your research progress, review evaluation results and stay informed throughout your thesis journey.</p>
        <div className="welcome-stages" aria-label="Thesis evaluation phases">
          <div><span className="welcome-stage-number">01</span><span>Pre-Thesis 1</span><CheckCircle2 size={16}/></div>
          <div><span className="welcome-stage-number">02</span><span>Pre-Thesis 2</span><CheckCircle2 size={16}/></div>
          <div><span className="welcome-stage-number">03</span><span>Final Defense</span><GraduationCap size={17}/></div>
        </div>
        <div className="welcome-footnote"><BookOpenCheck size={17}/><span>Students see their own results. Supervisors see their assigned groups. Administrative access is restricted by role.</span></div>
      </section>
      <section className="welcome-auth card" aria-label="Sign in">
        <div className="welcome-auth-icon"><ShieldCheck size={20}/></div>
        <div className="welcome-auth-kicker">SECURE SIGN-IN</div>
        <h2>Welcome to your portal</h2>
        <p>Continue with your BRAC University Google Workspace account.</p>
        <div className="welcome-signin-slot">{children}</div>
        <div className="welcome-domain-note"><span>@bracu.ac.bd</span><span>@g.bracu.ac.bd</span></div>
        <div className="welcome-auth-footer"><LockKeyhole size={14}/> {isDemo ? 'This preview uses fictional records only.' : 'Your access is verified for every request.'}</div>
      </section>
    </main>
    <PublicAnnouncements isDemo={isDemo} />
    <footer className="welcome-bottom"><span>© {new Date().getFullYear()} UG Thesis Committee. All rights reserved.</span><span>BRAC University · Department of Computer Science and Engineering</span></footer>
  </div>;
}
