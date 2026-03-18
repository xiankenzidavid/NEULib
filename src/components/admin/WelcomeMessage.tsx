"use client";

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ShieldCheck, Users, Clock, ArrowRight, Loader2 } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { startOfDay as startOfDayFn } from 'date-fns';
import { UserRecord } from '@/lib/firebase-schema';

const navy = 'hsl(221,72%,22%)';

interface Props {
  adminUser: UserRecord | null;
  onDismiss: () => void;
}

export default function WelcomeMessage({ adminUser, onDismiss }: Props) {
  const db = useFirestore();
  const [countdown, setCountdown] = useState(5);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const interval = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => { if (countdown <= 0) onDismiss(); }, [countdown]);

  // Live count of students currently inside today
  const todayStart = startOfDayFn(new Date()).toISOString();
  const logsQ = useMemoFirebase(
    () => query(collection(db, 'library_logs'), where('checkInTimestamp', '>=', todayStart)),
    [db]
  );
  const { data: todayLogs } = useCollection<any>(logsQ);
  const insideCount    = todayLogs?.filter((l: any) => !l.checkOutTimestamp).length ?? 0;
  const totalTodayCount = todayLogs?.length ?? 0;

  const displayName = adminUser
    ? [adminUser.firstName, adminUser.lastName].filter(Boolean).join(' ')
    : 'Administrator';
  const role = adminUser?.role === 'super_admin' ? 'Super Administrator' : 'Library Staff';
  const initials = displayName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(30,41,59,0.60)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
      <div className="w-full max-w-md animate-in zoom-in-95 duration-500"
        style={{ fontFamily: "'DM Sans',sans-serif" }}>

        {/* Card */}
        <div className="rounded-3xl overflow-hidden shadow-2xl" style={{ background: '#ffffff', border: '1px solid rgba(226,232,240,0.8)', transition: 'transform 0.3s ease-in-out' }}>

          {/* Header — solid white, gold avatar */}
          <div className="px-8 pt-8 pb-6 text-center border-b border-slate-100" style={{ background: '#ffffff' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-xl text-white mx-auto mb-4 shadow-lg"
              style={{ background: 'linear-gradient(135deg,hsl(43,85%,55%),hsl(38,90%,45%))' }}>
              {initials}
            </div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">{greeting}</p>
            <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
              {displayName}
            </h1>
            <p className="text-slate-400 text-sm font-semibold mt-0.5">{role}</p>
          </div>

          {/* Stats */}
          <div className="px-8 py-6 space-y-4" style={{ background: '#ffffff' }}>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl text-center"
                style={{ background: `${navy}08` }}>
                <p className="text-3xl font-bold" style={{ color: navy, fontFamily: "'Playfair Display',serif" }}>
                  {insideCount}
                </p>
                <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wide">Inside Now</p>
              </div>
              <div className="p-4 rounded-2xl text-center"
                style={{ background: 'rgba(5,150,105,0.08)' }}>
                <p className="text-3xl font-bold text-emerald-600" style={{ fontFamily: "'Playfair Display',serif" }}>
                  {totalTodayCount}
                </p>
                <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wide">Today's Visits</p>
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-xl"
              style={{ background: 'hsl(43,85%,52%,0.08)', border: '1px solid hsl(43,85%,52%,0.2)' }}>
              <ShieldCheck size={14} style={{ color: 'hsl(38,90%,40%)' }} />
              <p className="text-xs font-semibold" style={{ color: 'hsl(38,90%,35%)' }}>
                Access logged. All admin actions are audited.
              </p>
            </div>

            {/* Dismiss */}
            <button onClick={onDismiss}
              className="w-full h-12 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-95"
              style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,32%))` }}>
              Go to Dashboard <ArrowRight size={15} />
              <span className="ml-1 opacity-60 text-xs">({countdown})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}