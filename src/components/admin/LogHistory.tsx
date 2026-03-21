"use client";

import { useState, useMemo, useEffect } from 'react';
import { format, parseISO, isToday, differenceInMinutes, startOfDay, subDays } from 'date-fns';
import { History, Search, Filter, Loader2, ArrowUpDown, ArrowUp, ArrowDown, RotateCcw, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, where } from 'firebase/firestore';
import { LibraryLogRecord, DepartmentRecord } from '@/lib/firebase-schema';

const navy = 'hsl(221,72%,22%)';
const card: React.CSSProperties = {
  background:     'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border:         '1px solid rgba(255,255,255,0.9)',
  boxShadow:      '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius:   '1rem',
};

interface ProgramRecord { id: string; deptID: string; code: string; name: string; }
interface VisitPurpose  { id: string; label: string; active: boolean; }

type SortField = 'studentName' | 'studentId' | 'checkInTimestamp' | 'checkOutTimestamp' | 'duration' | 'deptID' | 'purpose' | 'status';
type LogView = 'sessions' | 'blocked';

function formatDur(ci: string, co?: string) {
  if (!co) return '—';
  const m = differenceInMinutes(parseISO(co), parseISO(ci));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatId(id: string) {
  if (!id) return '—';
  const d = id.replace(/\D/g, '');
  if (d.length < 3)  return id;
  if (d.length < 8)  return `${d.slice(0,2)}-${d.slice(2)}`;
  return `${d.slice(0,2)}-${d.slice(2,7)}-${d.slice(7,10)}`;
}

export function LogHistory() {
  const db = useFirestore();

  const [search,        setSearch]        = useState('');
  const [deptFilter,    setDeptFilter]    = useState('All Departments');
  const [programFilter, setProgramFilter] = useState('All Programs');
  const [purposeFilter, setPurposeFilter] = useState('All Purposes');
  const [statusFilter,  setStatusFilter]  = useState('All');
  const [roleFilter,    setRoleFilter]    = useState('All');
  const [dateRange,     setDateRange]     = useState('7');
  const [sortField,     setSortField]     = useState<SortField>('checkInTimestamp');
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('desc');
  const [logView,       setLogView]       = useState<LogView>('sessions');
  const [lhRpp,  setLhRpp]  = useState<number>(25);
  const [lhPage, setLhPage] = useState(1);
  const [lhBRpp, setLhBRpp] = useState<number>(25);
  const [lhBPage,setLhBPage]= useState(1);

  const deptRef = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: depts } = useCollection<DepartmentRecord>(deptRef);

  // For role filtering — build studentId → role map
  const usersRef2 = useMemoFirebase(() => collection(db, 'users'), [db]);
  const { data: allUsers } = useCollection<{ id: string; role: string }>(usersRef2);
  const userRoleMap = useMemo(() => {
    const m: Record<string, string> = {};
    (allUsers || []).forEach(u => { m[u.id] = u.role; });
    return m;
  }, [allUsers]);

  const programsRef = useMemoFirebase(() => collection(db, 'programs'), [db]);
  const { data: allPrograms } = useCollection<ProgramRecord>(programsRef);

  // FIX: All purposes from Firestore — admin filter shows hidden ones too (for historical data)
  const purposesRef = useMemoFirebase(() => collection(db, 'visit_purposes'), [db]);
  const { data: purposeDocs } = useCollection<VisitPurpose>(purposesRef);

  const livePurposes = useMemo(() => {
    if (!purposeDocs || purposeDocs.length === 0)
      return ['All Purposes', 'Reading Books', 'Research', 'Computer Use', 'Assignments'];
    // Show ALL purposes in admin filter — including hidden ones
    // Reasoning: if "Reading Books" was hidden, admins still need to filter historical logs that used it
    return ['All Purposes', ...purposeDocs.map(p => p.label).sort()];
  }, [purposeDocs]);

  // FIX: Programs filtered by selected dept
  const deptPrograms = useMemo(() => {
    if (!allPrograms || deptFilter === 'All Departments') return [];
    return allPrograms
      .filter(p => p.deptID === deptFilter)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [allPrograms, deptFilter]);

  // Reset program filter when dept changes
  useEffect(() => { setProgramFilter('All Programs'); }, [deptFilter]);

  const cutoff = dateRange === 'all'
    ? '2024-01-01T00:00:00.000Z'
    : subDays(startOfDay(new Date()), parseInt(dateRange)).toISOString();

  const logsQ = useMemoFirebase(
    () => query(
      collection(db, 'library_logs'),
      where('checkInTimestamp', '>=', cutoff),
      orderBy('checkInTimestamp', 'desc'),
      limit(500)
    ),
    [db, cutoff]
  );
  const { data: allLogs, isLoading } = useCollection<LibraryLogRecord>(logsQ);

  // Blocked attempts (separate collection)
  const blockedAttemptsRef = useMemoFirebase(
    () => query(collection(db, 'blocked_attempts'), orderBy('timestamp', 'desc'), limit(300)),
    [db]
  );
  const { data: blockedAttempts, isLoading: isBlockedLoading } = useCollection<any>(blockedAttemptsRef);

  const filtered = useMemo(() => {
    if (!allLogs) return [];
    const s = search.toLowerCase();
    return allLogs.filter(l => {
      const matchS  = !s || (l.studentName||'').toLowerCase().includes(s) || l.studentId.toLowerCase().includes(s);
      const matchD  = deptFilter    === 'All Departments' || l.deptID  === deptFilter;
      const matchP  = purposeFilter === 'All Purposes'    || l.purpose === purposeFilter;
      // Role filter: look up student's role from userRoleMap
      const userRole = userRoleMap[l.studentId] || 'student';
      const isStaff  = userRole === 'admin' || userRole === 'super_admin';
      const matchRole = roleFilter === 'All'
        || (roleFilter === 'Student' && !isStaff)
        || (roleFilter === 'Staff'   && isStaff);
      const ci      = parseISO(l.checkInTimestamp);
      const noTap   = !l.checkOutTimestamp && !isToday(ci);
      const matchSt = statusFilter === 'All'
        || (statusFilter === 'Active'    && !l.checkOutTimestamp && isToday(ci))
        || (statusFilter === 'Completed' && !!l.checkOutTimestamp)
        || (statusFilter === 'No Tap'    && noTap);
      return matchS && matchD && matchP && matchSt && matchRole;
    }).sort((a, b) => {
      let va = '', vb = '';
      if      (sortField === 'studentName')       { va = a.studentName||''; vb = b.studentName||''; }
      else if (sortField === 'checkInTimestamp')  { va = a.checkInTimestamp; vb = b.checkInTimestamp; }
      else if (sortField === 'checkOutTimestamp') { va = a.checkOutTimestamp||''; vb = b.checkOutTimestamp||''; }
      else if (sortField === 'studentId')         { va = a.studentId||''; vb = b.studentId||''; }
      else if (sortField === 'deptID')            { va = a.deptID; vb = b.deptID; }
      else if (sortField === 'purpose')           { va = a.purpose; vb = b.purpose; }
      else if (sortField === 'duration') {
        const da  = a.checkOutTimestamp ? differenceInMinutes(parseISO(a.checkOutTimestamp), parseISO(a.checkInTimestamp)) : -1;
        const db2 = b.checkOutTimestamp ? differenceInMinutes(parseISO(b.checkOutTimestamp), parseISO(b.checkInTimestamp)) : -1;
        return sortDir === 'asc' ? da - db2 : db2 - da;
      }
      else if (sortField === 'status') {
        const stat = (l: LibraryLogRecord) => l.checkOutTimestamp ? 'done' : isToday(parseISO(l.checkInTimestamp)) ? 'active' : 'notap';
        va = stat(a); vb = stat(b);
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [allLogs, search, deptFilter, purposeFilter, statusFilter, roleFilter, sortField, sortDir, userRoleMap]);

  // Three-state sort: asc → desc → reset to default
  const toggleSort = (f: SortField) => {
    if (sortField !== f) { setSortField(f); setSortDir('desc'); return; }
    if (sortDir === 'desc') { setSortDir('asc'); return; }
    setSortField('checkInTimestamp'); setSortDir('desc');
  };

  const handleReset = () => {
    setSearch(''); setDeptFilter('All Departments'); setProgramFilter('All Programs');
    setPurposeFilter('All Purposes'); setStatusFilter('All'); setRoleFilter('All');
    setDateRange('7'); setSortField('checkInTimestamp'); setSortDir('desc');
  };

  const isFiltersDirty = search !== '' || deptFilter !== 'All Departments' ||
    programFilter !== 'All Programs' || purposeFilter !== 'All Purposes' ||
    statusFilter !== 'All' || roleFilter !== 'All' || dateRange !== '7' ||
    sortField !== 'checkInTimestamp' || sortDir !== 'desc';

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={11} className="ml-1 opacity-30 inline" />;
    return sortDir === 'asc'
      ? <ArrowUp   size={11} className="ml-1 inline" style={{ color: navy }} />
      : <ArrowDown size={11} className="ml-1 inline" style={{ color: navy }} />;
  };

  const thStyle = 'text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 cursor-pointer select-none hover:bg-slate-100 transition-colors';

  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* View toggle: Successful Sessions / Blocked Attempts */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-white/70 backdrop-blur-sm border border-white/50 w-fit"
        style={{boxShadow:'0 2px 8px rgba(10,26,77,0.07)'}}>
        {([
          { id: 'sessions', label: 'Successful Sessions', icon: History },
          { id: 'blocked',  label: 'Blocked Attempts',    icon: AlertTriangle },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setLogView(tab.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
            style={logView === tab.id
              ? { background: navy, color: 'white' }
              : { color: '#64748b' }}>
            <tab.icon size={13}/> {tab.label}
            {tab.id === 'blocked' && (blockedAttempts?.length ?? 0) > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold"
                style={{ background: 'rgba(220,38,38,0.15)', color: '#dc2626' }}>
                {blockedAttempts!.length}
              </span>
            )}
          </button>
        ))}
      </div>


      {logView === 'blocked' ? (
        /* ── Blocked Attempts View ── */
        <div style={{background:'rgba(255,255,255,0.97)',backdropFilter:'blur(20px)',border:'1px solid rgba(255,255,255,0.9)',boxShadow:'0 4px 20px rgba(10,26,77,0.09)',borderRadius:'1rem'}} className="overflow-hidden">
          {isBlockedLoading ? (
            <div className="py-14 flex items-center justify-center gap-3 text-slate-400">
              <Loader2 className="animate-spin" size={18}/><span className="text-sm font-medium">Loading blocked attempts…</span>
            </div>
          ) : !blockedAttempts?.length ? (
            <div className="py-14 text-center">
              <AlertTriangle size={28} className="mx-auto text-slate-200 mb-3"/>
              <p className="text-slate-400 text-sm font-medium">No blocked access attempts recorded.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 h-11 bg-slate-50/80">
                    <th className="pl-5 text-left text-xs font-bold uppercase tracking-wide text-slate-500 py-3">Student</th>
                    <th className="text-left text-xs font-bold uppercase tracking-wide text-slate-500 py-3">Student ID</th>
                    <th className="text-left text-xs font-bold uppercase tracking-wide text-slate-500 py-3">Department</th>
                    <th className="text-left text-xs font-bold uppercase tracking-wide text-slate-500 py-3 hidden md:table-cell">Program</th>
                    <th className="text-left text-xs font-bold uppercase tracking-wide text-slate-500 py-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {(blockedAttempts||[]).slice((lhBPage-1)*lhBRpp, lhBPage*lhBRpp).map((a, i) => (
                    <tr key={a.id || i} className="border-b border-slate-50 transition-colors" style={{background:'rgba(239,68,68,0.03)',height:56}}>
                      <td className="pl-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white flex-shrink-0 bg-red-400">
                            {(a.studentName||'?')[0]}
                          </div>
                          <span className="font-semibold text-sm text-red-700">{a.studentName||'Unknown'}</span>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg bg-red-50 text-red-600">{a.studentId||'—'}</span>
                      </td>
                      <td className="py-3">
                        <span className="font-bold text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap bg-red-50 text-red-600 font-mono">{a.deptID||'—'}</span>
                      </td>
                      <td className="py-3 hidden md:table-cell">
                        <span className="text-xs font-medium text-red-500">{a.program||'—'}</span>
                      </td>
                      <td className="py-3">
                        <p className="text-sm font-medium text-red-700">{a.timestamp ? format(parseISO(a.timestamp),'h:mm a') : '—'}</p>
                        <p className="text-xs text-red-400 font-medium">{a.timestamp ? format(parseISO(a.timestamp),'MMM d, yyyy') : ''}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
      /* ── Successful Sessions View ── */
      <>

      {/* Filter card */}
      <div style={card} className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}><History size={18} /></div>
            <div>
              <h2 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
                Log History
              </h2>
              <p className="text-slate-400 text-sm mt-0.5">Complete visitor session records</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-slate-400 text-xs font-medium">{logView === 'sessions' ? filtered.length : (blockedAttempts?.length || 0)} record{(logView === 'sessions' ? filtered.length : (blockedAttempts?.length || 0)) !== 1 ? 's' : ''}</p>
            {isFiltersDirty && logView === 'sessions' && (
              <button onClick={handleReset}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[10px] font-bold border transition-all active:scale-95"
                style={{background:'rgba(220,38,38,0.06)',color:'#dc2626',borderColor:'rgba(220,38,38,0.18)'}}>
                <RotateCcw size={10}/> Reset
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search name or ID…" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium" />
          </div>

          {/* Date range */}
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="h-9 w-32 bg-slate-50 border-slate-200 rounded-xl text-xs font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="1"   className="text-xs font-semibold">Today</SelectItem>
              <SelectItem value="7"   className="text-xs font-semibold">Last 7 Days</SelectItem>
              <SelectItem value="30"  className="text-xs font-semibold">Last 30 Days</SelectItem>
              <SelectItem value="all" className="text-xs font-semibold">All Time</SelectItem>
            </SelectContent>
          </Select>

          {/* FIX: Dept — shows full name in list, only code in trigger */}
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-9 w-36 bg-slate-50 border-slate-200 rounded-xl text-xs font-semibold">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <Filter size={11} style={{ color: navy, flexShrink: 0 }} />
                <span className="truncate font-bold">
                  {deptFilter === 'All Departments' ? 'All Colleges' : deptFilter}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="All Departments" className="text-xs font-semibold">All Colleges</SelectItem>
              {depts?.sort((a, b) => a.deptID.localeCompare(b.deptID)).map(d => (
                <SelectItem key={d.deptID} value={d.deptID} className="text-xs font-semibold">
                  <span className="font-bold mr-1" style={{ color: navy }}>[{d.deptID}]</span>
                  {d.departmentName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* FIX: Program filter — only visible when a dept is selected */}
          {deptFilter !== 'All Departments' && deptPrograms.length > 0 && (
            <Select value={programFilter} onValueChange={setProgramFilter}>
              <SelectTrigger className="h-9 w-36 bg-slate-50 border-slate-200 rounded-xl text-xs font-semibold">
                <span className="truncate font-bold" style={{ fontFamily: "'DM Mono',monospace", fontSize: '0.7rem' }}>
                  {programFilter === 'All Programs' ? 'All Programs' : programFilter}
                </span>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="All Programs" className="text-xs font-semibold">All Programs</SelectItem>
                {deptPrograms.map(p => (
                  <SelectItem key={p.code} value={p.code} className="text-xs font-semibold">
                    <span className="font-bold mr-1.5 font-mono" style={{ color: navy }}>{p.code}</span>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* FIX: Purpose — all purposes including hidden (for historical filtering) */}
          <Select value={purposeFilter} onValueChange={setPurposeFilter}>
            <SelectTrigger className="h-9 w-36 bg-slate-50 border-slate-200 rounded-xl text-xs font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {livePurposes.map(p => (
                <SelectItem key={p} value={p} className="text-xs font-semibold">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
            {(['All', 'Active', 'Completed', 'No Tap'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={statusFilter === s ? { background: navy, color: 'white' } : { color: '#64748b' }}>
                {s}
              </button>
            ))}
          </div>

          {/* Role filter — Staff pinned first */}
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-9 w-36 bg-slate-50 border-slate-200 rounded-xl text-xs font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="All"     className="text-xs font-semibold">All Roles</SelectItem>
              <SelectItem value="Staff"   className="text-xs font-semibold">Staff / Faculty</SelectItem>
              <SelectItem value="Student" className="text-xs font-semibold">Student</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div style={card} className="overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={18} /><span className="text-sm font-medium">Loading history…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <History size={28} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-400 text-sm font-medium">No records match the current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-11 border-slate-100">
                  <TableHead className={`pl-5 ${thStyle}`} onClick={() => toggleSort('studentName')}>
                    Student <SortIcon field="studentName" />
                  </TableHead>
                  <TableHead className={thStyle} onClick={() => toggleSort('studentId')}>Student ID <SortIcon field="studentId"/></TableHead>
                  <TableHead className={thStyle} onClick={() => toggleSort('deptID')}>
                    Department <SortIcon field="deptID" />
                  </TableHead>
                  <TableHead className={`hidden md:table-cell ${thStyle}`} onClick={() => toggleSort('purpose')}>
                    Purpose <SortIcon field="purpose" />
                  </TableHead>
                  <TableHead className={thStyle} onClick={() => toggleSort('checkInTimestamp')}>
                    Time In <SortIcon field="checkInTimestamp" />
                  </TableHead>
                  <TableHead className={`hidden sm:table-cell ${thStyle}`} onClick={() => toggleSort('checkOutTimestamp')}>
                    Time Out <SortIcon field="checkOutTimestamp" />
                  </TableHead>
                  <TableHead className={`hidden sm:table-cell ${thStyle}`} onClick={() => toggleSort('duration')}>
                    Duration <SortIcon field="duration" />
                  </TableHead>
                  <TableHead className={`text-right pr-5 ${thStyle}`} onClick={() => toggleSort('status')}>
                    Status <SortIcon field="status" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice((lhPage-1)*lhRpp, lhPage*lhRpp).map(l => {
                  const ci     = parseISO(l.checkInTimestamp);
                  const noTap  = !l.checkOutTimestamp && !isToday(ci);
                  const active = !l.checkOutTimestamp && isToday(ci);
                  return (
                    <TableRow key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors" style={{ height: 60 }}>

                      {/* Name */}
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white flex-shrink-0"
                            style={{ background: active ? `linear-gradient(135deg,${navy},hsl(221,60%,35%))` : '#94a3b8' }}>
                            {(l.studentName||'S').split(',')[0]?.trim()[0]||'S'}
                          </div>
                          <span className="font-semibold text-slate-900 text-sm truncate max-w-[120px] sm:max-w-none">
                            {l.studentName || 'Student'}
                          </span>
                        </div>
                      </TableCell>

                      {/* Student ID */}
                      <TableCell>
                        <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg"
                          style={{ background: '#f1f5f9', color: '#475569' }}>
                          {formatId(l.studentId)}
                        </span>
                      </TableCell>

                      {/* Dept — FIX: whitespace-nowrap so codes like CAS-STAFF don't wrap */}
                      <TableCell>
                        <span className="font-bold text-xs px-2.5 py-1.5 rounded-lg font-mono whitespace-nowrap"
                          style={{ background: `${navy}0d`, color: navy }}>
                          {l.deptID}
                        </span>
                      </TableCell>

                      {/* Purpose */}
                      <TableCell className="hidden md:table-cell">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                          {l.purpose}
                        </span>
                      </TableCell>

                      {/* Time In */}
                      <TableCell>
                        <p className="text-sm font-medium text-slate-700">{format(ci, 'h:mm a')}</p>
                        <p className="text-xs text-slate-400 font-medium">{format(ci, 'MMM d')}</p>
                      </TableCell>

                      {/* Time Out */}
                      <TableCell className="hidden sm:table-cell">
                        {l.checkOutTimestamp ? (
                          <div>
                            <p className="text-sm font-medium text-slate-700">{format(parseISO(l.checkOutTimestamp), 'h:mm a')}</p>
                            <p className="text-xs text-slate-400 font-medium">{format(parseISO(l.checkOutTimestamp), 'MMM d')}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300 italic">—</span>
                        )}
                      </TableCell>

                      {/* Duration */}
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-sm font-bold font-mono" style={{ color: l.checkOutTimestamp ? '#475569' : '#3b82f6' }}>
                          {formatDur(l.checkInTimestamp, l.checkOutTimestamp)}
                        </span>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="text-right pr-5">
                        {l.checkOutTimestamp ? (
                          <span className="text-xs font-bold px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-500">Done</span>
                        ) : noTap ? (
                          <span className="text-xs font-bold px-2.5 py-1.5 rounded-full bg-red-50 text-red-500">No Tap</span>
                        ) : (
                          <span className="text-xs font-bold px-2.5 py-1.5 rounded-full bg-blue-50 text-blue-600 animate-pulse">Active</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
          {/* ── Sessions pagination ── */}
          {filtered.length > 0 && (() => {
            const _tot = filtered.length;
            const _pg  = Math.ceil(_tot / lhRpp);
            return (
              <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-medium text-slate-400">
                    {(lhPage-1)*lhRpp+1}–{Math.min(lhPage*lhRpp,_tot)} of {_tot}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">Rows per page:</span>
                    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100">
                      {([25,50,100] as const).map(n=>(
                        <button key={n} onClick={()=>{ setLhRpp(n); setLhPage(1); }}
                          className="px-2.5 py-1 rounded-md text-xs font-bold transition-all"
                          style={lhRpp===n?{background:'hsl(43,85%,50%)',color:'white'}:{color:'#64748b'}}>{n}</button>
                      ))}
                      <button onClick={()=>{const v=parseInt(prompt('Rows per page (10-500):',String(lhRpp))||String(lhRpp));if(!isNaN(v)&&v>=10&&v<=500){ setLhRpp(v); setLhPage(1);}}}
                        className="px-2.5 py-1 rounded-md text-xs font-bold text-slate-500 hover:bg-white transition-all">Custom</button>
                    </div>
                  </div>
                </div>
                {_pg>1&&(
                  <div className="flex items-center gap-1">
                    <button onClick={()=>{setLhPage(1);window.scrollTo({top:0,behavior:"smooth"});}} disabled={lhPage===1} className="h-7 px-2 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">««</button>
                    <button onClick={()=>{setLhPage((p:number)=>Math.max(1,p-1));window.scrollTo({top:0,behavior:"smooth"});}} disabled={lhPage===1} className="h-7 px-2.5 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">‹</button>
                    {Array.from({length:_pg},(_,i)=>i+1)
                      .filter(p=>p===1||p===_pg||Math.abs(p-lhPage)<=1)
                      .reduce<(number|string)[]>((acc,p,i,a)=>{if(i>0&&(p as number)-(a[i-1] as number)>1)acc.push('...');acc.push(p);return acc;},[ ])
                      .map((p,i)=>p==='...'?<span key={'e'+i} className="px-1 text-slate-400 text-xs">…</span>
                        :<button key={p} onClick={()=>{setLhPage(p as number);window.scrollTo({top:0,behavior:"smooth"});}} className="h-7 w-7 rounded-lg text-xs font-bold border transition-all"
                           style={lhPage===p?{background:'hsl(43,85%,50%)',color:'white',border:'none'}:{borderColor:'#e2e8f0',color:'#64748b'}}>{p}</button>)}
                    <button onClick={()=>{setLhPage((p:number)=>Math.min(_pg,p+1));window.scrollTo({top:0,behavior:"smooth"});}} disabled={lhPage===_pg} className="h-7 px-2.5 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">›</button>
                    <button onClick={()=>{setLhPage(_pg);window.scrollTo({top:0,behavior:"smooth"});}} disabled={lhPage===_pg} className="h-7 px-2 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">»»</button>
                  </div>
                )}
              </div>
            );
          })()}
      </div>
    </>
    )}
          {(() => {
            const _tot = (blockedAttempts||[]).length;
            const _pg  = Math.ceil(_tot / lhBRpp);
            if (_tot === 0) return null;
            return (
              <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-medium text-slate-400">
                    {(lhBPage-1)*lhBRpp+1}&ndash;{Math.min(lhBPage*lhBRpp,_tot)} of {_tot}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">Rows per page:</span>
                    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100">
                      {([25,50,100] as const).map(n=>(
                        <button key={n} onClick={()=>{ setLhBRpp(n); setLhBPage(1); }}
                          className="px-2.5 py-1 rounded-md text-xs font-bold transition-all"
                          style={lhBRpp===n?{background:'hsl(43,85%,50%)',color:'white'}:{color:'#64748b'}}>{n}</button>
                      ))}
                      <button onClick={()=>{const v=parseInt(prompt('Rows per page (10-500):',String(lhBRpp))||String(lhBRpp));if(!isNaN(v)&&v>=10&&v<=500){ setLhBRpp(v); setLhBPage(1);}}}
                        className="px-2.5 py-1 rounded-md text-xs font-bold text-slate-500 hover:bg-white transition-all">Custom</button>
                    </div>
                  </div>
                </div>
                {_pg>1&&(
                  <div className="flex items-center gap-1">
                    <button onClick={()=>{ setLhBPage(1); window.scrollTo({top:0,behavior:'smooth'}); }} disabled={lhBPage===1} className="h-7 px-2 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">&#171;&#171;</button>
                    <button onClick={()=>{ setLhBPage((p:number)=>Math.max(1,p-1)); window.scrollTo({top:0,behavior:'smooth'}); }} disabled={lhBPage===1} className="h-7 px-2.5 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">&#8249;</button>
                    {Array.from({length:_pg},(_,i)=>i+1)
                      .filter(p=>p===1||p===_pg||Math.abs(p-lhBPage)<=1)
                      .reduce<(number|string)[]>((acc,p,i,a)=>{if(i>0&&(p as number)-(a[i-1] as number)>1)acc.push('...');acc.push(p);return acc;},[])
                      .map((p,i)=>p==='...'?<span key={'e'+i} className="px-1 text-slate-400 text-xs">&#8230;</span>
                        :<button key={p} onClick={()=>{ setLhBPage(p as number); window.scrollTo({top:0,behavior:'smooth'}); }} className="h-7 w-7 rounded-lg text-xs font-bold border transition-all"
                           style={lhBPage===p?{background:'hsl(43,85%,50%)',color:'white',border:'none'}:{borderColor:'#e2e8f0',color:'#64748b'}}>{p}</button>)}
                    <button onClick={()=>{ setLhBPage((p:number)=>Math.min(_pg,p+1)); window.scrollTo({top:0,behavior:'smooth'}); }} disabled={lhBPage===_pg} className="h-7 px-2.5 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">&#8250;</button>
                    <button onClick={()=>{ setLhBPage(_pg); window.scrollTo({top:0,behavior:'smooth'}); }} disabled={lhBPage===_pg} className="h-7 px-2 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">&#187;&#187;</button>
                  </div>
                )}
              </div>
            );
          })()}
    </div>
  );
}