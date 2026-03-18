"use client";

import { useState } from 'react';
import { format } from 'date-fns';
import { X, FileEdit, IdCard, GraduationCap, User, ChevronRight, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, addDoc, query, where } from 'firebase/firestore';
import { UserRecord, DEPARTMENTS, ProgramRecord } from '@/lib/firebase-schema';
import { formatStudentId } from '@/lib/student-id-formatter';
import { useToast } from '@/hooks/use-toast';

interface Props {
  profile: UserRecord;
  onClose: () => void;
}

type RequestType = 'name' | 'student_id' | 'dept_program' | null;

const navy = 'hsl(221,72%,22%)';

export function CredentialRequestModal({ profile, onClose }: Props) {
  const db = useFirestore();
  const { toast } = useToast();
  const [type,        setType]        = useState<RequestType>(null);
  const [submitting,  setSubmitting]  = useState(false);

  // Name change fields
  const [newFirst,    setNewFirst]    = useState(profile.firstName  || '');
  const [newMiddle,   setNewMiddle]   = useState(profile.middleName || '');
  const [newLast,     setNewLast]     = useState(profile.lastName   || '');
  const [nameReason,  setNameReason]  = useState('');

  // ID change fields
  const [newId,       setNewId]       = useState('');
  const [idReason,    setIdReason]    = useState('');

  // Dept/Program change fields
  const [newDept,     setNewDept]     = useState(profile.deptID  || '');
  const [newProgram,  setNewProgram]  = useState(profile.program || '');
  const [deptReason,  setDeptReason]  = useState('');

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
        await addDoc(collection(db, 'credential_requests'), {
          ...base,
          requested: { firstName: newFirst.trim(), middleName: newMiddle.trim(), lastName: newLast.trim() },
          current:   { firstName: profile.firstName, middleName: profile.middleName || '', lastName: profile.lastName },
          reason:    nameReason.trim(),
        });
      } else if (type === 'student_id') {
        if (!newId.trim() || !/^\d{2}-\d{5}-\d{3}$/.test(newId.trim())) {
          toast({ title: 'Invalid format', description: 'Format: YY-XXXXX-ZZZ', variant: 'destructive' });
          setSubmitting(false); return;
        }
        if (!idReason.trim()) { toast({ title: 'Reason is required', variant: 'destructive' }); setSubmitting(false); return; }
        await addDoc(collection(db, 'credential_requests'), {
          ...base,
          requested: { studentId: newId.trim() },
          current:   { studentId: profile.id },
          reason:    idReason.trim(),
          requiresVerification: true,
          verified: false,
        });
      } else if (type === 'dept_program') {
        if (!newDept || !deptReason.trim()) { toast({ title: 'Department and reason are required', variant: 'destructive' }); setSubmitting(false); return; }
        await addDoc(collection(db, 'credential_requests'), {
          ...base,
          requested: { deptID: newDept, program: newProgram },
          current:   { deptID: profile.deptID || '', program: profile.program || '' },
          reason:    deptReason.trim(),
          requiresVerification: true,
          verified: false,
        });
      }

      toast({ title: 'Request Submitted', description: 'Your request has been sent to the administrator for review.' });
      onClose();
    } catch {
      toast({ title: 'Submission failed', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
                Request Credential Change
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">Changes are subject to admin review</p>
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
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Select the type of change</p>
              {([
                { id: 'name',        icon: User,         label: 'Name Change',           desc: 'First, middle, or last name' },
                { id: 'student_id',  icon: IdCard,       label: 'Student ID Change',     desc: 'Requires physical verification at Admin Office' },
                { id: 'dept_program',icon: GraduationCap,label: 'Department / Program',  desc: 'Requires physical verification at Admin Office' },
              ] as const).map(opt => (
                <button key={opt.id} onClick={() => setType(opt.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all hover:border-blue-200 hover:bg-blue-50/30 active:scale-[0.99]"
                  style={{ borderColor: '#e2e8f0' }}>
                  <div className="p-2.5 rounded-xl flex-shrink-0" style={{ background: `${navy}0d`, color: navy }}>
                    <opt.icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-sm">{opt.label}</p>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">{opt.desc}</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Name change form */}
          {type === 'name' && (
            <div className="space-y-4">
              <button onClick={() => setType(null)} className="text-xs font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1">
                ← Back
              </button>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Name Change Request</p>

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
                <Input value={newId} onChange={e => handleIdChange(e.target.value)} placeholder="YY-XXXXX-ZZZ"
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
              style={{ background: navy }}>
              {submitting ? <><Loader2 size={15} className="animate-spin" /> Submitting…</> : 'Submit Request'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}