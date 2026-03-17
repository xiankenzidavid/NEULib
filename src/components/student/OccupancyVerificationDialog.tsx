"use client";

/**
 * OccupancyVerificationDialog
 *
 * Shown to the student when their active session reaches 3 hours (then every
 * 3 hours recursively). Gives two choices:
 *   "Yes, I'm still here"  → resets the 3-hour timer
 *   "No, I've left"        → writes checkOutTimestamp = now and closes
 *
 * Props:
 *   logId       – Firestore library_logs document ID
 *   studentName – display name shown in greeting
 *   checkInTime – ISO string for calculating duration display
 *   onStillHere – callback when student confirms presence
 *   onCheckOut  – callback after checkout write completes
 */

import { useState } from 'react';
import { format, parseISO, differenceInHours, differenceInMinutes } from 'date-fns';
import { Clock, MapPin, LogOut, Loader2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface Props {
  logId:       string;
  studentName: string;
  checkInTime: string;
  onStillHere: () => void;
  onCheckOut:  () => void;
}

const navy = 'hsl(221,72%,22%)';

export function OccupancyVerificationDialog({ logId, studentName, checkInTime, onStillHere, onCheckOut }: Props) {
  const db = useFirestore();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const now       = new Date();
  const checkIn   = parseISO(checkInTime);
  const hrs       = differenceInHours(now, checkIn);
  const mins      = differenceInMinutes(now, checkIn) % 60;
  const durationStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

  const handleCheckOut = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'library_logs', logId), {
        checkOutTimestamp: new Date().toISOString(),
      });
      toast({ title: 'Session Closed', description: 'Your library session has been checked out.' });
      onCheckOut();
    } catch {
      toast({ title: 'Could not close session', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden text-center">

        {/* Icon header */}
        <div className="pt-8 pb-4 px-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'hsl(43,85%,52%,0.12)' }}>
            <Clock size={32} style={{ color: 'hsl(38,90%,45%)' }} />
          </div>
          <h2 className="font-bold text-slate-900 text-2xl" style={{ fontFamily: "'Playfair Display',serif" }}>
            Are you still there?
          </h2>
          <p className="text-slate-500 text-sm mt-2 font-medium leading-relaxed">
            Hi <strong>{studentName.split(',')[1]?.trim() || studentName}</strong>! You've been in the library for{' '}
            <strong style={{ color: navy }}>{durationStr}</strong>.
            <br />Please confirm your presence.
          </p>
        </div>

        {/* Session info chip */}
        <div className="mx-6 mb-4 p-3 rounded-xl flex items-center justify-center gap-3"
          style={{ background: `${navy}08` }}>
          <MapPin size={13} style={{ color: navy }} />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
            Checked in at {format(checkIn, 'h:mm a')}
          </span>
          <span className="text-slate-300">·</span>
          <span className="text-xs font-bold" style={{ color: navy, fontFamily: "'DM Mono',monospace" }}>
            {durationStr}
          </span>
        </div>

        {/* Buttons */}
        <div className="px-6 pb-8 flex flex-col gap-3">
          <button
            onClick={onStillHere}
            className="w-full h-13 py-3.5 rounded-2xl font-bold text-white text-base transition-all active:scale-95"
            style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,32%))` }}>
            ✅ Yes, I'm still here
          </button>
          <button
            onClick={handleCheckOut}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl font-bold text-base border-2 transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{ borderColor: '#fca5a5', color: '#dc2626', background: 'rgba(239,68,68,0.04)' }}>
            {saving
              ? <><Loader2 size={16} className="animate-spin" /> Checking out…</>
              : <><LogOut size={16} /> No, I've already left</>}
          </button>
        </div>
      </div>
    </div>
  );
}
