"use client";

import { useMemo, useState } from 'react';
import { isToday, isThisWeek, parseISO } from 'date-fns';
import { Users, Calendar, TrendingUp, Sparkles, Loader2, Filter, X } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { LibraryLogRecord, UserRecord, DEPARTMENTS } from '@/lib/firebase-schema';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PURPOSES = ['Reading Books', 'Research', 'Computer Use', 'Assignments'];
const VISITOR_TYPES = [
  { value: 'all',     label: 'All Visitors' },
  { value: 'student', label: 'Students' },
  { value: 'staff',   label: 'Staff / Faculty' },
];

export function StatsCards() {
  const db = useFirestore();

  // Filters
  const [purposeFilter, setPurposeFilter] = useState('all');
  const [deptFilter,    setDeptFilter]    = useState('all');
  const [typeFilter,    setTypeFilter]    = useState('all');

  const logsRef  = useMemoFirebase(() => collection(db, 'library_logs'), [db]);
  const usersRef = useMemoFirebase(() => query(collection(db, 'users')), [db]);
  const deptRef  = useMemoFirebase(() => collection(db, 'departments'), [db]);

  const { data: logs,   isLoading: logsLoading  } = useCollection<LibraryLogRecord>(logsRef);
  const { data: users                            } = useCollection<UserRecord>(usersRef);
  const { data: depts                            } = useCollection<{ deptID: string; departmentName: string }>(deptRef);

  // Build a map of userId → user for visitor-type filtering
  const userMap = useMemo(() => {
    const m: Record<string, UserRecord> = {};
    (users || []).forEach(u => { m[u.id] = u; });
    return m;
  }, [users]);

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter(l => {
      const matchPurpose = purposeFilter === 'all' || l.purpose === purposeFilter;
      const matchDept    = deptFilter    === 'all' || l.deptID   === deptFilter;
      let   matchType    = true;
      if (typeFilter !== 'all') {
        const u = userMap[l.studentId];
        if (typeFilter === 'student') matchType = !u || u.role === 'student' || u.role === 'visitor';
        if (typeFilter === 'staff')   matchType = !!u && (u.role === 'admin' || u.role === 'super_admin');
      }
      return matchPurpose && matchDept && matchType;
    });
  }, [logs, purposeFilter, deptFilter, typeFilter, userMap]);

  const isFiltered = purposeFilter !== 'all' || deptFilter !== 'all' || typeFilter !== 'all';

  const stats = useMemo(() => {
    const todayCount = filteredLogs.filter(l => isToday(parseISO(l.checkInTimestamp))).length;
    const weekCount  = filteredLogs.filter(l => isThisWeek(parseISO(l.checkInTimestamp))).length;
    const purposeCounts: Record<string, number> = {};
    filteredLogs.forEach(l => { purposeCounts[l.purpose] = (purposeCounts[l.purpose] || 0) + 1; });
    const topPurpose = Object.entries(purposeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    return [
      { title: 'Visitors Today',  value: todayCount,           icon: Users,      trend: 'Daily Active',  color: 'bg-primary' },
      { title: 'Weekly Traffic',  value: weekCount,            icon: Calendar,   trend: 'Current Week',  color: 'bg-blue-600' },
      { title: 'Top Purpose',     value: topPurpose,           icon: Sparkles,   trend: 'Session Focus', color: 'bg-slate-800' },
      { title: isFiltered ? 'Filtered Visits' : 'Total Visits', value: filteredLogs.length, icon: TrendingUp, trend: isFiltered ? 'Filtered' : 'Historical', color: 'bg-indigo-600' },
    ];
  }, [filteredLogs, isFiltered]);

  if (logsLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-40 bg-white/30 backdrop-blur-3xl rounded-[2.5rem] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-white/60 backdrop-blur-sm border border-white/40">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest flex-shrink-0">
          <Filter size={12} /> Filter Stats
        </div>

        {/* Purpose */}
        <Select value={purposeFilter} onValueChange={setPurposeFilter}>
          <SelectTrigger className="h-8 w-36 bg-white rounded-xl border-slate-200 font-semibold text-xs">
            <SelectValue placeholder="Purpose" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all" className="text-xs font-semibold">All Purposes</SelectItem>
            {PURPOSES.map(p => <SelectItem key={p} value={p} className="text-xs font-semibold">{p}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Department */}
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="h-8 w-36 bg-white rounded-xl border-slate-200 font-semibold text-xs">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all" className="text-xs font-semibold">All Colleges</SelectItem>
            {(depts || []).sort((a, b) => a.deptID.localeCompare(b.deptID)).map(d => (
              <SelectItem key={d.deptID} value={d.deptID} className="text-xs font-semibold">
                [{d.deptID}] {d.departmentName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Visitor type */}
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-36 bg-white rounded-xl border-slate-200 font-semibold text-xs">
            <SelectValue placeholder="Visitor Type" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {VISITOR_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value} className="text-xs font-semibold">{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear filters */}
        {isFiltered && (
          <button
            onClick={() => { setPurposeFilter('all'); setDeptFilter('all'); setTypeFilter('all'); }}
            className="flex items-center gap-1 h-8 px-3 rounded-xl bg-red-50 text-red-500 text-xs font-bold border border-red-100 hover:bg-red-100 transition-all"
          >
            <X size={12} /> Clear
          </button>
        )}

        {isFiltered && (
          <span className="ml-auto text-xs font-semibold text-slate-400">
            {filteredLogs.length} of {logs?.length || 0} records
          </span>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="smart-stat-card group">
            <div className="flex items-start justify-between mb-3 sm:mb-6">
              <div className={`p-3 sm:p-5 rounded-2xl ${stat.color} text-white shadow-2xl shadow-primary/20 transition-transform group-hover:scale-110`}>
                <stat.icon size={22} className="sm:hidden" />
                <stat.icon size={32} className="hidden sm:block" />
              </div>
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 bg-white/30 backdrop-blur-sm px-2 sm:px-4 py-1 sm:py-1.5 rounded-full uppercase tracking-widest border border-white/20 text-right leading-tight">
                {stat.trend}
              </span>
            </div>
            <div className="space-y-1 sm:space-y-2">
              <p className="text-[10px] sm:text-sm font-bold text-slate-500 uppercase tracking-wide leading-tight">{stat.title}</p>
              <h3 className="text-2xl sm:text-4xl font-bold font-headline truncate text-slate-900">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}