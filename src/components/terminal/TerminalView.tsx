"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Scan, ArrowRight, Loader2, Radio, ArrowLeft, LogOut, GraduationCap, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking, useAuth, useUser } from '@/firebase';
import { collection, query, where, limit, doc, getDoc, getDocs, orderBy, setDoc } from 'firebase/firestore';
import { signInAnonymously, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { isToday, parseISO } from 'date-fns';
import { formatStudentId } from '@/lib/student-id-formatter';
import { StudentRecord, UserRecord, DEPARTMENTS, ProgramRecord } from '@/lib/firebase-schema';

const FALLBACK_PURPOSES = [
  { value: 'Reading Books', label: 'Reading & Private Study' },
  { value: 'Research',      label: 'Thesis & Research' },
  { value: 'Computer Use',  label: 'Computer Usage' },
  { value: 'Assignments',   label: 'Academic Assignments' },
];

interface TerminalViewProps {
  onComplete?: () => void;
  onAdminReturn?: () => void;
  // Called when an unregistered NEU email is detected — auto-redirect to registration
  onRegister?: (email: string) => void;
  // Pre-loaded user from registration — skips auth, goes straight to purpose
  preloadedUser?: UserRecord | null;
}

export default function TerminalView({ onComplete, onAdminReturn, onRegister, preloadedUser }: TerminalViewProps) {
  // If a newly registered user is passed in, start at purpose step immediately
  const [step,              setStep]              = useState<'auth' | 'dept' | 'purpose' | 'success'>(
    preloadedUser ? 'purpose' : 'auth'
  );
  const [rfidInput,         setRfidInput]         = useState('');
  const [identifiedStudent, setIdentifiedStudent] = useState<StudentRecord | null>(
    preloadedUser ? {
      ...preloadedUser,
      studentId: preloadedUser.id,
      isBlocked: (preloadedUser.status as string) === 'blocked',
    } as StudentRecord : null
  );
  const [isVisitor,         setIsVisitor]         = useState(false);
  const [purpose,           setPurpose]           = useState('');
  const [isSearching,       setIsSearching]       = useState(false);
  const [countdown,         setCountdown]         = useState(5);
  const [lastAction,        setLastAction]        = useState<'checkin' | 'checkout'>('checkin');
  const [showNotRegistered, setShowNotRegistered] = useState(false);
  const [blockedStudent,    setBlockedStudent]    = useState<{ name: string } | null>(null);
  const [sessionDuration,   setSessionDuration]   = useState<{ hours: number; minutes: number } | null>(null);

  // Dept/program for visitors
  const [visitorDeptId,   setVisitorDeptId]   = useState('');
  const [visitorProgram,  setVisitorProgram]  = useState('');
  const [allDepts,        setAllDepts]        = useState<{ deptID: string; departmentName: string }[]>([]);
  const [deptPrograms,    setDeptPrograms]    = useState<ProgramRecord[]>([]);
  const [isLoadingProgs,  setIsLoadingProgs]  = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleRfidChange = (raw: string) => setRfidInput(formatStudentId(raw));
  const { toast } = useToast();
  const db   = useFirestore();
  const auth = useAuth();
  const { user: authUser } = useUser();

  useEffect(() => {
    if (!authUser) signInAnonymously(auth);
    if (step === 'auth' && inputRef.current) inputRef.current.focus();
  }, [step, authUser, auth]);

  // ── Dynamic purposes from Firestore — only active ones for kiosk ──────────
  const [livePurposes, setLivePurposes] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getDocs(query(collection(db, 'visit_purposes'), where('active', '==', true)))
      .then(snap => {
        if (snap.empty) { setLivePurposes(FALLBACK_PURPOSES); return; }
        const sorted = snap.docs
          .map(d => d.data() as { value: string; label: string; order?: number })
          .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setLivePurposes(sorted.map(p => ({ value: p.value, label: p.label })));
      })
      .catch(() => setLivePurposes(FALLBACK_PURPOSES));
  }, [db]);

  // Load departments
  useEffect(() => {
    getDocs(collection(db, 'departments')).then(snap =>
      setAllDepts(snap.docs.map(d => d.data() as { deptID: string; departmentName: string })
        .sort((a, b) => a.departmentName.localeCompare(b.departmentName)))
    );
  }, [db]);

  // Load programs when dept changes
  useEffect(() => {
    if (!visitorDeptId) { setDeptPrograms([]); return; }
    setIsLoadingProgs(true);
    setVisitorProgram('');
    getDocs(query(collection(db, 'programs'), where('deptID', '==', visitorDeptId)))
      .then(snap => setDeptPrograms(snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ProgramRecord))
        .sort((a, b) => a.code.localeCompare(b.code))))
      .finally(() => setIsLoadingProgs(false));
  }, [visitorDeptId, db]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 'success') {
      setCountdown(5);
      timer = setInterval(() => setCountdown(p => p > 0 ? p - 1 : 0), 1000);
    }
    return () => clearInterval(timer);
  }, [step]);

  useEffect(() => { if (step === 'success' && countdown <= 0) handleReset(); }, [step, countdown]);

  const handleReset = () => {
    const wasAdmin = identifiedStudent?.role === 'admin' || identifiedStudent?.role === 'super_admin';
    setStep('auth'); setRfidInput(''); setIdentifiedStudent(null);
    setPurpose(''); setLastAction('checkin'); setIsVisitor(false);
    setVisitorDeptId(''); setVisitorProgram(''); setSessionDuration(null);
    if (wasAdmin && onAdminReturn) onAdminReturn();
  };

  const goToNextStep = (student: StudentRecord, needsDept: boolean) => {
    setIdentifiedStudent(student);
    setLastAction('checkin');
    if (needsDept) { setIsVisitor(true); setStep('dept'); }
    else           { setStep('purpose'); }
  };

  const checkExistingLogs = async (student: StudentRecord, needsDept: boolean) => {
    const q = query(collection(db, 'library_logs'),
      where('studentId', '==', student.studentId),
      orderBy('checkInTimestamp', 'desc'), limit(1));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const log = snap.docs[0].data();
      if (!log.checkOutTimestamp && isToday(parseISO(log.checkInTimestamp))) {
        const checkOutNow = new Date();
        updateDocumentNonBlocking(doc(db, 'library_logs', snap.docs[0].id),
          { checkOutTimestamp: checkOutNow.toISOString() });

        // Compute how long the student was inside
        const checkInTime  = parseISO(log.checkInTimestamp);
        const totalMinutes = Math.max(0, Math.floor((checkOutNow.getTime() - checkInTime.getTime()) / 60000));
        setSessionDuration({ hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 });

        setIdentifiedStudent(student);
        setLastAction('checkout');
        setStep('success');
        return;
      }
    }
    goToNextStep(student, needsDept);
  };

  const handleIdentify = async (input: string) => {
    const cleanId = input.trim();
    if (!cleanId) return;
    setIsSearching(true);
    try {
      // 1. Check /users by doc ID
      let userDoc = await getDoc(doc(db, 'users', cleanId));

      // 2. Try by email
      if (!userDoc.exists()) {
        const emailSnap = await getDocs(
          query(collection(db, 'users'), where('email', '==', cleanId.toLowerCase()), limit(1))
        );
        if (!emailSnap.empty) userDoc = emailSnap.docs[0] as any;
      }

      if (userDoc.exists()) {
        const data = userDoc.data() as UserRecord;
        if (data.status === 'blocked') {
          setBlockedStudent({ name: data.firstName || 'Student' });
          return;
        }
        const asStudent: StudentRecord = {
          ...data, id: data.id || cleanId,
          studentId: data.id || cleanId,
          isBlocked: (data.status as string) === 'blocked',
        };
        await checkExistingLogs(asStudent, !data.deptID || data.deptID === '');
        return;
      }

      // 3. Check by temporaryId
      const tvSnap = await getDocs(query(collection(db, 'users'), where('temporaryId', '==', cleanId), limit(1)));
      if (!tvSnap.empty) {
        const tv = tvSnap.docs[0].data();
        const asStudent: StudentRecord = {
          studentId: cleanId, id: tv.id || cleanId,
          firstName: tv.firstName, middleName: tv.middleName || '',
          lastName: tv.lastName, email: tv.email,
          deptID: tv.deptID || '', program: tv.program || '',
          role: 'visitor', status: tv.status || 'pending', isBlocked: tv.status === 'blocked',
        };
        await checkExistingLogs(asStudent, !tv.deptID || tv.deptID === '');
        return;
      }

      // Not found — show not registered info
      // Not found — show popup card
      setShowNotRegistered(true);
    } catch {
      toast({ title: 'Registry Error', variant: 'destructive' });
    } finally { setIsSearching(false); }
  };

  const handleGoogleLogin = async () => {
    setIsSearching(true);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const email  = result.user.email;
      const SUPER_ADMIN = (process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL || 'shawndavidsobremontedomingo@gmail.com').toLowerCase();

      if (!email?.endsWith('@neu.edu.ph') && email?.toLowerCase() !== SUPER_ADMIN) {
        toast({ title: 'Restricted', description: 'Academic accounts only (@neu.edu.ph).', variant: 'destructive' });
        return;
      }

      // Look up by email in /users
      const uSnap = await getDocs(query(collection(db, 'users'), where('email', '==', email), limit(1)));

      if (!uSnap.empty) {
        const u = uSnap.docs[0].data() as UserRecord;
        if (u.status === 'blocked') {
          setBlockedStudent({ name: u.firstName || 'Student' });
          return;
        }
        const isAdmin = u.role === 'admin' || u.role === 'super_admin';
        const asStudent: StudentRecord = {
          studentId: u.id, id: u.id,
          firstName: u.firstName, middleName: u.middleName || '',
          lastName: u.lastName, email: u.email,
          deptID: u.deptID || '', program: u.program || '',
          role: u.role, status: u.status, isBlocked: (u.status as string) === 'blocked',
        };
        await checkExistingLogs(asStudent, !isAdmin && (!u.deptID || u.deptID === ''));
        return;
      }

      // ── AUTO-REDIRECT: NEU email not in database → registration ──────────
      // No manual register button needed — this handles it automatically
      if (email?.endsWith('@neu.edu.ph') && onRegister) {
        onRegister(email);
        return;
      }

      // Not found — show popup card
      setShowNotRegistered(true);
    } catch {
      toast({ title: 'Authentication Failed', variant: 'destructive' });
    } finally { setIsSearching(false); }
  };

  const handleDeptConfirm = async () => {
    if (!visitorDeptId || !identifiedStudent) return;
    const tvRef = doc(db, 'users', identifiedStudent.studentId);
    await setDoc(tvRef, { deptID: visitorDeptId, program: visitorProgram }, { merge: true });
    setIdentifiedStudent(prev => prev ? { ...prev, deptID: visitorDeptId, program: visitorProgram } : prev);
    setStep('purpose');
  };

  const handleCheckIn = () => {
    if (!purpose || !identifiedStudent) return;
    addDocumentNonBlocking(collection(db, 'library_logs'), {
      studentId:        identifiedStudent.studentId,
      deptID:           identifiedStudent.deptID,
      checkInTimestamp: new Date().toISOString(),
      purpose,
      studentName: `${(identifiedStudent.lastName || '').toUpperCase()}, ${identifiedStudent.firstName}`,
    });
    setLastAction('checkin');
    setStep('success');
  };

  const navy = 'hsl(221,72%,22%)';
  const purposes = livePurposes.length > 0 ? livePurposes : FALLBACK_PURPOSES;

  return (
    <div className="flex items-center justify-center min-h-screen p-4 sm:p-6">
      <div className="w-full max-w-lg">

        {/* ── AUTH ── */}
        {step === 'auth' && (
          <div className="rounded-[2rem] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-400">
            {/* Header */}
            <div className="px-8 pt-8 pb-8 text-center relative"
              style={{ background: 'linear-gradient(160deg,hsl(225,70%,42%) 0%,hsl(221,72%,28%) 60%,hsl(221,72%,22%) 100%)' }}>
              <button onClick={onComplete}
                className="flex items-center gap-1.5 text-white/50 hover:text-white/80 font-bold text-[10px] uppercase tracking-widest mb-5 transition-all">
                <ArrowLeft size={13} /> Main Portal
              </button>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <Radio size={32} className="text-white animate-pulse" />
              </div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight" style={{ fontFamily: "'Playfair Display',serif" }}>
                Library Kiosk
              </h1>
              <p className="text-white/50 font-semibold uppercase tracking-widest text-xs mt-1.5">
                NEU · Tap to Enter or Exit
              </p>
            </div>

            {/* Body */}
            <div className="bg-white px-8 py-7 space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="uppercase font-bold text-xs tracking-widest text-slate-400">Institutional ID</span>
                  <span className="flex items-center gap-1 uppercase font-bold text-xs text-primary/70">
                    <Radio size={10} className="animate-pulse" /> Sensor Active
                  </span>
                </div>
                <div className="relative">
                  <Scan className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <Input ref={inputRef} placeholder="XX-YYYYY-ZZZ"
                    value={rfidInput} onChange={e => handleRfidChange(e.target.value)}
                    className="h-14 text-lg font-mono text-center font-bold rounded-2xl border-2 border-slate-200 bg-slate-50/80 focus:bg-white focus:border-primary/40 pl-10 tracking-widest"
                    onKeyDown={e => e.key === 'Enter' && handleIdentify(rfidInput)}
                    inputMode="text" />
                </div>
              </div>

              <Button onClick={() => handleIdentify(rfidInput)}
                className="w-full h-13 py-3.5 text-base font-bold rounded-2xl shadow-lg transition-all"
                style={{ background: 'linear-gradient(135deg,hsl(225,70%,42%),hsl(221,72%,28%))' }}
                disabled={isSearching || !rfidInput.trim()}>
                {isSearching ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
                {isSearching ? 'Searching…' : 'Verify Identity'}
              </Button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-100" /></div>
                <div className="relative flex justify-center text-xs font-bold uppercase tracking-widest">
                  <span className="bg-white px-4 text-slate-300">Cloud Enrollment</span>
                </div>
              </div>

              {/* Google login — auto-redirects unregistered NEU emails to registration */}
              <Button variant="outline" onClick={handleGoogleLogin} disabled={isSearching}
                className="w-full h-12 text-sm font-semibold rounded-2xl border border-slate-200 hover:bg-slate-50 transition-all"
                style={{ color: '#1e293b' }}>
                <div className="flex items-center gap-3">
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
                  Institutional Login
                </div>
              </Button>

              <p className="text-center text-xs text-slate-400 font-medium">
                First time? Log in with your <strong>@neu.edu.ph</strong> email — you'll be redirected to registration automatically.
              </p>
            </div>
          </div>
        )}

        {/* ── DEPT/PROGRAM (visitors only) ── */}
        {step === 'dept' && identifiedStudent && (
          <Card className="rounded-[2.5rem] shadow-2xl p-10 space-y-6 animate-in slide-in-from-bottom-4 duration-500"
            style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
            <div className="text-center space-y-3">
              <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg"
                style={{ background: 'linear-gradient(135deg,hsl(43,85%,50%),hsl(38,90%,40%))' }}>
                {(identifiedStudent.firstName || 'V')[0]}
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                  Welcome, {identifiedStudent.firstName}!
                </h2>
                <p className="text-xs font-semibold text-amber-600 mt-1 uppercase tracking-wide">
                  Visitor — Please complete your information
                </p>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                <Building2 size={12} /> College / Department
              </label>
              <Select value={visitorDeptId} onValueChange={setVisitorDeptId}>
                <SelectTrigger className="h-14 rounded-2xl border-2 bg-slate-50 font-semibold text-sm">
                  <SelectValue placeholder="Select your college" />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-64">
                  {allDepts.map(d => (
                    <SelectItem key={d.deptID} value={d.deptID} className="font-semibold text-sm py-2">
                      <span className="font-bold mr-2 text-xs" style={{ color: navy }}>[{d.deptID}]</span>
                      {d.departmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                <GraduationCap size={12} /> Academic Program
                {!visitorDeptId && <span className="text-amber-400 font-normal normal-case ml-1">(Select dept first)</span>}
              </label>
              <Select value={visitorProgram} onValueChange={setVisitorProgram} disabled={!visitorDeptId || isLoadingProgs}>
                <SelectTrigger className="h-14 rounded-2xl border-2 bg-slate-50 font-semibold text-sm disabled:opacity-50">
                  <SelectValue placeholder={
                    !visitorDeptId ? 'Select a department first'
                    : isLoadingProgs ? 'Loading...'
                    : 'Select your program'
                  } />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-64">
                  {deptPrograms.map(p => (
                    <SelectItem key={p.code} value={p.code} className="font-semibold text-sm py-2.5">
                      <span className="font-bold mr-2 text-xs px-1.5 py-0.5 rounded"
                        style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                        {p.code}
                      </span>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={handleReset} className="flex-1 h-14 rounded-2xl font-bold">Cancel</Button>
              <Button onClick={handleDeptConfirm} disabled={!visitorDeptId}
                className="flex-[2] h-14 rounded-2xl font-bold text-white"
                style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,32%))`, border: 'none' }}>
                Continue <ArrowRight size={16} className="ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {/* ── PURPOSE — now a dropdown ── */}
        {step === 'purpose' && identifiedStudent && (
          <div className="rounded-[2rem] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-400"
            style={{ background: 'linear-gradient(160deg,hsl(225,70%,42%) 0%,hsl(221,72%,22%) 100%)' }}>
            <div className="px-8 pt-8 pb-6 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-extrabold text-white mx-auto mb-4"
                style={{ background: 'linear-gradient(135deg,hsl(43,85%,55%),hsl(38,90%,44%))' }}>
                {(identifiedStudent.firstName || 'V')[0]}
              </div>
              <h2 className="text-2xl font-extrabold text-white" style={{ fontFamily: "'Playfair Display',serif" }}>
                Welcome, {identifiedStudent.firstName} {identifiedStudent.lastName}!
              </h2>
              <p className="text-white/55 text-xs font-bold mt-1 uppercase tracking-widest">
                {identifiedStudent.deptID === 'STAFF'
                  ? 'Library Staff'
                  : DEPARTMENTS[identifiedStudent.deptID ?? ''] || identifiedStudent.deptID || ''}
                {identifiedStudent.program ? ` · ${identifiedStudent.program}` : ''}
              </p>
              {isVisitor && (
                <span className="inline-block text-xs font-bold px-3 py-1.5 rounded-full mt-2"
                  style={{ background: 'rgba(251,191,36,0.2)', color: 'hsl(43,85%,85%)' }}>
                  Visitor — Pending Verification
                </span>
              )}
            </div>

            <div className="bg-white rounded-t-3xl px-8 pt-7 pb-8 space-y-5">
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center">
                  Select Purpose of Visit
                </p>

                {/* FIX: Dropdown instead of grid buttons for data consistency */}
                <Select value={purpose} onValueChange={setPurpose}>
                  <SelectTrigger className="h-14 rounded-2xl border-2 bg-slate-50 font-semibold text-base"
                    style={{ borderColor: purpose ? navy : '#e2e8f0' }}>
                    <SelectValue placeholder="Choose your reason for visiting…" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-72">
                    {purposes.map(p => (
                      <SelectItem key={p.value} value={p.value}
                        className="font-semibold text-sm py-3 cursor-pointer">
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex w-full gap-3">
                <button onClick={handleReset}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button onClick={handleCheckIn} disabled={!purpose}
                  className="flex-[2] py-3.5 rounded-2xl font-bold text-sm text-white transition-all disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))`, boxShadow: purpose ? '0 6px 20px rgba(10,26,77,0.3)' : 'none' }}>
                  Check-In →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === 'success' && identifiedStudent && (() => {
          const firstName   = identifiedStudent.firstName;
          const fullName    = `${identifiedStudent.firstName} ${identifiedStudent.lastName}`.trim();
          const collegeName = identifiedStudent.deptID === 'STAFF'
            ? 'Library Staff'
            : (DEPARTMENTS[identifiedStudent.deptID ?? ''] || identifiedStudent.deptID || '');
          const prog        = identifiedStudent.program || '';
          const isCheckIn   = lastAction === 'checkin';

          // Build duration string for tap-out
          const durStr = (() => {
            if (!sessionDuration) return null;
            const { hours, minutes } = sessionDuration;
            if (hours === 0 && minutes === 0) return 'less than a minute';
            if (hours === 0) return `${minutes} min${minutes !== 1 ? 's' : ''}`;
            if (minutes === 0) return `${hours} hr${hours !== 1 ? 's' : ''}`;
            return `${hours} hr${hours !== 1 ? 's' : ''} ${minutes} min${minutes !== 1 ? 's' : ''}`;
          })();

          return (
            <div className="rounded-[2rem] overflow-hidden shadow-2xl animate-in zoom-in duration-500"
              style={{ background: 'linear-gradient(160deg,hsl(225,70%,38%) 0%,hsl(221,72%,22%) 100%)' }}>

              <div className="px-8 pt-10 pb-4 text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                  style={{ background: 'rgba(255,255,255,0.15)' }}>
                  {isCheckIn
                    ? <CheckCircle2 size={34} className="text-white" />
                    : <LogOut       size={34} className="text-white" />}
                </div>
                <p className="text-white/50 text-xs font-bold uppercase tracking-widest pt-1">
                  {isCheckIn ? 'Check-In Logged' : 'Check-Out Logged'}
                </p>
                <h2 className="text-3xl font-extrabold text-white leading-tight"
                  style={{ fontFamily: "'Playfair Display',serif" }}>
                  {isCheckIn ? 'Welcome to NEU Library,' : 'Thank You,'}
                  <br />{firstName}!
                </h2>
                {collegeName && (
                  <p className="text-white/45 text-xs font-bold uppercase tracking-widest">
                    {collegeName}{prog ? ` · ${prog}` : ''}
                  </p>
                )}
              </div>

              <div className="mx-6 border-t border-white/15 mt-4" />

              <div className="px-8 py-6 text-center space-y-5">
                {isCheckIn ? (
                  <p className="text-white/80 text-base font-medium leading-relaxed">
                    Thank you for logging. You may now enter, <strong className="text-white">{firstName}</strong>.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {/* Duration pill */}
                    {durStr && (
                      <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl"
                        style={{ background: 'rgba(255,255,255,0.14)' }}>
                        <LogOut size={15} className="text-white/70" />
                        <span className="text-white font-bold text-base" style={{ fontFamily: "'DM Mono',monospace" }}>
                          {durStr}
                        </span>
                        <span className="text-white/60 text-sm font-medium">inside</span>
                      </div>
                    )}
                    {/* Farewell message */}
                    <p className="text-white/85 text-base font-medium leading-relaxed">
                      Thank You <strong className="text-white">{fullName}</strong> for visiting NEU Library.{' '}
                      {durStr && (
                        <>You have been <strong className="text-white">{durStr}</strong> inside.<br /></>
                      )}
                      Your session has been recorded. Have a great day!
                    </p>
                  </div>
                )}

                {/* Countdown */}
                <div className="flex items-center justify-center gap-2 text-white/50 text-sm font-semibold">
                  <span>Returning in</span>
                  <span className="text-white font-extrabold text-xl w-7 text-center"
                    style={{ fontFamily: "'DM Mono',monospace" }}>{countdown}</span>
                </div>

                <button onClick={handleReset}
                  className="px-8 py-2 rounded-full font-bold text-sm text-white/60 hover:text-white border border-white/20 hover:border-white/50 transition-all active:scale-95">
                  Done
                </button>
              </div>
            </div>
          );
        })()}
        {/* ── BLOCKED STUDENT POPUP ── */}
        {blockedStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', animation: 'fadeIn 0.2s ease-out' }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300">
              <div className="px-7 py-7 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                  style={{ background: 'rgba(239,68,68,0.1)' }}>
                  <span className="text-3xl">🚫</span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                    Access Restricted
                  </h3>
                  <p className="text-slate-600 text-sm font-medium leading-relaxed">
                    Hi! <strong>{blockedStudent.name}</strong>, you're prohibited from entering the library.
                    Please contact the admin.
                  </p>
                </div>
                <button
                  onClick={() => setBlockedStudent(null)}
                  className="w-full h-12 rounded-2xl font-bold text-sm text-white transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                  Understood
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── NOT REGISTERED POPUP ── */}
        {showNotRegistered && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', animation: 'fadeIn 0.2s ease-out' }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300">
              <div className="px-8 pt-8 pb-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                  style={{ background: 'rgba(251,191,36,0.12)' }}>
                  <GraduationCap size={32} style={{ color: 'hsl(43,85%,42%)' }} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                    Not Yet Registered
                  </h3>
                  <p className="text-slate-500 text-sm font-medium leading-relaxed">
                    Sorry, this Institutional ID isn't yet registered. Please register using your{' '}
                    <strong className="text-slate-800">Institutional Account</strong> first.
                  </p>
                </div>
                <div className="p-4 rounded-2xl text-left space-y-1.5 text-xs"
                  style={{ background: 'rgba(10,26,77,0.04)', border: '1px solid rgba(10,26,77,0.08)' }}>
                  <p className="font-bold text-slate-600 uppercase tracking-wide">How to register:</p>
                  <ol className="text-slate-500 space-y-1 list-decimal list-inside font-medium">
                    <li>Tap <strong>Institutional Login</strong> below</li>
                    <li>Sign in with your <strong>@neu.edu.ph</strong> Google account</li>
                    <li>You'll be taken to the registration form automatically</li>
                  </ol>
                </div>
                <button
                  onClick={() => setShowNotRegistered(false)}
                  className="w-full h-12 rounded-2xl font-bold text-sm text-white transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))' }}>
                  Got it
                </button>
              </div>
            </div>
            <style>{`@keyframes fadeIn { from{opacity:0} to{opacity:1} }`}</style>
          </div>
        )}

      </div>
    </div>
  );
}