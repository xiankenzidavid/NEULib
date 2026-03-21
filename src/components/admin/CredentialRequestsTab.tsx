"use client";

import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import {
  FileEdit, CheckCircle2, XCircle, ShieldAlert, Clock, User,
  IdCard, GraduationCap, ChevronDown, Loader2, Search, Filter,
  ShieldCheck,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, doc, updateDoc, addDoc, getDoc, setDoc, deleteDoc, writeBatch, getDocs, where, limit } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { writeAuditLog } from '@/lib/audit-logger';
import { libraryLogId } from '@/lib/firestore-ids';
import { SuccessCard } from '@/components/ui/SuccessCard';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CredentialRequest {
  id:          string;
  studentId:   string;
  studentName: string;
  email:       string;
  type:        'name' | 'student_id' | 'dept_program' | 'admin_privilege' | 'unblock_request';
  status:      'pending' | 'approved' | 'partial' | 'revoked' | 'pending_verification';
  current:     Record<string, string>;
  requested:   Record<string, string>;
  reason:      string;
  requiresVerification?: boolean;
  verified?:   boolean;
  adminNote?:  string;
  createdAt:   string;
  updatedAt:   string;
}

const REVOKE_PRESETS = [
  'The submitted information could not be verified against official records.',
  'The requested change does not match your enrollment documents.',
  'Insufficient justification provided for this credential change.',
  'Please visit the Registrar\'s Office and resubmit with official documentation.',
];

const navy  = 'hsl(221,72%,22%)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1rem',
};

const TYPE_META = {
  name:            { label: 'Name Change',           icon: User,         color: '#2563eb' },
  student_id:      { label: 'Student ID Change',     icon: IdCard,       color: '#7c3aed' },
  dept_program:    { label: 'Dept / Program',        icon: GraduationCap,color: '#059669' },
  admin_privilege: { label: 'Admin Privilege',       icon: ShieldCheck,  color: '#d97706' },
  unblock_request: { label: 'Unblock Request',        icon: ShieldCheck,  color: '#dc2626' },
};

const STATUS_META = {
  pending:              { label: 'Pending',              bg: 'rgba(251,191,36,0.12)', color: '#d97706' },
  pending_verification: { label: 'Pending Verification', bg: 'rgba(124,58,237,0.1)',  color: '#7c3aed' },
  approved:             { label: 'Approved',             bg: 'rgba(5,150,105,0.1)',   color: '#059669' },
  partial:              { label: 'Partial Approval',     bg: 'rgba(14,165,233,0.1)',  color: '#0284c7' },
  revoked:              { label: 'Revoked',              bg: 'rgba(239,68,68,0.1)',   color: '#dc2626' },
};

// ─── Review Modal ─────────────────────────────────────────────────────────────
function ReviewModal({ req, onClose, onDone }: { req: CredentialRequest; onClose: () => void; onDone: () => void }) {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  // Revoke
  const [revoking,      setRevoking]      = useState(false);
  const [revokePreset,  setRevokePreset]  = useState<number | 'custom'>(0);
  const [revokeCustom,  setRevokeCustom]  = useState('');

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<{ title: string; description: string } | null>(null);

  // ─── Shared session re-attribution helper ────────────────────────────────
  // Called after any credential update. If the student is currently tapped in
  // today, auto tap-out the old session and immediately open a new one with
  // the updated credentials (name / dept / program / studentId).
  //
  // OLD log doc: checkOutTimestamp added — its deptID/program/studentName are
  // preserved exactly as they were (historical data integrity guaranteed).
  //
  // NEW log doc: carries the updated credentials from this point forward.
  const reattributeSession = async (opts: {
    lookupStudentId:  string;   // ID used to query existing logs
    newStudentId:     string;   // may differ for student_id changes
    newStudentName:   string;   // formatted "LAST, First"
    newDeptID?:       string;   // if changed
    newProgram?:      string;   // if changed
  }) => {
    const { lookupStudentId, newStudentId, newStudentName, newDeptID, newProgram } = opts;
    const now = new Date().toISOString();

    const activeLogQ = await getDocs(query(
      collection(db, 'library_logs'),
      where('studentId', '==', lookupStudentId),
      orderBy('checkInTimestamp', 'desc'),
      limit(1)
    ));
    if (activeLogQ.empty) return; // no logs at all

    const activeLog     = activeLogQ.docs[0];
    const activeLogData = activeLog.data();

    // Only re-attribute if this is an ACTIVE session (no tap-out yet).
    // We intentionally do NOT restrict to "today" — an admin could approve
    // a request for a student who tapped in yesterday and is still inside.
    const isActiveSession = !activeLogData.checkOutTimestamp;
    if (!isActiveSession) return;

    const batch = writeBatch(db);

    // 1. Tap-out the current session — OLD credentials remain on this doc
    //    (preserves historical dept/program/studentName untouched)
    batch.update(activeLog.ref, { checkOutTimestamp: now });

    // 2. Open a new session with the UPDATED credentials
    const resolvedDept    = newDeptID  ?? activeLogData.deptID  ?? '';
    const resolvedProgram = newProgram ?? activeLogData.program ?? '';
    const newLogDocId     = libraryLogId(newStudentName, resolvedDept);
    batch.set(doc(db, 'library_logs', newLogDocId), {
      studentId:        newStudentId,
      deptID:           resolvedDept,
      program:          resolvedProgram,
      checkInTimestamp: now,
      purpose:          activeLogData.purpose,
      studentName:      newStudentName,
    });

    await batch.commit();
  };

  const handleApprove = async () => {
    setSaving(true);
    try {
      const ref = doc(db, 'credential_requests', req.id);

      // ── Name change ──────────────────────────────────────────────────────
      if (req.type === 'name') {
        // All-or-nothing approval — no partial field selection.
        // Physical verification is required (requiresVerification gate enforces this).
        const updates: Record<string, string> = {};
        if (req.requested.firstName  !== req.current.firstName)  updates.firstName  = req.requested.firstName;
        if (req.requested.middleName !== req.current.middleName) updates.middleName = req.requested.middleName;
        if (req.requested.lastName   !== req.current.lastName)   updates.lastName   = req.requested.lastName;

        if (Object.keys(updates).length > 0) {
          await updateDoc(doc(db, 'users', req.studentId), updates);
          const newFirst = updates.firstName  ?? req.current.firstName  ?? '';
          const newLast  = updates.lastName   ?? req.current.lastName   ?? '';
          const newName  = `${newLast.toUpperCase()}, ${newFirst}`;
          try {
            await reattributeSession({
              lookupStudentId: req.studentId,
              newStudentId:    req.studentId,
              newStudentName:  newName,
            });
          } catch (e) {
            console.warn('[CredentialRequestsTab] name re-attribution failed:', e);
          }
        }

        await updateDoc(ref, { status: 'approved', updatedAt: new Date().toISOString(), approvedFields: updates });
        writeAuditLog(db, user, 'user.edit', { targetId: req.studentId, targetName: req.studentName, detail: `Name change approved` });

      // ── Dept / Program change ────────────────────────────────────────────
      } else if (req.type === 'dept_program') {
        // 1. Update the user record — only the /users doc changes.
        //    Existing library_logs keep their original deptID/program (snapshot integrity).
        await updateDoc(doc(db, 'users', req.studentId), req.requested);

        // 2. Session re-attribution: if tapped in today, swap the active session
        //    so future tap-out is attributed to the NEW dept/program.
        try {
          const existingName = req.studentName ||
            `${(req.current.lastName ?? '').toUpperCase()}, ${req.current.firstName ?? ''}`;
          await reattributeSession({
            lookupStudentId: req.studentId,
            newStudentId:    req.studentId,
            newStudentName:  existingName,
            newDeptID:       req.requested.deptID,
            newProgram:      req.requested.program,
          });
        } catch (e) {
          console.warn('[CredentialRequestsTab] dept_program re-attribution failed:', e);
        }

        await updateDoc(ref, { status: 'approved', updatedAt: new Date().toISOString() });
        writeAuditLog(db, user, 'user.edit', { targetId: req.studentId, targetName: req.studentName, detail: `Credential request (dept_program) approved` });

      // ── Student ID change ────────────────────────────────────────────────
      } else if (req.type === 'student_id') {
        const newId = req.requested.studentId;
        if (!newId) throw new Error('No new studentId in request');

        // 1. Find the current user doc (may have been stored under email or old ID)
        let oldSnap = await getDoc(doc(db, 'users', req.studentId));
        if (!oldSnap.exists() && req.email) {
          const emailQ = await getDocs(query(collection(db, 'users'), where('email', '==', req.email), limit(1)));
          if (!emailQ.empty) oldSnap = emailQ.docs[0] as any;
        }
        if (!oldSnap.exists()) throw new Error(`User doc not found for ID "${req.studentId}" or email "${req.email}"`);
        const oldData     = oldSnap.data();
        const actualDocId = oldSnap.id;

        // 2. Write to new doc with updated ID fields
        await setDoc(doc(db, 'users', newId), { ...oldData, id: newId });

        // 3. Historical cascade — update studentId across all collections.
        //    CRITICAL: always query by req.studentId (the numeric ID stored in log records),
        //    NOT actualDocId which may be the user's email if the doc was keyed by email.
        //    Also try actualDocId as a fallback in case some records used it.
        const idsToMigrate = Array.from(new Set([req.studentId, actualDocId].filter(Boolean)));

        // 3a. library_logs cascade
        try {
          for (const oldId of idsToMigrate) {
            const logsSnap = await getDocs(
              query(collection(db, 'library_logs'), where('studentId', '==', oldId), limit(500))
            );
            if (!logsSnap.empty) {
              const batch = writeBatch(db);
              logsSnap.docs.forEach(logDoc => batch.update(logDoc.ref, { studentId: newId }));
              await batch.commit();
            }
          }
        } catch (cascadeErr) {
          console.warn('[CredentialRequestsTab] library_logs cascade failed:', cascadeErr);
        }

        // 3b. blocked_attempts cascade
        try {
          for (const oldId of idsToMigrate) {
            const blockedSnap = await getDocs(
              query(collection(db, 'blocked_attempts'), where('studentId', '==', oldId), limit(500))
            );
            if (!blockedSnap.empty) {
              const batch = writeBatch(db);
              blockedSnap.docs.forEach(d => batch.update(d.ref, { studentId: newId }));
              await batch.commit();
            }
          }
        } catch (cascadeErr) {
          console.warn('[CredentialRequestsTab] blocked_attempts cascade failed:', cascadeErr);
        }

        // 3c. credential_requests cascade
        try {
          for (const oldId of idsToMigrate) {
            const credsSnap = await getDocs(
              query(collection(db, 'credential_requests'), where('studentId', '==', oldId), limit(500))
            );
            if (!credsSnap.empty) {
              const batch = writeBatch(db);
              credsSnap.docs.forEach(d => batch.update(d.ref, { studentId: newId }));
              await batch.commit();
            }
          }
        } catch (cascadeErr) {
          console.warn('[CredentialRequestsTab] credential_requests cascade failed:', cascadeErr);
        }

        // 4. Session re-attribution: if tapped in, close old session (now under newId
        //    after cascade) and open a new one. Name/dept/program stay the same.
        try {
          const existingName = req.studentName ||
            `${(oldData.lastName ?? '').toUpperCase()}, ${oldData.firstName ?? ''}`;
          await reattributeSession({
            lookupStudentId: newId,   // cascade already moved logs to newId
            newStudentId:    newId,
            newStudentName:  existingName,
            newDeptID:       oldData.deptID,
            newProgram:      oldData.program,
          });
        } catch (e) {
          console.warn('[CredentialRequestsTab] student_id re-attribution failed:', e);
        }

        // 5. Delete old user doc
        await deleteDoc(doc(db, 'users', actualDocId));
        await updateDoc(ref, { status: 'approved', updatedAt: new Date().toISOString() });
        writeAuditLog(db, user, 'user.edit', { targetId: newId, targetName: req.studentName, detail: `Student ID changed from ${req.studentId} to ${newId}` });

      // ── Admin privilege ──────────────────────────────────────────────────
      } else if (req.type === 'admin_privilege') {
        await updateDoc(doc(db, 'users', req.studentId), { role: 'admin', status: 'active' });
        await updateDoc(ref, { status: 'approved', updatedAt: new Date().toISOString() });
        writeAuditLog(db, user, 'role.promote', { targetId: req.studentId, targetName: req.studentName, detail: `Admin privilege granted via credential request — physical verification completed` });

      } else if (req.type === 'unblock_request') {
        // Unblock the user in /users
        await updateDoc(doc(db, 'users', req.studentId), { status: 'active' });
        await updateDoc(ref, { status: 'approved', updatedAt: new Date().toISOString() });
        writeAuditLog(db, user, 'user.unblock', {
          targetId: req.studentId, targetName: req.studentName,
          detail: `Account unblocked via student unblock request`,
        });
      }

      setSuccessMsg({ title: 'Request Approved', description: 'The student has been notified of the decision.' });
    } catch (err: any) {
      const msg = err?.message || err?.code || 'Unknown error';
      console.error('[handleApprove]', msg, err);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleRevoke = async () => {
    setSaving(true);
    const reason = revokePreset === 'custom' ? revokeCustom.trim() : REVOKE_PRESETS[revokePreset as number];
    if (!reason) { toast({ title: 'Enter revocation reason', variant: 'destructive' }); setSaving(false); return; }
    try {
      await updateDoc(doc(db, 'credential_requests', req.id), { status: 'revoked', adminNote: reason, updatedAt: new Date().toISOString() });
      writeAuditLog(db, user, 'user.edit', { targetId: req.studentId, targetName: req.studentName, detail: `Credential request revoked: ${reason}` });
      setSuccessMsg({ title: 'Request Revoked', description: 'The student has been notified of the decision.' });
    } catch (err: any) {
      const msg = err?.message || err?.code || 'Unknown error';
      console.error('[handleRevoke]', msg, err);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const [verifying, setVerifying] = useState(false);

  const handleToggleVerified = async () => {
    setVerifying(true);
    try {
      await updateDoc(doc(db, 'credential_requests', req.id), {
        verified: !req.verified,
        status: !req.verified ? 'pending' : 'pending_verification',
        updatedAt: new Date().toISOString(),
      });
      toast({ title: !req.verified ? 'Marked as Verified' : 'Verification removed' });
      onDone();
    } finally { setVerifying(false); }
  };

  const canApprove = !req.requiresVerification || req.verified;

  return (
    <>
      {successMsg && (
        <SuccessCard
          title={successMsg.title}
          description={successMsg.description}
          onClose={onDone}
          color={successMsg.title.includes('Revoked') ? 'amber' : 'green'}
        />
      )}

      {/* Processing overlay — shown while approve/revoke is in flight */}
      {saving && !successMsg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.15s ease-out' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden"
            style={{ animation: 'scaleIn 0.2s ease-out' }}>
            <div className="px-8 py-8 text-center space-y-5">
              {/* Dual-ring spinner */}
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent animate-spin"
                  style={{ borderTopColor: navy, animationDuration: '0.85s' }} />
                <div className="absolute inset-2 rounded-full border-4 border-transparent animate-spin"
                  style={{ borderTopColor: 'hsl(221,60%,60%)', animationDuration: '1.3s', animationDirection: 'reverse' }} />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-slate-800 text-base" style={{ fontFamily: "'Playfair Display',serif" }}>
                  Processing Request
                </p>
                <p className="text-xs font-medium text-slate-400">
                  {revoking ? 'Revoking and notifying student…' : 'Applying changes and notifying student…'}
                </p>
              </div>
            </div>
          </div>
          <style>{`
            @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
            @keyframes scaleIn { from { opacity: 0; transform: scale(0.9) } to { opacity: 1; transform: scale(1) } }
          `}</style>
        </div>
      )}

    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between" style={{ background: `${navy}06` }}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}><FileEdit size={18} /></div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>Review Request</h3>
              <p className="text-xs text-slate-400 mt-0.5">{req.studentName} · {req.studentId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 text-xl font-bold">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4" style={{ scrollbarWidth: "thin", scrollbarColor: "hsl(221,72%,70%) transparent" }}>

          {/* Request summary */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2 text-sm">
            <p className="font-bold text-slate-700">Request Details</p>
            <p className="text-slate-500 font-medium">Reason: <span className="text-slate-800">{req.reason}</span></p>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Current</p>
                {Object.entries(req.current).map(([k, v]) => (
                  <p key={k} className="text-xs font-mono text-slate-600"><span className="text-slate-400">{k}:</span> {v || '—'}</p>
                ))}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Requested</p>
                {Object.entries(req.requested).map(([k, v]) => (
                  <p key={k} className="text-xs font-mono font-bold text-slate-900"><span className="text-slate-400">{k}:</span> {v || '—'}</p>
                ))}
              </div>
            </div>
          </div>

          {/* Verification gate for high-security */}
          {req.requiresVerification && (
            <div className={`p-4 rounded-xl border ${req.verified ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-bold text-sm ${req.verified ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {req.verified ? '✓ Physical Verification Complete' : '⚠ Requires Physical Verification'}
                  </p>
                  <p className="text-xs font-medium mt-0.5 text-slate-500">
                    {req.verified ? 'Student has been verified in person.' : 'Student must visit Admin Office before approval.'}
                  </p>
                </div>
                <button onClick={handleToggleVerified} disabled={verifying}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 disabled:opacity-60 flex items-center gap-1.5"
                  style={req.verified
                    ? { background: 'white', borderColor: '#d1fae5', color: '#059669' }
                    : { background: navy, color: 'white', border: 'none' }}>
                  {verifying
                    ? <><Loader2 size={11} className="animate-spin" /> Processing…</>
                    : req.verified ? 'Undo' : 'Mark Verified'}
                </button>
              </div>
            </div>
          )}

          {/* Revoke panel */}
          {revoking && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Reason for Revocation</p>
              {REVOKE_PRESETS.map((p, i) => (
                <button key={i} onClick={() => setRevokePreset(i)}
                  className="w-full text-left p-3 rounded-xl border text-sm font-medium transition-all"
                  style={{ borderColor: revokePreset === i ? '#ef4444' : '#e2e8f0', background: revokePreset === i ? 'rgba(239,68,68,0.04)' : '#fafafa', color: '#1e293b' }}>
                  {p}
                </button>
              ))}
              <button onClick={() => setRevokePreset('custom')}
                className="w-full text-left p-3 rounded-xl border text-sm font-medium transition-all"
                style={{ borderColor: revokePreset === 'custom' ? '#ef4444' : '#e2e8f0', background: revokePreset === 'custom' ? 'rgba(239,68,68,0.04)' : '#fafafa' }}>
                Write custom reason…
              </button>
              {revokePreset === 'custom' && (
                <textarea value={revokeCustom} onChange={e => setRevokeCustom(e.target.value)} rows={3}
                  placeholder="Enter reason for revocation..."
                  className="w-full px-3 py-2.5 rounded-xl border border-red-300 text-sm font-medium resize-none outline-none"
                  style={{ lineHeight: '1.6' }} autoFocus />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 flex-wrap">
          {/* ── Closed request — read-only, no actions ── */}
          {['approved', 'partial', 'revoked'].includes(req.status) ? (
            <>
              <div className="flex-1 flex items-center gap-2 text-sm font-semibold"
                style={{ color: req.status === 'revoked' ? '#dc2626' : '#059669' }}>
                {req.status === 'revoked'
                  ? <><XCircle size={16} /> Request was revoked</>
                  : <><CheckCircle2 size={16} /> Request was {req.status === 'partial' ? 'partially ' : ''}approved</>}
              </div>
              <button onClick={onClose}
                className="h-11 px-6 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                Close
              </button>
            </>
          ) : !revoking ? (
            <>
              <button onClick={onClose} disabled={saving}
                className="flex-1 h-11 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">
                Cancel
              </button>
              <button onClick={() => setRevoking(true)}
                className="flex-1 h-11 rounded-xl font-bold text-sm border border-red-200 text-red-600 hover:bg-red-50 transition-all">
                <XCircle size={14} className="inline mr-1.5" />Revoke
              </button>
              <button onClick={handleApprove} disabled={saving || !canApprove}
                className="flex-1 h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                style={{ background: canApprove ? '#059669' : '#94a3b8' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {!canApprove ? 'Verify First' : 'Approve'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setRevoking(false)} disabled={saving}
                className="flex-1 h-11 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                ← Back
              </button>
              <button onClick={handleRevoke} disabled={saving}
                className="flex-1 h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                style={{ background: '#dc2626' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Confirm Revoke
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────
export function CredentialRequestsTab() {
  const db = useFirestore();
  const [search,      setSearch]      = useState('');
  const [typeFilter,  setTypeFilter]  = useState('all');
  const [statusFilter,setStatusFilter]= useState('all');
  const [reviewing,   setReviewing]   = useState<CredentialRequest | null>(null);
  const [crRpp,  setCrRpp]  = useState<number>(25);
  const [crPage, setCrPage] = useState(1);

  const reqsQ = useMemoFirebase(
    () => query(collection(db, 'credential_requests'), orderBy('createdAt', 'desc')),
    [db]
  );
  const { data: requests, isLoading } = useCollection<CredentialRequest>(reqsQ);

  const filtered = useMemo(() => {
    if (!requests) return [];
    const s = search.toLowerCase();
    return requests.filter(r => {
      const mS = !s || r.studentName.toLowerCase().includes(s) || r.studentId.toLowerCase().includes(s);
      const mT = typeFilter   === 'all' || r.type   === typeFilter;
      const mSt= statusFilter === 'all' || r.status === statusFilter;
      return mS && mT && mSt;
    });
  }, [requests, search, typeFilter, statusFilter]);

  const pendingCount = requests?.filter(r => r.status === 'pending' || r.status === 'pending_verification').length || 0;

  const thStyle = 'text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80';

  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* Header */}
      <div style={card} className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}><FileEdit size={18} /></div>
            <div>
              <h2 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
                Credential Requests
              </h2>
              <p className="text-slate-400 text-sm mt-0.5">Student-initiated change requests</p>
            </div>
          </div>
          {pendingCount > 0 && (
            <span className="text-xs font-bold px-3 py-1.5 rounded-full"
              style={{ background: 'hsl(43,85%,55%,0.15)', color: 'hsl(38,90%,35%)' }}>
              {pendingCount} pending review
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search name or ID…" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-44 bg-slate-50 border-slate-200 rounded-xl text-xs font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all"             className="text-xs font-semibold">All Types</SelectItem>
              <SelectItem value="name"            className="text-xs font-semibold">Name Change</SelectItem>
              <SelectItem value="student_id"      className="text-xs font-semibold">Student ID</SelectItem>
              <SelectItem value="dept_program"    className="text-xs font-semibold">Dept / Program</SelectItem>
              <SelectItem value="admin_privilege" className="text-xs font-semibold">Admin Privilege</SelectItem>
              <SelectItem value="unblock_request" className="text-xs font-semibold">Unblock Request</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-44 bg-slate-50 border-slate-200 rounded-xl text-xs font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="text-xs font-semibold">All Statuses</SelectItem>
              <SelectItem value="pending" className="text-xs font-semibold">Pending</SelectItem>
              <SelectItem value="pending_verification" className="text-xs font-semibold">Pending Verification</SelectItem>
              <SelectItem value="approved" className="text-xs font-semibold">Approved</SelectItem>
              <SelectItem value="partial" className="text-xs font-semibold">Partial Approval</SelectItem>
              <SelectItem value="revoked" className="text-xs font-semibold">Revoked</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div style={card} className="overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={18} /><span className="text-sm font-medium">Loading requests…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <FileEdit size={28} className="mx-auto text-slate-200 mb-3" />
            <p className="font-bold text-slate-600 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>
              {(requests?.length ?? 0) === 0 ? 'No requests yet' : 'No matches'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-10 border-slate-100">
                  <TableHead className={`pl-5 ${thStyle}`}>Student</TableHead>
                  <TableHead className={thStyle}>Type</TableHead>
                  <TableHead className={thStyle}>Submitted</TableHead>
                  <TableHead className={thStyle}>Status</TableHead>
                  <TableHead className={`text-right pr-5 ${thStyle}`}>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice((crPage-1)*crRpp, crPage*crRpp).map(req => {
                  const tm = TYPE_META[req.type];
                  const sm = STATUS_META[req.status] ?? STATUS_META.pending;
                  const isPending = req.status === 'pending' || req.status === 'pending_verification';
                  return (
                    <TableRow key={req.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors" style={{ height: 64 }}>
                      <TableCell className="pl-5">
                        <p className="font-semibold text-slate-900 text-sm">{req.studentName}</p>
                        <p className="text-xs text-slate-400 font-mono">{req.studentId}</p>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-full"
                          style={{ background: `${tm.color}12`, color: tm.color }}>
                          <tm.icon size={11} /> {tm.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-semibold text-slate-700">{format(parseISO(req.createdAt), 'MMM d, yyyy')}</p>
                        <p className="text-xs text-slate-400">{format(parseISO(req.createdAt), 'h:mm a')}</p>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-bold px-2.5 py-1.5 rounded-full"
                          style={{ background: sm.bg, color: sm.color }}>
                          {req.requiresVerification && !req.verified && req.status !== 'approved' && req.status !== 'revoked'
                            ? '⚠ Needs Verification'
                            : sm.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-5">
                        <button
                          onClick={() => setReviewing(req)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95"
                          style={isPending
                            ? { background: navy, color: 'white', border: 'none' }
                            : { borderColor: '#e2e8f0', color: '#64748b' }}>
                          {isPending ? 'Review' : 'View'}
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {(() => {
            const _tot = filtered.length;
            const _pg  = Math.ceil(_tot / crRpp);
            if (_tot === 0) return null;
            return (
              <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-medium text-slate-400">
                    {(crPage-1)*crRpp+1}&ndash;{Math.min(crPage*crRpp,_tot)} of {_tot}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">Rows per page:</span>
                    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100">
                      {([25,50,100] as const).map(n=>(
                        <button key={n} onClick={()=>{ setCrRpp(n); setCrPage(1); }}
                          className="px-2.5 py-1 rounded-md text-xs font-bold transition-all"
                          style={crRpp===n?{background:'hsl(43,85%,50%)',color:'white'}:{color:'#64748b'}}>{n}</button>
                      ))}
                      <button onClick={()=>{const v=parseInt(prompt('Rows per page (10-500):',String(crRpp))||String(crRpp));if(!isNaN(v)&&v>=10&&v<=500){ setCrRpp(v); setCrPage(1);}}}
                        className="px-2.5 py-1 rounded-md text-xs font-bold text-slate-500 hover:bg-white transition-all">Custom</button>
                    </div>
                  </div>
                </div>
                {_pg>1&&(
                  <div className="flex items-center gap-1">
                    <button onClick={()=>{ setCrPage(1); window.scrollTo({top:0,behavior:'smooth'}); }} disabled={crPage===1} className="h-7 px-2 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">&#171;&#171;</button>
                    <button onClick={()=>{ setCrPage((p:number)=>Math.max(1,p-1)); window.scrollTo({top:0,behavior:'smooth'}); }} disabled={crPage===1} className="h-7 px-2.5 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">&#8249;</button>
                    {Array.from({length:_pg},(_,i)=>i+1)
                      .filter(p=>p===1||p===_pg||Math.abs(p-crPage)<=1)
                      .reduce<(number|string)[]>((acc,p,i,a)=>{if(i>0&&(p as number)-(a[i-1] as number)>1)acc.push('...');acc.push(p);return acc;},[])
                      .map((p,i)=>p==='...'?<span key={'e'+i} className="px-1 text-slate-400 text-xs">&#8230;</span>
                        :<button key={p} onClick={()=>{ setCrPage(p as number); window.scrollTo({top:0,behavior:'smooth'}); }} className="h-7 w-7 rounded-lg text-xs font-bold border transition-all"
                           style={crPage===p?{background:'hsl(43,85%,50%)',color:'white',border:'none'}:{borderColor:'#e2e8f0',color:'#64748b'}}>{p}</button>)}
                    <button onClick={()=>{ setCrPage((p:number)=>Math.min(_pg,p+1)); window.scrollTo({top:0,behavior:'smooth'}); }} disabled={crPage===_pg} className="h-7 px-2.5 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">&#8250;</button>
                    <button onClick={()=>{ setCrPage(_pg); window.scrollTo({top:0,behavior:'smooth'}); }} disabled={crPage===_pg} className="h-7 px-2 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">&#187;&#187;</button>
                  </div>
                )}
              </div>
            );
          })()}
      {reviewing && (
        <ReviewModal
          req={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => setReviewing(null)}
        />
      )}
    </div>
  );
}