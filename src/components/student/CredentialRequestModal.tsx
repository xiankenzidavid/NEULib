"use client";

import { useState } from 'react';
import { format } from 'date-fns';
import { X, FileEdit, IdCard, GraduationCap, User, ChevronRight, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, addDoc, query, where, doc, setDoc } from 'firebase/firestore';
import { credentialRequestId } from '@/lib/firestore-ids';
import { UserRecord, DEPARTMENTS, ProgramRecord } from '@/lib/firebase-schema';
import { formatStudentId } from '@/lib/student-id-formatter';
import { useToast } from '@/hooks/use-toast';
import { SuccessCard } from '@/components/ui/SuccessCard';

interface Props {
  profile: UserRecord;
  onClose: () => void;
}

type RequestType = 'name' | 'student_id' | 'dept_program' | 'admin_privilege' | 'unblock_request' | null;

const navy = 'hsl(221,72%,22%)';

export function CredentialRequestModal({ profile, onClose }: Props) {
  const db = useFirestore();
  const { toast } = useToast();
  const [type,        setType]        = useState<RequestType>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [submittedType, setSubmittedType] = useState<RequestType>(null);

  // Name change fields
  const [newFirst,    setNewFirst]    = useState(profile.firstName  || '');
  const [newMiddle,   setNewMiddle]   = useState(profile.middleName || '');
  const [newLast,     setNewLast]     = useState(profile.lastName   || '');
  const [nameReason,  setNameReason]  = useState('');

  // ID change fields
  const [newId,       setNewId]       = useState('');
  const [idReason,    setIdReason]    = useState('');

  // Admin privilege fields
  const [adminPrivReason,  setAdminPrivReason]  = useState('');
  const [adminPrivPreset,  setAdminPrivPreset]  = useState('');
  const [newDept,     setNewDept]     = useState(profile.deptID  || '');
  const [newProgram,  setNewProgram]  = useState(profile.program || '');
  const [deptReason,  setDeptReason]  = useState('');

  // Unblock request fields
  const [unblockReason, setUnblockReason] = useState('');

  // Programs for selected dept
  const programsQ = useMemoFirebase(
    () => newDept ? query(collection(db, 'programs'), where('deptID', '==', newDept)) : null,
    [db, newDept]
  );
  const { data: programs } = useCollection<ProgramRecord>(programsQ);
  const sortedPrograms = (programs || []).sort((a, b) => a.code.localeCompare(b.code));

  // Departments
  const deptsRef = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: depts } = useCollection<{ deptID: string; departmentName: string }>(deptsRef);

  // Student ID auto-dash formatter — global utility ensures identical behaviour to Kiosk
  const handleIdChange = (raw: string) => setNewId(formatStudentId(raw));

  const handleSubmit = async () => {
    if (!type) return;
    setSubmitting(true);
    try {
      const base = {
        studentId:   profile.id,
        studentName: `${profile.firstName} ${profile.lastName}`,
        email:       profile.email,
        type,
        status:      'pending',
        createdAt:   new Date().toISOString(),
        updatedAt:   new Date().toISOString(),
      };

      if (type === 'name') {
        if (!nameReason.trim()) { toast({ title: 'Reason is required', variant: 'destructive' }); setSubmitting(false); return; }
        const credDocId = credentialRequestId();
        await setDoc(doc(db, 'credential_requests', credDocId), {
          ...base,
          requested: { firstName: newFirst.trim(), middleName: newMiddle.trim(), lastName: newLast.trim() },
          current:   { firstName: profile.firstName, middleName: profile.middleName || '', lastName: profile.lastName },
          reason:    nameReason.trim(),
          requiresVerification: true,
          verified: false,
        });
      } else if (type === 'student_id') {
        if (!newId.trim() || !/^\d{2}-\d{5}-\d{3}$/.test(newId.trim())) {
          toast({ title: 'Invalid format', description: 'Format: YY-XXXXX-ZZZ', variant: 'destructive' });
          setSubmitting(false); return;
        }
        if (!idReason.trim()) { toast({ title: 'Reason is required', variant: 'destructive' }); setSubmitting(false); return; }
        const credDocId = credentialRequestId();
        await setDoc(doc(db, 'credential_requests', credDocId), {
          ...base,
          requested: { studentId: newId.trim() },
          current:   { studentId: profile.id },
          reason:    idReason.trim(),
          requiresVerification: true,
          verified: false,
        });
      } else if (type === 'dept_program') {
        if (!newDept || !deptReason.trim()) { toast({ title: 'Department and reason are required', variant: 'destructive' }); setSubmitting(false); return; }
        const credDocId = credentialRequestId();
        await setDoc(doc(db, 'credential_requests', credDocId), {
          ...base,
          requested: { deptID: newDept, program: newProgram },
          current:   { deptID: profile.deptID || '', program: profile.program || '' },
          reason:    deptReason.trim(),
          requiresVerification: true,
          verified: false,
        });
      } else if (type === 'admin_privilege') {
        const reason = adminPrivPreset || adminPrivReason.trim();
        if (!reason) { toast({ title: 'Reason is required', variant: 'destructive' }); setSubmitting(false); return; }
        const credDocId = credentialRequestId();
        await setDoc(doc(db, 'credential_requests', credDocId), {
          ...base,
          type: 'admin_privilege',
          requested: { role: 'admin' },
          current:   { role: profile.role },
          reason,
          requiresVerification: true,
          verified: false,
        });
      } else if (type === 'unblock_request') {
        if (!unblockReason.trim()) { toast({ title: 'Reason is required', variant: 'destructive' }); setSubmitting(false); return; }
        const credDocId = credentialRequestId();
        await setDoc(doc(db, 'credential_requests', credDocId), {
          ...base,
          type: 'unblock_request',
          requested: { status: 'active' },
          current:   { status: profile.status },
          reason:    unblockReason.trim(),
        });
      }
      setSubmittedType(type);
      setSubmitted(true);
    } catch {
      toast({ title: 'Submission failed', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {submitted && (
        <SuccessCard
          title={submittedType === 'admin_privilege' ? 'Privilege Request Sent!' : 'Request Submitted!'}
          description={
            submittedType === 'admin_privilege'
              ? 'Your admin privilege request has been sent. Any active admin can review and approve it in the dashboard.'
              : 'Your request has been sent to the administrator for review. You go to Library Admin Office.'
          }
          onClose={onClose}
        />
      )}
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-slate-100"
          style={{ background: `${navy}08` }}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
              <FileEdit size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>
                Contact Admin
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">Changes & requests are subject to admin review</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* Step 1: Choose type */}
          {!type && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Select the type of request</p>
              {/* Blocked account banner — shown to blocked users only */}
              {profile.status === 'blocked' && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl text-xs font-medium"
                  style={{ background: 'rgba(254,242,242,0.8)', border: '1px solid rgba(220,38,38,0.2)', color: '#991b1b' }}>
                  <span className="text-base leading-none mt-0.5">🚫</span>
                  <div>
                    <p className="font-bold">Your account is currently blocked.</p>
                    <p className="mt-0.5 text-red-600">Only <strong>Request Unblock</strong> is available. Other requests are locked until your account is restored.</p>
                  </div>
                </div>
              )}
              {([
                { id: 'name',            icon: User,         label: 'Name Change',              desc: 'First, middle, or last name',                      blockedOnly: false },
                { id: 'student_id',      icon: IdCard,       label: 'Student ID Change',        desc: 'Requires physical verification at Admin Office',    blockedOnly: false },
                { id: 'dept_program',    icon: GraduationCap,label: 'Department / Program',     desc: 'Requires physical verification at Admin Office',    blockedOnly: false },
                { id: 'admin_privilege', icon: ShieldCheck,  label: 'Request Admin Privilege',  desc: 'Apply to become a library admin',                   blockedOnly: false },
                { id: 'unblock_request', icon: ShieldOff,    label: 'Request Unblock',          desc: 'Ask admin to restore your library access',          blockedOnly: true  },
              ] as const).map(opt => {
                const isBlocked = profile.status === 'blocked';
                // Blocked users can ONLY access unblock_request — all others are locked
                // Active users cannot access unblock_request (nothing to unblock)
                const isAccessible = isBlocked ? opt.id === 'unblock_request' : !opt.blockedOnly;
                const isUnblockBtn = opt.id === 'unblock_request';
                return (
                  <button key={opt.id}
                    onClick={() => isAccessible ? setType(opt.id) : undefined}
                    disabled={!isAccessible}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all"
                    style={{
                      borderColor: isUnblockBtn && isBlocked ? 'rgba(220,38,38,0.3)' : '#e2e8f0',
                      background:  isUnblockBtn && isBlocked ? 'rgba(254,242,242,0.5)' : undefined,
                      opacity:     !isAccessible ? 0.35 : 1,
                      cursor:      !isAccessible ? 'not-allowed' : 'pointer',
                    }}>
                    <div className="p-2.5 rounded-xl flex-shrink-0"
                      style={{
                        background: isUnblockBtn && isBlocked ? 'rgba(220,38,38,0.1)' : `${navy}0d`,
                        color:      isUnblockBtn && isBlocked ? '#dc2626' : navy,
                      }}>
                      <opt.icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm">{opt.label}</p>
                      <p className="text-xs font-medium mt-0.5"
                        style={{ color: isUnblockBtn && isBlocked ? '#ef4444' : '#94a3b8' }}>
                        {isBlocked && !isUnblockBtn ? 'Unavailable while account is blocked' : opt.desc}
                      </p>
                    </div>
                    {isAccessible && <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Name change form */}
          {type === 'name' && (
            <div className="space-y-4">
              <button onClick={() => setType(null)} className="text-xs font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1">
                ← Back
              </button>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Name Change Request</p>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700 space-y-1">
                <p className="font-bold">⚠ High-Security Request</p>
                <p>Bring your credentials (e.g. ID, COM). Visit the <strong>Library Admin Office</strong> for physical verification before this change can be approved.</p>
              </div>

              <div className="p-3 rounded-xl text-xs font-medium text-slate-500 bg-slate-50 border border-slate-100">
                Current: <span className="font-bold text-slate-800">{profile.firstName} {profile.middleName} {profile.lastName}</span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {[
                  { label: 'New First Name', val: newFirst,  set: setNewFirst,  ph: profile.firstName  || 'First name' },
                  { label: 'New Middle Name (optional)', val: newMiddle, set: setNewMiddle, ph: profile.middleName || 'Middle name' },
                  { label: 'New Last Name',  val: newLast,   set: setNewLast,   ph: profile.lastName   || 'Last name'  },
                ].map(f => (
                  <div key={f.label}>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">{f.label}</label>
                    <Input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                      className="h-10 rounded-xl bg-slate-50 border-slate-200 text-sm" />
                  </div>
                ))}
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Reason for Change <span className="text-red-400">*</span></label>
                  <textarea value={nameReason} onChange={e => setNameReason(e.target.value)} rows={3}
                    placeholder="e.g. Legal name change due to marriage, correction of typographical error..."
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium resize-none outline-none focus:border-blue-400"
                    style={{ lineHeight: '1.6' }} />
                </div>
              </div>
            </div>
          )}

          {/* Student ID change form */}
          {type === 'student_id' && (
            <div className="space-y-4">
              <button onClick={() => setType(null)} className="text-xs font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1">← Back</button>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Student ID Change</p>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700 space-y-1">
                <p className="font-bold">⚠ High-Security Request</p>
                <p>After submitting, you will be asked to visit the <strong>Admin Office</strong> for physical ID verification before this change can be approved.</p>
              </div>

              <div className="p-3 rounded-xl text-xs font-medium text-slate-500 bg-slate-50 border border-slate-100">
                Current ID: <span className="font-bold text-slate-800 font-mono">{profile.id}</span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">New Student ID <span className="text-red-400">*</span></label>
                <Input value={newId} onChange={e => handleIdChange(e.target.value)} placeholder="XX-YYYYY-ZZZ"
                  className="h-10 rounded-xl bg-slate-50 border-slate-200 text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Reason for Change <span className="text-red-400">*</span></label>
                <textarea value={idReason} onChange={e => setIdReason(e.target.value)} rows={3}
                  placeholder="e.g. Incorrect ID issued, transferred from another campus..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium resize-none outline-none focus:border-blue-400"
                  style={{ lineHeight: '1.6' }} />
              </div>
            </div>
          )}

          {/* Dept/Program change form */}
          {type === 'dept_program' && (
            <div className="space-y-4">
              <button onClick={() => setType(null)} className="text-xs font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1">← Back</button>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Department / Program Change</p>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700 space-y-1">
                <p className="font-bold">⚠ High-Security Request</p>
                <p>Visit the <strong>Admin Office</strong> for physical verification before this change can be approved.</p>
              </div>

              <div className="p-3 rounded-xl text-xs font-medium text-slate-500 bg-slate-50 border border-slate-100">
                Current: <span className="font-bold text-slate-800">{profile.deptID || '—'} · {profile.program || '—'}</span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">New Department <span className="text-red-400">*</span></label>
                <Select value={newDept} onValueChange={v => { setNewDept(v); setNewProgram(''); }}>
                  <SelectTrigger className="h-10 rounded-xl bg-slate-50 border-slate-200 text-sm font-semibold">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-60">
                    {(depts || []).sort((a, b) => a.deptID.localeCompare(b.deptID)).map(d => (
                      <SelectItem key={d.deptID} value={d.deptID} className="font-semibold text-sm">
                        <span className="font-bold mr-2 text-xs" style={{ color: navy }}>[{d.deptID}]</span>
                        {d.departmentName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">New Program</label>
                <Select value={newProgram} onValueChange={setNewProgram} disabled={!newDept}>
                  <SelectTrigger className="h-10 rounded-xl bg-slate-50 border-slate-200 text-sm font-semibold disabled:opacity-50">
                    <SelectValue placeholder={!newDept ? 'Select dept first' : 'Select program'} />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-60">
                    {sortedPrograms.map(p => (
                      <SelectItem key={p.code} value={p.code} className="font-semibold text-sm">
                        <span className="font-bold mr-2 text-xs font-mono" style={{ color: navy }}>{p.code}</span>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Reason for Change <span className="text-red-400">*</span></label>
                <textarea value={deptReason} onChange={e => setDeptReason(e.target.value)} rows={3}
                  placeholder="e.g. Transferred to a different college, wrong program enrolled..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium resize-none outline-none focus:border-blue-400"
                  style={{ lineHeight: '1.6' }} />
              </div>
            </div>
          )}

          {/* ── Admin Privilege Request form ── */}
          {type === 'admin_privilege' && (
            <div className="space-y-4">
              <button onClick={() => setType(null)} className="text-xs font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1">← Back</button>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Request Admin Privilege</p>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700 space-y-1">
                <p className="font-bold">⚠ High-Security Request</p>
                <p>Bring your credentials (e.g. ID, COM). Visit the <strong>Library Admin Office</strong> for physical verification before this change can be approved.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Reason <span className="text-red-400">*</span></label>
                {([
                  'I have been blocked from admin access',
                  'Applying as a new Library Admin',
                  'My admin account was accidentally removed',
                  'I was assigned as a Library Staff',
                ] as const).map(preset => (
                  <button key={preset} onClick={() => setAdminPrivPreset(p => p === preset ? '' : preset)}
                    className="w-full text-left p-3 rounded-xl border text-sm font-medium transition-all"
                    style={{
                      borderColor: adminPrivPreset === preset ? navy : '#e2e8f0',
                      background:  adminPrivPreset === preset ? `${navy}07` : '#fafafa',
                      color: '#1e293b',
                    }}>
                    {preset}
                  </button>
                ))}
                <textarea
                  value={adminPrivReason}
                  onChange={e => { setAdminPrivReason(e.target.value); setAdminPrivPreset(''); }}
                  rows={2}
                  placeholder="Or write your own reason…"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium resize-none outline-none focus:border-blue-400"
                  style={{ lineHeight: '1.6' }}
                />
              </div>
            </div>
          )}

          {/* Unblock request form — only reachable when profile.status === 'blocked' */}
          {type === 'unblock_request' && (
            <div className="space-y-4">
              <button onClick={() => setType(null)} className="text-xs font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1">← Back</button>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#dc2626' }}>Request Account Unblock</p>

              {/* Info banner */}
              <div className="p-3 rounded-xl text-xs font-medium border space-y-1.5"
                style={{ background: 'rgba(254,242,242,0.6)', borderColor: 'rgba(220,38,38,0.2)', color: '#991b1b' }}>
                <p className="font-bold">Your account is currently blocked.</p>
                <p>Submitting this request will notify the Library Admin. They can review and unblock your account directly from the Requests tab in the dashboard.</p>
              </div>

              {/* Account info — auto-pulled from profile, read-only */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1 text-xs">
                <p className="font-bold text-slate-600 uppercase tracking-wide text-[10px]">Account being unblocked</p>
                <p className="font-semibold text-slate-800">{profile.firstName} {profile.lastName}</p>
                <p className="font-mono text-slate-500">{profile.id}  ·  {profile.email}</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                  Reason for unblock request <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={unblockReason}
                  onChange={e => setUnblockReason(e.target.value)}
                  rows={3}
                  placeholder="Explain why you believe your account should be unblocked…"
                  className="w-full px-3 py-2.5 rounded-xl border text-sm font-medium resize-none outline-none"
                  style={{ borderColor: 'rgba(220,38,38,0.3)', background: '#fff', lineHeight: '1.6' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} disabled={submitting}
            className="flex-1 h-11 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">
            Cancel
          </button>
          {type && (
            <button onClick={handleSubmit} disabled={submitting}
              className="flex-1 h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
              style={{ background: type === 'unblock_request' ? '#dc2626' : navy }}>
              {submitting ? <><Loader2 size={15} className="animate-spin" /> Submitting…</> : type === 'unblock_request' ? 'Send Unblock Request' : 'Submit Request'}
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  );
}