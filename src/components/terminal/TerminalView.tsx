"use client";

import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Scan, ArrowRight, Loader2, Radio, ArrowLeft, LogOut, GraduationCap, Heart, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking, useAuth, useUser } from '@/firebase';
import { collection, query, where, limit, doc, getDoc, getDocs, orderBy, setDoc } from 'firebase/firestore';
import { signInAnonymously, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { isToday, parseISO } from 'date-fns';
import { formatStudentId } from '@/lib/student-id-formatter';
import { StudentRecord, UserRecord, DEPARTMENTS, ProgramRecord } from '@/lib/firebase-schema';

const PURPOSES = [
  { value: 'Reading Books', label: 'Reading & Private Study' },
  { value: 'Research',      label: 'Thesis & Research' },
  { value: 'Computer Use',  label: 'Computer Usage' },
  { value: 'Assignments',   label: 'Academic Assignments' },
];

export default function TerminalView({ onComplete, onAdminReturn }: { onComplete?: () => void; onAdminReturn?: () => void }) {
  const [step, setStep] = useState<'auth' | 'dept' | 'purpose' | 'success'>('auth');
  const [rfidInput,  setRfidInput]  = useState('');
  const [identifiedStudent, setIdentifiedStudent] = useState<StudentRecord | null>(null);
  const [isVisitor,  setIsVisitor]  = useState(false);
  const [purpose,    setPurpose]    = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [countdown,  setCountdown]  = useState(5);
  const [lastAction, setLastAction] = useState<'checkin' | 'checkout'>('checkin');
  const [notRegistered, setNotRegistered] = useState(false);

  // Dept/program for visitors
  const [visitorDeptId,  setVisitorDeptId]  = useState('');
  const [visitorProgram, setVisitorProgram] = useState('');
  const [allDepts,       setAllDepts]       = useState<{ deptID: string; departmentName: string }[]>([]);
  const [deptPrograms,   setDeptPrograms]   = useState<ProgramRecord[]>([]);
  const [isLoadingProgs, setIsLoadingProgs] = useState(false);

  const inputRef  = useRef<HTMLInputElement>(null);

  // ── Student ID auto-dash formatter — uses global utility ──────────────
  const handleRfidChange = (raw: string) => setRfidInput(formatStudentId(raw));
  const { toast } = useToast();
  const db   = useFirestore();
  const auth = useAuth();
  const { user: authUser } = useUser();

  useEffect(() => {
    if (!authUser) signInAnonymously(auth);
    if (step === 'auth' && inputRef.current) inputRef.current.focus();
  }, [step, authUser, auth]);

  // ── Dynamic purposes from Firestore ──
  const [livePurposes, setLivePurposes] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getDocs(query(collection(db, 'visit_purposes'), where('active', '==', true)))
      .then(snap => {
        if (snap.empty) { setLivePurposes(PURPOSES); return; }
        const sorted = snap.docs
          .map(d => d.data() as { value: string; label: string; order?: number })
          .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setLivePurposes(sorted.map(p => ({ value: p.value, label: p.label })));
      })
      .catch(() => setLivePurposes(PURPOSES));
  }, [db]);

  // Load all departments once
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
    // If the identified user is admin and onAdminReturn is provided, redirect to admin dashboard
    const wasAdmin = identifiedStudent?.role === 'admin' || identifiedStudent?.role === 'super_admin';
    setStep('auth'); setRfidInput(''); setIdentifiedStudent(null);
    setPurpose(''); setLastAction('checkin'); setIsVisitor(false);
    setVisitorDeptId(''); setVisitorProgram(''); setNotRegistered(false);
    if (wasAdmin && onAdminReturn) {
      onAdminReturn();
    }
  };

  const goToNextStep = (student: StudentRecord, needsDept: boolean) => {
    setIdentifiedStudent(student);
    setLastAction('checkin');
    if (needsDept) { setIsVisitor(true); setStep('dept'); }
    else { setStep('purpose'); }
  };

  const checkExistingLogs = async (student: StudentRecord, needsDept: boolean) => {
    const q = query(collection(db, 'library_logs'),
      where('studentId', '==', student.studentId),
      orderBy('checkInTimestamp', 'desc'), limit(1));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const log = snap.docs[0].data();
      if (!log.checkOutTimestamp && isToday(parseISO(log.checkInTimestamp))) {
        updateDocumentNonBlocking(doc(db, 'library_logs', snap.docs[0].id),
          { checkOutTimestamp: new Date().toISOString() });
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
      // 1. Check /users by doc ID (student ID or admin ID)
      let userDoc = await getDoc(doc(db, 'users', cleanId));

      // 2. If not found by ID, try email
      if (!userDoc.exists()) {
        const emailSnap = await getDocs(query(collection(db, 'users'), where('email', '==', cleanId.toLowerCase()), limit(1)));
        if (!emailSnap.empty) userDoc = emailSnap.docs[0] as any;
      }

      if (userDoc.exists()) {
        const data = userDoc.data() as UserRecord;
        if (data.status === 'blocked') {
          toast({ title: 'Access Blocked', description: 'Please visit the help desk.', variant: 'destructive' });
          return;
        }
        const asStudent: StudentRecord = {
          ...data,
          id:        data.id || cleanId,
          studentId: data.id || cleanId,
          isBlocked: (data.status as string) === 'blocked',
        };
        await checkExistingLogs(asStudent, !data.deptID || data.deptID === '');
        return;
      }

      // 2. Check /users by temporaryId field (visitors)
      const tvQ = query(collection(db, 'users'),
        where('temporaryId', '==', cleanId), limit(1));
      const tvSnap = await getDocs(tvQ);
      if (!tvSnap.empty) {
        const tv = tvSnap.docs[0].data();
        const asStudent: StudentRecord = {
          studentId: cleanId, id: tv.id || cleanId,
          firstName: tv.firstName, middleName: tv.middleName || '',
          lastName: tv.lastName, email: tv.email,
          deptID: tv.deptID || '', program: tv.program || '',
          role: 'visitor', status: tv.status || 'pending', isBlocked: (tv.status as string) === 'blocked',
        };
        await checkExistingLogs(asStudent, !tv.deptID || tv.deptID === '');
        return;
      }

      // 3. Check /users for admin/super_admin role
      const adminDoc = await getDoc(doc(db, 'users', cleanId));
      if (adminDoc.exists()) {
        const admin = adminDoc.data();
        // Only proceed if this is actually an admin/super_admin user
        if (!admin.role || !['admin', 'super_admin'].includes(admin.role)) {
          // ID not found — show registration prompt card
      setNotRegistered(true);
          return;
        }
        const asStudent: StudentRecord = {
          studentId: cleanId, id: cleanId,
          firstName:  admin.firstName || 'Staff',
          middleName: admin.middleName || '',
          lastName:   admin.lastName  || '',
          email:      admin.email || '',
          deptID:     admin.deptID || 'STAFF',
          program:    admin.program || '',
          role: 'admin', status: 'active', isBlocked: false,
        };
        // Admins don't need dept prompt — they have dept in their profile
        await checkExistingLogs(asStudent, false);
        return;
      }

      // ID not found — show registration prompt card
      setNotRegistered(true);
    } catch (e) {
      toast({ title: 'Registry Error', variant: 'destructive' });
    } finally { setIsSearching(false); }
  };

  const handleGoogleLogin = async () => {
    setIsSearching(true);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const email = result.user.email;
      const SUPER_ADMIN = 'shawndavidsobremontedomingo@gmail.com';
      if (!email?.endsWith('@neu.edu.ph') && email?.toLowerCase() !== SUPER_ADMIN) {
        toast({ title: 'Restricted', description: 'Academic accounts only.', variant: 'destructive' }); return;
      }
      // Look up by email in /users
      setRfidInput(email); // Store email so the "not registered" card can show it
      const uQ = query(collection(db, 'users'), where('email', '==', email), limit(1));
      const uSnap = await getDocs(uQ);
      if (!uSnap.empty) {
        const u = uSnap.docs[0].data();
        const isAdmin = u.role === 'admin' || u.role === 'super_admin';
        const asStudent: StudentRecord = {
          studentId: u.id, id: u.id,
          firstName: u.firstName, middleName: u.middleName || '',
          lastName: u.lastName, email: u.email,
          deptID: u.deptID || '', program: u.program || '',
          role: u.role, status: u.status, isBlocked: (u.status as string) === 'blocked',
        };
        // Admins never need dept prompt regardless of whether deptID is set
        await checkExistingLogs(asStudent, !isAdmin && (!u.deptID || u.deptID === ''));
        return;
      }
      setNotRegistered(true);
    } catch (e) {
      toast({ title: 'Authentication Failed', variant: 'destructive' });
    } finally { setIsSearching(false); }
  };

  const handleDeptConfirm = async () => {
    if (!visitorDeptId || !identifiedStudent) return;
    // Persist dept+program back to /users
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

  return (
    <div className="flex items-center justify-center min-h-screen p-4 sm:p-6">
      <div className="w-full max-w-lg">

        {/* ── NOT REGISTERED ── */}
        {notRegistered && (
          <Card className="rounded-[2.5rem] shadow-2xl p-10 space-y-8 animate-in fade-in zoom-in duration-500" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
            <button onClick={handleReset} className="flex items-center gap-2 text-slate-400 hover:text-primary font-bold text-[10px] uppercase tracking-widest">
              <ArrowLeft size={16} /> Back to Kiosk
            </button>
            <div className="text-center space-y-4">
              <div className="mx-auto w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center text-amber-500">
                <GraduationCap size={40} />
              </div>
              <h1 className="text-3xl font-bold font-headline text-slate-900">Not Registered</h1>
              <p className="text-slate-500 font-medium text-sm leading-relaxed max-w-xs mx-auto">
                Your ID <span className="font-bold font-mono text-slate-800">{rfidInput}</span> was not found in the system.
              </p>
            </div>
            <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100 space-y-2">
              <p className="text-sm font-bold text-blue-800">How to register:</p>
              <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside font-medium">
                <li>Go back to the main portal screen</li>
                <li>Click <strong>Student Portal</strong></li>
                <li>Sign in with your <strong>@neu.edu.ph</strong> Google account</li>
                <li>Your account will be created automatically</li>
                <li>Return to the kiosk to check in</li>
              </ol>
            </div>
            <Button onClick={handleReset} className="w-full h-14 text-base font-bold rounded-2xl">
              <ArrowLeft size={18} className="mr-2" /> Return to Kiosk
            </Button>
          </Card>
        )}

        {/* ── AUTH ── */}
        {!notRegistered && step === 'auth' && (
          <div className="rounded-[2rem] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-400"
            style={{ transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.01)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 32px 64px rgba(0,0,0,0.35)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}>
            {/* Blue gradient header — matches screenshot */}
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
            {/* White body */}
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
              <Button variant="outline" onClick={handleGoogleLogin} disabled={isSearching}
                className="w-full h-12 text-sm font-semibold rounded-2xl border border-slate-200 hover:bg-slate-50 transition-all"
                style={{ color: '#1e293b' }}>
                <div className="flex items-center gap-3">
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
                  Institutional Login
                </div>
              </Button>
            </div>
          </div>
        )}

        {/* ── DEPT/PROGRAM (visitors only) ── */}
        {step === 'dept' && identifiedStudent && (
          <Card className="rounded-[2.5rem] shadow-2xl p-10 space-y-6 animate-in slide-in-from-bottom-4 duration-500" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
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
              <Select value={visitorProgram} onValueChange={setVisitorProgram}
                disabled={!visitorDeptId || isLoadingProgs}>
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

        {/* ── PURPOSE ── */}
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
              <div className="w-full space-y-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Select Purpose of Visit</p>
                <div className="grid grid-cols-2 gap-3">
                  {(livePurposes.length > 0 ? livePurposes : PURPOSES).map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPurpose(p.value)}
                      className="flex items-center justify-center px-4 py-5 rounded-2xl font-bold text-sm text-center min-h-[80px]"
                      style={{
                        transition: 'all 0.3s ease-in-out',
                        ...(purpose === p.value
                          ? { background: 'hsl(221,72%,22%)', color: 'white', border: '2px solid hsl(221,72%,22%)', boxShadow: '0 8px 24px rgba(10,26,77,0.35)', transform: 'scale(1.02)' }
                          : { background: 'rgba(241,245,249,0.9)', color: '#1e3a6e', border: '1.5px solid rgba(203,213,225,0.8)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' })
                      }}
                      onMouseEnter={e => { if (purpose !== p.value) { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(10,26,77,0.12)'; } }}
                      onMouseLeave={e => { if (purpose !== p.value) { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; } }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex w-full gap-3">
                <button onClick={handleReset}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button onClick={handleCheckIn} disabled={!purpose}
                  className="flex-[2] py-3.5 rounded-2xl font-bold text-sm text-white transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))', boxShadow: purpose ? '0 6px 20px rgba(10,26,77,0.3)' : 'none' }}>
                  Check-In →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── SUCCESS — matches screenshots 3 & 4 ── */}
        {step === 'success' && identifiedStudent && (() => {
          const fullName    = `${identifiedStudent.firstName} ${identifiedStudent.lastName}`.trim();
          const collegeName = identifiedStudent.deptID === 'STAFF'
            ? 'Library Staff'
            : (DEPARTMENTS[identifiedStudent.deptID ?? ''] || identifiedStudent.deptID || '');
          const program     = identifiedStudent.program || '';
          const isCheckIn   = lastAction === 'checkin';
          return (
            <div className="rounded-[2rem] overflow-hidden shadow-2xl animate-in zoom-in duration-500"
              style={{ background: 'linear-gradient(160deg,hsl(225,70%,38%) 0%,hsl(221,72%,22%) 100%)' }}>

              {/* Full blue body */}
              <div className="px-8 pt-10 pb-4 text-center space-y-3">
                {/* Icon */}
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                  style={{ background: 'rgba(255,255,255,0.15)' }}>
                  {isCheckIn
                    ? <CheckCircle2 size={34} className="text-white" />
                    : <LogOut size={34} className="text-white" />}
                </div>
                {/* Status label */}
                <p className="text-white/50 text-xs font-bold uppercase tracking-widest pt-1">
                  {isCheckIn ? 'Check-In Logged' : 'Check-Out Logged'}
                </p>
                {/* Name */}
                <h2 className="text-3xl font-extrabold text-white leading-tight" style={{ fontFamily: "'Playfair Display',serif" }}>
                  {isCheckIn ? 'Welcome to NEU Library,' : 'Thank you,'}
                  <br />{fullName}!
                </h2>
                {/* College · Program */}
                {collegeName && (
                  <p className="text-white/45 text-xs font-bold uppercase tracking-widest">
                    {collegeName}{program ? ` · ${program}` : ''}
                  </p>
                )}
              </div>

              {/* Divider + message body */}
              <div className="mx-6 border-t border-white/15 mt-4" />
              <div className="px-8 py-6 text-center space-y-5">
                <p className="text-white/80 text-base font-medium leading-relaxed">
                  {isCheckIn
                    ? `Thank you for logging. You may now enter, ${identifiedStudent.firstName}.`
                    : `Your session has been recorded. Have a great day!`}
                </p>
                {/* Countdown */}
                <div className="flex items-center justify-center gap-3 text-white/60 text-sm font-semibold">
                  <span className="text-white font-extrabold text-xl" style={{ fontFamily: "'DM Mono',monospace" }}>{countdown}</span>
                  <span>Auto-reset in {countdown}s</span>
                </div>
                {/* Skip */}
                <button onClick={handleReset}
                  className="px-8 py-2 rounded-full font-bold text-sm text-white/60 hover:text-white border border-white/20 hover:border-white/50 transition-all">
                  Skip
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}