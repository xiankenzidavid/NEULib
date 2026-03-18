"use client";

/**
 * page.tsx — Main router (Requirement Update)
 *
 * Views:
 *   selection   — Landing page with 3 buttons
 *   terminal    — Visitor Kiosk (tap in/out)
 *   registration— New NEU user fills profile → pending visitor
 *   admin       — Admin/Staff Dashboard
 *
 * Student Portal is deprecated.
 * Approved students use the Kiosk to tap in/out.
 * Pending/new users are routed to RegistrationPage.
 * Admins switching to kiosk → after purpose logged → auto-return to admin.
 */

import { useState, useEffect } from 'react';
import TerminalView from '@/components/terminal/TerminalView';
import AdminDashboard from '@/components/admin/AdminDashboard';
import RegistrationPage from '@/components/student/RegistrationPage';
import WelcomeMessage from '@/components/admin/WelcomeMessage';
import { ShieldCheck, UserCheck, Loader2, UserCircle, ArrowRight, Radio, X, FileEdit } from 'lucide-react';
import { useUser, useAuth, useFirestore } from '@/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getDocs, collection, query, where, limit } from 'firebase/firestore';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { UserRecord } from '@/lib/firebase-schema';

type AppView = 'selection' | 'terminal' | 'registration' | 'admin';

const SUPER_ADMIN_EMAIL = "shawndavidsobremontedomingo@gmail.com";

export default function Home() {
  const [view, setViewRaw]                          = useState<AppView>('selection');
  const [resolvedUser, setResolvedUser]             = useState<UserRecord | null>(null);
  const [hydrated, setHydrated]                     = useState(false);
  const [isAdminLoginOpen, setIsAdminLoginOpen]     = useState(false);
  const [isAuthenticating, setIsAuthenticating]     = useState(false);
  const [notRegisteredEmail, setNotRegisteredEmail] = useState<string | null>(null);
  const [wrongDomainEmail,   setWrongDomainEmail]   = useState<string | null>(null);
  const [showAdminWelcome,   setShowAdminWelcome]   = useState(false);
  // Credential request: NEU mail auth gate on landing page
  const [isCredAuthOpen, setIsCredAuthOpen]         = useState(false);
  const [credAuthUser,   setCredAuthUser]           = useState<UserRecord | null>(null);

  const { user, isUserLoading } = useUser();
  const auth  = useAuth();
  const db    = useFirestore();
  const { toast } = useToast();

  const setView = (v: AppView) => {
    setViewRaw(v);
    if (v === 'selection' || v === 'terminal') {
      sessionStorage.removeItem('neu_view');
      sessionStorage.removeItem('neu_user_email');
      sessionStorage.removeItem('neu_user_role');
    } else {
      sessionStorage.setItem('neu_view', v);
    }
  };

  const setResolvedUserAndSave = (u: UserRecord | null) => {
    setResolvedUser(u);
    if (u) {
      sessionStorage.setItem('neu_user_email', u.email || '');
      sessionStorage.setItem('neu_user_role',  u.role  || '');
    }
  };

  useEffect(() => {
    const savedView  = sessionStorage.getItem('neu_view') as AppView | null;
    const savedEmail = sessionStorage.getItem('neu_user_email');
    const savedRole  = sessionStorage.getItem('neu_user_role') as UserRecord['role'] | null;
    if (savedView && ['admin', 'registration'].includes(savedView)) setViewRaw(savedView);
    if (savedEmail && savedRole && savedView === 'admin') {
      setResolvedUser({ id: '', email: savedEmail, role: savedRole, firstName: '', lastName: '', status: 'active' } as UserRecord);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!isUserLoading && !user && (view === 'registration' || view === 'admin')) {
      setView('selection');
    }
  }, [user, isUserLoading, hydrated]);

  async function resolveUserByEmail(email: string): Promise<UserRecord | null> {
    // Retry up to 3 times with backoff — Firebase auth token sometimes takes
    // a moment to propagate to Firestore after signInWithPopup resolves.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email), limit(1)));
        if (!snap.empty) return snap.docs[0].data() as UserRecord;
        // Found nothing — could be a new user, return null after first clean success
        return null;
      } catch (err: any) {
        // If it's a permissions error and we have retries left, wait and retry
        if ((err?.code === 'permission-denied' || err?.message?.includes('permission')) && attempt < 2) {
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        // Any other error or out of retries — treat as no record found
        console.warn('[resolveUserByEmail] attempt', attempt + 1, 'failed:', err?.code || err?.message);
        return null;
      }
    }
    return null;
  }

  // ── Admin login ─────────────────────────────────────────────────────────────
  const handleAdminLogin = async () => {
    setIsAuthenticating(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const email  = result.user.email!;

      // Force token refresh so Firestore reads immediately after popup use fresh credentials
      try { await result.user.getIdToken(true); } catch { /* non-fatal */ }
      const userRecord  = await resolveUserByEmail(email);
      const isWhitelisted = email.toLowerCase() === SUPER_ADMIN_EMAIL;

      if (userRecord && (userRecord.role === 'admin' || userRecord.role === 'super_admin')) {
        setResolvedUserAndSave(userRecord);
        setIsAdminLoginOpen(false);
        setShowAdminWelcome(true);
        setView('admin');   // ← set view immediately so AdminDashboard mounts
        return;
      }
      if (isWhitelisted) {
        // Build a minimal resolvedUser from the Firebase auth result so
        // AdminDashboard doesn't show "Access Restricted" for the owner email
        const nameParts = (result.user.displayName || 'Super Admin').split(' ');
        const ownerRecord: UserRecord = {
          id:         userRecord?.id || '',
          firstName:  nameParts.slice(0, -1).join(' ') || nameParts[0] || 'Super',
          middleName: '',
          lastName:   nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'Admin',
          email:      email,
          role:       'super_admin',
          status:     'active',
        } as UserRecord;
        setResolvedUserAndSave(ownerRecord);
        setIsAdminLoginOpen(false);
        setShowAdminWelcome(true);
        setView('admin');
        return;
      }
      await signOut(auth);
      setNotRegisteredEmail(email);
      setIsAdminLoginOpen(false);
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        toast({ title: "Authentication Failed", description: err?.message || "Please try again.", variant: "destructive" });
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  // ── Student / Kiosk login (landing "Student Portal" button) ─────────────────
  const handleStudentLogin = async () => {
    setIsAuthenticating(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const email  = result.user.email!;

      if (!email.endsWith('@neu.edu.ph') && email.toLowerCase() !== SUPER_ADMIN_EMAIL) {
        await signOut(auth);
        setWrongDomainEmail(email);
        return;
      }

      // Force token refresh before Firestore query
      try { await result.user.getIdToken(true); } catch { /* non-fatal */ }
      const userRecord = await resolveUserByEmail(email);

      // Admin clicking student → go to kiosk, will auto-return after
      if (userRecord && (userRecord.role === 'admin' || userRecord.role === 'super_admin')) {
        setResolvedUserAndSave(userRecord);
        setView('terminal');
        return;
      }

      // Registered student → kiosk
      if (userRecord && userRecord.role === 'student' && userRecord.status === 'active') {
        setResolvedUser(userRecord);
        setView('terminal');
        return;
      }

      // Pending visitor → kiosk (they can still tap in while pending)
      if (userRecord && (userRecord.role === 'visitor' || userRecord.status === 'pending')) {
        setResolvedUser(userRecord);
        setView('terminal');
        return;
      }

      // New user → registration
      const nameParts = (result.user.displayName || '').trim().split(' ');
      const lastName  = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
      const firstName = nameParts.slice(0, nameParts.length > 1 ? -1 : 1).join(' ');
      setResolvedUser({ id: '', firstName, middleName: '', lastName, email, role: 'visitor', status: 'pending' } as UserRecord);
      setView('registration');

    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        toast({ title: "Authentication Failed", description: err?.message || "Please try again.", variant: "destructive" });
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  // ── Register button — check NEU mail, if new user → registration ──────────────
  const handleRegisterClick = async () => {
    setIsAuthenticating(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const email  = result.user.email!;

      if (!email.endsWith('@neu.edu.ph') && email.toLowerCase() !== SUPER_ADMIN_EMAIL) {
        await signOut(auth);
        setWrongDomainEmail(email);
        return;
      }

      // Force token refresh before Firestore query
      try { await result.user.getIdToken(true); } catch { /* non-fatal */ }
      const userRecord = await resolveUserByEmail(email);

      if (userRecord) {
        // Already registered — show popup then redirect to kiosk after 5s
        setResolvedUser(userRecord);
        setAlreadyRegUser(userRecord);
        setAlreadyRegistered(true);
        setTimeout(() => {
          setAlreadyRegistered(false);
          setView('terminal');
        }, 5000);
        return;
      }

      // Not registered — toast notification + go to registration
      toast({
        title: 'User not registered',
        description: 'Please proceed to registration.',
      });
      const nameParts = (result.user.displayName || '').trim().split(' ');
      const lastName  = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
      const firstName = nameParts.slice(0, nameParts.length > 1 ? -1 : 1).join(' ');
      setResolvedUser({ id: '', firstName, middleName: '', lastName, email, role: 'visitor', status: 'pending' } as UserRecord);
      setView('registration');

    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        toast({ title: "Authentication Failed", variant: "destructive" });
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  // ── Credential change auth gate (landing page button) ───────────────────────
  const handleCredentialLogin = async () => {
    setIsAuthenticating(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const email  = result.user.email!;

      if (!email.endsWith('@neu.edu.ph') && email.toLowerCase() !== SUPER_ADMIN_EMAIL) {
        await signOut(auth);
        setWrongDomainEmail(email);
        setIsCredAuthOpen(false);
        return;
      }

      const userRecord = await resolveUserByEmail(email);
      if (!userRecord) {
        toast({ title: 'Not registered', description: 'Please complete registration first.', variant: 'destructive' });
        setIsCredAuthOpen(false);
        return;
      }

      setCredAuthUser(userRecord);
      setIsCredAuthOpen(false);
      // Open credential request modal — re-use existing RegistrationPage flow
      // by routing to a credential-change modal (the CredentialRequestModal in StudentDashboard)
      // For now: import and show CredentialRequestModal inline
      toast({ title: 'Authenticated', description: 'You can now submit a credential change request.' });
      setShowCredModal(true);
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        toast({ title: "Auth Failed", variant: "destructive" });
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const [showCredModal,       setShowCredModal]       = useState(false);
  const [alreadyRegistered,   setAlreadyRegistered]   = useState(false);
  const [alreadyRegUser,      setAlreadyRegUser]      = useState<UserRecord | null>(null);

  const handleExit = () => {
    setView('selection');
    setResolvedUser(null);
    sessionStorage.removeItem('neu_view');
    sessionStorage.removeItem('neu_user_email');
    sessionStorage.removeItem('neu_user_role');
  };

  // ── Route rendering ─────────────────────────────────────────────────────────
  if (view !== 'selection') {
    if (view === 'terminal') return (
      <TerminalView
        onComplete={handleExit}
        onAdminReturn={resolvedUser?.role === 'admin' || resolvedUser?.role === 'super_admin' ? () => setView('admin') : undefined}
      />
    );
    if (view === 'registration') return (
      <RegistrationPage
        onSubmitted={handleExit}
        onBack={handleExit}
      />
    );
    // Admin view — WelcomeMessage overlays AdminDashboard (both mounted simultaneously)
    return (
      <>
        <AdminDashboard
          onExit={handleExit}
          resolvedUser={resolvedUser}
          onSwitchToStudent={() => setView('terminal')}
        />
        {showAdminWelcome && (
          <WelcomeMessage
            adminUser={resolvedUser}
            onDismiss={() => setShowAdminWelcome(false)}
          />
        )}
      </>
    );
  }

  // ── Selection (Landing) screen ──────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: "'DM Sans',sans-serif" }}>
      <header className="relative z-10 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="neu-seal flex-shrink-0 overflow-hidden" style={{ width: 36, height: 36, padding: 0 }}>
            <img src="/neu_logo.png" alt="NEU" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
          </div>
          <span className="text-white font-bold text-sm hidden sm:block" style={{ letterSpacing: '0.06em' }}>New Era University</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-white/40 text-xs font-semibold">
            <Radio size={9} className="animate-pulse text-red-400" /> Live System
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 gap-8 relative z-10">
        <div className="text-center space-y-3">
          <div className="space-y-2">
            <h1 className="hero-title text-3xl sm:text-5xl md:text-6xl">NEU Library Portal</h1>
            <p className="hero-subtitle" style={{ letterSpacing: '0.25em', fontSize: '0.6rem' }}>Institutional Access & Presence Management</p>
            <div className="flex items-center justify-center gap-3 pt-1">
              <div className="h-px w-10" style={{ background: 'linear-gradient(90deg,transparent,rgba(200,160,40,0.5))' }} />
              <span className="text-white/40 text-xs">✦</span>
              <div className="h-px w-10" style={{ background: 'linear-gradient(90deg,rgba(200,160,40,0.5),transparent)' }} />
            </div>
          </div>
        </div>

        {/* ── Primary Access Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
          {/* KIOSK */}
          <button onClick={() => setView('terminal')} className="kiosk-button">
            <div className="kiosk-icon-wrapper"><UserCheck size={30} /></div>
            <div>
              <h2 className="text-xl font-bold text-slate-800" style={{ fontFamily: "'Playfair Display',serif" }}>Kiosk</h2>
              <p className="text-slate-400 mt-1 font-semibold text-sm">Daily Check-in / Check-out</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(10,26,77,0.07)', color: 'hsl(221,72%,22%)' }}>
              <Radio size={9} className="animate-pulse" /> RFID / ID Scan
            </div>
          </button>

          {/* ADMIN */}
          <button className="kiosk-button" onClick={() => setIsAdminLoginOpen(true)}>
            <div className="kiosk-icon-wrapper"><ShieldCheck size={30} /></div>
            <div>
              <h2 className="text-xl font-bold text-slate-800" style={{ fontFamily: "'Playfair Display',serif" }}>Admin</h2>
              <p className="text-slate-400 mt-1 font-semibold text-sm">Dashboard Management</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(10,26,77,0.07)', color: 'hsl(221,72%,22%)' }}>
              <ArrowRight size={9} /> Staff Login
            </div>
          </button>
        </div>

        {/* ── Secondary Action Buttons ── */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-2xl">
          {/* Register */}
          <button onClick={handleRegisterClick} disabled={isAuthenticating}
            className="flex items-center justify-center gap-2 h-12 rounded-2xl font-bold text-sm transition-all active:scale-95 disabled:opacity-60"
            style={{ background: 'rgba(255,255,255,0.13)', backdropFilter: 'blur(10px)', color: 'white', border: '1px solid rgba(255,255,255,0.25)' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.25)';
              (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(255,255,255,0.55)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.13)';
              (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(255,255,255,0.25)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
            }}>
            {isAuthenticating ? <Loader2 size={15} className="animate-spin" /> : <UserCircle size={15} />}
            Register
          </button>
          {/* Request Credential */}
          <button onClick={() => setIsCredAuthOpen(true)} disabled={isAuthenticating}
            className="flex items-center justify-center gap-2 h-12 rounded-2xl font-bold text-sm transition-all active:scale-95 disabled:opacity-60"
            style={{ background: 'rgba(255,255,255,0.13)', backdropFilter: 'blur(10px)', color: 'white', border: '1px solid rgba(255,255,255,0.25)' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.25)';
              (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(255,255,255,0.55)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.13)';
              (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(255,255,255,0.25)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
            }}>
            <FileEdit size={15} />
            Request Credential
          </button>
        </div>
      </div>

      {/* ── Already Registered popup (kiosk style) ── */}
      {alreadyRegistered && alreadyRegUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300">
            <div className="px-8 py-7 text-center"
              style={{ background: 'linear-gradient(135deg,hsl(221,72%,18%),hsl(221,72%,28%))' }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3"
                style={{ background: 'rgba(255,255,255,0.15)' }}>
                <UserCircle size={32} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-white" style={{ fontFamily: "'Playfair Display',serif" }}>
                Already Registered!
              </h3>
              <p className="text-white/60 text-xs font-semibold mt-1 uppercase tracking-widest">
                {alreadyRegUser.deptID || 'NEU Library'}
              </p>
            </div>
            <div className="px-8 py-6 text-center space-y-4">
              <p className="text-slate-700 font-medium text-sm leading-relaxed">
                You are already registered in the system as <strong>{alreadyRegUser.firstName} {alreadyRegUser.lastName}</strong>.
                Redirecting you to the Kiosk…
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400 font-medium">
                <Loader2 size={12} className="animate-spin" />
                Redirecting in 5 seconds
              </div>
              <button onClick={() => { setAlreadyRegistered(false); setView('terminal'); }}
                className="w-full h-11 rounded-2xl font-bold text-sm text-white transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))' }}>
                Go to Kiosk Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Wrong domain popup ── */}
      {wrongDomainEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-5 text-center animate-in fade-in zoom-in duration-300">
            <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center text-4xl">😔</div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>Sorry!</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                <span className="font-bold font-mono text-slate-700">{wrongDomainEmail}</span> is not an institutional account.
              </p>
              <p className="text-slate-400 text-sm">Please sign in with your <span className="font-bold text-primary">@neu.edu.ph</span> Google account.</p>
            </div>
            <button onClick={() => setWrongDomainEmail(null)}
              className="w-full h-12 rounded-2xl font-bold text-white text-sm"
              style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))' }}>
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── Not registered as staff ── */}
      {notRegisteredEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-5 text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'hsl(43,85%,52%,0.12)' }}>
              <ShieldCheck size={32} style={{ color: 'hsl(43,85%,40%)' }} />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>Not Registered as Staff</h3>
              <p className="text-slate-500 text-sm font-medium">
                <span className="font-bold font-mono text-slate-800">{notRegisteredEmail}</span> is not in the Staff Registry.
              </p>
            </div>
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-left space-y-1.5">
              <p className="text-sm font-bold text-blue-800">To get access:</p>
              <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside font-medium">
                <li>Contact a <strong>Super Admin</strong></li>
                <li>Ask them to register your email in <strong>Staff Access Registry</strong></li>
                <li>Return and sign in again</li>
              </ol>
            </div>
            <button onClick={() => setNotRegisteredEmail(null)}
              className="w-full h-12 rounded-2xl font-bold text-white text-sm"
              style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))' }}>
              <ArrowRight size={15} className="inline mr-2 rotate-180" /> Back to Portal
            </button>
          </div>
        </div>
      )}

      {/* ── Credential request auth dialog ── */}
      {isCredAuthOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>Request Credential Change</h3>
                <p className="text-slate-400 text-sm mt-1">Authenticate with your NEU account first</p>
              </div>
              <button onClick={() => setIsCredAuthOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
            </div>
            <button onClick={handleCredentialLogin} disabled={isAuthenticating}
              className="w-full h-14 rounded-xl border-2 border-slate-200 font-bold text-base text-slate-700 flex items-center justify-center gap-3 active:scale-95 transition-all hover:border-primary/30 hover:bg-slate-50 disabled:opacity-60">
              {isAuthenticating
                ? <Loader2 size={20} className="animate-spin text-primary" />
                : <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" className="w-5 h-5" />}
              {isAuthenticating ? 'Signing in…' : 'Sign in with Google'}
            </button>
            <p className="text-center text-xs text-slate-400">@neu.edu.ph accounts only</p>
          </div>
        </div>
      )}

      {/* ── Credential change modal (after auth) ── */}
      {showCredModal && credAuthUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
          {/* Dynamic import of CredentialRequestModal */}
          {(() => {
            const { CredentialRequestModal } = require('@/components/student/CredentialRequestModal');
            return <CredentialRequestModal profile={credAuthUser} onClose={() => { setShowCredModal(false); setCredAuthUser(null); }} />;
          })()}
        </div>
      )}

      <footer className="relative z-10 text-center py-4 px-4">
        <p className="text-white/30 text-xs">© {new Date().getFullYear()} New Era University Library · No. 9 Central Avenue, Quezon City</p>
      </footer>

      {/* ── Admin login dialog ── */}
      <Dialog open={isAdminLoginOpen} onOpenChange={setIsAdminLoginOpen}>
        <DialogContent className="border-none shadow-2xl p-0 overflow-hidden [&>button]:hidden" style={{ borderRadius: '1.25rem', width: 'calc(100vw - 2rem)', maxWidth: '420px' }}>
          <div className="p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg,hsl(221,72%,18%),hsl(221,60%,30%))' }}>
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <button onClick={() => setIsAdminLoginOpen(false)} className="absolute top-4 right-4 z-20 w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-95 hover:bg-white/20" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <X size={15} className="text-white" />
            </button>
            <div className="relative z-10 flex items-center gap-3">
              <div className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.12)' }}><ShieldCheck size={22} className="text-white" /></div>
              <div>
                <DialogTitle className="text-xl font-bold text-white" style={{ fontFamily: "'Playfair Display',serif" }}>Staff Access</DialogTitle>
                <DialogDescription className="text-white/55 font-medium" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Authorized Personnel Only</DialogDescription>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-5 bg-white">
            <div className="text-center space-y-1 pb-2">
              <p className="text-slate-600 text-sm font-medium leading-relaxed">Sign in with your institutional Google account to access the Staff Console.</p>
              <p className="text-[10px] text-slate-400">Only registered staff members will be granted access.</p>
            </div>
            <button onClick={handleAdminLogin} disabled={isAuthenticating}
              className="w-full h-14 rounded-xl border-2 border-slate-200 font-bold text-base text-slate-700 flex items-center justify-center gap-3 active:scale-95 transition-all hover:border-primary/30 hover:bg-slate-50 disabled:opacity-60">
              {isAuthenticating
                ? <Loader2 size={20} className="animate-spin text-primary" />
                : <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />}
              {isAuthenticating ? 'Signing in...' : 'Sign in with Google'}
            </button>
            <p className="text-center text-xs text-slate-400">Access is monitored and logged for security.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}