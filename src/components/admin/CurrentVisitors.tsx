"use client";

import { useMemo, useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { format, parseISO, isToday, differenceInMinutes } from 'date-fns';
import { Loader2, Users, Search, Filter, Radio, Clock, Bell } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, addDoc, doc, updateDoc } from 'firebase/firestore';
import { LibraryLogRecord, DepartmentRecord } from '@/lib/firebase-schema';

const navy = 'hsl(221,72%,22%)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.96)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.88)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1rem',
};

const PURPOSES = ['All Purposes', 'Reading Books', 'Research', 'Computer Use', 'Assignments'];

export function CurrentVisitors() {
  const db  = useFirestore();
  const { toast } = useToast();
  const [now, setNow] = useState(new Date());
  const [sendingVerify, setSendingVerify] = useState<string | null>(null);

  const sendVerificationPrompt = async (log: LibraryLogRecord) => {
    setSendingVerify(log.id);
    try {
      await addDoc(collection(db, 'notifications'), {
        studentId:   log.studentId,
        type:        'occupancy_verify',
        logId:       log.id,
        message:     `Occupancy Check: You have been in the library for an extended period. Please confirm you are still present or your session will be marked as a missed tap-out.`,
        sentAt:      new Date().toISOString(),
        read:        false,
      });
      toast({ title: 'Verification prompt sent', description: `Sent to ${log.studentName}.` });
    } catch {
      toast({ title: 'Failed to send', variant: 'destructive' });
    } finally { setSendingVerify(null); }
  };


  // Filters
  const [search,        setSearch]        = useState('');
  const [deptFilter,    setDeptFilter]    = useState('All Departments');
  const [purposeFilter, setPurposeFilter] = useState('All Purposes');
  const [statusFilter,  setStatusFilter]  = useState('Inside');

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const logsQuery = useMemoFirebase(
    () => query(collection(db, 'library_logs'), orderBy('checkInTimestamp', 'desc')),
    [db]
  );
  const { data: allLogs, isLoading } = useCollection<LibraryLogRecord>(logsQuery);

  const deptRef = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: depts } = useCollection<DepartmentRecord>(deptRef);

  const todayLogs = useMemo(() => {
    if (!allLogs) return [];
    return allLogs.filter(l => isToday(parseISO(l.checkInTimestamp)));
  }, [allLogs]);

  const currentlyInside = useMemo(() =>
    todayLogs.filter(l => !l.checkOutTimestamp),
    [todayLogs]
  );

  const filteredLogs = useMemo(() => {
    const s = search.toLowerCase();
    return todayLogs.filter(l => {
      const matchSearch  = !s || (l.studentName || '').toLowerCase().includes(s) || l.studentId.toLowerCase().includes(s);
      const matchDept    = deptFilter    === 'All Departments' || l.deptID   === deptFilter;
      const matchPurpose = purposeFilter === 'All Purposes'    || l.purpose  === purposeFilter;
      const matchStatus  = statusFilter  === 'All'
        || (statusFilter === 'Inside'    && !l.checkOutTimestamp)
        || (statusFilter === 'Completed' && !!l.checkOutTimestamp);
      return matchSearch && matchDept && matchPurpose && matchStatus;
    });
  }, [todayLogs, search, deptFilter, purposeFilter, statusFilter]);

  const formatDur = (checkIn: string, checkOut?: string) => {
    const diff = differenceInMinutes(checkOut ? parseISO(checkOut) : now, parseISO(checkIn));
    return diff < 60 ? `${diff}m` : `${Math.floor(diff / 60)}h ${diff % 60}m`;
  };



  const thStyle = "text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80";

  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* ── Header Card ── */}
      <div style={card} className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
              <Users size={18} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
                Library Presence
              </h2>
              <p className="text-slate-400 font-medium text-sm mt-0.5">
                Today's visitation log
              </p>
            </div>
          </div>

          {/* Live badge + stats */}
          <div className="flex items-center gap-3">
            <div className="text-center px-3 py-1.5 rounded-xl" style={{ background: `${navy}08` }}>
              <p className="font-bold text-lg" style={{ color: navy }}>{currentlyInside.length}</p>
              <p className="text-slate-400 font-semibold" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Inside</p>
            </div>
            <div className="text-center px-3 py-1.5 rounded-xl" style={{ background: 'rgba(5,150,105,0.07)' }}>
              <p className="font-bold text-sm text-emerald-600">{todayLogs.length}</p>
              <p className="text-slate-400 font-semibold" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Today</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-xs"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
              <Radio size={10} className="animate-pulse" /> Live
            </div>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search name or ID..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium" />
          </div>

          {/* Dept */}
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-9 w-36 bg-slate-50 border-slate-200 rounded-xl font-semibold text-xs">
              <div className="flex items-center gap-1.5">
                <Filter size={11} style={{ color: navy }} />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="All Departments" className="font-semibold text-sm">All Colleges</SelectItem>
              {depts?.sort((a, b) => a.deptID.localeCompare(b.deptID)).map(d => (
                <SelectItem key={d.deptID} value={d.deptID} className="font-semibold text-sm">
                  <span className="font-bold mr-1.5" style={{ color: navy }}>[{d.deptID}]</span>
                  {d.departmentName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Purpose */}
          <Select value={purposeFilter} onValueChange={setPurposeFilter}>
            <SelectTrigger className="h-9 w-36 bg-slate-50 border-slate-200 rounded-xl font-semibold text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {PURPOSES.map(p => <SelectItem key={p} value={p} className="font-semibold text-sm">{p}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Status */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
            {(['All', 'Inside', 'Completed'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={statusFilter === s
                  ? { background: navy, color: 'white' }
                  : { color: '#64748b' }
                }>
                {s}
              </button>
            ))}
          </div>

          <p className="text-slate-400 text-xs font-medium ml-auto">
            {filteredLogs.length} record{filteredLogs.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* ── Table Card ── */}
      <div style={card} className="overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={20} />
            <span className="text-sm font-medium">Synchronizing presence data...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-20 text-center">
            <Clock size={32} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-400 text-sm font-medium">No records match the current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-11 border-slate-100">
                  <TableHead className={`pl-5 ${thStyle}`}>Student</TableHead>
                  <TableHead className={thStyle}>ID</TableHead>
                  <TableHead className={thStyle}>Dept</TableHead>
                  <TableHead className={thStyle}>Purpose</TableHead>
                  <TableHead className={thStyle}>Time In</TableHead>
                  <TableHead className={thStyle}>Time Inside</TableHead>
                  <TableHead className={`text-right pr-5 ${thStyle}`}>Status / Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map(log => {
                  const isInside = !log.checkOutTimestamp;
                  const dur = formatDur(log.checkInTimestamp, log.checkOutTimestamp);
                  return (
                    <TableRow key={log.id}
                      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                      style={{ height: '60px' }}>

                      {/* Name */}
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white flex-shrink-0"
                            style={{ background: isInside ? `linear-gradient(135deg,${navy},hsl(221,60%,35%))` : '#94a3b8' }}>
                            {(log.studentName || 'S').split(',')[0]?.trim()[0] || 'S'}
                          </div>
                          <span className="font-semibold text-slate-900 text-base truncate max-w-[160px]">
                            {log.studentName || 'Scholar'}
                          </span>
                        </div>
                      </TableCell>

                      {/* ID */}
                      <TableCell>
                        <span className="font-bold text-lg" style={{ color: navy, fontFamily: "'DM Mono',monospace" }}>
                          {log.studentId}
                        </span>
                      </TableCell>

                      {/* Dept */}
                      <TableCell>
                        <span className="font-bold text-xs px-2.5 py-1 rounded-lg"
                          style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                          {log.deptID}
                        </span>
                      </TableCell>

                      {/* Purpose */}
                      <TableCell>
                        <span className="text-sm font-semibold px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-600">
                          {log.purpose}
                        </span>
                      </TableCell>

                      {/* Time In */}
                      <TableCell>
                        <span className="text-base font-medium text-slate-600">
                          {format(parseISO(log.checkInTimestamp), 'h:mm a')}
                        </span>
                      </TableCell>

                      {/* Time Inside */}
                      <TableCell>
                        <span className="font-bold text-base" style={{ color: isInside ? '#3b82f6' : '#64748b', fontFamily: "'DM Mono',monospace" }}>
                          {dur}
                        </span>
                      </TableCell>

                      {/* Status + Verify action */}
                      <TableCell className="text-right pr-5">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {isInside ? (
                            <>
                              <span className="text-sm font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
                                style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
                                Inside
                              </span>
                              <button
                                onClick={() => sendVerificationPrompt(log)}
                                disabled={sendingVerify === log.id}
                                title="Send occupancy verification prompt to student"
                                className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl border transition-all active:scale-95 disabled:opacity-50"
                                style={{ borderColor: 'hsl(43,85%,55%)', color: 'hsl(38,90%,40%)', background: 'hsl(43,85%,55%,0.08)' }}>
                                {sendingVerify === log.id
                                  ? <Loader2 size={11} className="animate-spin" />
                                  : <Bell size={11} />}
                                Verify
                              </button>
                            </>
                          ) : (
                            <span className="text-sm font-bold px-3 py-1.5 rounded-full bg-slate-100 text-slate-500">
                              Done
                            </span>
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

    </div>
  );
}