"use client";

/**
 * OverviewDashboard — Unified Control Room
 *
 * Single shared state drives ALL four phases:
 *  Phase 1: Global Date + Department filters (top)
 *  Phase 2: Summary cards (filtered)
 *  Phase 3: Academic Attendance bar chart with average line + cross-filter on bar click
 *  Phase 4: Donut (by dept) + Horizontal bar (by purpose, sorted desc)
 *
 * Cross-filter: clicking a bar on the trend chart narrows Phases 2 & 4 to that day only.
 */

import { useMemo, useState, useCallback } from 'react';
import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell,
  Pie, PieChart, Legend, ReferenceLine, ResponsiveContainer, Tooltip,
} from 'recharts';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import {
  format, subDays, parseISO, startOfDay, endOfDay,
  isWithinInterval, eachDayOfInterval, differenceInCalendarDays,
  startOfWeek, startOfMonth, isToday,
} from 'date-fns';
import {
  Users, TrendingUp, Sparkles, BarChart3, TrendingDown, Minus,
  PieChart as PieIcon, Filter, X,
} from 'lucide-react';
import { LibraryLogRecord, UserRecord, DepartmentRecord } from '@/lib/firebase-schema';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ── Constants ──────────────────────────────────────────────────────────────────
const navy   = 'hsl(221,72%,22%)';
const COLORS  = [
  'hsl(221,72%,22%)', 'hsl(221,55%,42%)', 'hsl(262,83%,58%)',
  'hsl(189,79%,38%)', 'hsl(43,85%,50%)',  'hsl(221,83%,68%)',
  'hsl(10,80%,55%)',  'hsl(150,60%,40%)',
];
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1rem',
};

type DatePreset = 'today' | '7d' | '30d' | 'month' | 'custom';

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today'      },
  { id: '7d',    label: 'Last 7 Days'},
  { id: '30d',   label: 'Last 30 Days'},
  { id: 'month', label: 'This Month' },
  { id: 'custom',label: 'Custom'     },
];

function getPresetRange(preset: DatePreset): { start: string; end: string } {
  const today = new Date();
  const fmt   = (d: Date) => format(d, 'yyyy-MM-dd');
  switch (preset) {
    case 'today':  return { start: fmt(today), end: fmt(today) };
    case '7d':     return { start: fmt(subDays(today, 6)), end: fmt(today) };
    case '30d':    return { start: fmt(subDays(today, 29)), end: fmt(today) };
    case 'month':  return { start: fmt(startOfMonth(today)), end: fmt(today) };
    default:       return { start: fmt(subDays(today, 6)), end: fmt(today) };
  }
}

// ── Custom tooltip (shared across all charts) ──────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'white', border: '1px solid #e2e8f0',
      borderRadius: 12, padding: '8px 12px',
      boxShadow: '0 4px 16px rgba(10,26,77,0.12)',
      fontFamily: "'DM Sans',sans-serif",
    }}>
      {label && <p style={{ fontSize: 11, fontWeight: 700, color: navy, marginBottom: 2 }}>{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
          {p.name !== 'visits' && p.name !== 'value' ? `${p.name}: ` : ''}
          <span style={{ fontWeight: 700, color: navy }}>{p.value}</span> visit{p.value !== 1 ? 's' : ''}
        </p>
      ))}
    </div>
  );
}

// ── Solid white stat card wrapper ──────────────────────────────────────────
const statCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1.25rem',
  padding: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

// ── Custom Donut label ─────────────────────────────────────────────────────────
function DonutLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      fontSize={11} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function OverviewDashboard() {
  const db = useFirestore();

  // ── Phase 1: Global filters ───────────────────────────────────────────────
  const [preset,     setPreset]     = useState<DatePreset>('7d');
  const [startDate,  setStartDate]  = useState(getPresetRange('7d').start);
  const [endDate,    setEndDate]    = useState(getPresetRange('7d').end);
  const [deptFilter, setDeptFilter] = useState('all');
  const [showCustom, setShowCustom] = useState(false);

  // Cross-filter: when user clicks a bar, drill into that single day
  const [focusDay, setFocusDay] = useState<string | null>(null);

  // ── Firestore ─────────────────────────────────────────────────────────────
  const logsRef  = useMemoFirebase(() => collection(db, 'library_logs'), [db]);
  const deptsRef = useMemoFirebase(() => collection(db, 'departments'),  [db]);

  const { data: allLogs, isLoading } = useCollection<LibraryLogRecord>(logsRef);
  const { data: depts }              = useCollection<DepartmentRecord>(deptsRef);

  // ── Date range helpers ────────────────────────────────────────────────────
  const startDt = useMemo(() => startOfDay(parseISO(startDate)), [startDate]);
  const endDt   = useMemo(() => endOfDay(parseISO(endDate)),     [endDate]);

  const prevStart = useMemo(() => {
    const days = differenceInCalendarDays(endDt, startDt) + 1;
    return startOfDay(subDays(startDt, days));
  }, [startDt, endDt]);
  const prevEnd = useMemo(() => endOfDay(subDays(startDt, 1)), [startDt]);

  const applyPreset = useCallback((id: DatePreset) => {
    setPreset(id);
    setFocusDay(null);
    if (id !== 'custom') {
      const r = getPresetRange(id);
      setStartDate(r.start);
      setEndDate(r.end);
      setShowCustom(false);
    } else {
      setShowCustom(true);
    }
  }, []);

  // ── Filtered log sets ─────────────────────────────────────────────────────
  // Current period + dept filter
  const periodLogs = useMemo(() => {
    if (!allLogs) return [];
    return allLogs.filter(l => {
      const d = parseISO(l.checkInTimestamp);
      const inRange = isWithinInterval(d, { start: startDt, end: endDt });
      const inDept  = deptFilter === 'all' || l.deptID === deptFilter;
      return inRange && inDept;
    });
  }, [allLogs, startDt, endDt, deptFilter]);

  // Previous equivalent period (for trend card)
  const prevPeriodLogs = useMemo(() => {
    if (!allLogs) return [];
    return allLogs.filter(l => {
      const d = parseISO(l.checkInTimestamp);
      return isWithinInterval(d, { start: prevStart, end: prevEnd }) &&
             (deptFilter === 'all' || l.deptID === deptFilter);
    });
  }, [allLogs, prevStart, prevEnd, deptFilter]);

  // Cross-filtered logs: if a day bar is clicked, narrow to that day
  const focusLogs = useMemo(() => {
    if (!focusDay) return periodLogs;
    return periodLogs.filter(l =>
      format(parseISO(l.checkInTimestamp), 'MMM dd') === focusDay
    );
  }, [periodLogs, focusDay]);

  // ── Phase 2: Summary cards ────────────────────────────────────────────────
  const totalDays   = Math.max(1, differenceInCalendarDays(endDt, startDt) + 1);
  const totalVisits = periodLogs.length;
  const avgDaily    = totalVisits / totalDays;

  const topPurpose = useMemo(() => {
    const counts: Record<string, number> = {};
    focusLogs.forEach(l => { counts[l.purpose] = (counts[l.purpose] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  }, [focusLogs]);

  const trendPct = useMemo(() => {
    const prev = prevPeriodLogs.length;
    if (prev === 0) return null;
    return Math.round(((totalVisits - prev) / prev) * 100);
  }, [totalVisits, prevPeriodLogs]);

  const periodLabel = useMemo(() => {
    switch (preset) {
      case 'today': return 'Today';
      case '7d':    return 'Last 7 Days';
      case '30d':   return 'Last 30 Days';
      case 'month': return 'This Month';
      default: {
        const s = format(parseISO(startDate), 'MMM d');
        const e = format(parseISO(endDate),   'MMM d');
        return s === e ? s : `${s} – ${e}`;
      }
    }
  }, [preset, startDate, endDate]);

  // ── Phase 3: Chart data ───────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!allLogs) return [];
    const days  = eachDayOfInterval({ start: startDt, end: endDt })
                    .filter(d => format(d, 'EEE') !== 'Sun');
    const stats: Record<string, number> = {};
    days.forEach(d => { stats[format(d, 'MMM dd')] = 0; });
    periodLogs.forEach(l => {
      const key = format(parseISO(l.checkInTimestamp), 'MMM dd');
      if (key in stats) stats[key]++;
    });
    return Object.entries(stats).map(([name, visits]) => ({ name, visits }));
  }, [allLogs, periodLogs, startDt, endDt]);

  const avgLine  = chartData.length ? Math.round(chartData.reduce((s, d) => s + d.visits, 0) / chartData.length) : 0;
  const peakDay  = chartData.reduce((a, b) => b.visits > a.visits ? b : a, { name: '—', visits: 0 });

  // ── Phase 4: Breakdown data (cross-filtered) ──────────────────────────────
  const deptBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    focusLogs.forEach(l => { const c = l.deptID || 'N/A'; counts[c] = (counts[c] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [focusLogs]);

  const purposeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    focusLogs.forEach(l => { counts[l.purpose] = (counts[l.purpose] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])   // sorted descending by volume
      .map(([name, visits], i) => ({ name, visits, fill: COLORS[i % COLORS.length] }));
  }, [focusLogs]);

  const focusLabel = focusDay ? `Day: ${focusDay}` : periodLabel;

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-16 rounded-2xl bg-white/40" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 rounded-2xl bg-white/40" />)}
        </div>
        <div className="h-64 rounded-2xl bg-white/40" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-72 rounded-2xl bg-white/40" />
          <div className="h-72 rounded-2xl bg-white/40" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* ═══════════════════════════════════════════════════════════════════════
          PHASE 1 — Control Room (Global Filters)
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="p-3 sm:p-4 rounded-2xl flex flex-wrap items-center gap-2 sm:gap-3"
        style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.7)', boxShadow: '0 2px 12px rgba(10,26,77,0.07)' }}>

        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest flex-shrink-0"
          style={{ color: navy }}>
          <Filter size={12} /> Control Room
        </div>

        {/* Date preset chips */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
          {DATE_PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all active:scale-95"
              style={preset === p.id
                ? { background: navy, color: 'white' }
                : { color: '#64748b' }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom date pickers */}
        {(preset === 'custom' || showCustom) && (
          <div className="flex items-center gap-2">
            <input type="date" value={startDate}
              onChange={e => { setStartDate(e.target.value); setFocusDay(null); }}
              style={{ height: 34, padding: '0 10px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: '0.82rem', fontWeight: 600, color: '#1e293b', outline: 'none', width: 140 }} />
            <span className="text-slate-300 text-xs font-bold">→</span>
            <input type="date" value={endDate}
              onChange={e => { setEndDate(e.target.value); setFocusDay(null); }}
              style={{ height: 34, padding: '0 10px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: '0.82rem', fontWeight: 600, color: '#1e293b', outline: 'none', width: 140 }} />
          </div>
        )}

        {/* Department filter */}
        <Select value={deptFilter} onValueChange={v => { setDeptFilter(v); setFocusDay(null); }}>
          <SelectTrigger className="h-9 w-44 bg-white rounded-xl border-slate-200 font-semibold text-xs">
            <span className="truncate font-bold" style={{ fontFamily: "'DM Mono',monospace", fontSize: '0.8rem' }}>
              {deptFilter === 'all' ? 'All Colleges' : deptFilter}
            </span>
          </SelectTrigger>
          <SelectContent className="rounded-xl max-h-64">
            <SelectItem value="all" className="text-xs font-semibold">All Colleges</SelectItem>
            {(depts || [])
              .sort((a, b) => {
                const aS = a.deptID === 'LIBRARY' || a.deptID === 'STAFF';
                const bS = b.deptID === 'LIBRARY' || b.deptID === 'STAFF';
                if (aS && !bS) return -1; if (!aS && bS) return 1;
                return a.deptID.localeCompare(b.deptID);
              })
              .map(d => (
                <SelectItem key={d.deptID} value={d.deptID} className="text-xs font-semibold">
                  <span className="font-bold mr-1 whitespace-nowrap" style={{ color: navy, fontFamily: "'DM Mono',monospace" }}>{d.deptID}</span>
                  {' - '}{d.departmentName}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        {/* Active filters summary + clear */}
        <div className="ml-auto flex items-center gap-2">
          {focusDay && (
            <button onClick={() => setFocusDay(null)}
              className="flex items-center gap-1 h-8 px-3 rounded-xl text-xs font-bold border transition-all"
              style={{ background: 'rgba(10,26,77,0.07)', color: navy, borderColor: `${navy}20` }}>
              <X size={11} /> Clear Day Filter
            </button>
          )}
          <span className="text-xs font-semibold text-slate-400">
            {focusLogs.length} record{focusLogs.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PHASE 2 — Summary Cards (Pulse)
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">

        {/* Card 1: Visitors */}
        <div style={statCard}>
          <div className="flex items-start justify-between">
            <div className="p-3 rounded-2xl text-white"
              style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,35%))`, boxShadow: `0 6px 18px ${navy}30` }}>
              <Users size={22} />
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full uppercase tracking-wide whitespace-nowrap">
              {focusDay ? focusDay : periodLabel}
            </span>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">
              {focusDay ? 'Day Visitors' : 'Period Visitors'}
            </p>
            <p className="text-3xl sm:text-4xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
              {focusDay ? focusLogs.length : totalVisits}
            </p>
          </div>
        </div>

        {/* Card 2: Avg Daily Traffic */}
        <div style={statCard}>
          <div className="flex items-start justify-between">
            <div className="p-3 rounded-2xl text-white"
              style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)', boxShadow: '0 6px 18px #2563eb30' }}>
              <BarChart3 size={22} />
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full uppercase tracking-wide">
              Daily Avg
            </span>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Avg Daily Traffic</p>
            <p className="text-3xl sm:text-4xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
              {avgDaily.toFixed(1)}
            </p>
            <p className="text-xs text-slate-400 font-medium mt-1">
              {totalVisits} visits ÷ {totalDays} day{totalDays !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Card 3: Primary Purpose */}
        <div style={statCard}>
          <div className="flex items-start justify-between">
            <div className="p-3 rounded-2xl text-white"
              style={{ background: 'linear-gradient(135deg,hsl(262,83%,52%),hsl(262,83%,65%))', boxShadow: '0 6px 18px hsl(262,83%,52%,0.25)' }}>
              <Sparkles size={22} />
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full uppercase tracking-wide">
              Top Activity
            </span>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Primary Purpose</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight" style={{ fontFamily: "'Playfair Display',serif" }}>
              {topPurpose}
            </p>
            {focusDay && <p className="text-xs text-slate-400 font-medium mt-1">for {focusDay}</p>}
          </div>
        </div>

        {/* Card 4: Trend % */}
        <div style={statCard}>
          <div className="flex items-start justify-between">
            <div className="p-3 rounded-2xl text-white"
              style={{
                background: trendPct === null ? 'linear-gradient(135deg,#64748b,#94a3b8)'
                  : trendPct >= 0 ? 'linear-gradient(135deg,#059669,#10b981)'
                  : 'linear-gradient(135deg,#dc2626,#ef4444)',
                boxShadow: trendPct === null ? '0 6px 18px #64748b25'
                  : trendPct >= 0 ? '0 6px 18px #05966925'
                  : '0 6px 18px #dc262625',
              }}>
              {trendPct === null ? <Minus size={22} /> : trendPct >= 0
                ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full uppercase tracking-wide">
              vs Prior
            </span>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Trend</p>
            <p className="text-3xl sm:text-4xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
              {trendPct === null ? '—' : `${trendPct >= 0 ? '+' : ''}${trendPct}%`}
            </p>
            <p className="text-xs text-slate-400 font-medium mt-1">
              {prevPeriodLogs.length} visits prior period
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PHASE 3 — Academic Attendance Chart (Context)
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={card}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <BarChart3 size={18} style={{ color: navy }} />
            <div>
              <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>
                Academic Attendance
              </h3>
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mt-0.5">
                {periodLabel} · Click a bar to cross-filter below
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1 rounded-full" style={{ background: navy }} />
              Visits
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-px border-t-2 border-dashed" style={{ borderColor: '#f59e0b' }} />
              Avg ({avgLine})
            </div>
            {focusDay && (
              <span className="px-2 py-1 rounded-full text-white text-[10px] font-bold" style={{ background: navy }}>
                📍 {focusDay}
              </span>
            )}
          </div>
        </div>

        <div style={{ padding: '16px 16px 8px 4px', height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 8 }}
              onClick={data => {
                if (data?.activeLabel) {
                  setFocusDay(prev => prev === data.activeLabel ? null : data.activeLabel!);
                }
              }}
              style={{ cursor: 'pointer' }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.07} />
              <XAxis dataKey="name" axisLine={false} tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} dy={6} />
              <YAxis tickLine={false} axisLine={false}
                tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(10,26,77,0.04)', strokeWidth: 0 }} />
              {avgLine > 0 && (
                <ReferenceLine y={avgLine} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5}
                  label={{ value: `Avg ${avgLine}`, position: 'right', fontSize: 10, fontWeight: 700, fill: '#f59e0b' }} />
              )}
              <Bar dataKey="visits" radius={[5, 5, 0, 0]} barSize={22} cursor="pointer">
                {chartData.map((e, i) => {
                  // Cycle through a warm palette; grey out zero-visit days
                  const palette = [
                    'hsl(221,72%,32%)', 'hsl(262,70%,55%)', 'hsl(189,75%,38%)',
                    'hsl(43,90%,48%)',  'hsl(10,75%,52%)',  'hsl(150,60%,38%)',
                    'hsl(330,65%,52%)', 'hsl(25,85%,50%)',
                  ];
                  const isFocus  = focusDay && e.name === focusDay;
                  const isFaded  = focusDay && e.name !== focusDay;
                  const isPeak   = !focusDay && e.visits === peakDay.visits && e.visits > 0;
                  const baseColor = e.visits > 0 ? palette[i % palette.length] : '#e2e8f0';
                  return (
                    <Cell key={i}
                      fill={isFaded ? `${palette[i % palette.length]}40` : baseColor}
                      stroke={isFocus || isPeak ? 'rgba(255,255,255,0.6)' : 'none'}
                      strokeWidth={2}
                      opacity={1}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="px-5 pb-4 pt-1 flex items-center gap-6 border-t border-slate-50">
          <div>
            <p className="font-bold text-slate-900 text-2xl" style={{ fontFamily: "'Playfair Display',serif" }}>{totalVisits}</p>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Total Visits</p>
          </div>
          <div>
            <p className="font-bold text-slate-900 text-2xl" style={{ fontFamily: "'Playfair Display',serif" }}>{peakDay.visits}</p>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Peak Day</p>
          </div>
          <div className="ml-auto text-right">
            <p className="font-bold text-sm" style={{ color: navy }}>{peakDay.name}</p>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Busiest</p>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PHASE 4 — Segmentation (Details)
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Donut — By Department with % labels */}
        <div style={card}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <PieIcon size={16} style={{ color: navy }} />
              <div>
                <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>By Department</h3>
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mt-0.5">{focusLabel}</p>
              </div>
            </div>
            {focusDay && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-full text-white" style={{ background: navy }}>
                Filtered
              </span>
            )}
          </div>
          <div style={{ height: 280, padding: '8px' }}>
            {deptBreakdown.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deptBreakdown}
                    cx="50%" cy="44%"
                    innerRadius={52} outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    labelLine={false}
                    label={DonutLabel}>
                    {deptBreakdown.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    verticalAlign="bottom" height={60} iconType="circle"
                    wrapperStyle={{ fontSize: 11, fontWeight: 700, paddingTop: 4 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Horizontal Bar — By Purpose, sorted descending */}
        <div style={card}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <BarChart3 size={16} style={{ color: navy }} />
              <div>
                <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>By Visit Purpose</h3>
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mt-0.5">{focusLabel} · sorted by volume</p>
              </div>
            </div>
            {focusDay && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-full text-white" style={{ background: navy }}>
                Filtered
              </span>
            )}
          </div>
          <div style={{ height: 280, padding: '8px 8px 8px 0' }}>
            {purposeBreakdown.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={purposeBreakdown}
                layout="vertical"
                margin={{ left: 16, right: 40, top: 8, bottom: 8 }}
              >
                <CartesianGrid horizontal={false} strokeOpacity={0.05} />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={100}
                  tick={{ fontSize: 11, fontWeight: 600, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                
                {/* Set cursor to false to stop the background from changing color on click/hover */}
                <Tooltip content={<ChartTooltip />} cursor={false} />

                <Bar
                  dataKey="visits"
                  radius={[0, 6, 6, 0]}
                  barSize={20}
                  cursor="pointer"
                  /* activeBar={false} ensures Recharts doesn't apply its default active styles/dimming */
                  activeBar={false}
                  label={{
                    position: 'right',
                    fontSize: 11,
                    fontWeight: 700,
                    fill: '#64748b',
                    formatter: (v: any) => (v > 0 ? v : ''),
                  }}
                >
                  {purposeBreakdown.map((e, i) => (
                    <Cell key={`cell-${i}`} fill={e.fill || '#64748b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}