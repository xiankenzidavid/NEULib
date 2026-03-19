"use client";

/**
 * page.tsx — Main router
 *
 * Views:
 *   selection    — Landing page (Kiosk + Admin only)
 *   terminal     — Visitor Kiosk (tap in/out)
 *   registration — New NEU user fills profile → pending visitor
 *   admin        — Admin/Staff Dashboard
 *
 * Registration flow:
 *   - Typing a non-NEU student ID at the kiosk → popup: "Register with @neu.edu.ph first"
 *   - Logging in with @neu.edu.ph email not in DB → auto-redirect to RegistrationPage
 *   - No manual Register button on the landing page
 */

import { useState, useEffect, useCallback } from 'react';
import TerminalView from '@/components/terminal/TerminalView';
import AdminDashboard from '@/components/admin/AdminDashboard';
import RegistrationPage from '@/components/student/RegistrationPage';
import WelcomeMessage from '@/components/admin/WelcomeMessage';
import {
  ShieldCheck, UserCheck, Loader2, ArrowRight,
  Radio, X, FileEdit, GraduationCap,
} from 'lucide-react';
import { useUser, useAuth, useFirestore } from '@/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getDocs, collection, query, where, limit } from 'firebase/firestore';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { UserRecord } from '@/lib/firebase-schema';

type AppView = 'selection' | 'terminal' | 'registration' | 'admin';

const SUPER_ADMIN_EMAIL = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL || 'shawndavidsobremontedomingo@gmail.com';

export default function Home() {
  const [view, setViewRaw]                          = useState<AppView>('selection');
  const [resolvedUser, setResolvedUser]             = useState<UserRecord | null>(null);
  const [hydrated, setHydrated]                     = useState(false);
  const [isAdminLoginOpen, setIsAdminLoginOpen]     = useState(false);
  const [isAuthenticating, setIsAuthenticating]     = useState(false);
  const [notRegisteredEmail, setNotRegisteredEmail] = useState<string | null>(null);
  const [wrongDomainEmail,   setWrongDomainEmail]   = useState<string | null>(null);
  const [showAdminWelcome,   setShowAdminWelcome]   = useState(false);

  // Credential request auth gate
  const [isCredAuthOpen, setIsCredAuthOpen] = useState(false);
  const [credAuthUser,   setCredAuthUser]   = useState<UserRecord | null>(null);
  const [showCredModal,  setShowCredModal]  = useState(false);

  // Stable callback — prevents SuccessCard useEffect re-running on every render
  const handleCredModalClose = useCallback(() => {
    setShowCredModal(false);
    setCredAuthUser(null);
  }, []);

  // "Not registered via ID" popup — shown when kiosk can't find a student ID
  // and they haven't used a @neu.edu.ph email
  const [showNotRegisteredIdPopup, setShowNotRegisteredIdPopup] = useState(false);

  const { user, isUserLoading } = useUser();
  const auth  = useAuth();
  const db    = useFirestore();
  const { toast } = useToast();

  // ── Session restore ────────────────────────────────────────────────────────
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

  // ── Helpers ────────────────────────────────────────────────────────────────
  async function resolveUserByEmail(email: string): Promise<UserRecord | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email), limit(1)));
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          return { ...docSnap.data() as UserRecord, id: docSnap.id };
        }
        return null;
      } catch (err: any) {
        if ((err?.code === 'permission-denied' || err?.message?.includes('permission')) && attempt < 2) {
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        return null;
      }
    }
    return null;
  }

  const handleExit = () => {
    setView('selection');
    setResolvedUser(null);
    sessionStorage.removeItem('neu_view');
    sessionStorage.removeItem('neu_user_email');
    sessionStorage.removeItem('neu_user_role');
  };

  // ── Admin login ────────────────────────────────────────────────────────────
  const handleAdminLogin = async () => {
    setIsAuthenticating(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const email  = result.user.email!;

      try { await result.user.getIdToken(true); } catch { /* non-fatal */ }
      const userRecord    = await resolveUserByEmail(email);
      const isWhitelisted = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

      if (userRecord && (userRecord.role === 'admin' || userRecord.role === 'super_admin')) {
        setResolvedUserAndSave(userRecord);
        setIsAdminLoginOpen(false);
        setShowAdminWelcome(true);
        setView('admin');
        return;
      }
      if (isWhitelisted) {
        const nameParts = (result.user.displayName || 'Super Admin').split(' ');
        const ownerRecord: UserRecord = {
          id:         userRecord?.id || '',
          firstName:  nameParts.slice(0, -1).join(' ') || nameParts[0] || 'Super',
          middleName: '',
          lastName:   nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'Admin',
          email,
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
        toast({ title: 'Authentication Failed', description: err?.message || 'Please try again.', variant: 'destructive' });
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  // ── Credential change auth gate ────────────────────────────────────────────
  const handleCredentialLogin = async () => {
    setIsAuthenticating(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const email  = result.user.email!;

      if (!email.endsWith('@neu.edu.ph') && email.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
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
      setShowCredModal(true);
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        toast({ title: 'Auth Failed', variant: 'destructive' });
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  // ── Auto-registration handler — called by TerminalView ────────────────────
  // Triggered when a @neu.edu.ph Google login is not found in the database
  const handleAutoRegister = (email: string) => {
    // Pre-fill name from Firebase auth displayName if available
    const authDisplayName = user?.displayName || '';
    const nameParts = authDisplayName.trim().split(' ');
    const lastName  = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
    const firstName = nameParts.slice(0, nameParts.length > 1 ? -1 : 1).join(' ');
    setResolvedUser({
      id: '', firstName, middleName: '', lastName,
      email, role: 'visitor', status: 'pending',
    } as UserRecord);
    setView('registration');
  };

  // ── Route rendering ────────────────────────────────────────────────────────
  if (view !== 'selection') {
    if (view === 'terminal') return (
      <TerminalView
        onComplete={handleExit}
        onAdminReturn={
          resolvedUser?.role === 'admin' || resolvedUser?.role === 'super_admin'
            ? () => setView('admin')
            : undefined
        }
        onRegister={handleAutoRegister}
        preloadedUser={resolvedUser}
      />
    );
    if (view === 'registration') return (
      <RegistrationPage
        onSubmitted={(registeredUser) => {
          // After registration, go straight to kiosk purpose step with credentials pre-filled
          if (registeredUser) {
            setResolvedUser(registeredUser);
          }
          setView('terminal');
        }}
        onBack={handleExit}
      />
    );
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

  // ── Landing page ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* Header */}
      <header className="relative z-10 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="neu-seal flex-shrink-0 overflow-hidden" style={{ width: 36, height: 36, padding: 0 }}>
            <img src="/neu_logo.png" alt="NEU" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
          </div>
          <span className="text-white font-bold text-sm hidden sm:block" style={{ letterSpacing: '0.06em' }}>
            New Era University
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full font-bold text-xs"
            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: 'rgba(134,239,172,0.95)' }}>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
            </span>
            Live System
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 gap-8 relative z-10">

        {/* Logo + title */}
        <div className="text-center space-y-4">
          <div className="flex flex-col items-center gap-4">
            <div className="overflow-hidden shadow-2xl"
              style={{ width: 96, height: 96, borderRadius: '50%', border: '3px solid rgba(200,160,40,0.5)', boxShadow: '0 0 40px rgba(200,160,40,0.25)' }}>
              <img src="/neu_logo.png" alt="NEU" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div className="space-y-1">
              <h1 className="hero-title text-4xl sm:text-6xl md:text-7xl">NEU Library Portal</h1>
              <p className="hero-subtitle" style={{ letterSpacing: '0.25em', fontSize: '0.65rem' }}>
                Institutional Access & Presence Management
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <div className="h-px w-14" style={{ background: 'linear-gradient(90deg,transparent,rgba(200,160,40,0.5))' }} />
              <span className="text-white/40 text-xs">✦</span>
              <div className="h-px w-14" style={{ background: 'linear-gradient(90deg,rgba(200,160,40,0.5),transparent)' }} />
            </div>
          </div>
        </div>

        {/* Primary access cards — Kiosk + Admin only, NO Register button */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
          <button onClick={() => setView('terminal')} className="kiosk-button">
            <div className="kiosk-icon-wrapper"><UserCheck size={30} /></div>
            <div>
              <h2 className="text-xl font-bold text-slate-800" style={{ fontFamily: "'Playfair Display',serif" }}>Kiosk</h2>
              <p className="text-slate-400 mt-1 font-semibold text-sm">Daily Check-in / Check-out</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(10,26,77,0.07)', color: 'hsl(221,72%,22%)' }}>
              <Radio size={9} className="animate-pulse" /> RFID / ID Scan
            </div>
          </button>

          <button className="kiosk-button" onClick={() => setIsAdminLoginOpen(true)}>
            <div className="kiosk-icon-wrapper"><ShieldCheck size={30} /></div>
            <div>
              <h2 className="text-xl font-bold text-slate-800" style={{ fontFamily: "'Playfair Display',serif" }}>Admin</h2>
              <p className="text-slate-400 mt-1 font-semibold text-sm">Dashboard Management</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(10,26,77,0.07)', color: 'hsl(221,72%,22%)' }}>
              <ArrowRight size={9} /> Staff Login
            </div>
          </button>
        </div>

        {/* Secondary action — Request Credential only (Register removed) */}
        <div className="w-full max-w-2xl">
          <button
            onClick={() => setIsCredAuthOpen(true)}
            disabled={isAuthenticating}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl font-bold text-sm transition-all active:scale-95 disabled:opacity-60"
            style={{ background: 'rgba(255,255,255,0.13)', backdropFilter: 'blur(10px)', color: 'white', border: '1px solid rgba(255,255,255,0.25)' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.25)';
              (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(255,255,255,0.55)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.13)';
              (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(255,255,255,0.25)';
            }}>
            <FileEdit size={15} />
            Contact Admin
          </button>
        </div>

        {/* Registration hint — replaces the old Register button */}
        <p className="text-white/35 text-xs font-medium text-center max-w-xs">
          First time? Go to <strong className="text-white/55">Kiosk</strong> and sign in with your{' '}
          <strong className="text-white/55">@neu.edu.ph</strong> Google account — you'll be guided to registration automatically.
          Need help or admin access? Use <strong className="text-white/55">Contact Admin</strong>.
        </p>
      </div>

      {/* ── "Not registered ID" popup — shown when kiosk can't find a student ID ── */}
      {showNotRegisteredIdPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', animation: 'fadeIn 0.2s ease-out' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300">
            <div className="px-7 py-7 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                style={{ background: 'rgba(251,191,36,0.12)' }}>
                <GraduationCap size={32} style={{ color: 'hsl(43,85%,42%)' }} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                  Not Registered
                </h3>
                <p className="text-slate-500 text-sm font-medium leading-relaxed">
                  This ID was not found in the system. To register, please sign in with your{' '}
                  <strong className="text-slate-800">@neu.edu.ph</strong> Google account at the kiosk — you'll be redirected to registration automatically.
                </p>
              </div>
              <div className="p-4 rounded-2xl text-left space-y-1.5"
                style={{ background: 'rgba(10,26,77,0.04)', border: '1px solid rgba(10,26,77,0.08)' }}>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">How to register:</p>
                <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside font-medium">
                  <li>Go to the <strong>Kiosk</strong></li>
                  <li>Tap <strong>Institutional Login</strong></li>
                  <li>Sign in with your <strong>@neu.edu.ph</strong> Google account</li>
                  <li>You'll be taken to the registration form automatically</li>
                </ol>
              </div>
              <button
                onClick={() => setShowNotRegisteredIdPopup(false)}
                className="w-full h-12 rounded-2xl font-bold text-sm text-white transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))' }}>
                Got it
              </button>
            </div>
          </div>
          <style>{`@keyframes fadeIn { from{opacity:0} to{opacity:1} }`}</style>
        </div>
      )}

      {/* ── Wrong domain popup ── */}
      {wrongDomainEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-5 text-center animate-in fade-in zoom-in duration-300">
            <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center text-4xl">😔</div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>Sorry!</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                <span className="font-bold font-mono text-slate-700">{wrongDomainEmail}</span> is not an institutional account.
              </p>
              <p className="text-slate-400 text-sm">
                Please sign in with your <span className="font-bold text-primary">@neu.edu.ph</span> Google account.
              </p>
            </div>
            <button onClick={() => setWrongDomainEmail(null)}
              className="w-full h-12 rounded-2xl font-bold text-white text-sm"
              style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))' }}>
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── Not registered as staff popup ── */}
      {notRegisteredEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-5 text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'hsl(43,85%,52%,0.12)' }}>
              <ShieldCheck size={32} style={{ color: 'hsl(43,85%,40%)' }} />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                Not Registered as Staff
              </h3>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                  Contact Admin
                </h3>
                <p className="text-slate-400 text-sm mt-1">Authenticate with your NEU account first</p>
              </div>
              <button onClick={() => setIsCredAuthOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
          {(() => {
            const { CredentialRequestModal } = require('@/components/student/CredentialRequestModal');
            return (
              <CredentialRequestModal
                profile={credAuthUser}
                onClose={handleCredModalClose}
              />
            );
          })()}
        </div>
      )}

      <footer className="relative z-10 text-center py-4 px-4">
        <p className="text-white/30 text-xs">
          © {new Date().getFullYear()} New Era University Library · No. 9 Central Avenue, Quezon City
        </p>
      </footer>

      {/* ── Admin login dialog ── */}
      <Dialog open={isAdminLoginOpen} onOpenChange={setIsAdminLoginOpen}>
        <DialogContent
          className="border-none shadow-2xl p-0 overflow-hidden [&>button]:hidden"
          style={{ borderRadius: '1.25rem', width: 'calc(100vw - 2rem)', maxWidth: '420px' }}>
          <div className="p-6 text-white relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg,hsl(221,72%,18%),hsl(221,60%,30%))' }}>
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)' }} />
            <button onClick={() => setIsAdminLoginOpen(false)}
              className="absolute top-4 right-4 z-20 w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-95 hover:bg-white/20"
              style={{ background: 'rgba(255,255,255,0.12)' }}>
              <X size={15} className="text-white" />
            </button>
            <div className="relative z-10 flex items-center gap-3">
              <div className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.12)' }}>
                <ShieldCheck size={22} className="text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-white" style={{ fontFamily: "'Playfair Display',serif" }}>
                  Staff Access
                </DialogTitle>
                <DialogDescription className="text-white/55 font-medium"
                  style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  Authorized Personnel Only
                </DialogDescription>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-5 bg-white">
            <div className="text-center space-y-1 pb-2">
              <p className="text-slate-600 text-sm font-medium leading-relaxed">
                Sign in with your institutional Google account to access the Staff Console.
              </p>
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