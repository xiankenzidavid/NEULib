"use client";

import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import {
  FileEdit, CheckCircle2, XCircle, ShieldAlert, Clock, User,
  IdCard, GraduationCap, ChevronDown, Loader2, Search, Filter,
  CheckSquare, Square, ShieldCheck,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, doc, updateDoc, addDoc, getDoc, setDoc, deleteDoc, writeBatch, getDocs, where, limit } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { writeAuditLog } from '@/lib/audit-logger';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CredentialRequest {
  id:          string;
  studentId:   string;
  studentName: string;
  email:       string;
  type:        'name' | 'student_id' | 'dept_program';
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
  name:         { label: 'Name Change',        icon: User,         color: '#2563eb' },
  student_id:   { label: 'Student ID Change',  icon: IdCard,       color: '#7c3aed' },
  dept_program: { label: 'Dept / Program',     icon: GraduationCap,color: '#059669' },
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

  // Granular name field approvals
  const [approveFirst,  setApproveFirst]  = useState(true);
  const [approveMiddle, setApproveMiddle] = useState(true);
  const [approveLast,   setApproveLast]   = useState(true);

  // Revoke
  const [revoking,      setRevoking]      = useState(false);
  const [revokePreset,  setRevokePreset]  = useState<number | 'custom'>(0);
  const [revokeCustom,  setRevokeCustom]  = useState('');

  const [saving, setSaving] = useState(false);

  const sendStudentNotif = async (studentId: string, message: string) => {
    await addDoc(collection(db, 'notifications'), {
      studentId, message, type: 'credential_request',
      sentAt: new Date().toISOString(), read: false,
    });
  };

  const handleApprove = async () => {
    setSaving(true);
    try {
      const ref = doc(db, 'credential_requests', req.id);

      if (req.type === 'name') {
        // Determine which fields are approved
        const updates: Record<string, string> = {};
        if (approveFirst  && req.requested.firstName  !== req.current.firstName)  updates.firstName  = req.requested.firstName;
        if (approveMiddle && req.requested.middleName !== req.current.middleName) updates.middleName = req.requested.middleName;
        if (approveLast   && req.requested.lastName   !== req.current.lastName)   updates.lastName   = req.requested.lastName;

        const anyApproved = Object.keys(updates).length > 0;
        const allApproved = [approveFirst, approveMiddle, approveLast].every(Boolean);
        const status = anyApproved ? (allApproved ? 'approved' : 'partial') : 'revoked';

        if (anyApproved) {
          await updateDoc(doc(db, 'users', req.studentId), updates);
        }
        await updateDoc(ref, { status, updatedAt: new Date().toISOString(), approvedFields: updates });

        const changedList = Object.keys(updates).join(', ') || 'none';
        const msg = status === 'approved'
          ? `Your name change request has been fully approved. Your name has been updated to: ${updates.firstName || req.current.firstName} ${updates.lastName || req.current.lastName}.`
          : status === 'partial'
          ? `Your name change request has been partially approved. Updated fields: ${changedList}.`
          : 'Your name change request was reviewed but no changes were applied.';
        await sendStudentNotif(req.studentId, msg);
        writeAuditLog(db, user, 'user.edit', { targetId: req.studentId, targetName: req.studentName, detail: `Credential request (name) ${status}: fields updated — ${changedList}` });

      } else if (req.type === 'dept_program') {
        // Dept/Program: simple field update on existing doc
        await updateDoc(doc(db, 'users', req.studentId), req.requested);
        await updateDoc(ref, { status: 'approved', updatedAt: new Date().toISOString() });
        await sendStudentNotif(req.studentId, `Your Department/Program change request has been approved and your record has been updated.`);
        writeAuditLog(db, user, 'user.edit', { targetId: req.studentId, targetName: req.studentName, detail: `Credential request (dept_program) approved` });

      } else if (req.type === 'student_id') {
        // Student ID: doc ID IS the student ID, so we must copy to new doc + delete old
        const newId = req.requested.studentId;
        if (!newId) throw new Error('No new studentId in request');
        // 1. Read the current user doc — try by doc ID first, then fall back to email query
        let oldSnap = await getDoc(doc(db, 'users', req.studentId));
        if (!oldSnap.exists() && req.email) {
          // Fallback: studentId field in the request may be stale; look up by email
          const emailQ = await getDocs(query(collection(db, 'users'), where('email', '==', req.email), limit(1)));
          if (!emailQ.empty) oldSnap = emailQ.docs[0] as any;
        }
        if (!oldSnap.exists()) throw new Error(`User doc not found for ID "${req.studentId}" or email "${req.email}"`);
        const oldData  = oldSnap.data();
        const actualDocId = oldSnap.id; // use the real Firestore doc ID, not req.studentId
        // 2. Write to new doc with updated ID fields
        await setDoc(doc(db, 'users', newId), { ...oldData, id: newId }); // write new doc
        // 3. Cascade-update all library_logs (static imports — no dynamic import())
        try {
          const logsSnap = await getDocs(
            query(collection(db, 'library_logs'), where('studentId', '==', actualDocId), limit(500))
          );
          if (!logsSnap.empty) {
            const batch = writeBatch(db);
            logsSnap.docs.forEach(logDoc => batch.update(logDoc.ref, { studentId: newId }));
            await batch.commit();
          }
        } catch (cascadeErr) {
          console.warn('[CredentialRequestsTab] cascade log update failed:', cascadeErr);
        }

        // 4. Delete old user doc
        await deleteDoc(doc(db, 'users', actualDocId)); // delete using actual doc ID
        // 4. Update request as approved
        await updateDoc(ref, { status: 'approved', updatedAt: new Date().toISOString() });
        await sendStudentNotif(newId, `Your Student ID change request has been approved. Your new ID is ${newId}. Please use this ID to log in going forward.`);
        writeAuditLog(db, user, 'user.edit', { targetId: newId, targetName: req.studentName, detail: `Student ID changed from ${req.studentId} to ${newId}` });
      }

      toast({ title: 'Request Approved', description: 'Student has been notified.' });
      onDone();
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
      await sendStudentNotif(req.studentId, `Your credential change request has been revoked. Reason: ${reason}`);
      writeAuditLog(db, user, 'user.edit', { targetId: req.studentId, targetName: req.studentName, detail: `Credential request revoked: ${reason}` });
      toast({ title: 'Request Revoked', description: 'Student has been notified.' });
      onDone();
    } catch (err: any) {
      const msg = err?.message || err?.code || 'Unknown error';
      console.error('[handleRevoke]', msg, err);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleToggleVerified = async () => {
    await updateDoc(doc(db, 'credential_requests', req.id), {
      verified: !req.verified,
      status: !req.verified ? 'pending' : 'pending_verification',
      updatedAt: new Date().toISOString(),
    });
    toast({ title: !req.verified ? 'Marked as Verified' : 'Verification removed' });
    onDone();
  };

  const canApprove = !req.requiresVerification || req.verified;

  return (
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
                <button onClick={handleToggleVerified}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95"
                  style={req.verified
                    ? { background: 'white', borderColor: '#d1fae5', color: '#059669' }
                    : { background: navy, color: 'white', border: 'none' }}>
                  {req.verified ? 'Undo' : 'Mark Verified'}
                </button>
              </div>
            </div>
          )}

          {/* Granular name field approval */}
          {req.type === 'name' && !revoking && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Select fields to approve</p>
              {([
                { key: 'firstName',  label: 'First Name',  val: approveFirst,  set: setApproveFirst  },
                { key: 'middleName', label: 'Middle Name', val: approveMiddle, set: setApproveMiddle },
                { key: 'lastName',   label: 'Last Name',   val: approveLast,   set: setApproveLast   },
              ] as const).map(f => {
                const changed = req.requested[f.key] !== req.current[f.key];
                return (
                  <button key={f.key} onClick={() => changed && f.set(!f.val)}
                    disabled={!changed}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all"
                    style={{ borderColor: f.val && changed ? navy : '#e2e8f0', background: f.val && changed ? `${navy}06` : '#fafafa', opacity: changed ? 1 : 0.45 }}>
                    {f.val && changed ? <CheckSquare size={16} style={{ color: navy }} /> : <Square size={16} className="text-slate-300" />}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-slate-500 uppercase">{f.label}</span>
                      <p className="text-sm">
                        <span className="text-slate-400 line-through mr-2">{req.current[f.key] || '—'}</span>
                        <span className="font-bold text-slate-900">{req.requested[f.key] || '—'}</span>
                      </p>
                    </div>
                  </button>
                );
              })}
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
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────
export function CredentialRequestsTab() {
  const db = useFirestore();
  const [search,      setSearch]      = useState('');
  const [typeFilter,  setTypeFilter]  = useState('all');
  const [statusFilter,setStatusFilter]= useState('all');
  const [reviewing,   setReviewing]   = useState<CredentialRequest | null>(null);

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
            <SelectTrigger className="h-9 w-40 bg-slate-50 border-slate-200 rounded-xl text-xs font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="text-xs font-semibold">All Types</SelectItem>
              <SelectItem value="name" className="text-xs font-semibold">Name Change</SelectItem>
              <SelectItem value="student_id" className="text-xs font-semibold">Student ID</SelectItem>
              <SelectItem value="dept_program" className="text-xs font-semibold">Dept / Program</SelectItem>
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
                {filtered.map(req => {
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