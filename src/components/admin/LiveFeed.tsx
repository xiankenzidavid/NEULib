"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, isToday } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, User, Loader2, LogIn, LogOut } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { LibraryLogRecord, DEPARTMENTS } from '@/lib/firebase-schema';

export function LiveFeed() {
  const db = useFirestore();

  const logsQuery = useMemoFirebase(() => {
    return query(
      collection(db, 'library_logs'),
      orderBy('checkInTimestamp', 'desc'),
      limit(20)
    );
  }, [db]);

  const { data: recentLogs, isLoading } = useCollection<LibraryLogRecord>(logsQuery);

  return (
    <Card className="school-card bg-white/40 rounded-3xl overflow-hidden shadow-sm">
      <CardHeader className="border-b border-white/20">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-xl text-primary">
            <Activity size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="live-dot" style={{width:8,height:8}} />
              <CardTitle className="text-2xl font-headline font-bold text-slate-900">Live Traffic</CardTitle>
            </div>
            <CardDescription className="text-sm font-medium text-slate-500">Real-time entries and exits</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[350px]">
          {isLoading ? (
            <div className="p-12 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="animate-spin mb-2" />
              <p className="text-sm font-bold uppercase tracking-widest">Fetching logs...</p>
            </div>
          ) : !recentLogs || recentLogs.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground font-medium italic">
              No traffic recorded yet.
            </div>
          ) : (
            <div>
              {/* Column headers — mobile: 3 cols, desktop: 5 cols */}
              <div className="grid grid-cols-[2fr_1fr_1fr] sm:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50/80">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Name</span>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Purpose</span>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400 text-right">Status</span>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400 hidden sm:block">Student ID</span>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400 text-right hidden sm:block">Time In</span>
              </div>
              <div className="divide-y divide-slate-50">
                {recentLogs.map((log) => {
                  const isNoTap = !log.checkOutTimestamp && !isToday(parseISO(log.checkInTimestamp));
                  return (
                    <div key={log.id} className="grid grid-cols-[2fr_1fr_1fr] sm:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-3 items-center hover:bg-slate-50/60 transition-colors">
                      {/* Name + Dept */}
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-sm flex-shrink-0">
                          {(log.studentName || 'S').charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-slate-900 truncate">{log.studentName || 'Student'}</p>
                          <p className="text-xs font-medium text-slate-400 truncate">{DEPARTMENTS[log.deptID] || log.deptID}</p>
                        </div>
                      </div>
                      {/* Purpose — always visible */}
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-primary/5 text-primary w-fit truncate">
                        {log.purpose}
                      </span>
                      {/* Status — always visible */}
                      <div className="flex justify-end">
                        {log.checkOutTimestamp ? (
                          <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">Done</span>
                        ) : isNoTap ? (
                          <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-50 text-red-500">No Tap</span>
                        ) : (
                          <span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-50 text-blue-600 animate-pulse">Active</span>
                        )}
                      </div>
                      {/* Student ID — desktop only */}
                      <span className="text-xs font-bold text-slate-500 truncate hidden sm:block" style={{ fontFamily: "'DM Mono',monospace" }}>
                        {log.studentId}
                      </span>
                      {/* Time In — desktop only */}
                      <span className="text-xs font-medium text-slate-500 hidden sm:block">
                        {format(parseISO(log.checkInTimestamp), 'MMM d, h:mm a')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}