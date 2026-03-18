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
import { FileDown, Sparkles, Loader2, Trash2, Calendar, ChevronDown, ChevronUp, Trophy, Sheet, Search } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { LibraryLogRecord, DepartmentRecord, ProgramRecord } from '@/lib/firebase-schema';

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
  const [logToDelete,   setLogToDelete]   = useState<{ id: string; name: string } | null>(null);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [filtersOpen,   setFiltersOpen]   = useState(true);
  const [topVisitorsOpen,  setTopVisitorsOpen]  = useState(true);
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

  const deptNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    dbDepartments?.forEach(d => { m[d.deptID] = d.departmentName; });
    return m;
  }, [dbDepartments]);

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
  };

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
      const inTapOut = tapOutFilter === 'all'
        || (tapOutFilter === 'with_timeout' && !!l.checkOutTimestamp)
        || (tapOutFilter === 'no_tap'       && !l.checkOutTimestamp && !isToday(parseISO(l.checkInTimestamp)));
      // Program filter is based on code — since logs don't store program,
      // we skip program filtering at log level (filter is for export context display)
      const inProgram = true; // program shown in filter label only
      return inRange && inDept && inPurpose;
    }).sort((a, b) => b.checkInTimestamp.localeCompare(a.checkInTimestamp)),
    [allLogs, startDate, endDate, deptFilter, purposeFilter, programFilter, tapOutFilter]
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
      else if (archiveSortField === 'duration') {
        const durA = a.checkOutTimestamp ? differenceInMinutes(parseISO(a.checkOutTimestamp), parseISO(a.checkInTimestamp)) : 0;
        const durB = b.checkOutTimestamp ? differenceInMinutes(parseISO(b.checkOutTimestamp), parseISO(b.checkInTimestamp)) : 0;
        return archiveSortOrder === 'asc' ? durA - durB : durB - durA;
      }
      return archiveSortOrder === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
    });
    return list;
  }, [filteredLogs, archiveSearch, archiveSortField, archiveSortOrder]);

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
      ``,
      `⚠️ Note: This is a statistical summary because the AI service is currently unavailable. To enable AI-powered insights, set the GEMINI_API_KEY environment variable and redeploy.`,
    ].join('\n');
  };

  const generateAiSummary = async () => {
    if (!filteredLogs.length) return;
    setIsGeneratingAi(true); setAiSummary(null);
    try {
      const res = await fetch('/NEULib/api/ai-summary', {
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
    toast({ title: "Log Removed" });
    setIsDeleteAlertOpen(false); setLogToDelete(null);
  };

  const downloadPDF = () => {
    try {
      const pdf = new jsPDF();
      pdf.setFillColor(10, 26, 77); pdf.rect(0, 0, 210, 42, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16); pdf.setFont('helvetica', 'bold');
      pdf.text('NEU LIBRARY — VISITOR LOG', 105, 15, { align: 'center' });
      pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
      pdf.text(`Period: ${startDate}  to  ${endDate}`, 105, 25, { align: 'center' });
      pdf.text(`Records: ${filteredLogs.length}  |  Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}`, 105, 33, { align: 'center' });
      pdf.setTextColor(80, 80, 80);
      autoTable(pdf, {
        startY: 50,
        head: [['Student', 'Dept', 'Purpose', 'Check In', 'Check Out', 'Duration']],
        body: filteredLogs.map(l => {
          const ci = parseISO(l.checkInTimestamp);
          return [l.studentName || 'Student', l.deptID, l.purpose, format(ci, 'MMM d, h:mm a'),
            l.checkOutTimestamp ? format(parseISO(l.checkOutTimestamp), 'h:mm a') : (!l.checkOutTimestamp && !isToday(ci) ? 'NO TAP' : 'ACTIVE'),
            formatDur(l.checkInTimestamp, l.checkOutTimestamp)];
        }),
        headStyles: { fillColor: [10, 26, 77], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 8 }, alternateRowStyles: { fillColor: [245, 247, 252] },
        styles: { cellPadding: 3 },
      });
      pdf.save(`NEU_Library_${startDate}_${endDate}.pdf`);
    } catch { toast({ title: "Export Failed", variant: "destructive" }); }
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
    toast({ title: 'CSV Exported', description: `${filteredLogs.length} session records downloaded.` });
  };

  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans',sans-serif" }}>

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
              {/* College */}
              <div>
                <p className="text-slate-400 font-semibold text-xs mb-1.5 uppercase tracking-wide">College</p>
                <Select value={deptFilter} onValueChange={handleDeptChange}>
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200 font-semibold text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="All Departments" className="font-semibold text-sm">All Colleges</SelectItem>
                    {dbDepartments?.map(d => (
                      <SelectItem key={d.deptID} value={d.deptID} className="font-semibold text-sm">{d.departmentName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Program — only active when dept selected */}
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
                    {availablePrograms.map(prog => (
                      <SelectItem key={prog.code} value={prog.code} className="font-semibold text-sm py-2">
                        <span className="font-bold mr-2 text-xs px-1.5 py-0.5 rounded"
                          style={{ background: `${navy}08`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                          {prog.code}
                        </span>
                        {prog.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Purpose */}
              <div>
                <p className="text-slate-400 font-semibold text-xs mb-1.5 uppercase tracking-wide">Purpose</p>
                <Select value={purposeFilter} onValueChange={setPurposeFilter}>
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200 font-semibold text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {dynamicPurposes.map(p => <SelectItem key={p} value={p} className="font-semibold text-sm">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tap-out status filter */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 w-fit">
              {([
                { value: 'all',          label: 'All Sessions' },
                { value: 'with_timeout', label: 'With Timeout' },
                { value: 'no_tap',       label: 'No Tap-out' },
              ] as const).map(opt => (
                <button key={opt.value} onClick={() => setTapOutFilter(opt.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={tapOutFilter === opt.value ? { background: navy, color: 'white' } : { color: '#64748b' }}>
                  {opt.label}
                </button>
              ))}
            </div>

            <p className="text-slate-400 text-sm font-medium">
              {filteredLogs.length} record{filteredLogs.length !== 1 ? 's' : ''} found
              {deptFilter !== 'All Departments' && <span className="ml-2 font-semibold" style={{ color: navy }}>· {deptFilter}</span>}
              {programFilter !== 'All Programs' && <span className="ml-1 text-purple-600 font-semibold">· {availablePrograms.find(p => p.name === programFilter)?.code || programFilter}</span>}
            </p>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={downloadPDF} disabled={filteredLogs.length === 0}
                className="flex-1 h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-40">
                <FileDown size={17} /> Export PDF
              </button>
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

      {/* ── AI Summary ── */}
      {(aiSummary !== null || isGeneratingAi) && (
        <div style={{ ...card, background: 'rgba(255,255,255,0.98)' }} className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: navyBtn.background }}>
              <Sparkles size={15} />
            </div>
            <h4 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
              AI Generated Insights
            </h4>
          </div>
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

      {/* ── Top Visitors ── */}
      {topVisitors.length > 0 && (
        <div style={{ ...card, background: 'rgba(255,255,255,0.98)' }} className="overflow-hidden">
          <button className="w-full px-5 py-4 border-b border-slate-100 flex items-center gap-2.5 text-left" onClick={() => setTopVisitorsOpen(o => !o)}>
            <Trophy size={16} style={{ color: 'hsl(43,85%,50%)' }} />
            <h3 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
              Top Visitors
            </h3>
            <span className="ml-auto text-slate-400 text-sm mr-2">selected period</span>
            {topVisitorsOpen ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
          </button>
          {topVisitorsOpen && (
            <div className="divide-y divide-slate-50">
              {topVisitors.map((v, i) => (
                <div key={i} className="px-5 py-3.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 text-white"
                    style={{ background: i === 0 ? 'hsl(43,85%,52%)' : i === 1 ? '#94a3b8' : i === 2 ? '#c8915a' : `${navy}15`, color: i < 3 ? 'white' : navy }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{v.name}</p>
                    <p className="text-slate-400 text-xs font-medium">{v.dept}</p>
                  </div>
                  <div className="flex items-center gap-5 flex-shrink-0">
                    <div className="text-right">
                      <p className="font-bold text-sm" style={{ color: navy }}>{v.visits}</p>
                      <p className="text-slate-400 font-semibold text-xs uppercase tracking-wide">visits</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-slate-700">
                        {v.totalMins >= 60 ? `${Math.floor(v.totalMins / 60)}h` : `${v.totalMins}m`}
                      </p>
                      <p className="text-slate-400 font-semibold text-xs uppercase tracking-wide">time</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Session Archive ── */}
      <div style={{ ...card, background: 'rgba(255,255,255,0.98)' }} className="overflow-hidden">
        {/* Table header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
              <FileDown size={17} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
                Session Archive
              </h3>
              <p className="text-slate-400 text-sm font-medium mt-0.5">
                {displayedLogs.length} of {filteredLogs.length} record{filteredLogs.length !== 1 ? 's' : ''} · {startDate} to {endDate}
              </p>
            </div>
          </div>
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, ID, dept..."
              value={archiveSearch}
              onChange={e => setArchiveSearch(e.target.value)}
              style={{ height:'40px', paddingLeft:'36px', paddingRight:'12px', borderRadius:'12px',
                border:'1px solid #e2e8f0', background:'#f8fafc', fontSize:'0.875rem', fontWeight:500,
                color:'#1e293b', outline:'none', width:'360px' }}
            />
          </div>
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
          </div>
        </div>

        {isLoading ? (
          <div className="py-14 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={20} /><span className="text-sm font-medium">Loading...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-14 text-center text-slate-400 text-sm italic font-medium">No records for selected period.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-11 border-slate-100">
                  <TableHead className="pl-5 text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 cursor-pointer hover:bg-slate-100 select-none" onClick={() => toggleArchiveSort('studentName')}>Student <ArchiveSortIcon field="studentName" /></TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 hidden sm:table-cell cursor-pointer hover:bg-slate-100 select-none" onClick={() => toggleArchiveSort('studentId')}>Student ID <ArchiveSortIcon field="studentId" /></TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 hidden lg:table-cell cursor-pointer hover:bg-slate-100 select-none" onClick={() => toggleArchiveSort('program')}>Program <ArchiveSortIcon field="program" /></TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 cursor-pointer hover:bg-slate-100 select-none" onClick={() => toggleArchiveSort('deptID')}>Dept <ArchiveSortIcon field="deptID" /></TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 hidden sm:table-cell cursor-pointer hover:bg-slate-100 select-none" onClick={() => toggleArchiveSort('purpose')}>Purpose <ArchiveSortIcon field="purpose" /></TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 cursor-pointer hover:bg-slate-100 select-none" onClick={() => toggleArchiveSort('checkInTimestamp')}>Time In <ArchiveSortIcon field="checkInTimestamp" /></TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 hidden md:table-cell">Time Out</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 text-center hidden md:table-cell cursor-pointer hover:bg-slate-100 select-none" onClick={() => toggleArchiveSort('duration')}>Duration <ArchiveSortIcon field="duration" /></TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 text-right pr-5">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedLogs.map(l => {
                  const ci    = parseISO(l.checkInTimestamp);
                  const noTap = !l.checkOutTimestamp && !isToday(ci);
                  const dur   = formatDur(l.checkInTimestamp, l.checkOutTimestamp);
                  return (
                    <TableRow key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors" style={{ height: '60px' }}>

                      {/* Student */}
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white flex-shrink-0"
                            style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,35%))` }}>
                            {(l.studentName || 'S').split(',')[0]?.trim()[0] || 'S'}
                          </div>
                          <span className="font-semibold text-slate-900 text-sm truncate max-w-[130px] sm:max-w-none">
                            {l.studentName || 'Student'}
                          </span>
                        </div>
                      </TableCell>

                      {/* Student ID */}
                      <TableCell className="hidden sm:table-cell">
                        <span className="font-bold text-xs px-2 py-1 rounded-lg"
                          style={{ fontFamily: "'DM Mono',monospace", color: '#475569', background: '#f1f5f9' }}>
                          {l.studentId || '—'}
                        </span>
                      </TableCell>

                      {/* Dept */}
                      <TableCell>
                        <span className="font-bold text-xs px-2.5 py-1.5 rounded-lg"
                          style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                          {l.deptID}
                        </span>
                      </TableCell>

                      {/* Program */}
                      <TableCell className="hidden lg:table-cell">
                        {(l as any).program ? (
                          <span className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
                            style={{ background: 'hsl(262,83%,58%,0.08)', color: 'hsl(262,83%,45%)', fontFamily: "'DM Mono',monospace" }}>
                            {(l as any).program}
                          </span>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </TableCell>

                      {/* Purpose */}
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                          {l.purpose}
                        </span>
                      </TableCell>

                      {/* Time In */}
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-slate-700">{format(ci, 'h:mm a')}</p>
                          <p className="text-xs text-slate-400 font-medium">{format(ci, 'MMM d')}</p>
                        </div>
                      </TableCell>

                      {/* Time Out */}
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm font-medium"
                          style={{ color: l.checkOutTimestamp ? '#475569' : noTap ? '#ef4444' : '#3b82f6' }}>
                          {l.checkOutTimestamp
                            ? format(parseISO(l.checkOutTimestamp), 'h:mm a')
                            : noTap ? 'NO TAP' : 'ACTIVE'}
                        </span>
                      </TableCell>

                      {/* Duration */}
                      <TableCell className="hidden md:table-cell text-center">
                        <span className="font-bold text-sm" style={{ color: navy, fontFamily: "'DM Mono',monospace" }}>
                          {dur}
                        </span>
                      </TableCell>

                      {/* Status + delete */}
                      <TableCell className="text-right pr-5">
                        <div className="flex items-center justify-end gap-2">
                          {l.checkOutTimestamp ? (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">Done</span>
                          ) : noTap ? (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>No Tap</span>
                          ) : (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1"
                              style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
                              Active
                            </span>
                          )}
                          {isSuperAdmin && (
                            <button onClick={() => { setLogToDelete({ id: l.id, name: l.studentName || 'Student' }); setIsDeleteAlertOpen(true); }}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all active:scale-95">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Delete Dialog */}
      {isSuperAdmin && (
        <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
          <AlertDialogContent className="rounded-2xl p-6 w-[calc(100vw-2rem)] max-w-sm mx-auto border-red-100">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-600 font-bold text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>Delete Log</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-600 text-sm leading-relaxed">
                Remove record for <strong>{logToDelete?.name}</strong>? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="pt-4 flex-row gap-2">
              <AlertDialogCancel className="flex-1 rounded-xl h-11 font-semibold text-sm">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteLog} className="flex-1 bg-red-600 text-white rounded-xl h-11 font-semibold text-sm">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}