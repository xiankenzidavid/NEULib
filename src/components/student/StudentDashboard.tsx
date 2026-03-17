"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, limit, setDoc, doc, getDocs } from 'firebase/firestore';
import {
  LogOut, Clock, History, Activity, Loader2, Flame, Menu, X as XIcon,
  LayoutDashboard, TrendingUp, LogIn, Sparkles,
  BookOpen, ArrowLeft, BookMarked, UserCircle2,
  IdCard, GraduationCap, Building2, Mail, ArrowUpDown, ArrowUp, ArrowDown, Search, Bell, CheckCircle, ShieldCheck, FileEdit
} from 'lucide-react';
import {
  format, parseISO, isToday, differenceInMinutes,
  isWithinInterval, startOfDay, endOfDay, startOfWeek, startOfMonth, subDays, eachDayOfInterval
} from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { UserRecord, StudentRecord, LibraryLogRecord, DEPARTMENTS, ProgramRecord, toStudentRecord } from '@/lib/firebase-schema';
import { CredentialRequestModal } from '@/components/student/CredentialRequestModal';
import { OccupancyVerificationDialog } from '@/components/student/OccupancyVerificationDialog';

// ── Standalone History Tab with sortable table ──────────────────────────────
function HistoryTab({ logs, cardStyle }: { logs: LibraryLogRecord[]; cardStyle: React.CSSProperties }) {
  const [sortField, setSortField] = useState<'date' | 'purpose' | 'duration'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [purposeFilter, setPurposeFilter] = useState('All');
  const [search, setSearch] = useState('');

  const PURPOSES = ['All', 'Reading Books', 'Research', 'Computer Use', 'Assignments'];

  const processed = useMemo(() => {
    let rows = [...logs];
    if (purposeFilter !== 'All') rows = rows.filter(l => l.purpose === purposeFilter);
    if (search) rows = rows.filter(l =>
      format(parseISO(l.checkInTimestamp), 'MMM dd yyyy').toLowerCase().includes(search.toLowerCase()) ||
      l.purpose.toLowerCase().includes(search.toLowerCase())
    );
    rows.sort((a, b) => {
      let vA: number, vB: number;
      if (sortField === 'date') {
        vA = parseISO(a.checkInTimestamp).getTime();
        vB = parseISO(b.checkInTimestamp).getTime();
      } else if (sortField === 'purpose') {
        return sortOrder === 'asc'
          ? a.purpose.localeCompare(b.purpose)
          : b.purpose.localeCompare(a.purpose);
      } else {
        vA = a.checkOutTimestamp ? differenceInMinutes(parseISO(a.checkOutTimestamp), parseISO(a.checkInTimestamp)) : -1;
        vB = b.checkOutTimestamp ? differenceInMinutes(parseISO(b.checkOutTimestamp), parseISO(b.checkInTimestamp)) : -1;
      }
      return sortOrder === 'asc' ? vA - vB : vB - vA;
    });
    return rows;
  }, [logs, sortField, sortOrder, purposeFilter, search]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('desc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ArrowUpDown size={13} className="ml-1 opacity-40" />;
    return sortOrder === 'asc'
      ? <ArrowUp size={13} className="ml-1 text-blue-500" />
      : <ArrowDown size={13} className="ml-1 text-blue-500" />;
  };

  const navy = 'hsl(221,72%,22%)';

  return (
    <div style={cardStyle} className="overflow-hidden">
      {/* Header + filters */}
      <div className="px-4 sm:px-5 py-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-2xl" style={{ fontFamily: "'Playfair Display',serif" }}>Attendance Archive</h3>
            <p className="text-slate-400 text-sm mt-0.5">{processed.length} of {logs.length} sessions</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Search date, purpose..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 w-64 bg-slate-50 border-slate-200 rounded-xl text-sm" />
            </div>
            {/* Purpose filter chips */}
            <div className="flex items-center gap-1 flex-wrap">
              {PURPOSES.map(p => (
                <button key={p} onClick={() => setPurposeFilter(p)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 border"
                  style={purposeFilter === p
                    ? { background: navy, color: 'white', borderColor: navy }
                    : { background: 'white', color: 'hsl(221,40%,40%)', borderColor: 'rgba(10,26,77,0.15)' }
                  }>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      {processed.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm italic">No records match the current filters.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-3 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => toggleSort('date')}>
                  <div className="flex items-center text-sm font-bold text-slate-500 uppercase tracking-wide">Date <SortIcon field="date" /></div>
                </th>
                <th className="text-left px-4 py-3 hidden sm:table-cell text-sm font-bold text-slate-500 uppercase tracking-wide">Time In</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell text-sm font-bold text-slate-500 uppercase tracking-wide">Time Out</th>
                <th className="text-left px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => toggleSort('purpose')}>
                  <div className="flex items-center text-sm font-bold text-slate-500 uppercase tracking-wide">Purpose <SortIcon field="purpose" /></div>
                </th>
                <th className="text-right px-5 py-3 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => toggleSort('duration')}>
                  <div className="flex items-center justify-end text-sm font-bold text-slate-500 uppercase tracking-wide">Duration <SortIcon field="duration" /></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {processed.map(l => {
                const ci = parseISO(l.checkInTimestamp);
                const isNoTap = !l.checkOutTimestamp && !isToday(ci);
                const mins = l.checkOutTimestamp ? differenceInMinutes(parseISO(l.checkOutTimestamp), ci) : null;
                return (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors" style={{ height: '56px' }}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800 text-base">{format(ci, 'MMM dd, yyyy')}</p>
                      <p className="text-slate-400 text-xs">{format(ci, 'EEEE')}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-slate-700 text-base font-medium">{format(ci, 'h:mm a')}</span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-base font-medium" style={{
                        color: l.checkOutTimestamp ? '#475569' : isNoTap ? '#ef4444' : '#3b82f6'
                      }}>
                        {l.checkOutTimestamp ? format(parseISO(l.checkOutTimestamp), 'h:mm a') : isNoTap ? 'No Tap' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold px-3 py-1 rounded-full"
                        style={{ background: 'rgba(10,26,77,0.06)', color: navy }}>
                        {l.purpose}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-bold text-base" style={{ color: navy, fontFamily: "'DM Mono',monospace" }}>
                        {mins !== null ? (mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`) : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface StudentDashboardProps {
  onExit: () => void;
  resolvedUser?: import('@/lib/firebase-schema').UserRecord | null;
  onSwitchToAdmin?: () => void;
}

export default function StudentDashboard({ onExit, resolvedUser, onSwitchToAdmin }: StudentDashboardProps) {
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const db = useFirestore();
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'analytics' | 'messages' | 'profile'>('overview');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const studentQ = useMemoFirebase(
    () => user?.email ? query(collection(db, 'users'), where('email', '==', user.email), limit(1)) : null,
    [db, user?.email]
  );
  const { data: registry, isLoading: isProfileLoading } = useCollection<StudentRecord>(studentQ);
  const profile = registry?.[0] || null;

  const logsQ = useMemoFirebase(
    () => profile
      ? query(collection(db, 'library_logs'), where('studentId', '==', profile.id), orderBy('checkInTimestamp', 'desc'), limit(500))
      : null,
    [db, profile]
  );
  // Notifications from admin
  const notificationsQ = useMemoFirebase(
    () => profile?.id
      ? query(collection(db, 'notifications'), where('studentId', '==', profile.id), limit(30))
      : null,
    [db, profile?.id]
  );
  const { data: notifications } = useCollection<any>(notificationsQ);
  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  const markRead = async (notifId: string) => {
    if (!db) return;
    try {
      await setDoc(doc(db, 'notifications', notifId), { read: true }, { merge: true });
    } catch {}
  };

  const { data: logs } = useCollection<LibraryLogRecord>(logsQ);

  // Fetch program record for display in profile tab
  const programsQ = useMemoFirebase(
    () => profile?.deptID ? query(collection(db, 'programs'), where('deptID', '==', profile.deptID)) : null,
    [db, profile?.deptID]
  );
  const { data: deptPrograms } = useCollection<ProgramRecord>(programsQ);
  // Match by code (new) or name (legacy fallback for existing students with full name stored)
  const programEntry = deptPrograms?.find(
    p => p.code === profile?.program || p.name === profile?.program
  ) || null;

  const analytics = useMemo(() => {
    if (!logs) return { weekly: [], totalHours: 0 };
    const start = startOfDay(parseISO(startDate));
    const end = endOfDay(parseISO(endDate));
    const days = eachDayOfInterval({ start, end });
    const dateStats: Record<string, number> = {};
    let totalMinutes = 0;

    days.forEach(d => {
      if (format(d, 'EEE') !== 'Sun') dateStats[format(d, 'MMM dd')] = 0;
    });

    logs.forEach(l => {
      const date = parseISO(l.checkInTimestamp);
      if (isWithinInterval(date, { start, end })) {
        if (l.checkOutTimestamp) totalMinutes += differenceInMinutes(parseISO(l.checkOutTimestamp), date);
        if (format(date, 'EEE') !== 'Sun') {
          const key = format(date, 'MMM dd');
          if (key in dateStats) dateStats[key] += 1;
        }
      }
    });

    // Purpose breakdown using ALL logs (not date filtered)
    const purposeCounts: Record<string, number> = {};
    (logs || []).forEach(l => {
      const p = l.purpose || 'Other';
      purposeCounts[p] = (purposeCounts[p] || 0) + 1;
    });
    const purposeData = Object.entries(purposeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    return {
      weekly: Object.entries(dateStats).map(([name, visits]) => ({ name, visits })),
      totalHours: Math.round(totalMinutes / 60),
      purposeData,
    };
  }, [logs, startDate, endDate]);

  // ── 3-hour occupancy verification trigger ─────────────────────────────────
  const verifyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [verifyLogId, setVerifyLogId] = useState<string | null>(null);

  useEffect(() => {
    if (!logs || !profile) return;
    const activeLog = logs.find(l => !l.checkOutTimestamp && isToday(parseISO(l.checkInTimestamp)));
    if (!activeLog) {
      if (verifyTimerRef.current) { clearTimeout(verifyTimerRef.current); verifyTimerRef.current = null; }
      return;
    }
    const THREE_HOURS = 3 * 60 * 60 * 1000;
    const elapsed     = Date.now() - parseISO(activeLog.checkInTimestamp).getTime();
    const blocksPassed = Math.floor(elapsed / THREE_HOURS);
    const msUntilNext  = THREE_HOURS - (elapsed % THREE_HOURS);

    if (blocksPassed >= 1 && !showVerifyDialog) {
      setVerifyLogId(activeLog.id);
      setShowVerifyDialog(true);
    }
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current);
    verifyTimerRef.current = setTimeout(() => {
      setVerifyLogId(activeLog.id);
      setShowVerifyDialog(true);
    }, msUntilNext);

    return () => { if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current); };
  }, [logs, profile, showVerifyDialog]);

  // ── Visit streak calculation — must be before any early returns ──────────
  const { currentStreak, longestStreak } = useMemo(() => {
    if (!logs || logs.length === 0) return { currentStreak: 0, longestStreak: 0 };

    const visitDays = new Set<string>();
    logs.forEach(l => {
      if (l.checkOutTimestamp || isToday(parseISO(l.checkInTimestamp))) {
        visitDays.add(format(parseISO(l.checkInTimestamp), 'yyyy-MM-dd'));
      }
    });

    if (visitDays.size === 0) return { currentStreak: 0, longestStreak: 0 };

    const days = [...visitDays].sort().reverse();
    const today     = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

    let current = 0;
    if (days[0] === today || days[0] === yesterday) {
      let check = days[0] === today ? new Date() : subDays(new Date(), 1);
      for (const day of days) {
        if (day === format(check, 'yyyy-MM-dd')) { current++; check = subDays(check, 1); }
        else break;
      }
    }

    const allDays = [...visitDays].sort();
    let longest = 1, run = 1;
    for (let i = 1; i < allDays.length; i++) {
      const diff = Math.round((parseISO(allDays[i]).getTime() - parseISO(allDays[i-1]).getTime()) / 86400000);
      if (diff === 1) { run++; if (run > longest) longest = run; }
      else run = 1;
    }

    return { currentStreak: current, longestStreak: longest };
  }, [logs]);

  // ── Admin bypass — fetch admin record if email matches /admins ──
  // Use resolvedUser directly if it's admin — avoids async flash to "Identity Not Found"
  const resolvedIsAdmin = resolvedUser && (resolvedUser.role === 'admin' || resolvedUser.role === 'super_admin');

  // ── Persistence fix: restore from sessionStorage so refresh doesn't lose admin state ──
  const storedAdminRecord = (() => {
    try { const s = sessionStorage.getItem('neu_admin_record'); return s ? JSON.parse(s) : null; } catch { return null; }
  })();
  const storedIsAdmin = (() => {
    try { return sessionStorage.getItem('neu_is_admin') === 'true'; } catch { return false; }
  })();

  const [isAdminEmailRaw,  setIsAdminEmailRaw]  = useState<boolean>(!!resolvedIsAdmin || storedIsAdmin);
  const [confirmSwitch,    setConfirmSwitch]     = useState(false);
  const [menuOpen,         setMenuOpen]          = useState(false);
  const [credRequestOpen,  setCredRequestOpen]   = useState(false);
  const [adminRecord,   setAdminRecordRaw]   = useState<any>(resolvedIsAdmin ? resolvedUser : storedAdminRecord);

  const isAdminEmail = isAdminEmailRaw;
  const setIsAdminEmail = (v: boolean) => {
    setIsAdminEmailRaw(v);
    try { sessionStorage.setItem('neu_is_admin', String(v)); } catch {}
  };
  const setAdminRecord = (v: any) => {
    setAdminRecordRaw(v);
    try { if (v) sessionStorage.setItem('neu_admin_record', JSON.stringify(v)); else sessionStorage.removeItem('neu_admin_record'); } catch {}
  };

  useEffect(() => {
    if (resolvedUser && (resolvedUser.role === 'admin' || resolvedUser.role === 'super_admin')) {
      setIsAdminEmail(true);
      setAdminRecord(resolvedUser);
      return;
    }
    // Use cached value on refresh — only re-query when no cached state exists
    if (storedIsAdmin && storedAdminRecord) return;
    if (!user?.email) { setIsAdminEmail(false); setAdminRecord(null); return; }
    getDocs(query(collection(db, 'users'), where('email', '==', user.email), where('role', 'in', ['admin', 'super_admin']), limit(1)))
      .then(snap => {
        if (!snap.empty) { setIsAdminEmail(true); setAdminRecord(snap.docs[0].data()); }
        else             { setIsAdminEmail(false); setAdminRecord(null); }
      })
      .catch(() => { setIsAdminEmail(false); setAdminRecord(null); });
  }, [user?.email, db, resolvedUser]); // removed `profile` — that was the cause of the bail bug

  // ── Loading — wait for auth, profile, AND admin-email check ──
  if (isUserLoading || isProfileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="p-5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.92)' }}>
            <Loader2 className="animate-spin w-10 h-10" style={{ color: 'hsl(221,72%,22%)' }} />
          </div>
          <p className="text-white font-semibold text-xs tracking-widest uppercase opacity-70">Loading Portal...</p>
        </div>
      </div>
    );
  }

  // ── Not registered ──
  if (!profile && user && !isAdminEmail && !resolvedIsAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm p-8 text-center space-y-6 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.95)', boxShadow: '0 8px 40px rgba(10,26,77,0.15)' }}>
          <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'hsl(221,72%,22%,0.08)', color: 'hsl(221,72%,22%)' }}>
            <Activity size={36} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
              Identity Not Found
            </h2>
            <p className="text-slate-500 text-sm mt-2 leading-relaxed">
              Your account is not registered. Please visit the help desk for enrollment.
            </p>
          </div>
          <button onClick={onExit}
            className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
            style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))', color: 'white' }}>
            <ArrowLeft size={15} /> Return to Portal
          </button>
        </div>
      </div>
    );
  }

  // For admins accessing the student portal: use structured name fields from AdminRecord.
  const adminFirstName  = adminRecord?.firstName  || '';
  const adminMiddleName = adminRecord?.middleName || '';
  const adminLastName   = adminRecord?.lastName   || '';
  const adminFullName   = [adminFirstName, adminMiddleName, adminLastName].filter(Boolean).join(' ')
    || user?.displayName || 'Staff';

  const firstName   = profile?.firstName || (isAdminEmail ? adminFirstName : user?.displayName?.split(' ')[0]) || 'Staff';
  const lastName    = profile?.lastName  || (isAdminEmail ? adminLastName  : '') || '';
  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : isAdminEmail ? adminFullName : user?.displayName || 'Staff';
  const initials = displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
  const dept = DEPARTMENTS[profile?.deptID || ''] || (isAdminEmail ? 'Library Staff' : 'Institutional Guest');

  const navItems = [
    { id: 'overview',  label: 'Dashboard', icon: LayoutDashboard },
    { id: 'history',   label: 'History',   icon: History },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'messages',  label: 'Messages',  icon: Bell },
    { id: 'profile',   label: 'Profile',   icon: UserCircle2 },
  ];

  const navyGrad = 'linear-gradient(135deg,hsl(221,72%,18%),hsl(221,72%,24%))'; 
  const cardStyle = {
    background: 'rgba(255,255,255,0.93)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.8)',
    boxShadow: '0 4px 20px rgba(10,26,77,0.08)',
    borderRadius: '1rem',
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* ══ SIDEBAR — solid navy, desktop only ══ */}
      <aside className="hidden lg:flex w-64 xl:w-72 flex-col flex-shrink-0 sticky top-0 h-screen"
        style={{ background: navyGrad, borderRight: '1px solid rgba(255,255,255,0.08)', boxShadow: '4px 0 32px rgba(0,0,0,0.2)' }}>

        {/* Logo */}
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0">
            <img src="/neu_logo.png" alt="NEU" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}} /></div>
          <div>
            <p className="text-white font-bold text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>NEU Library</p>
            <p className="text-white/40 font-medium" style={{ fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Student Portal</p>
          </div>
        </div>

        {/* User card */}
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,hsl(43,85%,55%),hsl(38,90%,48%))', color: 'hsl(221,72%,12%)' }}>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-base leading-tight">{displayName}</p>
            <p className="text-white/45 font-medium truncate" style={{ fontSize: '0.82rem' }}>{dept}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id as any)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-base font-semibold transition-all text-left"
              style={{
                background: activeTab === item.id ? 'rgba(255,255,255,0.14)' : 'transparent',
                color: activeTab === item.id ? 'white' : 'rgba(255,255,255,0.45)',
                borderLeft: activeTab === item.id ? '3px solid hsl(43,85%,55%)' : '3px solid transparent',
              }}>
              <item.icon size={20} />
              <span className="flex-1">{item.label}</span>
              {item.id === 'messages' && unreadCount > 0 && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'hsl(43,85%,52%)', color: 'hsl(221,72%,15%)' }}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Sign out + switcher */}
        <div className="p-4 border-t border-white/10 space-y-2">
          {/* Admin↔Student switcher — only for admin users */}
          {onSwitchToAdmin && (isAdminEmail || resolvedIsAdmin) && (
            <>
              <button onClick={() => setConfirmSwitch(true)}
                className="w-full flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-sm font-bold transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)' }}>
                <span className="text-white/50 hover:text-white/80 transition-colors text-[11px] font-bold">Admin</span>
                <span className="text-white/30">|</span>
                <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.9)', color: 'hsl(221,72%,22%)' }}>Student</span>
              </button>
            </>
          )}
          <button onClick={onExit}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-base font-semibold transition-all text-left"
            style={{ color: 'rgba(255,255,255,0.35)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
            <LogOut size={17} /> Sign Out
          </button>
        </div>
      </aside>

      {/* ══ MAIN ══ */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top header bar */}
        <div className="sticky top-0 z-40 px-4 sm:px-6 py-3 flex items-center justify-between border-b"
          style={{ background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(20px)', borderColor: 'rgba(10,26,77,0.08)' }}>
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl transition-all active:scale-95"
              style={{ background: 'hsl(221,72%,22%,0.08)', color: 'hsl(221,72%,22%)' }}
              aria-label="Open menu">
              <Menu size={22} />
            </button>
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                Welcome, {displayName}!
              </h1>
              <p className="text-slate-400 text-sm font-medium mt-0.5 hidden sm:block truncate max-w-none">{dept}</p>
            </div>
          </div>
        </div>

        {/* ── MOBILE HAMBURGER DRAWER ── */}
        {menuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[60] lg:hidden"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
              onClick={() => setMenuOpen(false)}
            />
            {/* Drawer */}
            <div
              className="fixed top-0 left-0 bottom-0 z-[70] lg:hidden flex flex-col w-72"
              style={{ background: navyGrad, boxShadow: '4px 0 32px rgba(0,0,0,0.35)', paddingBottom: 'env(safe-area-inset-bottom,0px)' }}>

              {/* Drawer header — user card */}
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,hsl(43,85%,55%),hsl(38,90%,48%))', color: 'hsl(221,72%,12%)' }}>
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm leading-tight truncate max-w-[150px]">{displayName}</p>
                    <p className="text-white/45 font-medium truncate max-w-[150px]" style={{ fontSize: '0.75rem' }}>{dept}</p>
                  </div>
                </div>
                <button onClick={() => setMenuOpen(false)}
                  className="p-2 rounded-xl hover:bg-white/10 transition-all text-white/50 hover:text-white flex-shrink-0">
                  <XIcon size={18} />
                </button>
              </div>

              {/* Nav items */}
              <nav className="flex-1 p-3 overflow-y-auto space-y-0.5" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.2) transparent" }}>
                {navItems.map(item => (
                  <button key={item.id}
                    onClick={() => { setActiveTab(item.id as any); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all text-left active:scale-95"
                    style={{
                      background: activeTab === item.id ? 'rgba(255,255,255,0.14)' : 'transparent',
                      color:      activeTab === item.id ? 'white'                  : 'rgba(255,255,255,0.55)',
                      borderLeft: activeTab === item.id ? '3px solid hsl(43,85%,55%)' : '3px solid transparent',
                    }}>
                    <item.icon size={18} />
                    <span className="flex-1">{item.label}</span>
                    {item.id === 'messages' && unreadCount > 0 && (
                      <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold"
                        style={{ background: 'hsl(43,85%,52%)', color: 'hsl(221,72%,15%)' }}>
                        {unreadCount}
                      </span>
                    )}
                  </button>
                ))}
              </nav>

              {/* Bottom actions */}
              <div className="p-4 border-t border-white/10 space-y-2">
                {onSwitchToAdmin && (isAdminEmail || resolvedIsAdmin) && (
                  <button onClick={() => { setMenuOpen(false); setConfirmSwitch(true); }}
                    className="w-full flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl text-sm font-bold transition-all active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
                    <span className="text-white/55 text-[11px] font-bold">Admin</span>
                    <span className="text-white/30">|</span>
                    <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.9)', color: 'hsl(221,72%,22%)' }}>Student</span>
                  </button>
                )}
                <button
                  onClick={() => { setMenuOpen(false); onExit?.(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-left transition-all active:scale-95"
                  style={{ color: '#f87171', background: 'rgba(248,113,113,0.1)' }}>
                  <LogOut size={16} /> Sign Out
                </button>
              </div>
            </div>
          </>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6 space-y-4 sm:space-y-5" style={{ scrollbarWidth: "thin", scrollbarColor: "hsl(221,72%,70%) transparent" }}>
          <div key={activeTab} className="animate-in fade-in duration-200">

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl col-span-1 flex items-center gap-3" style={cardStyle}>
                  <div className="p-3 rounded-xl text-white flex-shrink-0" style={{ background: 'hsl(221,72%,22%)' }}>
                    <Clock size={22} />
                  </div>
                  <div>
                    <p className="text-slate-400 font-semibold text-xs uppercase tracking-wide">Study Time</p>
                    <p className="text-2xl font-bold text-slate-900 mt-0.5">
                      {analytics.totalHours}<span className="text-sm font-medium text-slate-400 ml-1">hrs</span>
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl col-span-1 flex items-center gap-3" style={cardStyle}>
                  <div className="p-3 rounded-xl text-white flex-shrink-0" style={{ background: '#059669' }}>
                    <Activity size={22} />
                  </div>
                  <div>
                    <p className="text-slate-400 font-semibold text-xs uppercase tracking-wide">Status</p>
                    <p className="text-2xl font-bold mt-0.5" style={{ color: '#059669' }}>Active</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl col-span-2 sm:col-span-1 flex items-center gap-3" style={cardStyle}>
                  <div className="p-3 rounded-xl text-white flex-shrink-0" style={{ background: '#334155' }}>
                    <BookMarked size={22} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-slate-400 font-semibold text-xs uppercase tracking-wide">Student ID</p>
                    <p className="text-lg font-bold text-slate-900 mt-0.5 truncate"
                      style={{ fontFamily: "'DM Mono',monospace" }}>
                      {profile?.id || '—'}
                    </p>
                  </div>
                </div>

                {/* Streak cards */}
                <div className="p-4 rounded-2xl col-span-1 flex items-center gap-3" style={cardStyle}>
                  <div className="p-3 rounded-xl text-white flex-shrink-0" style={{ background: 'hsl(38,90%,48%)' }}>
                    <Flame size={22} />
                  </div>
                  <div>
                    <p className="text-slate-400 font-semibold text-xs uppercase tracking-wide">Current Streak</p>
                    <p className="text-2xl font-bold text-slate-900 mt-0.5">
                      {currentStreak}<span className="text-sm font-medium text-slate-400 ml-1">days</span>
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl col-span-1 flex items-center gap-3" style={cardStyle}>
                  <div className="p-3 rounded-xl text-white flex-shrink-0" style={{ background: '#7c3aed' }}>
                    <Flame size={22} />
                  </div>
                  <div>
                    <p className="text-slate-400 font-semibold text-xs uppercase tracking-wide">Best Streak</p>
                    <p className="text-2xl font-bold text-slate-900 mt-0.5">
                      {longestStreak}<span className="text-sm font-medium text-slate-400 ml-1">days</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Recent sessions — clean table matching admin style */}
              <div style={cardStyle} className="overflow-hidden">
                <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="live-dot" style={{ width: 8, height: 8 }} />
                    <h3 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>Live Traffic</h3>
                  </div>
                  <button onClick={() => setActiveTab('history')}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95 transition-all">
                    View All
                  </button>
                </div>

                {(!logs || logs.length === 0) ? (
                  <div className="py-10 text-center text-slate-400 text-sm italic">No sessions recorded yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-400">Date</th>
                          <th className="text-left px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-400">Time In</th>
                          <th className="text-left px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-400">Time Out</th>
                          <th className="text-left px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-400 hidden sm:table-cell">Duration</th>
                          <th className="text-left px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-400">Purpose</th>
                          <th className="text-right px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-400">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {logs.slice(0, 5).map(l => {
                          const checkIn  = parseISO(l.checkInTimestamp);
                          const isNoTap  = !l.checkOutTimestamp && !isToday(checkIn);
                          const mins     = l.checkOutTimestamp
                            ? differenceInMinutes(parseISO(l.checkOutTimestamp), checkIn)
                            : null;
                          const duration = mins !== null
                            ? (mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`)
                            : '—';
                          return (
                            <tr key={l.id} className="hover:bg-slate-50 transition-colors" style={{ height: '56px' }}>
                              <td className="px-4 py-3 font-semibold text-slate-800 text-base">{format(checkIn, 'MMM dd, yyyy')}</td>
                              <td className="px-4 py-3 text-slate-700 font-medium text-base">{format(checkIn, 'h:mm a')}</td>
                              <td className="px-4 py-3 font-medium text-base" style={{ color: l.checkOutTimestamp ? '#475569' : isNoTap ? '#ef4444' : '#3b82f6' }}>
                                {l.checkOutTimestamp ? format(parseISO(l.checkOutTimestamp), 'h:mm a') : isNoTap ? 'No Tap' : 'Active'}
                              </td>
                              <td className="px-4 py-3 text-slate-600 text-base font-medium hidden sm:table-cell">{duration}</td>
                              <td className="px-4 py-3">
                                <span className="text-sm font-semibold px-3 py-1.5 rounded-full"
                                  style={{ background: 'hsl(221,72%,22%,0.07)', color: 'hsl(221,72%,22%)' }}>
                                  {l.purpose}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {l.checkOutTimestamp
                                  ? <span className="text-sm font-semibold px-3 py-1.5 rounded-full bg-slate-100 text-slate-500">Done</span>
                                  : isNoTap
                                    ? <span className="text-sm font-semibold px-3 py-1.5 rounded-full bg-red-50 text-red-500">No Tap</span>
                                    : <span className="text-sm font-semibold px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 animate-pulse">Active</span>
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Visit by Purpose chart */}
              {analytics.purposeData && analytics.purposeData.length > 0 && (
                <div style={cardStyle} className="overflow-hidden">
                  <div className="px-4 sm:px-5 py-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>Visits by Purpose</h3>
                    <p className="text-slate-400 text-sm mt-0.5">Breakdown of your library session types</p>
                  </div>
                  <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4">
                    <div className="h-48 w-full sm:w-64 flex-shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={analytics.purposeData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {analytics.purposeData.map((_, i) => (
                              <Cell key={i} fill={[
                                'hsl(221,72%,22%)', 'hsl(43,85%,52%)', '#059669', '#7c3aed', '#0284c7', '#db2777'
                              ][i % 6]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: '13px' }}
                            formatter={(val: number) => [`${val} visit${val > 1 ? 's' : ''}`, '']}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 w-full space-y-2.5">
                      {analytics.purposeData.map((entry, i) => {
                        const total = analytics.purposeData.reduce((s, e) => s + e.value, 0);
                        const pct   = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                        const color = ['hsl(221,72%,22%)', 'hsl(43,85%,52%)', '#059669', '#7c3aed', '#0284c7', '#db2777'][i % 6];
                        return (
                          <div key={entry.name}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-slate-700">{entry.name}</span>
                              <span className="text-sm font-bold" style={{ color }}>{entry.value} ({pct}%)</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── HISTORY ── */}
          {activeTab === 'history' && (
            <HistoryTab logs={logs || []} cardStyle={cardStyle} />
          )}

          {/* ── ANALYTICS ── */}
          {activeTab === 'analytics' && (
            <div style={cardStyle} className="overflow-hidden">
              <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-2xl" style={{ fontFamily: "'Playfair Display',serif" }}>Engagement Trends</h3>
                  <p className="text-slate-400 text-sm mt-0.5">Daily visit frequency over time</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Preset buttons */}
                  {([
                    { label: 'Today',      start: format(new Date(), 'yyyy-MM-dd'),                                     end: format(new Date(), 'yyyy-MM-dd') },
                    { label: 'This Week',  start: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),   end: format(new Date(), 'yyyy-MM-dd') },
                    { label: 'This Month', start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),                       end: format(new Date(), 'yyyy-MM-dd') },
                    { label: 'All Time',   start: '2020-01-01',                                                         end: format(new Date(), 'yyyy-MM-dd') },
                  ]).map(p => (
                    <button key={p.label}
                      onClick={() => { setStartDate(p.start); setEndDate(p.end); }}
                      className="px-4 py-2 rounded-xl text-sm font-bold border transition-all active:scale-95"
                      style={{
                        background:  startDate === p.start && endDate === p.end ? 'hsl(221,72%,22%)' : '#f8fafc',
                        color:       startDate === p.start && endDate === p.end ? 'white' : '#64748b',
                        borderColor: startDate === p.start && endDate === p.end ? 'hsl(221,72%,22%)' : '#e2e8f0',
                      }}>
                      {p.label}
                    </button>
                  ))}
                  {/* Divider */}
                  <span className="text-slate-200 text-lg font-light">|</span>
                  {/* Date range pickers */}
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    style={{ height:'38px', padding:'0 10px', borderRadius:'10px', border:'1px solid #e2e8f0',
                      background:'#f8fafc', fontSize:'0.85rem', fontWeight:600, color:'#1e293b',
                      cursor:'pointer', outline:'none', width:'140px' }} />
                  <span className="text-slate-300 font-medium">—</span>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    style={{ height:'38px', padding:'0 10px', borderRadius:'10px', border:'1px solid #e2e8f0',
                      background:'#f8fafc', fontSize:'0.85rem', fontWeight:600, color:'#1e293b',
                      cursor:'pointer', outline:'none', width:'140px' }} />
                </div>
              </div>

              <div className="p-4 sm:p-5">
                <div className="h-56 sm:h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.weekly} margin={{ top: 0, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeOpacity={0.06} strokeDasharray="4 4" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} dy={6} />
                      <YAxis axisLine={false} tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} />
                      <Tooltip
                        cursor={{ fill: 'rgba(10,26,77,0.04)', radius: 8 }}
                        contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: '12px', padding: '10px' }} />
                      <Bar dataKey="visits" radius={[5, 5, 2, 2]} barSize={28}>
                        {analytics.weekly.map((entry, i) => (
                          <Cell key={i} fill={entry.visits > 0 ? 'hsl(221,72%,22%)' : 'hsl(220,20%,93%)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Study Hours</p>
                    <p className="text-3xl font-bold text-slate-900 mt-1" style={{ fontFamily: "'Playfair Display',serif" }}>
                      {analytics.totalHours}<span className="text-sm font-medium text-slate-400 ml-1">hrs</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Total Visits</p>
                    <p className="text-3xl font-bold text-slate-900 mt-1" style={{ fontFamily: "'Playfair Display',serif" }}>
                      {analytics.weekly.reduce((a, b) => a + b.visits, 0)}
                      <span className="text-sm font-medium text-slate-400 ml-1">visits</span>
                    </p>
                  </div>
                </div>

                {/* Purpose breakdown in analytics */}
                {analytics.purposeData && analytics.purposeData.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Visits by Purpose</p>
                    <div className="space-y-2.5">
                      {analytics.purposeData.map((entry, i) => {
                        const total = analytics.purposeData.reduce((s, e) => s + e.value, 0);
                        const pct   = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                        const color = ['hsl(221,72%,22%)', 'hsl(43,85%,52%)', '#059669', '#7c3aed', '#0284c7', '#db2777'][i % 6];
                        return (
                          <div key={entry.name}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-slate-700">{entry.name}</span>
                              <span className="text-sm font-bold" style={{ color }}>{entry.value} ({pct}%)</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── MESSAGES ── */}
          {activeTab === 'messages' && (
            <div style={cardStyle} className="overflow-hidden">
              <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-2xl" style={{ fontFamily: "'Playfair Display',serif" }}>Messages</h3>
                  <p className="text-slate-400 text-sm mt-0.5">Notifications from library staff</p>
                </div>
                {unreadCount > 0 && (
                  <span className="text-sm font-bold px-3 py-1 rounded-full"
                    style={{ background: 'hsl(43,85%,52%,0.15)', color: 'hsl(43,75%,35%)' }}>
                    {unreadCount} unread
                  </span>
                )}
              </div>
              {(!notifications || notifications.length === 0) ? (
                <div className="py-16 text-center">
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-slate-400 text-sm font-medium">No messages yet</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {[...(notifications || [])].sort((a, b) => b.sentAt?.localeCompare(a.sentAt || '') || 0).map((n: any) => (
                    <div key={n.id}
                      className="px-5 py-4 flex items-start gap-4 transition-colors"
                      style={{ background: n.read ? 'transparent' : 'hsl(43,85%,52%,0.04)' }}>
                      <div className="p-2.5 rounded-xl flex-shrink-0 mt-0.5"
                        style={{ background: n.read ? '#f1f5f9' : 'hsl(43,85%,52%,0.15)', color: n.read ? '#94a3b8' : 'hsl(43,75%,35%)' }}>
                        <Bell size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-bold uppercase tracking-wide"
                            style={{ color: 'hsl(221,72%,22%)' }}>Library Staff</span>
                          <span className="text-xs text-slate-400 font-medium flex-shrink-0">
                            {format(parseISO(n.sentAt), 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <p className="text-slate-800 text-sm font-medium leading-relaxed">{n.message}</p>
                        {!n.read && (
                          <button onClick={() => markRead(n.id)}
                            className="mt-2 flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors">
                            <CheckCircle size={12} /> Mark as read
                          </button>
                        )}
                      </div>
                      {!n.read && (
                        <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2"
                          style={{ background: 'hsl(43,85%,52%)' }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── PROFILE ── */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              {/* Profile Card */}
              <div style={cardStyle} className="overflow-hidden">
                {/* Header banner */}
                <div className="h-24 relative" style={{background:'linear-gradient(135deg,hsl(221,72%,18%),hsl(221,72%,30%))'}}>
                  <div className="absolute -bottom-8 left-5">
                    <div className="w-16 h-16 rounded-2xl border-4 border-white flex items-center justify-center font-bold text-2xl text-white shadow-xl"
                      style={{background:'linear-gradient(135deg,hsl(43,85%,52%),hsl(38,90%,44%))'}}>
                      {initials}
                    </div>
                  </div>
                </div>
                <div className="pt-10 px-5 pb-5">
                  <h2 className="font-bold text-slate-900 text-2xl" style={{fontFamily:"'Playfair Display',serif"}}>
                    {displayName}
                  </h2>
                  <p className="text-slate-400 text-sm font-medium mt-1">{profile?.email || user?.email}</p>
                </div>
              </div>

              {/* Info Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                {/* Student ID */}
                <div style={cardStyle} className="p-4 flex items-start gap-3">
                  <div className="p-2.5 rounded-xl text-white flex-shrink-0" style={{background:'hsl(221,72%,22%)'}}>
                    <IdCard size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-400" style={{fontSize:'0.75rem',letterSpacing:'0.08em',textTransform:'uppercase'}}>Student ID</p>
                    <p className="font-bold text-slate-900 text-base mt-0.5" style={{fontFamily:"'DM Mono',monospace"}}>
                      {profile?.id || '—'}
                    </p>
                  </div>
                </div>

                {/* Email */}
                <div style={cardStyle} className="p-4 flex items-start gap-3">
                  <div className="p-2.5 rounded-xl text-white flex-shrink-0" style={{background:'hsl(221,60%,38%)'}}>
                    <Mail size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-400" style={{fontSize:'0.75rem',letterSpacing:'0.08em',textTransform:'uppercase'}}>Institutional Email</p>
                    <p className="font-bold text-slate-900 text-base mt-0.5 truncate">{profile?.email || user?.email || '—'}</p>
                  </div>
                </div>

                {/* Department */}
                <div style={cardStyle} className="p-4 flex items-start gap-3">
                  <div className="p-2.5 rounded-xl text-white flex-shrink-0" style={{background:'#059669'}}>
                    <Building2 size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-400" style={{fontSize:'0.75rem',letterSpacing:'0.08em',textTransform:'uppercase'}}>Department</p>
                    <p className="font-bold text-slate-900 text-base mt-0.5">
                      {profile?.deptID
                        ? <><span className="font-bold px-2 py-0.5 rounded-md mr-2 text-xs"
                            style={{background:'hsl(221,72%,22%,0.08)',color:'hsl(221,72%,22%)'}}>{profile.deptID}</span>
                          {DEPARTMENTS[profile.deptID] || profile.deptID}</>
                        : '—'}
                    </p>
                  </div>
                </div>

                {/* Program */}
                <div style={cardStyle} className="p-4 flex items-start gap-3">
                  <div className="p-2.5 rounded-xl text-white flex-shrink-0" style={{background:'#7c3aed'}}>
                    <GraduationCap size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-400" style={{fontSize:'0.75rem',letterSpacing:'0.08em',textTransform:'uppercase'}}>Academic Program</p>
                    <p className="font-bold text-slate-900 text-sm mt-0.5 leading-snug">
                      {profile?.program
                    ? programEntry
                      ? <><span className="font-bold mr-2 text-sm px-2.5 py-1 rounded-lg" style={{background:'hsl(262,83%,58%,0.1)',color:'hsl(262,83%,45%)',fontFamily:"'DM Mono',monospace"}}>{programEntry.code}</span><span className="text-slate-700">{programEntry.name}</span></>
                      : <><span className="font-bold mr-2 text-sm px-2.5 py-1 rounded-lg" style={{background:'hsl(221,72%,22%,0.08)',color:'hsl(221,72%,22%)',fontFamily:"'DM Mono',monospace"}}>{profile.program}</span></>
                    : <span className="text-slate-400 font-medium italic text-xs">Not assigned yet — contact your admin</span>
                  }
                    </p>
                  </div>
                </div>

              </div>

              {/* Request Credential Change */}
              {profile && (
                <button
                  onClick={() => setCredRequestOpen(true)}
                  className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl font-bold text-sm text-white transition-all active:scale-95"
                  style={{ background: `linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))` }}>
                  <FileEdit size={16} /> Request Credential Change
                </button>
              )}

              {/* Activity Summary */}
              <div style={cardStyle} className="p-4">
                <p className="font-bold text-slate-900 text-xl mb-4" style={{fontFamily:"'Playfair Display',serif"}}>Activity Summary</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 rounded-xl" style={{background:'hsl(221,72%,22%,0.05)'}}>
                    <p className="font-bold text-3xl text-slate-900" style={{fontFamily:"'Playfair Display',serif"}}>{logs?.length || 0}</p>
                    <p className="text-slate-400 font-semibold" style={{fontSize:'0.72rem',textTransform:'uppercase',letterSpacing:'0.06em'}}>Total Visits</p>
                  </div>
                  <div className="text-center p-3 rounded-xl" style={{background:'hsl(221,72%,22%,0.05)'}}>
                    <p className="font-bold text-3xl text-slate-900" style={{fontFamily:"'Playfair Display',serif"}}>{analytics.totalHours}</p>
                    <p className="text-slate-400 font-semibold" style={{fontSize:'0.72rem',textTransform:'uppercase',letterSpacing:'0.06em'}}>Study Hours</p>
                  </div>
                  <div className="text-center p-3 rounded-xl" style={{background:'hsl(221,72%,22%,0.05)'}}>
                    <p className="font-bold text-xl" style={{fontFamily:"'Playfair Display',serif",color:'#059669'}}>
                      {profile?.isBlocked ? '🔒' : '✓'}
                    </p>
                    <p className="text-slate-400 font-semibold" style={{fontSize:'0.58rem',textTransform:'uppercase',letterSpacing:'0.08em'}}>
                      {profile?.isBlocked ? 'Blocked' : 'Active'}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-center text-slate-400 text-xs font-medium px-4">
                To update your department or program, please contact a library staff member or administrator.
              </p>
            </div>
          )}

          </div>
        </main>
      </div>

      {/* Confirm Switch — root level, above all content */}
      {confirmSwitch && (
        <div className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 99999, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl text-white" style={{ background: 'hsl(221,72%,22%)' }}>
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>Switch to Admin View?</h3>
                <p className="text-slate-400 text-sm">You will be redirected to the Admin Dashboard.</p>
              </div>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              Your student session is preserved — you can switch back anytime using the <strong>Admin | Student</strong> toggle in the sidebar.
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setConfirmSwitch(false)}
                className="flex-1 h-11 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                Stay in Student
              </button>
              <button onClick={() => { setConfirmSwitch(false); onSwitchToAdmin?.(); }}
                className="flex-1 h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all"
                style={{ background: 'hsl(221,72%,22%)' }}>
                Switch to Admin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3-hour occupancy verification dialog */}
      {showVerifyDialog && verifyLogId && profile && (
        <OccupancyVerificationDialog
          logId={verifyLogId}
          studentName={displayName}
          checkInTime={logs?.find(l => l.id === verifyLogId)?.checkInTimestamp || new Date().toISOString()}
          onStillHere={() => {
            setShowVerifyDialog(false);
            if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current);
            verifyTimerRef.current = setTimeout(() => setShowVerifyDialog(true), 3 * 60 * 60 * 1000);
          }}
          onCheckOut={() => { setShowVerifyDialog(false); setVerifyLogId(null); }}
        />
      )}

      {/* Credential change request modal */}
      {credRequestOpen && profile && (
        <CredentialRequestModal
          profile={profile}
          onClose={() => setCredRequestOpen(false)}
        />
      )}
    </div>
  );
}