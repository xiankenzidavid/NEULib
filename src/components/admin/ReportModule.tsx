"use client";

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  format, parseISO, isAfter, isBefore, startOfDay, endOfDay,
  subDays, isToday, differenceInMinutes, startOfWeek, startOfMonth,
} from 'date-fns';
import { FileDown, Sparkles, Loader2, Trash2, Calendar, ChevronDown, ChevronUp, Trophy, Sheet, Search, RotateCcw, Eye } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { LibraryLogRecord, DepartmentRecord, ProgramRecord } from '@/lib/firebase-schema';

type LogRecord = LibraryLogRecord & { program?: string };
import { SuccessCard } from '@/components/ui/SuccessCard';

const PRESETS = [
  { label: 'Today',      getStart: () => format(new Date(), 'yyyy-MM-dd'),                             getEnd: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'This Week',  getStart: () => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'), getEnd: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'This Month', getStart: () => format(startOfMonth(new Date()), 'yyyy-MM-dd'),                getEnd: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'All Time',   getStart: () => '2024-01-01',                                                  getEnd: () => format(new Date(), 'yyyy-MM-dd') },
];

interface ReportModuleProps { isSuperAdmin: boolean; }

const navy = 'hsl(221,72%,22%)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.96)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1rem',
};
const navyBtn: React.CSSProperties = {
  background: `linear-gradient(135deg,${navy},hsl(221,60%,32%))`,
  color: 'white', border: 'none',
};

export function ReportModule({ isSuperAdmin }: ReportModuleProps) {
  const [startDate,     setStartDate]     = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [endDate,       setEndDate]       = useState(format(new Date(), 'yyyy-MM-dd'));
  const [activePreset,  setActivePreset]  = useState<string>('This Week');
  const [deptFilter,    setDeptFilter]    = useState('All Departments');
  const [programFilter, setProgramFilter] = useState('All Programs');
  const [purposeFilter, setPurposeFilter] = useState('All Purposes');
  const [aiSummary,     setAiSummary]     = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiCollapsed,   setAiCollapsed]   = useState(false);
  const [logToDelete,   setLogToDelete]   = useState<{ id: string; name: string } | null>(null);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [filtersOpen,   setFiltersOpen]   = useState(true);
  const [successCard,   setSuccessCard]   = useState<{ title: string; description: string; color?: 'green' | 'navy' | 'amber' } | null>(null);
  const [pdfPreview,    setPdfPreview]    = useState<{ url: string; filename: string } | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'blocked'>('active');
  const [rowsPerPage,      setRowsPerPage]      = useState<number>(50);
  const [currentPage,      setCurrentPage]      = useState(1);
  const [tapOutFilter,  setTapOutFilter]  = useState<'all' | 'no_tap' | 'with_timeout'>('all');
  const [archiveSearch,    setArchiveSearch]    = useState('');
  const [archiveSortField, setArchiveSortField] = useState<'checkInTimestamp' | 'studentName' | 'deptID' | 'purpose' | 'duration' | 'studentId' | 'checkOutTimestamp' | 'program'>('checkInTimestamp');
  const [archiveSortOrder, setArchiveSortOrder] = useState<'asc' | 'desc'>('desc');

  const { toast } = useToast();
  const db = useFirestore();

  // ── Dynamic purposes from Firestore (replaces hardcoded list) ────────────
  const purposesRef = useMemoFirebase(() => collection(db, 'visit_purposes'), [db]);
  const { data: livePurposeDocs } = useCollection<{ id: string; label: string; value: string; active: boolean }>(purposesRef);
  const dynamicPurposes = useMemo(() => {
    const base = ['All Purposes'];
    if (!livePurposeDocs || livePurposeDocs.length === 0) {
      return [...base, 'Reading Books', 'Research', 'Computer Use', 'Assignments'];
    }
    const active = livePurposeDocs
      .filter(p => p.active !== false)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(p => p.label);
    return [...base, ...active];
  }, [livePurposeDocs]);


  const deptQuery = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: dbDepartments } = useCollection<DepartmentRecord>(deptQuery);

  const usersRef = useMemoFirebase(() => collection(db, 'users'), [db]);
  const { data: allUsers } = useCollection<{ id: string; program?: string; deptID?: string; status?: string }>(usersRef);

  // Map studentId → program and status (for enriching + filtering log rows)
  const userProgramMap = useMemo(() => {
    const m: Record<string, string> = {};
    (allUsers || []).forEach(u => { if (u.id && u.program) m[u.id] = u.program; });
    return m;
  }, [allUsers]);

  const userStatusMap = useMemo(() => {
    const m: Record<string, string> = {};
    (allUsers || []).forEach(u => { if (u.id) m[u.id] = u.status || 'active'; });
    return m;
  }, [allUsers]);

  const deptNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    dbDepartments?.forEach(d => { m[d.deptID] = d.departmentName; });
    return m;
  }, [dbDepartments]);

  // Blocked attempts — needed for Template B (RESTRICTED) and Template C (ALL)
  const blockedRef = useMemoFirebase(
    () => collection(db, 'blocked_attempts'),
    [db]
  );
  const { data: blockedAttempts } = useCollection<{
    id: string; studentId: string; studentName: string;
    deptID: string; program?: string; timestamp: string;
  }>(blockedRef);

  // Fetch programs from Firestore for selected dept
  const { data: allPrograms } = useCollection<ProgramRecord>(
    useMemoFirebase(() => collection(db, 'programs'), [db])
  );
  const availablePrograms = useMemo(() => {
    if (deptFilter === 'All Departments' || !allPrograms) return [];
    return allPrograms.filter(p => p.deptID === deptFilter).sort((a, b) => a.code.localeCompare(b.code));
  }, [deptFilter, allPrograms]);

  // Reset program filter when dept changes
  const handleDeptChange = (val: string) => {
    setDeptFilter(val);
    setProgramFilter('All Programs');
    setCurrentPage(1);
  };

  // Reset page on any filter change
  const resetPage = () => setCurrentPage(1);

  const handleResetFilters = () => {
    const def = PRESETS.find(p => p.label === 'This Week') ?? PRESETS[0];
    setStartDate(def.getStart()); setEndDate(def.getEnd()); setActivePreset(def.label);
    setDeptFilter('All Departments'); setProgramFilter('All Programs');
    setPurposeFilter('All Purposes'); setTapOutFilter('all');
    setUserStatusFilter('active'); setArchiveSearch('');
    setArchiveSortField('checkInTimestamp'); setArchiveSortOrder('desc');
    setCurrentPage(1);
  };

  const handleResetSort = () => {
    setArchiveSortField('checkInTimestamp'); setArchiveSortOrder('desc');
    setCurrentPage(1);
  };

  // Button 1 (filter panel): appears when ANY filter or sort is changed
  const isFiltersDirty =
    deptFilter !== 'All Departments' || programFilter !== 'All Programs' ||
    purposeFilter !== 'All Purposes' || tapOutFilter !== 'all'           ||
    userStatusFilter !== 'active'    || archiveSearch.trim() !== ''      ||
    archiveSortField !== 'checkInTimestamp' || archiveSortOrder !== 'desc';

  // Button 2 (archive header): appears only when sort is changed — resets sort only
  const isSortDirty =
    archiveSortField !== 'checkInTimestamp' || archiveSortOrder !== 'desc';

  const logsRef = useMemoFirebase(() => collection(db, 'library_logs'), [db]);
  const { data: allLogs, isLoading } = useCollection<LibraryLogRecord>(logsRef);

  const filteredLogs = useMemo(() =>
    (allLogs || []).filter(l => {
      const v = parseISO(l.checkInTimestamp);
      const s = startOfDay(parseISO(startDate));
      const e = endOfDay(parseISO(endDate));
      const inRange   = (isAfter(v, s) || v.getTime() === s.getTime()) && (isBefore(v, e) || v.getTime() === e.getTime());
      const inDept    = deptFilter    === 'All Departments' || l.deptID   === deptFilter;
      const inPurpose = purposeFilter === 'All Purposes'    || l.purpose  === purposeFilter;
      // No Tap-out = checkOutTimestamp IS NULL (any session without a recorded exit)
      // With Timeout = checkOutTimestamp IS NOT NULL
      const inTapOut = tapOutFilter === 'all'
        || (tapOutFilter === 'with_timeout' && !!l.checkOutTimestamp)
        || (tapOutFilter === 'no_tap'       && !l.checkOutTimestamp);
      // Program filter: use log's own snapshotted field first, fall back to current
      // user record for old logs that haven't been backfilled yet
      const logProgram = (l as LogRecord).program || userProgramMap[l.studentId] || '';
      const inProgram = programFilter === 'All Programs' || logProgram === programFilter;
      // filteredLogs always contains ALL successful sessions (historical snapshots).
      // The userStatusFilter drives whether we show blocked_attempts (separate collection).
      // ACTIVE: show all successful sessions (historical — never hide them).
      // ALL:    show successful + blocked attempts (unified model, built below).
      // BLOCKED: show only blocked_attempts (handled separately, not in filteredLogs).
      return inRange && inDept && inPurpose && inTapOut && inProgram;
    }).sort((a, b) => b.checkInTimestamp.localeCompare(a.checkInTimestamp)),
    [allLogs, startDate, endDate, deptFilter, purposeFilter, programFilter, tapOutFilter, userProgramMap]
  );

  const displayedLogs = useMemo(() => {
    let list = [...filteredLogs];
    // Apply search
    if (archiveSearch.trim()) {
      const s = archiveSearch.toLowerCase();
      list = list.filter(l =>
        (l.studentName || '').toLowerCase().includes(s) ||
        (l.studentId  || '').toLowerCase().includes(s) ||
        (l.deptID     || '').toLowerCase().includes(s) ||
        (l.purpose    || '').toLowerCase().includes(s)
      );
    }
    // Apply column sort
    list.sort((a, b) => {
      let vA = '', vB = '';
      if (archiveSortField === 'checkInTimestamp') { vA = a.checkInTimestamp; vB = b.checkInTimestamp; }
      else if (archiveSortField === 'studentName') { vA = a.studentName || ''; vB = b.studentName || ''; }
      else if (archiveSortField === 'deptID')      { vA = a.deptID || '';     vB = b.deptID || ''; }
      else if (archiveSortField === 'purpose')     { vA = a.purpose || '';    vB = b.purpose || ''; }
      else if (archiveSortField === 'program')     {
        vA = (a as LogRecord).program || userProgramMap[a.studentId] || '';
        vB = (b as LogRecord).program || userProgramMap[b.studentId] || '';
      }
      else if (archiveSortField === 'duration') {
        const durA = a.checkOutTimestamp ? differenceInMinutes(parseISO(a.checkOutTimestamp), parseISO(a.checkInTimestamp)) : 0;
        const durB = b.checkOutTimestamp ? differenceInMinutes(parseISO(b.checkOutTimestamp), parseISO(b.checkInTimestamp)) : 0;
        return archiveSortOrder === 'asc' ? durA - durB : durB - durA;
      }
      return archiveSortOrder === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
    });
    return list;
  }, [filteredLogs, archiveSearch, archiveSortField, archiveSortOrder]);

  // ── Unified row model — merges sessions + blocked attempts for ALL mode ──────
  // Each row has a canonical timestamp for sorting, a type flag, and all fields
  // needed by the single unified table.
  type UnifiedRow =
    | { _type: 'session'; _ts: string; data: typeof filteredLogs[0] }
    | { _type: 'blocked'; _ts: string; data: NonNullable<typeof blockedAttempts>[0] };

  const unifiedRows = useMemo((): UnifiedRow[] => {
    // ── Sort comparator — works across both row types ──────────────────────
    const compare = (a: UnifiedRow, b: UnifiedRow): number => {
      const getVal = (r: UnifiedRow, field: typeof archiveSortField): string | number => {
        if (r._type === 'blocked') {
          // Blocked rows only have: studentName, studentId, deptID, program, timestamp
          if (field === 'studentName')      return r.data.studentName || '';
          if (field === 'studentId')        return r.data.studentId || '';
          if (field === 'deptID')           return r.data.deptID || '';
          if (field === 'program')          return r.data.program || userProgramMap[r.data.studentId] || '';
          if (field === 'checkInTimestamp') return r.data.timestamp || '';
          return ''; // purpose / duration / checkOutTimestamp — not applicable
        }
        const l = r.data;
        if (field === 'studentName')        return l.studentName || '';
        if (field === 'studentId')          return l.studentId || '';
        if (field === 'deptID')             return l.deptID || '';
        if (field === 'program')            return (l as LogRecord).program || userProgramMap[l.studentId] || '';
        if (field === 'purpose')            return l.purpose || '';
        if (field === 'checkInTimestamp')   return l.checkInTimestamp || '';
        if (field === 'checkOutTimestamp')  return l.checkOutTimestamp || '';
        if (field === 'duration') {
          if (!l.checkOutTimestamp) return 0;
          return differenceInMinutes(parseISO(l.checkOutTimestamp), parseISO(l.checkInTimestamp));
        }
        return '';
      };
      const vA = getVal(a, archiveSortField);
      const vB = getVal(b, archiveSortField);
      if (typeof vA === 'number' && typeof vB === 'number') {
        return archiveSortOrder === 'asc' ? vA - vB : vB - vA;
      }
      const cmp = String(vA).localeCompare(String(vB));
      return archiveSortOrder === 'asc' ? cmp : -cmp;
    };

    if (userStatusFilter === 'blocked') {
      // Pure blocked view — apply date range filter
      const s  = startOfDay(parseISO(startDate));
      const e  = endOfDay(parseISO(endDate));
      const search = archiveSearch.toLowerCase();
      return (blockedAttempts || [])
        .filter(a => {
          const ts = parseISO(a.timestamp);
          const inRange = (isAfter(ts, s) || ts.getTime() === s.getTime()) && (isBefore(ts, e) || ts.getTime() === e.getTime());
          const inSearch = !search || (a.studentName||'').toLowerCase().includes(search) || (a.studentId||'').toLowerCase().includes(search);
          return inRange && inSearch;
        })
        .map(a => ({ _type: 'blocked' as const, _ts: a.timestamp, data: a }))
        .sort(compare);
    }
    if (userStatusFilter === 'all') {
      const sessions: UnifiedRow[] = filteredLogs.map(l => ({ _type: 'session' as const, _ts: l.checkInTimestamp, data: l }));
      const purposeFiltered = purposeFilter !== 'All Purposes';
      const blockedRows: UnifiedRow[] = purposeFiltered
        ? []
        : (blockedAttempts || [])
            .filter(a => {
              const ts = parseISO(a.timestamp);
              const s  = startOfDay(parseISO(startDate));
              const e  = endOfDay(parseISO(endDate));
              return (isAfter(ts, s) || ts.getTime() === s.getTime()) && (isBefore(ts, e) || ts.getTime() === e.getTime());
            })
            .map(a => ({ _type: 'blocked' as const, _ts: a.timestamp, data: a }));
      const search = archiveSearch.toLowerCase();
      return [...sessions, ...blockedRows]
        .filter(r => {
          if (!search) return true;
          return (r.data.studentName||'').toLowerCase().includes(search) ||
                 (r.data.studentId||'').toLowerCase().includes(search);
        })
        .sort(compare);
    }
    // ACTIVE: all successful sessions only
    const search = archiveSearch.toLowerCase();
    return filteredLogs
      .filter(l => !search || (l.studentName||'').toLowerCase().includes(search) || (l.studentId||'').toLowerCase().includes(search))
      .map(l => ({ _type: 'session' as const, _ts: l.checkInTimestamp, data: l }))
      .sort(compare);
  }, [filteredLogs, blockedAttempts, userStatusFilter, archiveSearch,
      archiveSortField, archiveSortOrder, userProgramMap,
      startDate, endDate, purposeFilter]);

  // Paginated slice — unified rows
  const totalPages    = Math.ceil(unifiedRows.length / rowsPerPage);
  const paginatedRows = unifiedRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Keep paginatedLogs for PDF (PDF uses filteredLogs directly, not unifiedRows)
  const paginatedLogs = displayedLogs.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const topVisitors = useMemo(() => {
    const counts: Record<string, { name: string; dept: string; visits: number; totalMins: number }> = {};
    filteredLogs.forEach(l => {
      if (!counts[l.studentId]) counts[l.studentId] = { name: l.studentName || l.studentId, dept: l.deptID, visits: 0, totalMins: 0 };
      counts[l.studentId].visits++;
      if (l.checkOutTimestamp)
        counts[l.studentId].totalMins += differenceInMinutes(parseISO(l.checkOutTimestamp), parseISO(l.checkInTimestamp));
    });
    return Object.values(counts).sort((a, b) => b.visits - a.visits).slice(0, 5);
  }, [filteredLogs]);

  const toggleArchiveSort = (field: typeof archiveSortField) => {
    if (archiveSortField === field) setArchiveSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setArchiveSortField(field); setArchiveSortOrder('asc'); }
  };
  const ArchiveSortIcon = ({ field }: { field: typeof archiveSortField }) => {
    if (archiveSortField !== field) return <span className="ml-1 opacity-30">↕</span>;
    return <span className="ml-1">{archiveSortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  const formatDur = (ci: string, co?: string) => {
    if (!co) return '—';
    const m = differenceInMinutes(parseISO(co), parseISO(ci));
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
  };

  const applyPreset = (p: typeof PRESETS[0]) => {
    setStartDate(p.getStart()); setEndDate(p.getEnd()); setActivePreset(p.label);
  };
  const handleDateChange = (field: 'start' | 'end', v: string) => {
    setActivePreset('');
    if (field === 'start') setStartDate(v); else setEndDate(v);
  };

  // ── Statistical fallback — computed entirely client-side ──────────────────
  const buildStatisticalSummary = () => {
    const logs = filteredLogs;
    if (!logs.length) return '⚠️ No data available for the selected period.';

    // Peak hour
    const hourCounts: Record<number, number> = {};
    logs.forEach(l => {
      const h = parseISO(l.checkInTimestamp).getHours();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    const peakHour = Object.entries(hourCounts).sort((a, b) => +b[1] - +a[1])[0];
    const peakHourNum = peakHour ? parseInt(peakHour[0]) : 0;
    const peakLabel   = peakHour
      ? `${String(peakHourNum).padStart(2,'0')}:00 (${peakHourNum < 12 ? 'morning' : peakHourNum < 17 ? 'afternoon' : 'evening'}) with ${peakHour[1]} visit${+peakHour[1] > 1 ? 's' : ''}`
      : '—';

    // Purpose counts
    const purposeCounts: Record<string, number> = {};
    logs.forEach(l => { const p = l.purpose || 'Unknown'; purposeCounts[p] = (purposeCounts[p] || 0) + 1; });
    const topPurpose   = Object.entries(purposeCounts).sort((a, b) => b[1] - a[1])[0];
    const purposeCount = Object.keys(purposeCounts).length;

    // Dept counts
    const deptCounts: Record<string, number> = {};
    logs.forEach(l => { const d = deptNameMap[l.deptID] || l.deptID; deptCounts[d] = (deptCounts[d] || 0) + 1; });
    const topDept  = Object.entries(deptCounts).sort((a, b) => b[1] - a[1])[0];
    const deptCount = Object.keys(deptCounts).length;

    // Avg duration
    const completed = logs.filter(l => l.checkOutTimestamp);
    const avgMins = completed.length
      ? Math.round(completed.reduce((s, l) => s + differenceInMinutes(parseISO(l.checkOutTimestamp!), parseISO(l.checkInTimestamp)), 0) / completed.length)
      : null;
    const avgDurStr = avgMins !== null
      ? (avgMins >= 60 ? `${Math.floor(avgMins/60)}h ${avgMins%60}m` : `${avgMins}m`)
      : 'N/A';

    // Unique students
    const uniqueStudents = new Set(logs.map(l => l.studentId)).size;

    return [
      `📊 STATISTICAL SUMMARY (AI models unavailable)`,
      ``,
      `Based on ${logs.length} visit${logs.length !== 1 ? 's' : ''} analyzed from ${startDate} to ${endDate}:`,
      ``,
      `• Peak Activity: ${peakLabel}`,
      `• Most Common Purpose: "${topPurpose?.[0] || '—'}" (out of ${purposeCount} different purpose${purposeCount !== 1 ? 's' : ''})`,
      `• Most Active Department: "${topDept?.[0] || '—'}"`,
      `• Total Departments Active: ${deptCount}`,
      `• Unique Students: ${uniqueStudents}`,
      `• Average Session Duration: ${avgDurStr} (${completed.length} completed session${completed.length !== 1 ? 's' : ''})`,
    ].join('\n');
  };

  const generateAiSummary = async () => {
    if (!filteredLogs.length) return;
    setIsGeneratingAi(true); setAiSummary(null); setAiCollapsed(false);
    try {
      const res = await fetch('/api/ai-summary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate, endDate,
          visitData: filteredLogs.slice(0, 50).map(l => ({
            userId: l.studentId, timestamp: l.checkInTimestamp,
            purpose: l.purpose, collegeOffice: deptNameMap[l.deptID] || l.deptID,
          })),
        }),
      });
      if (!res.ok) {
        // Server unreachable or quota error — fall back to statistical summary
        setAiSummary(buildStatisticalSummary());
        return;
      }
      const result = await res.json();
      // If the API returned an error or empty summary, use statistical fallback
      if (result.error || !result.summary || result.summary.includes('unavailable')) {
        setAiSummary(buildStatisticalSummary());
      } else {
        setAiSummary(result.summary);
      }
    } catch {
      // Network error — always fall back to statistical summary
      setAiSummary(buildStatisticalSummary());
    } finally { setIsGeneratingAi(false); }
  };

  const confirmDeleteLog = () => {
    if (!isSuperAdmin || !logToDelete) return;
    deleteDocumentNonBlocking(doc(db, 'library_logs', logToDelete.id));
    setSuccessCard({ title: 'Log Removed', description: `The session record for ${logToDelete.name} has been permanently deleted.`, color: 'amber' });
    setIsDeleteAlertOpen(false); setLogToDelete(null);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PDF ENGINE — Three-template system
  // Template A: ACTIVE   — Library Activity & Engagement Report
  // Template B: RESTRICTED — Restricted Access & Violation Report
  // Template C: ALL      — Comprehensive Library Operations Report
  // ══════════════════════════════════════════════════════════════════════════

  const generatePDF = async (disposition: 'download' | 'view') => {
    setPdfGenerating(true);

    // ── Fetch NEU logo as base64 for embedding (from Next.js /public folder) ──
    let neuLogoBase64: string | null = null;
    try {
      const resp = await fetch('/neu-logo.png');
      if (resp.ok) {
        const blob = await resp.blob();
        neuLogoBase64 = await new Promise<string>(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }
    } catch { /* logo unavailable — skip it */ }

    setTimeout(() => {
    try {
      // ── Shared constants ───────────────────────────────────────────────────
      const pdf  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W    = 210;
      const NAVY    : [number,number,number] = [10, 26, 77];
      const GOLD    : [number,number,number] = [212, 170, 61];
      const SLATE   : [number,number,number] = [71, 85, 105];
      const LIGHT   : [number,number,number] = [245, 247, 252];
      const RED_BG  : [number,number,number] = [254, 242, 242];
      const RED_TXT : [number,number,number] = [185, 28, 28];
      const RED_MED : [number,number,number] = [220, 38, 38];
      const BLU_BG  : [number,number,number] = [239, 246, 255];
      const BLU_TXT : [number,number,number] = [29, 78, 216];
      const GRN     : [number,number,number] = [5, 150, 105];
      const AMB_BG  : [number,number,number] = [255, 251, 235];
      const AMB_TXT : [number,number,number] = [146, 64, 14];

      const isRestricted = userStatusFilter === 'blocked';
      const isAll        = userStatusFilter === 'all';
      const isActive     = userStatusFilter === 'active' || (!isRestricted && !isAll);

      const blocked = blockedAttempts || [];

      // ── Page footer helper ─────────────────────────────────────────────────
      const addPageNumbers = (reportLabel: string) => {
        const total = (pdf as any).getNumberOfPages?.() ?? 1;
        for (let i = 1; i <= total; i++) {
          pdf.setPage(i);
          pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(...SLATE);
          pdf.text(`NEU Library  |  ${reportLabel}  |  ${format(new Date(), 'MMM d, yyyy')}`, 14, 292);
          pdf.text(`Page ${i} of ${total}`, W - 14, 292, { align: 'right' });
        }
      };

      // ── Shared: branded header ─────────────────────────────────────────────
      const drawHeader = (
        accentColor: [number,number,number],
        title: string,
        subtitle: string,
        filterLine: string
      ) => {
        pdf.setFillColor(...NAVY);
        pdf.rect(0, 0, W, 52, 'F');
        pdf.setFillColor(...accentColor);
        pdf.rect(0, 52, W, 2, 'F');

        // NEU logo — top-left corner of the navy banner (if available)
        if (neuLogoBase64) {
          try {
            pdf.addImage(neuLogoBase64, 'PNG', 8, 6, 38, 38);
          } catch { /* skip if format unsupported */ }
        }

        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(17); pdf.setFont('helvetica', 'bold');
        pdf.text(title, W / 2, 17, { align: 'center' });
        pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
        pdf.text(subtitle, W / 2, 27, { align: 'center' });
        const periodStr = startDate === endDate
          ? `Period: ${format(parseISO(startDate), 'MMMM d, yyyy')}`
          : `Period: ${format(parseISO(startDate), 'MMM d, yyyy')}  -  ${format(parseISO(endDate), 'MMM d, yyyy')}`;
        pdf.setFontSize(8);
        pdf.text(periodStr, W / 2, 36, { align: 'center' });
        pdf.setFontSize(7); pdf.setTextColor(180, 200, 240);
        pdf.text(`Filter: ${filterLine}`, W / 2, 44, { align: 'center' });
      };

      // ── Shared: metric card grid ───────────────────────────────────────────
      const drawCards = (
        cards: { label: string; value: string; sub: string; accent?: [number,number,number] }[],
        startY: number
      ): number => {
        const CW = (W - 28 - 6) / 2;
        const CH = 22;
        const nRows = Math.ceil(cards.length / 2);
        cards.forEach((c, i) => {
          const cx = 14 + (i % 2) * (CW + 6);
          const cy = startY + Math.floor(i / 2) * (CH + 4);
          const accent = c.accent ?? NAVY;
          pdf.setFillColor(...LIGHT);
          pdf.roundedRect(cx, cy, CW, CH, 2, 2, 'F');
          pdf.setFillColor(...accent);
          pdf.roundedRect(cx, cy, 2.5, CH, 1, 1, 'F');
          pdf.setFontSize(6.5); pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(...SLATE);
          pdf.text(c.label.toUpperCase(), cx + 6, cy + 6);
          pdf.setFontSize(12); pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(...accent);
          pdf.text(String(c.value).slice(0, 28), cx + 6, cy + 14);
          pdf.setFontSize(6); pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(...SLATE);
          pdf.text(c.sub, cx + 6, cy + 19.5);
        });
        return startY + nRows * (CH + 4) + 4;
      };

      // ── Shared: TOC ────────────────────────────────────────────────────────
      const drawTOC = (items: string[], startY: number): number => {
        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...NAVY);
        pdf.text('Table of Contents', 14, startY); startY += 7;
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...SLATE);
        items.forEach((label, i) => {
          const num = `${i + 1}.`;
          pdf.text(num, 14, startY);
          pdf.text(label, 22, startY);
          const dotStart = 22 + pdf.getTextWidth(label) + 2;
          for (let x = dotStart; x < W - 24; x += 2) pdf.text('.', x, startY);
          pdf.text('1', W - 14, startY, { align: 'right' });
          startY += 6;
        });
        pdf.setDrawColor(...NAVY); pdf.setLineWidth(0.3);
        pdf.line(14, startY, W - 14, startY);
        return startY + 8;
      };

      // ── Shared: bar chart (vector, no canvas) ──────────────────────────────
      const drawBarChart = (
        days: [string, number][],
        startY: number,
        peakColor: [number,number,number],
        standardColor: [number,number,number],
        peakLabel: string,
        stdLabel: string
      ): number => {
        if (days.length === 0) {
          pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(...SLATE);
          pdf.text('No data for this period.', 14, startY);
          return startY + 8;
        }
        const CHART_H = 38; const CHART_W = W - 28;
        const maxCount = Math.max(...days.map(d => d[1]), 1);
        const barW = Math.min((CHART_W / days.length) - 2, 18);
        const gap  = CHART_W / days.length;
        // Background
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(14, startY, CHART_W, CHART_H, 2, 2, 'F');
        pdf.setDrawColor(220, 225, 235); pdf.setLineWidth(0.2);
        pdf.roundedRect(14, startY, CHART_W, CHART_H, 2, 2, 'S');
        // Grid
        [0.25, 0.5, 0.75].forEach(f => {
          const gy = startY + CHART_H - f * (CHART_H - 8) - 4;
          pdf.setDrawColor(220, 225, 235); pdf.setLineWidth(0.15);
          pdf.line(16, gy, 14 + CHART_W - 2, gy);
          pdf.setFontSize(5.5); pdf.setTextColor(160, 170, 185);
          pdf.text(String(Math.round(f * maxCount)), 16, gy - 1);
        });
        // Bars
        const peakVal = Math.max(...days.map(d => d[1]));
        days.forEach(([dateStr, count], i) => {
          const isPeak = count === peakVal;
          const barH   = (count / maxCount) * (CHART_H - 10);
          const bx     = 14 + i * gap + (gap - barW) / 2;
          const by     = startY + CHART_H - barH - 5;
          pdf.setFillColor(...(isPeak ? peakColor : standardColor));
          pdf.roundedRect(bx, by, barW, barH, 1.5, 1.5, 'F');
          // Count label
          pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
          if (barH > 6) {
            pdf.setTextColor(255, 255, 255);
            pdf.text(String(count), bx + barW / 2, by + Math.min(barH - 2, 5.5), { align: 'center' });
          } else {
            pdf.setTextColor(...(isPeak ? peakColor : SLATE));
            pdf.text(String(count), bx + barW / 2, by - 1.5, { align: 'center' });
          }
          // Date label
          pdf.setFontSize(6.5); pdf.setFont('helvetica', isPeak ? 'bold' : 'normal');
          pdf.setTextColor(...(isPeak ? peakColor : SLATE));
          const lbl = days.length <= 7 ? format(parseISO(dateStr), 'MMM d') : format(parseISO(dateStr), 'M/d');
          pdf.text(lbl, bx + barW / 2, startY + CHART_H - 1.5, { align: 'center' });
          // Peak annotation
          if (isPeak) {
            pdf.setFontSize(5); pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(...peakColor);
            pdf.text('PEAK', bx + barW / 2, startY + 5, { align: 'center' });
          }
        });
        // Legend
        const ly = startY + CHART_H + 4;
        pdf.setFontSize(6.5); pdf.setFont('helvetica', 'normal');
        pdf.setFillColor(...peakColor); pdf.roundedRect(14, ly, 5, 3, 0.5, 0.5, 'F');
        pdf.setTextColor(...SLATE); pdf.text(peakLabel, 21, ly + 2.5);
        pdf.setFillColor(...standardColor); pdf.roundedRect(55, ly, 5, 3, 0.5, 0.5, 'F');
        pdf.text(stdLabel, 62, ly + 2.5);
        return ly + 8;
      };

      // ── Shared: stacked bar chart (for ALL template) ───────────────────────
      const drawStackedBarChart = (
        days: [string, number][],
        deniedByDay: Record<string, number>,
        startY: number
      ): number => {
        if (days.length === 0 && Object.keys(deniedByDay).length === 0) {
          pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(...SLATE);
          pdf.text('No data for this period.', 14, startY);
          return startY + 8;
        }
        // Merge all day keys
        const allDayKeys = Array.from(new Set([
          ...days.map(d => d[0]),
          ...Object.keys(deniedByDay),
        ])).sort();
        const CHART_H = 40; const CHART_W = W - 28;
        const maxCount = Math.max(...allDayKeys.map(k => (days.find(d => d[0] === k)?.[1] || 0) + (deniedByDay[k] || 0)), 1);
        const barW = Math.min((CHART_W / allDayKeys.length) - 2, 18);
        const gap  = CHART_W / allDayKeys.length;
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(14, startY, CHART_W, CHART_H, 2, 2, 'F');
        pdf.setDrawColor(220, 225, 235); pdf.setLineWidth(0.2);
        pdf.roundedRect(14, startY, CHART_W, CHART_H, 2, 2, 'S');
        [0.25, 0.5, 0.75].forEach(f => {
          const gy = startY + CHART_H - f * (CHART_H - 8) - 4;
          pdf.setDrawColor(220, 225, 235); pdf.setLineWidth(0.15);
          pdf.line(16, gy, 14 + CHART_W - 2, gy);
          pdf.setFontSize(5.5); pdf.setTextColor(160, 170, 185);
          pdf.text(String(Math.round(f * maxCount)), 16, gy - 1);
        });
        allDayKeys.forEach((dateStr, i) => {
          const success = days.find(d => d[0] === dateStr)?.[1] || 0;
          const denied  = deniedByDay[dateStr] || 0;
          const total   = success + denied;
          const totalH  = (total / maxCount) * (CHART_H - 10);
          const dH      = total > 0 ? (denied / total)  * totalH : 0;
          const sH      = total > 0 ? (success / total) * totalH : 0;
          const bx = 14 + i * gap + (gap - barW) / 2;
          const baseY = startY + CHART_H - totalH - 5;
          // Red segment (denied — top)
          if (dH > 0) {
            pdf.setFillColor(...RED_MED);
            pdf.roundedRect(bx, baseY, barW, dH, 1, 1, 'F');
          }
          // Blue segment (success — bottom)
          if (sH > 0) {
            pdf.setFillColor(62, 92, 155);
            pdf.roundedRect(bx, baseY + dH, barW, sH, 1, 1, 'F');
          }
          // Total label
          if (total > 0) {
            pdf.setFontSize(6.5); pdf.setFont('helvetica', 'bold');
            if (totalH > 5) { pdf.setTextColor(255, 255, 255); pdf.text(String(total), bx + barW / 2, baseY + Math.min(totalH - 2, 5), { align: 'center' }); }
            else { pdf.setTextColor(...SLATE); pdf.text(String(total), bx + barW / 2, baseY - 1.5, { align: 'center' }); }
          }
          // Date label
          pdf.setFontSize(6); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...SLATE);
          const lbl = allDayKeys.length <= 7 ? format(parseISO(dateStr), 'MMM d') : format(parseISO(dateStr), 'M/d');
          pdf.text(lbl, bx + barW / 2, startY + CHART_H - 1.5, { align: 'center' });
        });
        const ly = startY + CHART_H + 4;
        pdf.setFontSize(6.5); pdf.setFont('helvetica', 'normal');
        pdf.setFillColor(62, 92, 155); pdf.roundedRect(14, ly, 5, 3, 0.5, 0.5, 'F');
        pdf.setTextColor(...SLATE); pdf.text('Successful Entries', 21, ly + 2.5);
        pdf.setFillColor(...RED_MED); pdf.roundedRect(70, ly, 5, 3, 0.5, 0.5, 'F');
        pdf.text('Denied Attempts', 77, ly + 2.5);
        return ly + 8;
      };

      // ══════════════════════════════════════════════════════════════════════
      // TEMPLATE A — ACTIVE: Library Activity & Engagement Report
      // ══════════════════════════════════════════════════════════════════════
      if (!isRestricted && !isAll) {
        const logs       = filteredLogs;
        const completed  = logs.filter(l => l.checkOutTimestamp);
        const avgMins    = completed.length
          ? Math.round(completed.reduce((s, l) => s + differenceInMinutes(parseISO(l.checkOutTimestamp!), parseISO(l.checkInTimestamp)), 0) / completed.length)
          : null;
        const avgDur     = avgMins !== null ? (avgMins >= 60 ? `${Math.floor(avgMins/60)}h ${avgMins%60}m` : `${avgMins}m`) : 'N/A';
        const purp: Record<string, number> = {};
        logs.forEach(l => { purp[l.purpose] = (purp[l.purpose] || 0) + 1; });
        const topPurpose = Object.entries(purp).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
        const uniqV      = new Set(logs.map(l => l.studentId)).size;
        const deptC: Record<string, number> = {};
        logs.forEach(l => { deptC[l.deptID] = (deptC[l.deptID] || 0) + 1; });
        const topDept    = Object.entries(deptC).sort((a, b) => b[1] - a[1])[0];
        const topDeptLbl = topDept ? `${topDept[0]} (${topDept[1]} visits)` : '-';
        const dayCounts: Record<string, number> = {};
        logs.forEach(l => { const d = l.checkInTimestamp.slice(0, 10); dayCounts[d] = (dayCounts[d] || 0) + 1; });
        const days       = Object.entries(dayCounts).sort((a, b) => a[0].localeCompare(b[0])) as [string, number][];
        const peakEntry  = days.reduce((mx, d) => d[1] > mx[1] ? d : mx, ['', 0]);
        const peakDay    = peakEntry[0] ? format(parseISO(peakEntry[0]), 'MMM d, yyyy') : '-';
        const activeCount = logs.filter(l => !l.checkOutTimestamp && isToday(parseISO(l.checkInTimestamp))).length;
        const noTapCount  = logs.filter(l => !l.checkOutTimestamp && !isToday(parseISO(l.checkInTimestamp))).length;
        const filterCtx  = [
          deptFilter !== 'All Departments' ? `Dept: ${deptNameMap[deptFilter] || deptFilter}` : null,
          programFilter !== 'All Programs' ? `Program: ${programFilter}` : null,
          purposeFilter !== 'All Purposes' ? `Purpose: ${purposeFilter}` : null,
        ].filter(Boolean).join(' · ') || 'All Active Sessions';

        drawHeader(GOLD, 'LIBRARY ACTIVITY & ENGAGEMENT REPORT', 'New Era University - Library Management System', filterCtx);

        let y = drawTOC(['Executive Summary', 'Academic Attendance Trend', 'Session Archive'], 62);

        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...NAVY);
        pdf.text('1.  Executive Summary', 14, y); y += 7;

        const showTopDept    = deptFilter === 'All Departments';
        const showTopProgram = programFilter === 'All Programs';
        const progC: Record<string, number> = {};
        logs.forEach(l => { const p = (l as LogRecord).program || userProgramMap[l.studentId]; if (p) progC[p] = (progC[p] || 0) + 1; });
        const topProgEntry = Object.entries(progC).sort((a, b) => b[1] - a[1])[0];
        const topProgLbl   = topProgEntry ? `${topProgEntry[0]} (${topProgEntry[1]})` : '-';

        // Date range intelligence: single day → peak hour, multi-day → peak date
        const isSingleDay = startDate === endDate;
        let peakTimeCard: { label: string; value: string; sub: string; accent?: [number,number,number] };
        if (isSingleDay) {
          const hourMap: Record<number, number> = {};
          logs.forEach(l => { const h = parseISO(l.checkInTimestamp).getHours(); hourMap[h] = (hourMap[h] || 0) + 1; });
          const peakHE = Object.entries(hourMap).sort((a, b) => +b[1] - +a[1])[0];
          const peakHLbl = peakHE
            ? (() => { const h = parseInt(peakHE[0]); return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:00 ${h < 12 ? 'AM' : 'PM'}`; })()
            : 'No data';
          peakTimeCard = { label: 'Peak Hour (Today)', value: peakHLbl, sub: `${peakHE?.[1] || 0} visits at that hour`, accent: GRN };
        } else {
          peakTimeCard = { label: 'Peak Attendance Day', value: peakDay, sub: `${peakEntry[1]} visits that day`, accent: GRN };
        }

        const aNoTap = logs.filter(l => !l.checkOutTimestamp && !isToday(parseISO(l.checkInTimestamp))).length;
        const cards: { label: string; value: string; sub: string; accent?: [number,number,number] }[] = [
          { label: 'Total Log Entries',     value: String(logs.length),  sub: `${activeCount} active · ${aNoTap} no tap-out`, accent: NAVY },
          { label: 'Total Visitors',        value: String(uniqV),        sub: `unique students in period`, accent: NAVY },
          ...(activeCount > 0 ? [{ label: 'Active Now',    value: String(activeCount), sub: 'currently checked in', accent: [29,78,216] as [number,number,number] }] : []),
          { label: 'Avg Session Duration',  value: avgDur,               sub: `${completed.length} completed session${completed.length !== 1 ? 's' : ''}`, accent: NAVY },
          { label: 'Top Visit Purpose',     value: topPurpose,           sub: 'most common reason', accent: NAVY },
          peakTimeCard,
          ...(showTopDept    ? [{ label: 'Top Visiting Department', value: topDeptLbl,  sub: 'highest footfall', accent: NAVY as [number,number,number] }] : []),
          ...(showTopProgram ? [{ label: 'Top Visiting Program',    value: topProgLbl,  sub: 'most library visits', accent: NAVY as [number,number,number] }] : []),
        ];
        y = drawCards(cards, y);

        // No-tap alert pill (still useful for the librarian)
        if (noTapCount > 0) {
          pdf.setFillColor(...AMB_BG); pdf.roundedRect(14, y, (W - 28) / 2 - 3, 10, 2, 2, 'F');
          pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...AMB_TXT);
          pdf.text(`[!] ${noTapCount} No Tap-Out record${noTapCount !== 1 ? 's' : ''}`, 18, y + 6.5);
          y += 14;
        }

        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...NAVY);
        pdf.text('2.  Academic Attendance Trend', 14, y); y += 7;
        y = drawBarChart(days, y, GRN, [62, 92, 155], 'Peak Day', 'Standard Day');

        pdf.addPage();
        pdf.setFillColor(...NAVY); pdf.rect(0, 0, W, 12, 'F');
        pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255);
        pdf.text('3.  Session Archive - Active Visitor Log', W / 2, 8, { align: 'center' });

        autoTable(pdf, {
          startY: 16,
          head: [['Student', 'ID', 'Dept', 'Program', 'Purpose', 'Time In', 'Time Out', 'Duration', 'Status']],
          body: logs.map(l => {
            const ci = parseISO(l.checkInTimestamp);
            const isAct = !l.checkOutTimestamp && isToday(ci);
            const isNT  = !l.checkOutTimestamp && !isToday(ci);
            const status = l.checkOutTimestamp ? 'Done' : isAct ? 'Active' : 'No Tap';
            const dur = l.checkOutTimestamp ? (() => { const m = differenceInMinutes(parseISO(l.checkOutTimestamp), ci); return m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`; })() : '-';
            return [l.studentName||'-', l.studentId||'-', l.deptID||'-', (l as LogRecord).program || userProgramMap[l.studentId] || '-', l.purpose||'-', format(ci,'MMM d, h:mm a'), l.checkOutTimestamp ? format(parseISO(l.checkOutTimestamp),'h:mm a') : '-', dur, status];
          }),
          headStyles:         { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 9.5 },
          bodyStyles:         { fontSize: 9 },
          alternateRowStyles: { fillColor: LIGHT },
          showHead: 'everyPage',
          // A4 usable width = 210 - 14 - 14 = 182mm. Columns sum = 182.
          columnStyles: {
            0: { cellWidth: 36, fontStyle: 'bold' },            // Student
            1: { cellWidth: 24, font: 'courier', fontSize: 8.5 }, // ID
            2: { cellWidth: 12, halign: 'center', fontStyle: 'bold' }, // Dept
            3: { cellWidth: 18, fontSize: 8.5 },                 // Program
            4: { cellWidth: 22 },                                // Purpose
            5: { cellWidth: 26 },                                // Time In
            6: { cellWidth: 18 },                                // Time Out
            7: { cellWidth: 10, halign: 'center' },              // Dur
            8: { cellWidth: 16, halign: 'center', fontStyle: 'bold' }, // Status
          },
          styles: { cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 }, overflow: 'linebreak' },
          tableWidth: 182,
          margin: { left: 14, right: 14 },
          didParseCell(data) {
            if (data.section !== 'body') return;
            const row = logs[data.row.index]; if (!row) return;
            const ci  = parseISO(row.checkInTimestamp);
            const isAct = !row.checkOutTimestamp && isToday(ci);
            const isNT  = !row.checkOutTimestamp && !isToday(ci);
            if (isAct) { data.cell.styles.fillColor = BLU_BG; if (data.column.index === 8) data.cell.styles.textColor = BLU_TXT; }
            else if (isNT) { data.cell.styles.fillColor = AMB_BG; if (data.column.index === 8) data.cell.styles.textColor = AMB_TXT; }
          },
        });
        addPageNumbers('Library Activity & Engagement Report');
      }

      // ══════════════════════════════════════════════════════════════════════
      // TEMPLATE B — RESTRICTED: Restricted Access & Violation Report
      // ══════════════════════════════════════════════════════════════════════
      else if (isRestricted) {
        const attempts  = blocked;
        const totalDenied = attempts.length;
        const uniqBlocked = new Set(attempts.map(a => a.studentId)).size;
        // Most frequent violator
        const freqMap: Record<string, { name: string; count: number }> = {};
        attempts.forEach(a => {
          if (!freqMap[a.studentId]) freqMap[a.studentId] = { name: a.studentName || a.studentId, count: 0 };
          freqMap[a.studentId].count++;
        });
        const topViolator = Object.values(freqMap).sort((a, b) => b.count - a.count)[0];
        const topViolatorLbl = topViolator ? `${topViolator.name} (${topViolator.count}x)` : 'None';
        // Peak attempt hour
        const hourMap: Record<number, number> = {};
        attempts.forEach(a => { const h = parseISO(a.timestamp).getHours(); hourMap[h] = (hourMap[h] || 0) + 1; });
        const peakHourEntry = Object.entries(hourMap).sort((a, b) => +b[1] - +a[1])[0];
        const peakHourLbl = peakHourEntry
          ? (() => { const h = parseInt(peakHourEntry[0]); return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:00 ${h < 12 ? 'AM' : 'PM'} (${peakHourEntry[1]} attempts)`; })()
          : 'No data';
        // Daily attempt counts for chart
        const deniedByDay: Record<string, number> = {};
        attempts.forEach(a => { const d = a.timestamp.slice(0, 10); deniedByDay[d] = (deniedByDay[d] || 0) + 1; });
        const deniedDays = Object.entries(deniedByDay).sort((a, b) => a[0].localeCompare(b[0])) as [string, number][];

        const filterCtxB = [
          deptFilter !== 'All Departments' ? `Dept: ${deptNameMap[deptFilter] || deptFilter}` : null,
          `Period: ${format(parseISO(startDate),'MMM d')} - ${format(parseISO(endDate),'MMM d, yyyy')}`,
        ].filter(Boolean).join(' · ');
        drawHeader(RED_MED, 'RESTRICTED ACCESS & VIOLATION REPORT', 'New Era University - Library Security Log', filterCtxB);

        let y = drawTOC(['Executive Summary', 'Unauthorized Access Trends', 'Violation Log'], 62);

        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...RED_MED);
        pdf.text('1.  Executive Summary', 14, y); y += 7;

        const cards = [
          { label: 'Total Denied Attempts', value: String(totalDenied),  sub: 'blocked entry attempts in period', accent: RED_MED },
          { label: 'Unique Blocked Users',  value: String(uniqBlocked),  sub: 'distinct IDs flagged by system',   accent: RED_MED },
          { label: 'Most Frequent Violator',value: topViolatorLbl,       sub: 'highest attempt count',            accent: RED_TXT },
          { label: 'Peak Attempt Hour',     value: peakHourLbl,          sub: 'when security is most needed',     accent: RED_MED },
        ];
        y = drawCards(cards as any, y);

        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...RED_MED);
        pdf.text('2.  Unauthorized Access Trends', 14, y); y += 7;
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...SLATE);
        pdf.text('When are blocked users attempting entry? Staff schedules should align with peak windows.', 14, y); y += 6;
        y = drawBarChart(deniedDays, y, RED_MED, [220, 150, 150], 'Peak Window', 'Standard Window');

        pdf.addPage();
        pdf.setFillColor(...RED_MED); pdf.rect(0, 0, W, 12, 'F');
        pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255);
        pdf.text('3.  Violation Log - Denied Access Attempts', W / 2, 8, { align: 'center' });

        autoTable(pdf, {
          startY: 16,
          head: [['Student', 'Student ID', 'Dept', 'Program', 'Attempt Time', 'Status']],
          body: attempts.map(a => [
            a.studentName || '-',
            a.studentId   || '-',
            a.deptID      || '-',
            a.program     || userProgramMap[a.studentId] || '-',
            a.timestamp ? format(parseISO(a.timestamp), 'MMM d, h:mm a') : '-',
            'DENIED',
          ]),
          headStyles:   { fillColor: RED_MED, textColor: 255, fontStyle: 'bold', fontSize: 9.5 },
          bodyStyles:   { fontSize: 9 },
          showHead: 'everyPage',
          // Legacy schema: Student | ID | Dept | Program | Timestamp | Status
          // A4 usable width 182mm, 6 columns
          columnStyles: {
            0: { cellWidth: 46, fontStyle: 'bold' },            // Student
            1: { cellWidth: 30, font: 'courier', fontSize: 8.5 }, // Student ID
            2: { cellWidth: 16, halign: 'center', fontStyle: 'bold' }, // Dept
            3: { cellWidth: 30, fontSize: 8.5 },                 // Program
            4: { cellWidth: 36 },                                // Timestamp
            5: { cellWidth: 24, halign: 'center', fontStyle: 'bold' }, // Status
          },
          styles: { cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 }, overflow: 'linebreak' },
          tableWidth: 182, margin: { left: 14, right: 14 },
          didParseCell(data) {
            if (data.section !== 'body') return;
            // Pastel pink on all rows — professional, not eye-wrenching
            data.cell.styles.fillColor = [255, 243, 243] as [number,number,number];
            // Bold red only on ID + Status columns
            if (data.column.index === 1 || data.column.index === 5) {
              data.cell.styles.textColor = RED_TXT;
              data.cell.styles.fontStyle = 'bold';
            }
          },
        });
        addPageNumbers('Restricted Access & Violation Report');
      }

      // ══════════════════════════════════════════════════════════════════════
      // TEMPLATE C — ALL: Comprehensive Library Operations Report
      // ══════════════════════════════════════════════════════════════════════
      else {
        const logs       = filteredLogs;
        const attempts   = blocked;
        const totalSuccess = logs.length;
        const totalDenied  = attempts.length;
        const totalReqs    = totalSuccess + totalDenied;
        const successPct   = totalReqs > 0 ? Math.round((totalSuccess / totalReqs) * 100) : 100;
        const deniedPct    = 100 - successPct;
        // Peak traffic hour (combined)
        const hourMap: Record<number, number> = {};
        logs.forEach(l => { const h = parseISO(l.checkInTimestamp).getHours(); hourMap[h] = (hourMap[h] || 0) + 1; });
        attempts.forEach(a => { const h = parseISO(a.timestamp).getHours(); hourMap[h] = (hourMap[h] || 0) + 1; });
        const peakHourEntry = Object.entries(hourMap).sort((a, b) => +b[1] - +a[1])[0];
        const peakHourLbl = peakHourEntry
          ? (() => { const h = parseInt(peakHourEntry[0]); return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:00 ${h < 12 ? 'AM' : 'PM'} (${peakHourEntry[1]} req)`; })()
          : '-';
        const dayCounts: Record<string, number> = {};
        logs.forEach(l => { const d = l.checkInTimestamp.slice(0, 10); dayCounts[d] = (dayCounts[d] || 0) + 1; });
        const days = Object.entries(dayCounts).sort((a, b) => a[0].localeCompare(b[0])) as [string, number][];
        const deniedByDay: Record<string, number> = {};
        attempts.forEach(a => { const d = a.timestamp.slice(0, 10); deniedByDay[d] = (deniedByDay[d] || 0) + 1; });
        const filterCtx = [
          deptFilter    !== 'All Departments' ? `Dept: ${deptNameMap[deptFilter] || deptFilter}` : null,
          programFilter !== 'All Programs'    ? `Program: ${programFilter}` : null,
          purposeFilter !== 'All Purposes'    ? `Purpose: ${purposeFilter} (blocked attempts excluded)` : null,
        ].filter(Boolean).join(' · ') || 'All Users - Successful + Denied';

        drawHeader([62, 92, 155], 'COMPREHENSIVE LIBRARY OPERATIONS REPORT', 'New Era University - Full Traffic Analysis', filterCtx);

        let y = drawTOC(['Executive Summary', 'Total Library Traffic Volume', 'Unified Session Archive'], 62);

        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...NAVY);
        pdf.text('1.  Executive Summary', 14, y); y += 7;

        // Date range intelligence
        const isSingleDayAll = startDate === endDate;
        let peakTimeCardAll: { label: string; value: string; sub: string; accent?: [number,number,number] };
        if (isSingleDayAll) {
          peakTimeCardAll = { label: 'Peak Hour (Today)', value: peakHourLbl, sub: 'combined successful + denied', accent: GRN };
        } else {
          // Peak day from successful sessions
          const allDayCounts: Record<string, number> = {};
          logs.forEach(l => { const d = l.checkInTimestamp.slice(0,10); allDayCounts[d] = (allDayCounts[d]||0)+1; });
          const peakDayEntry = Object.entries(allDayCounts).sort((a,b) => b[1]-a[1])[0];
          const peakDayLbl   = peakDayEntry ? format(parseISO(peakDayEntry[0]),'MMM d, yyyy') : '-';
          peakTimeCardAll = { label: 'Peak Attendance Day', value: peakDayLbl, sub: `${peakDayEntry?.[1]||0} sessions`, accent: GRN };
        }

        // Demographic filters — same Case A/B/C logic as ACTIVE template
        const showTopDeptAll    = deptFilter === 'All Departments';
        const showTopProgAll    = programFilter === 'All Programs';
        const deptCAll: Record<string, number> = {};
        logs.forEach(l => { deptCAll[l.deptID] = (deptCAll[l.deptID]||0)+1; });
        const topDeptAll = Object.entries(deptCAll).sort((a,b) => b[1]-a[1])[0];
        const topDeptAllLbl = topDeptAll ? `${topDeptAll[0]} (${topDeptAll[1]} visits)` : '-';
        const progCAll: Record<string, number> = {};
        logs.forEach(l => { const p=(l as LogRecord).program||userProgramMap[l.studentId]; if(p) progCAll[p]=(progCAll[p]||0)+1; });
        const topProgAll = Object.entries(progCAll).sort((a,b) => b[1]-a[1])[0];
        const topProgAllLbl = topProgAll ? `${topProgAll[0]} (${topProgAll[1]})` : '-';
        const purpAll: Record<string, number> = {};
        logs.forEach(l => { purpAll[l.purpose] = (purpAll[l.purpose]||0)+1; });
        const topPurpAll = Object.entries(purpAll).sort((a,b) => b[1]-a[1])[0]?.[0] || '-';
        const completedAll = logs.filter(l => l.checkOutTimestamp);
        const avgMinsAll = completedAll.length
          ? Math.round(completedAll.reduce((s,l) => s + differenceInMinutes(parseISO(l.checkOutTimestamp!), parseISO(l.checkInTimestamp)), 0) / completedAll.length)
          : null;
        const avgDurAll = avgMinsAll !== null ? (avgMinsAll >= 60 ? `${Math.floor(avgMinsAll/60)}h ${avgMinsAll%60}m` : `${avgMinsAll}m`) : 'N/A';
        const activeCountAll = logs.filter(l => !l.checkOutTimestamp && isToday(parseISO(l.checkInTimestamp))).length;
        const uniqAll = new Set(logs.map(l => l.studentId)).size;

        const cards = [
          { label: 'Total Log Entries',  value: String(totalReqs),                  sub: `${totalSuccess} sessions · ${totalDenied} denied`,  accent: NAVY },
          { label: 'Total Visitors',     value: String(uniqAll),                    sub: `unique students in period`,                          accent: NAVY },
          { label: 'Traffic Snapshot',   value: `${successPct}% / ${deniedPct}%`,   sub: 'Success vs Denied ratio',                           accent: GRN  },
          { label: 'Avg Session Duration', value: avgDurAll,                         sub: `${completedAll.length} completed sessions`,          accent: NAVY },
          { label: 'Top Visit Purpose',  value: topPurpAll,                          sub: 'most common reason',                                accent: NAVY },
          peakTimeCardAll,
          ...(activeCountAll > 0 ? [{ label: 'Active Now', value: String(activeCountAll), sub: 'currently checked in', accent: [29,78,216] as [number,number,number] }] : []),
          ...(showTopDeptAll ? [{ label: 'Top Department', value: topDeptAllLbl, sub: 'highest session count', accent: NAVY as [number,number,number] }] : []),
          ...(showTopProgAll ? [{ label: 'Top Program',    value: topProgAllLbl, sub: 'most visits by program', accent: NAVY as [number,number,number] }] : []),
        ];
        y = drawCards(cards as any, y);

        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...NAVY);
        pdf.text('2.  Total Library Traffic Volume', 14, y); y += 7;
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...SLATE);
        pdf.text('Stacked view: blue = successful entries, red = denied attempts.', 14, y); y += 6;
        y = drawStackedBarChart(days, deniedByDay, y);

        pdf.addPage();
        pdf.setFillColor(62, 92, 155); pdf.rect(0, 0, W, 12, 'F');
        pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255);
        pdf.text('3.  Unified Session Archive  (Sessions + Blocked Attempts)', W / 2, 8, { align: 'center' });

        // ── Unified chronological table: sessions + blocked attempts merged ──────
        // Schema: Student | ID | Dept | Program | Purpose | Time In | Time Out | Dur | Status
        // Blocked rows: Purpose='-', Time Out='-', Dur='-', Status='BLOCKED'
        type AllRow = { isBlocked: boolean; name: string; id: string; dept: string; prog: string;
                        purpose: string; timeIn: string; timeOut: string; dur: string; status: string; };
        const allRowsSorted: AllRow[] = [
          ...logs.map(l => {
            const ci = parseISO(l.checkInTimestamp);
            const isAct = !l.checkOutTimestamp && isToday(ci);
            const status = l.checkOutTimestamp ? 'Done' : isAct ? 'Active' : 'No Tap';
            const dur = l.checkOutTimestamp ? (() => { const m = differenceInMinutes(parseISO(l.checkOutTimestamp), ci); return m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`; })() : '-';
            return { isBlocked: false, name: l.studentName||'-', id: l.studentId||'-', dept: l.deptID||'-',
              prog: (l as LogRecord).program||userProgramMap[l.studentId]||'-', purpose: l.purpose||'-',
              timeIn: format(ci,'MMM d, h:mm a'), timeOut: l.checkOutTimestamp?format(parseISO(l.checkOutTimestamp),'h:mm a'):'-',
              dur, status, _ts: l.checkInTimestamp };
          }),
          ...attempts.map(a => ({
            isBlocked: true, name: a.studentName||'-', id: a.studentId||'-', dept: a.deptID||'-',
            prog: a.program||userProgramMap[a.studentId]||'-', purpose: '-',
            timeIn: a.timestamp ? format(parseISO(a.timestamp),'MMM d, h:mm a') : '-',
            timeOut: '-', dur: '-', status: 'BLOCKED', _ts: a.timestamp||'',
          })),
        ].sort((a, b) => (b as any)._ts.localeCompare((a as any)._ts));

        autoTable(pdf, {
          startY: 16,
          head: [['Student', 'ID', 'Dept', 'Program', 'Purpose', 'Time In', 'Time Out', 'Dur', 'Status']],
          body: allRowsSorted.map(r => [r.name, r.id, r.dept, r.prog, r.purpose, r.timeIn, r.timeOut, r.dur, r.status]),
          headStyles:  { fillColor: [62,92,155] as [number,number,number], textColor:255, fontStyle:'bold', fontSize:9.5 },
          bodyStyles:  { fontSize:9 },
          alternateRowStyles: { fillColor: LIGHT },
          showHead: 'everyPage',
          // A4 usable width = 210 - 14 - 14 = 182mm. Columns sum = 182.
          columnStyles: {
            0: { cellWidth: 36, fontStyle: 'bold' },           // Student
            1: { cellWidth: 24, font: 'courier', fontSize: 8 }, // ID
            2: { cellWidth: 12, halign: 'center', fontStyle: 'bold' }, // Dept
            3: { cellWidth: 18, fontSize: 8 },                  // Program
            4: { cellWidth: 22 },                               // Purpose
            5: { cellWidth: 26 },                               // Time In
            6: { cellWidth: 18 },                               // Time Out
            7: { cellWidth: 10, halign: 'center' },             // Dur
            8: { cellWidth: 16, halign: 'center', fontStyle: 'bold' }, // Status
          },
          styles: { cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 }, overflow: 'linebreak' },
          tableWidth: 182, margin: { left: 14, right: 14 },
          didParseCell(data) {
            if (data.section !== 'body') return;
            const row = allRowsSorted[data.row.index];
            if (!row) return;
            if (row.isBlocked) {
              // Pastel pink — blocked rows
              data.cell.styles.fillColor = [255, 243, 243] as [number,number,number];
              if (data.column.index === 1 || data.column.index === 8) {
                data.cell.styles.textColor = RED_TXT;
                data.cell.styles.fontStyle = 'bold';
              }
            } else {
              // Session rows — colour by status
              if (row.status === 'Active') {
                data.cell.styles.fillColor = BLU_BG;
                if (data.column.index === 8) data.cell.styles.textColor = BLU_TXT;
              } else if (row.status === 'Done') {
                if (data.column.index === 8) data.cell.styles.textColor = GRN;
              } else {
                // No Tap
                data.cell.styles.fillColor = AMB_BG;
                if (data.column.index === 8) data.cell.styles.textColor = AMB_TXT;
              }
            }
          },
        });
        addPageNumbers('Comprehensive Library Operations Report');
      }

      // ── Deliver ──────────────────────────────────────────────────────────
      const templateName = isRestricted ? 'Violation' : isAll ? 'Operations' : 'Activity';
      const filename = `NEU_Library_${templateName}_Report_${startDate}_to_${endDate}.pdf`;
      if (disposition === 'download') {
        pdf.save(filename);
        setSuccessCard({ title: 'PDF Downloaded', description: `${isRestricted ? blocked.length : filteredLogs.length} records exported.`, color: 'navy' });
      } else {
        const blob = pdf.output('blob');
        const url  = URL.createObjectURL(blob);
        setPdfPreview({ url, filename });
      }
    } catch (err) {
      console.error('[PDF]', err);
      toast({ title: 'Export Failed', description: 'PDF generation error.', variant: 'destructive' });
    } finally {
      setPdfGenerating(false);
    }
    }, 30);
  };

  const exportCSV = () => {
    if (!filteredLogs.length) return;
    const headers = ['Student Name', 'Student ID', 'Department', 'Purpose', 'Check In', 'Check Out', 'Duration (mins)', 'Status'];
    const rows = filteredLogs.map(l => {
      const ci = parseISO(l.checkInTimestamp);
      const isNoTap = !l.checkOutTimestamp && !isToday(ci);
      const mins = l.checkOutTimestamp
        ? differenceInMinutes(parseISO(l.checkOutTimestamp), ci)
        : null;
      return [
        l.studentName || 'Student',
        l.studentId,
        l.deptID,
        l.purpose,
        format(ci, 'yyyy-MM-dd HH:mm:ss'),
        l.checkOutTimestamp ? format(parseISO(l.checkOutTimestamp), 'yyyy-MM-dd HH:mm:ss') : '',
        mins !== null ? String(mins) : '',
        l.checkOutTimestamp ? 'Completed' : isNoTap ? 'No Tap' : 'Active',
      ];
    });
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `NEU_Library_Sessions_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setSuccessCard({ title: 'CSV Exported', description: `${filteredLogs.length} session records downloaded successfully.`, color: 'navy' });
  };

  return (
    <>
      {successCard && (
        <SuccessCard
          title={successCard.title}
          description={successCard.description}
          color={successCard.color}
          onClose={() => setSuccessCard(null)}
        />
      )}

      {/* ── PDF Generating Overlay ── */}
      {pdfGenerating && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center"
          style={{ background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl px-10 py-9 flex flex-col items-center gap-5 w-72"
            style={{ fontFamily: "'DM Sans',sans-serif" }}>
            {/* Spinning rings */}
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent animate-spin"
                style={{ borderTopColor: 'hsl(221,72%,22%)', animationDuration: '0.85s' }} />
              <div className="absolute inset-2 rounded-full border-4 border-transparent animate-spin"
                style={{ borderTopColor: 'hsl(221,60%,60%)', animationDuration: '1.3s', animationDirection: 'reverse' }} />
            </div>
            <div className="text-center space-y-1">
              <p className="font-bold text-slate-800 text-base" style={{ fontFamily: "'Playfair Display',serif" }}>
                Generating Report
              </p>
              <p className="text-xs font-medium text-slate-400">Building chart, summary, and log table...</p>
            </div>
            {/* Skeleton bars */}
            <div className="w-full space-y-2">
              {[1, 0.7, 0.5].map((op, i) => (
                <div key={i} className="h-2.5 rounded-full bg-slate-100 animate-pulse" style={{ opacity: op }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PDF Preview Modal ── */}
      {pdfPreview && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.70)', backdropFilter: 'blur(8px)', fontFamily: "'DM Sans',sans-serif" }}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: '90vw', maxWidth: 960, height: '90vh' }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 flex-shrink-0"
              style={{ background: 'hsl(221,72%,22%)' }}>
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-white/10">
                  <FileDown size={15} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm leading-tight" style={{ fontFamily: "'Playfair Display',serif" }}>
                    Visitor Analytics Report
                  </p>
                  <p className="text-white/50 text-[10px] font-medium">{pdfPreview.filename}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Download from modal */}
                <a href={pdfPreview.url} download={pdfPreview.filename}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold transition-all active:scale-95"
                  style={{ background: 'hsl(43,85%,55%)', color: 'hsl(221,72%,15%)' }}>
                  <FileDown size={12} /> Download
                </a>
                {/* Close */}
                <button
                  onClick={() => { URL.revokeObjectURL(pdfPreview.url); setPdfPreview(null); }}
                  className="flex items-center justify-center w-8 h-8 rounded-xl transition-all active:scale-95 text-white/60 hover:text-white hover:bg-white/10">
                  ✕
                </button>
              </div>
            </div>

            {/* PDF iframe viewer */}
            <div className="flex-1 bg-slate-100 relative">
              <iframe
                src={pdfPreview.url}
                className="w-full h-full border-0"
                title="PDF Preview"
                style={{ display: 'block' }}
              />
            </div>
          </div>
        </div>
      )}
    <div className="space-y-4" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* ── Top row: Filters (left) + Right column: Top Visitors + AI Insights ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">

        {/* ── Filter Card ── */}
        <div style={card}>
        <button className="w-full flex items-center justify-between p-4 sm:p-5" onClick={() => setFiltersOpen(f => !f)}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
              <Calendar size={16} />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>Reporting Hub</h3>
              <p className="text-slate-400 font-semibold text-xs mt-0.5">Filter · Export · AI Insights</p>
            </div>
          </div>
          {filtersOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
        </button>

        {filtersOpen && (
          <div className="px-4 sm:px-5 pb-5 space-y-4 border-t border-slate-100 pt-4">

            {/* Preset chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500 font-semibold text-sm mr-1">Range:</span>
              {PRESETS.map(p => (
                <button key={p.label} onClick={() => applyPreset(p)}
                  className="px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all active:scale-95 border"
                  style={activePreset === p.label
                    ? { background: navy, color: 'white', borderColor: navy }
                    : { background: 'white', color: 'hsl(221,40%,40%)', borderColor: 'rgba(10,26,77,0.15)' }
                  }>
                  {p.label}
                </button>
              ))}
              <div className="flex items-center gap-2 ml-auto">
                <input type="date" value={startDate} onChange={e => handleDateChange('start', e.target.value)}
                  style={{ height:'36px', padding:'0 10px', borderRadius:'12px', border:'1px solid #e2e8f0',
                    background:'#f8fafc', fontSize:'0.875rem', fontWeight:600, color:'#1e293b', cursor:'pointer',
                    outline:'none', width:'140px' }} />
                <span className="text-slate-300 text-sm font-bold">to</span>
                <input type="date" value={endDate} onChange={e => handleDateChange('end', e.target.value)}
                  style={{ height:'36px', padding:'0 10px', borderRadius:'12px', border:'1px solid #e2e8f0',
                    background:'#f8fafc', fontSize:'0.875rem', fontWeight:600, color:'#1e293b', cursor:'pointer',
                    outline:'none', width:'140px' }} />
              </div>
            </div>

            {/* Dept + Program + Purpose filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* College — format: DeptID - Full Name */}
              <div>
                <p className="text-slate-400 font-semibold text-xs mb-1.5 uppercase tracking-wide">College</p>
                <Select value={deptFilter} onValueChange={handleDeptChange}>
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200 font-semibold text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-64">
                    <SelectItem value="All Departments" className="font-semibold text-sm">All Colleges</SelectItem>
                    {(dbDepartments || [])
                      .sort((a, b) => {
                        // Pin LIBRARY/STAFF to top
                        const aStaff = a.deptID === 'LIBRARY' || a.deptID === 'STAFF';
                        const bStaff = b.deptID === 'LIBRARY' || b.deptID === 'STAFF';
                        if (aStaff && !bStaff) return -1;
                        if (!aStaff && bStaff) return 1;
                        return a.deptID.localeCompare(b.deptID);
                      })
                      .map(d => (
                        <SelectItem key={d.deptID} value={d.deptID} className="font-semibold text-sm">
                          <span className="font-bold mr-1" style={{ color: navy, fontFamily: "'DM Mono',monospace" }}>{d.deptID}</span>
                          {' - '}{d.departmentName}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Program — STAFF codes pinned first, then Code - Full Title */}
              <div>
                <p className="text-slate-400 font-semibold text-xs mb-1.5 uppercase tracking-wide">Program</p>
                <Select
                  value={programFilter}
                  onValueChange={setProgramFilter}
                  disabled={deptFilter === 'All Departments'}
                >
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200 font-semibold text-sm disabled:opacity-50">
                    <SelectValue placeholder={deptFilter === 'All Departments' ? 'Select dept first' : 'All Programs'} />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-64">
                    <SelectItem value="All Programs" className="font-semibold text-sm">All Programs</SelectItem>
                    {[...availablePrograms]
                      .sort((a, b) => {
                        const aStaff = a.code.toUpperCase().includes('STAFF');
                        const bStaff = b.code.toUpperCase().includes('STAFF');
                        if (aStaff && !bStaff) return -1;
                        if (!aStaff && bStaff) return 1;
                        return a.code.localeCompare(b.code);
                      })
                      .map(prog => (
                        <SelectItem key={prog.code} value={prog.code} className="font-semibold text-sm py-2">
                          <span className="font-bold mr-1 whitespace-nowrap inline-block" style={{ color: navy, fontFamily: "'DM Mono',monospace" }}>{prog.code}</span>
                          {' - '}{prog.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Purpose — disabled in BLOCKED mode (blocked attempts have no purpose data) */}
              <div>
                <p className="text-slate-400 font-semibold text-xs mb-1.5 uppercase tracking-wide">
                  Purpose
                  {userStatusFilter === 'blocked' && (
                    <span className="ml-2 text-red-400 font-bold normal-case tracking-normal">· N/A in Blocked view</span>
                  )}
                </p>
                <Select
                  value={purposeFilter}
                  onValueChange={setPurposeFilter}
                  disabled={userStatusFilter === 'blocked'}
                >
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {dynamicPurposes.map(p => <SelectItem key={p} value={p} className="font-semibold text-sm">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Filter hierarchy row */}
            <div className="flex flex-wrap gap-4">

              {/* USER ACCESS — primary filter */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 px-1">User Access</span>
                <div className="flex items-center gap-0.5 p-1 rounded-xl bg-slate-100">
                  {([
                    { value: 'all',     label: 'ALL'     },
                    { value: 'active',  label: 'ACTIVE'  },
                    { value: 'blocked', label: 'BLOCKED' },
                  ] as const).map(opt => (
                    <button key={opt.value} onClick={() => { setUserStatusFilter(opt.value); resetPage(); }}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all tracking-wide"
                      style={userStatusFilter === opt.value
                        ? { background: opt.value === 'blocked' ? '#dc2626' : navy, color: 'white' }
                        : { color: '#64748b' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* SESSION TYPE — secondary filter (hidden in BLOCKED mode) */}
              {userStatusFilter !== 'blocked' && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 px-1">Session Type</span>
                  <div className="flex items-center gap-0.5 p-1 rounded-xl bg-slate-100">
                    {([
                      { value: 'all',          label: 'ALL'          },
                      { value: 'with_timeout', label: 'WITH TIMEOUT' },
                      { value: 'no_tap',       label: 'NO TAP-OUT'   },
                    ] as const).map(opt => (
                      <button key={opt.value} onClick={() => setTapOutFilter(opt.value)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all tracking-wide"
                        style={tapOutFilter === opt.value ? { background: navy, color: 'white' } : { color: '#64748b' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Records count + Reset */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-slate-400 text-sm font-medium">
                {userStatusFilter === 'blocked'
                    ? `${blockedAttempts?.length || 0} blocked attempt${(blockedAttempts?.length||0) !== 1 ? 's' : ''}`
                    : userStatusFilter === 'all'
                    ? `${unifiedRows.length} record${unifiedRows.length !== 1 ? 's' : ''} (sessions + blocked)`
                    : `${filteredLogs.length} session${filteredLogs.length !== 1 ? 's' : ''}`} found
                {deptFilter !== 'All Departments' && <span className="ml-2 font-semibold" style={{ color: navy }}>· {deptFilter}</span>}
                {programFilter !== 'All Programs' && <span className="ml-1 text-purple-600 font-semibold">· {availablePrograms.find(p => p.name === programFilter)?.code || programFilter}</span>}
                {userStatusFilter !== 'all' && (
                  <span className="ml-1 font-semibold" style={{ color: userStatusFilter === 'blocked' ? '#dc2626' : '#059669' }}>
                    · {userStatusFilter === 'blocked' ? 'Blocked Users' : 'Active Only'}
                  </span>
                )}
              </p>
              {isFiltersDirty && (
                <button onClick={handleResetFilters}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold border transition-all active:scale-95"
                  style={{ background: 'rgba(220,38,38,0.06)', color: '#dc2626', borderColor: 'rgba(220,38,38,0.2)' }}>
                  <RotateCcw size={11} /> Reset Filters &amp; Sort
                </button>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Split PDF button: View (inline) + Download */}
              <div className="flex flex-1 rounded-xl overflow-hidden border border-slate-200 divide-x divide-slate-200">
                <button onClick={() => generatePDF('view')} disabled={filteredLogs.length === 0}
                  className="flex-1 h-12 font-semibold text-sm flex items-center justify-center gap-2 bg-white text-slate-700 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-40">
                  <Eye size={15} /> Preview
                </button>
                <button onClick={() => generatePDF('download')} disabled={filteredLogs.length === 0}
                  className="flex-1 h-12 font-semibold text-sm flex items-center justify-center gap-2 bg-white text-slate-700 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-40">
                  <FileDown size={15} /> Download PDF
                </button>
              </div>
              <button onClick={exportCSV} disabled={filteredLogs.length === 0}
                className="flex-1 h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 active:scale-95 transition-all disabled:opacity-40">
                <Sheet size={17} /> Export CSV
              </button>
              <button onClick={generateAiSummary} disabled={isGeneratingAi || filteredLogs.length === 0}
                className="flex-1 h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
                style={navyBtn}>
                {isGeneratingAi ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {isGeneratingAi ? 'Analyzing...' : 'AI Insights'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Right column: Top Visitors only ── */}
      <div>

      {/* ── Top Visitors ── */}
        {topVisitors.length > 0 && (
          <div style={{ ...card, background: 'rgba(255,255,255,0.98)' }} className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
              <Trophy size={16} style={{ color: 'hsl(43,85%,50%)' }} />
              <div>
                <h3 className="font-bold text-slate-900 text-base leading-tight" style={{ fontFamily: "'Playfair Display',serif" }}>
                  Top Visitors
                </h3>
                <p className="text-slate-400 text-xs font-medium mt-0.5">Top 5 · selected period</p>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {topVisitors.map((v, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 text-white"
                    style={{ background: i === 0 ? 'hsl(43,85%,52%)' : i === 1 ? '#94a3b8' : i === 2 ? '#c8915a' : `${navy}20`, color: i < 3 ? 'white' : navy }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{v.name}</p>
                    <p className="text-slate-400 text-xs font-medium">{v.dept}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-sm" style={{ color: navy }}>{v.visits}×</p>
                    <p className="text-slate-400 text-xs">
                      {v.totalMins >= 60 ? `${Math.floor(v.totalMins/60)}h ${v.totalMins%60}m` : `${v.totalMins}m`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>{/* end right column */}
      </div>{/* end grid */}

      {/* ── AI Summary — full width, below filters ── */}
      {(aiSummary !== null || isGeneratingAi) && (
        <div style={{ ...card, background: 'rgba(255,255,255,0.98)' }} className="overflow-hidden">
          <button
            className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors border-b border-slate-100"
            onClick={() => setAiCollapsed(c => !c)}
          >
            <div className="p-2.5 rounded-xl text-white flex-shrink-0" style={{ background: navyBtn.background }}>
              <Sparkles size={15} />
            </div>
            <h4 className="font-bold text-slate-900 text-xl flex-1" style={{ fontFamily: "'Playfair Display',serif" }}>
              AI Generated Insights
            </h4>
            {aiCollapsed
              ? <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
              : <ChevronUp   size={16} className="text-slate-400 flex-shrink-0" />}
            <span
              role="button"
              onClick={e => { e.stopPropagation(); setAiSummary(null); setAiCollapsed(false); }}
              title="Close"
              className="ml-1 p-1.5 rounded-lg hover:bg-red-50 hover:text-red-400 text-slate-300 transition-colors text-lg leading-none font-bold">
              ×
            </span>
          </button>
          {!aiCollapsed && (
            <div className="p-5">
              {isGeneratingAi ? (
                <div className="flex items-center gap-3 py-4">
                  <Loader2 size={20} className="animate-spin" style={{ color: navy }} />
                  <p className="text-slate-500 text-sm font-medium">Analyzing {filteredLogs.length} records...</p>
                </div>
              ) : (
                <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">{aiSummary}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Session Archive / Blocked Attempts ── */}
      <div style={{ ...card, background: 'rgba(255,255,255,0.98)' }} className="overflow-hidden">
        {/* Table header */}
        <div className="px-5 py-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl text-white"
                style={{ background: userStatusFilter === 'blocked' ? '#dc2626' : navy }}>
                <FileDown size={17} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
                  {userStatusFilter === 'blocked' ? 'Blocked Attempts Log' : userStatusFilter === 'all' ? 'Unified Session Archive' : 'Session Archive'}
                </h3>
                <p className="text-slate-400 text-sm font-medium mt-0.5">
                  {`Showing ${Math.min(paginatedRows.length + (currentPage-1)*rowsPerPage, unifiedRows.length)} of ${unifiedRows.length} record${unifiedRows.length!==1?'s':''}`}
                </p>
              </div>
            </div>

            {/* Rows-per-page + search row */}
            <div className="flex items-center gap-2 flex-wrap ml-auto">
              {/* Rows per page */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">Rows:</span>
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100">
                  {([25, 50, 100] as const).map(n => (
                    <button key={n} onClick={() => { setRowsPerPage(n); setCurrentPage(1); }}
                      className="px-2.5 py-1 rounded-md text-xs font-bold transition-all"
                      style={rowsPerPage === n
                        ? { background: navy, color: 'white' }
                        : { color: '#64748b' }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search name, ID, dept..."
                  value={archiveSearch}
                  onChange={e => { setArchiveSearch(e.target.value); setCurrentPage(1); }}
                  style={{ height:'40px', paddingLeft:'36px', paddingRight:'12px', borderRadius:'12px',
                    border:'1px solid #e2e8f0', background:'#f8fafc', fontSize:'0.875rem', fontWeight:500,
                    color:'#1e293b', outline:'none', width:'280px' }} />
              </div>
            </div>
          </div>

          {/* Active filter chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {deptFilter !== 'All Departments' && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg"
                style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                {deptFilter}
              </span>
            )}
            {programFilter !== 'All Programs' && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg"
                style={{ background: 'hsl(262,83%,58%,0.1)', color: 'hsl(262,83%,45%)', fontFamily: "'DM Mono',monospace" }}>
                {programFilter}
              </span>
            )}
            {purposeFilter !== 'All Purposes' && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                {purposeFilter}
              </span>
            )}
            {userStatusFilter !== 'all' && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={userStatusFilter === 'blocked'
                  ? { background: 'rgba(220,38,38,0.08)', color: '#dc2626' }
                  : { background: 'rgba(5,150,105,0.08)', color: '#059669' }}>
                {userStatusFilter === 'blocked' ? 'Blocked Users' : 'Active Users Only'}
              </span>
            )}
            {isSortDirty && (
              <button onClick={handleResetSort}
                className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full transition-all active:scale-95 ml-auto"
                style={{ background: 'rgba(100,116,139,0.07)', color: '#475569', border: '1px solid rgba(100,116,139,0.2)' }}>
                <RotateCcw size={10} /> Reset Sort
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="py-14 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={20} /><span className="text-sm font-medium">Loading...</span>
          </div>
        ) : unifiedRows.length === 0 ? (
          <div className="py-14 text-center text-slate-400 text-sm italic font-medium">No records for selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {userStatusFilter === 'blocked' ? (
                  /* BLOCKED schema: Student | Student ID | Department | Program | Timestamp | Status */
                  <TableRow className="h-11 border-slate-100">
                    <TableHead className="pl-5 text-xs font-bold uppercase tracking-wide bg-red-50 text-red-700 cursor-pointer hover:bg-red-100 select-none" onClick={() => toggleArchiveSort('studentName')}>Student <ArchiveSortIcon field="studentName" /></TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wide bg-red-50 text-red-700 hidden sm:table-cell cursor-pointer hover:bg-red-100 select-none" onClick={() => toggleArchiveSort('studentId')}>Student ID <ArchiveSortIcon field="studentId" /></TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wide bg-red-50 text-red-700 cursor-pointer hover:bg-red-100 select-none" onClick={() => toggleArchiveSort('deptID')}>Department <ArchiveSortIcon field="deptID" /></TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wide bg-red-50 text-red-700 hidden lg:table-cell cursor-pointer hover:bg-red-100 select-none" onClick={() => toggleArchiveSort('program')}>Program <ArchiveSortIcon field="program" /></TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wide bg-red-50 text-red-700 cursor-pointer hover:bg-red-100 select-none" onClick={() => toggleArchiveSort('checkInTimestamp')}>Timestamp <ArchiveSortIcon field="checkInTimestamp" /></TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wide bg-red-50 text-red-700 text-right pr-5">Status</TableHead>
                  </TableRow>
                ) : (
                  /* ACTIVE / ALL schema: Student | ID | Dept | Program | Purpose | Time In | Time Out | Duration | Status */
                  <TableRow className="h-11 border-slate-100">
                    <TableHead className="pl-5 text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 cursor-pointer hover:bg-slate-100 select-none" onClick={() => toggleArchiveSort('studentName')}>Student <ArchiveSortIcon field="studentName" /></TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 hidden sm:table-cell cursor-pointer hover:bg-slate-100 select-none" onClick={() => toggleArchiveSort('studentId')}>Student ID <ArchiveSortIcon field="studentId" /></TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 cursor-pointer hover:bg-slate-100 select-none" onClick={() => toggleArchiveSort('deptID')}>Dept <ArchiveSortIcon field="deptID" /></TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 hidden lg:table-cell cursor-pointer hover:bg-slate-100 select-none" onClick={() => toggleArchiveSort('program')}>Program <ArchiveSortIcon field="program" /></TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 hidden sm:table-cell cursor-pointer hover:bg-slate-100 select-none" onClick={() => toggleArchiveSort('purpose')}>Purpose</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 cursor-pointer hover:bg-slate-100 select-none" onClick={() => toggleArchiveSort('checkInTimestamp')}>Time In <ArchiveSortIcon field="checkInTimestamp" /></TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 hidden md:table-cell">Time Out</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 text-center hidden md:table-cell cursor-pointer hover:bg-slate-100 select-none" onClick={() => toggleArchiveSort('duration')}>Duration <ArchiveSortIcon field="duration" /></TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 text-right pr-5">Status</TableHead>
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {paginatedRows.map((row, idx) => {
                  if (row._type === 'blocked') {
                    const a = row.data;
                    const prog = a.program || userProgramMap[a.studentId] || '';

                    if (userStatusFilter === 'blocked') {
                      /* ── BLOCKED view: 6-column legacy schema ── */
                      return (
                        <TableRow key={a.id || `b-${idx}`}
                          className="border-b border-red-50 transition-colors"
                          style={{ background: 'rgba(255,241,241,0.7)', height: '60px' }}>
                          {/* Student */}
                          <TableCell className="pl-5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white flex-shrink-0 bg-red-400">
                                {(a.studentName||'?')[0].toUpperCase()}
                              </div>
                              <span className="font-semibold text-red-800 text-sm">{a.studentName||'—'}</span>
                            </div>
                          </TableCell>
                          {/* Student ID */}
                          <TableCell className="hidden sm:table-cell">
                            <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg bg-red-100 text-red-700">{a.studentId||'—'}</span>
                          </TableCell>
                          {/* Department */}
                          <TableCell>
                            <span className="font-bold text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap bg-red-100 text-red-700 font-mono">{a.deptID||'—'}</span>
                          </TableCell>
                          {/* Program */}
                          <TableCell className="hidden lg:table-cell">
                            {prog
                              ? <span className="text-xs font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap"
                                  style={{ background: 'hsl(262,83%,58%,0.08)', color: 'hsl(262,83%,45%)', fontFamily: "'DM Mono',monospace" }}>{prog}</span>
                              : <span className="text-red-300 text-xs">—</span>}
                          </TableCell>
                          {/* Timestamp */}
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium text-red-700">{a.timestamp ? format(parseISO(a.timestamp),'h:mm a') : '—'}</p>
                              <p className="text-xs text-red-400 font-medium">{a.timestamp ? format(parseISO(a.timestamp),'MMM d, yyyy') : ''}</p>
                            </div>
                          </TableCell>
                          {/* Status */}
                          <TableCell className="text-right pr-5">
                            <span className="text-xs font-extrabold px-2.5 py-1.5 rounded-full text-red-700 border border-red-200 tracking-wide"
                              style={{ background: 'rgba(254,226,226,0.8)' }}>BLOCKED</span>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    /* ── ALL view: 9-column extended schema, blocked row with dashes ── */
                    return (
                      <TableRow key={a.id || `b-${idx}`}
                        className="border-b border-red-50 transition-colors"
                        style={{ background: 'rgba(255,241,241,0.7)', height: '60px' }}>
                        <TableCell className="pl-5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white flex-shrink-0 bg-red-400">
                              {(a.studentName||'?')[0].toUpperCase()}
                            </div>
                            <span className="font-semibold text-slate-800 text-sm">{a.studentName||'—'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="font-bold text-xs px-2 py-1 rounded-lg font-mono text-red-700 bg-red-100">{a.studentId||'—'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-bold text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap bg-red-100 text-red-700 font-mono">{a.deptID||'—'}</span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {prog ? <span className="text-xs font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap"
                            style={{ background: 'hsl(262,83%,58%,0.08)', color: 'hsl(262,83%,45%)', fontFamily: "'DM Mono',monospace" }}>{prog}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell"><span className="text-xs text-slate-400 italic">—</span></TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium text-slate-700">{a.timestamp ? format(parseISO(a.timestamp),'h:mm a') : '—'}</p>
                            <p className="text-xs text-slate-400 font-medium">{a.timestamp ? format(parseISO(a.timestamp),'MMM d') : ''}</p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell"><span className="text-xs text-slate-300">—</span></TableCell>
                        <TableCell className="hidden md:table-cell text-center"><span className="text-xs text-slate-300">—</span></TableCell>
                        <TableCell className="text-right pr-5">
                          <span className="text-xs font-extrabold px-2.5 py-1.5 rounded-full text-red-700 border border-red-200 tracking-wide"
                            style={{ background: 'rgba(254,226,226,0.8)' }}>BLOCKED</span>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  // Successful session row
                  const l   = row.data;
                  const ci  = parseISO(l.checkInTimestamp);
                  const noTap = !l.checkOutTimestamp && !isToday(ci);
                  const dur   = formatDur(l.checkInTimestamp, l.checkOutTimestamp);
                  const prog  = (l as LogRecord).program || userProgramMap[l.studentId] || '';
                  return (
                    <TableRow key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors" style={{ height: '60px' }}>
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white flex-shrink-0"
                            style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,35%))` }}>
                            {(l.studentName||'S').split(',')[0]?.trim()[0]||'S'}
                          </div>
                          <span className="font-semibold text-slate-900 text-sm">{l.studentName||'Student'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="font-bold text-xs px-2 py-1 rounded-lg"
                          style={{ fontFamily: "'DM Mono',monospace", color: '#475569', background: '#f1f5f9' }}>
                          {l.studentId||'—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap"
                          style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                          {l.deptID||'—'}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {prog
                          ? <span className="text-xs font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap"
                              style={{ background: 'hsl(262,83%,58%,0.08)', color: 'hsl(262,83%,45%)', fontFamily: "'DM Mono',monospace" }}>{prog}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{l.purpose}</span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-slate-700">{format(ci,'h:mm a')}</p>
                          <p className="text-xs text-slate-400 font-medium">{format(ci,'MMM d')}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm font-medium"
                          style={{ color: l.checkOutTimestamp ? '#475569' : noTap ? '#ef4444' : '#3b82f6' }}>
                          {l.checkOutTimestamp ? format(parseISO(l.checkOutTimestamp),'h:mm a') : noTap ? 'NO TAP' : 'ACTIVE'}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-center">
                        <span className="text-sm font-bold font-mono"
                          style={{ color: l.checkOutTimestamp ? '#475569' : '#3b82f6' }}>{dur}</span>
                      </TableCell>
                      <TableCell className="text-right pr-5">
                        {l.checkOutTimestamp ? (
                          <span className="text-xs font-bold px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-500">Done</span>
                        ) : noTap ? (
                          <span className="text-xs font-bold px-2.5 py-1.5 rounded-full bg-red-50 text-red-500">No Tap</span>
                        ) : (
                          <span className="text-xs font-bold px-2.5 py-1.5 rounded-full flex items-center gap-1 justify-end"
                            style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />Active
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination controls */}
        {!isLoading && totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs font-medium text-slate-400">
              Page {currentPage} of {totalPages} · {unifiedRows.length} total records
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
                className="h-8 px-2.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all">
                ««
              </button>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="h-8 px-3 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all">
                ‹ Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) => p === '...'
                  ? <span key={`ellipsis-${i}`} className="px-1 text-slate-400 text-xs">…</span>
                  : <button key={p} onClick={() => setCurrentPage(p as number)}
                      className="h-8 w-8 rounded-lg text-xs font-bold border transition-all"
                      style={currentPage === p
                        ? { background: navy, color: 'white', border: 'none' }
                        : { borderColor: '#e2e8f0', color: '#64748b' }}>
                      {p}
                    </button>
                )}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="h-8 px-3 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all">
                Next ›
              </button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
                className="h-8 px-2.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all">
                »»
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
    </>
  );
}