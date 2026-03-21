"use client";

import { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Clock, CheckCircle, Edit3, Trash2, Loader2, ShieldAlert, GraduationCap, Building2, Search, RotateCcw, Bug } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking, updateDocumentNonBlocking, useUser } from '@/firebase';
import { collection, doc, query, where, getDocs, setDoc, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { UserRecord, DepartmentRecord, ProgramRecord, formatFullName } from '@/lib/firebase-schema';
import { format } from 'date-fns';
import { SuccessCard } from '@/components/ui/SuccessCard';

interface Props { isSuperAdmin?: boolean | null; }

const navy = 'hsl(221,72%,22%)';

export function TemporaryVisitorManagement({ isSuperAdmin }: Props) {
  const [search, setSearch] = useState('');
  const [deptFilter,    setDeptFilter]    = useState('all');
  const [programFilter, setProgramFilter] = useState('all');
  const [sortField,     setSortField]     = useState<'name' | 'date' | 'dept'>('date');
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('desc');
  const [editingVisitor,   setEditingVisitor]   = useState<UserRecord | null>(null);
  const [isEditOpen,       setIsEditOpen]       = useState(false);
  const [visitorToDelete,  setVisitorToDelete]  = useState<UserRecord | null>(null);
  const [isDeleteOpen,     setIsDeleteOpen]     = useState(false);
  const [isApproving,      setIsApproving]      = useState<string | null>(null);
  const [successCard,      setSuccessCard]      = useState<{ title: string; description: string; color?: 'green' | 'navy' | 'amber' } | null>(null);

  // Edit form fields
  const [editFirstName,  setEditFirstName]  = useState('');
  const [editMiddleName, setEditMiddleName] = useState('');
  const [editLastName,   setEditLastName]   = useState('');
  const [editDeptId,     setEditDeptId]     = useState('');
  const [editProgram,    setEditProgram]    = useState('');

  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();

  const deptRef     = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: dbDepartments } = useCollection<DepartmentRecord>(deptRef);

  // All programs (for filter dropdown — scoped to selected dept)
  const allProgramsRef = useMemoFirebase(() => collection(db, 'programs'), [db]);
  const { data: allPrograms } = useCollection<ProgramRecord>(allProgramsRef);
  const availablePrograms = useMemo(() => {
    if (deptFilter === 'all' || !allPrograms) return [];
    return allPrograms.filter(p => p.deptID === deptFilter).sort((a, b) => a.code.localeCompare(b.code));
  }, [deptFilter, allPrograms]);

  const programsRef = useMemoFirebase(
    () => editDeptId ? query(collection(db, 'programs'), where('deptID', '==', editDeptId)) : null,
    [db, editDeptId]
  );
  const { data: deptPrograms } = useCollection<ProgramRecord>(programsRef);
  const sortedPrograms = (deptPrograms || []).sort((a, b) => a.code.localeCompare(b.code));

  // Query /users where role = visitor
  const visitorsRef = useMemoFirebase(
    () => query(collection(db, 'users'), where('role', '==', 'visitor')),
    [db]
  );
  const { data: visitors, isLoading } = useCollection<UserRecord>(visitorsRef);

  const isFiltersDirty = useMemo(() => 
    search.trim() !== '' || deptFilter !== 'all' || programFilter !== 'all',
    [search, deptFilter, programFilter]
  );

  const handleReset = () => {
    setSearch('');
    setDeptFilter('all');
    setProgramFilter('all');
  };

  const filtered = useMemo(() => {
    let list = (visitors || []);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(v =>
        `${v.firstName} ${v.lastName}`.toLowerCase().includes(s) ||
        (v.email || '').toLowerCase().includes(s) ||
        (v.id || '').toLowerCase().includes(s) ||
        (v.deptID || '').toLowerCase().includes(s)
      );
    }
    if (deptFilter !== 'all') list = list.filter(v => v.deptID === deptFilter);
    if (programFilter !== 'all') list = list.filter(v => v.program === programFilter);
    list = [...list].sort((a, b) => {
      let va = '', vb = '';
      if (sortField === 'name') { va = `${a.lastName}${a.firstName}`; vb = `${b.lastName}${b.firstName}`; }
      else if (sortField === 'dept') { va = a.deptID || ''; vb = b.deptID || ''; }
      else { va = a.addedAt || ''; vb = b.addedAt || ''; }
      const cmp = va.localeCompare(vb);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [visitors, search, deptFilter, programFilter, sortField, sortDir]);

  const openEdit = (v: UserRecord) => {
    setEditingVisitor(v);
    setEditFirstName(v.firstName || '');
    setEditMiddleName(v.middleName || '');
    setEditLastName(v.lastName || '');
    setEditDeptId(v.deptID || '');
    setEditProgram(v.program || '');
    setIsEditOpen(true);
  };

  // Helper: force checkout all active sessions for a given student ID
  const forceCheckoutActiveSessions = async (studentId: string) => {
    console.log('=== FORCE CHECKOUT DEBUG ===');
    console.log('Student ID:', studentId);
    console.log('Admin user email:', user?.email);
    
    try {
      const possibleIds = [
        studentId,
        studentId.replace(/-/g, ''),
        studentId.split('-')[0] + studentId.split('-')[1] + studentId.split('-')[2],
        studentId.split('-')[0] + '-' + studentId.split('-')[1] + studentId.split('-')[2],
      ];
      
      let foundSessions = false;
      
      for (const idFormat of possibleIds) {
        console.log(`🔍 Trying ID format: "${idFormat}"`);
        
        const allLogsQuery = query(
          collection(db, 'library_logs'),
          where('studentId', '==', idFormat)
        );
        const allLogsSnap = await getDocs(allLogsQuery);
        console.log(`   Found ${allLogsSnap.size} total logs`);
        
        const activeLogs = allLogsSnap.docs.filter(doc => {
          const data = doc.data();
          const isActive = !data.checkOutTimestamp || data.checkOutTimestamp === '';
          if (isActive) {
            console.log(`   Active session found: ${doc.id}, checkOutTimestamp: ${data.checkOutTimestamp}`);
          }
          return isActive;
        });
        
        console.log(`   Active sessions: ${activeLogs.length}`);
        
        if (activeLogs.length > 0) {
          console.log(`✅ Found ${activeLogs.length} active sessions with ID format: ${idFormat}`);
          const now = new Date().toISOString();
          for (const logDoc of activeLogs) {
            const logData = logDoc.data();
            console.log(`   Updating session: ${logDoc.id}`);
            console.log(`   Checked in at: ${logData.checkInTimestamp}`);
            console.log(`   Current checkOutTimestamp: ${logData.checkOutTimestamp || 'NULL/EMPTY'}`);
            console.log(`   Setting checkout to: ${now}`);
            
            await updateDocumentNonBlocking(doc(db, 'library_logs', logDoc.id), {
              checkOutTimestamp: now,
            });
            console.log(`   ✅ Updated ${logDoc.id}`);
          }
          foundSessions = true;
          break;
        }
      }
      
      if (!foundSessions) {
        console.log('❌ No active sessions found for any ID format');
      }
      
    } catch (error) {
      console.error('❌ Force checkout error:', error);
    }
    console.log('=== END DEBUG ===\n');
  };

  // ── PROMOTE (Approve) visitor to student ───────────────────────────────────
  // NOTE: Promoting should NOT terminate active sessions.
  const handleApprove = async (v: UserRecord) => {
    if (!v.deptID) {
      toast({ title: 'Assign Department First', description: 'Edit the record and assign a college.', variant: 'destructive' });
      openEdit(v); return;
    }
    if (!v.id || v.id.startsWith('TEMP-') || !/^\d{2}-\d{5}-\d{3}$/.test(v.id)) {
      toast({
        title: 'Student ID Missing',
        description: 'The student has not completed their registration. Ask them to log in via Student Portal and enter their Student ID.',
        variant: 'destructive',
      });
      return;
    }

    setIsApproving(v.id);
    try {
      // ✅ PROMOTE: DO NOT force checkout — user should stay checked in
      // No call to forceCheckoutActiveSessions here

      // Promote in place — update role and status
      await setDoc(doc(db, 'users', v.id), {
        ...v,
        role:   'student',
        status: 'active',
      }, { merge: true });

      // Update any existing logs that used this student ID
      const logSnap = await getDocs(query(collection(db, 'library_logs'), where('studentId', '==', v.id)));
      logSnap.forEach((logDoc: QueryDocumentSnapshot<DocumentData>) => {
        updateDocumentNonBlocking(doc(db, 'library_logs', logDoc.id), {
          deptID:      v.deptID,
          studentName: `${(v.lastName || '').toUpperCase()}, ${v.firstName}`,
        });
      });

      setSuccessCard({
        title: 'Student Activated!',
        description: `${v.firstName} ${v.lastName} is now a verified student with full library access.`,
        color: 'green',
      });
    } catch {
      toast({ title: 'Promotion Failed', variant: 'destructive' });
    } finally {
      setIsApproving(null);
    }
  };

  // ── SAVE edits (just updating metadata) ──────────────────────────────────
  const saveEdits = () => {
    if (!editingVisitor) return;
    updateDocumentNonBlocking(doc(db, 'users', editingVisitor.id), {
      firstName:  editFirstName.trim(),
      middleName: editMiddleName.trim(),
      lastName:   editLastName.trim(),
      deptID:     editDeptId,
      program:    editProgram,
    });
    setIsEditOpen(false);
    setSuccessCard({ title: 'Record Updated', description: 'The visitor profile has been saved successfully.', color: 'navy' });
  };

  // ── DELETE visitor ─────────────────────────────────────────────────────────
  // NOTE: Deleting a user should terminate any active sessions.
  const confirmDelete = async () => {
    if (!visitorToDelete) return;
    // ✅ DELETE: Force checkout before deleting user
    await forceCheckoutActiveSessions(visitorToDelete.id);
    deleteDocumentNonBlocking(doc(db, 'users', visitorToDelete.id));
    setSuccessCard({ title: 'Visitor Removed', description: 'The pending visitor record has been deleted.', color: 'amber' });
    setIsDeleteOpen(false);
  };

  const thStyle = "text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 py-3";

  return (
    <>
      {successCard && (
        <SuccessCard
          title={successCard.title}
          description={successCard.description}
          color={successCard.color}
          onClose={() => setSuccessCard(null)}
        />
      )}
    <div className="space-y-4">
      {/* Header card */}
      <div className="school-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
                <Clock size={17} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
                  Pending Visitors
                </h3>
                <p className="text-slate-400 text-sm font-medium mt-0.5">
                  {filtered.length} awaiting verification
                  {isFiltersDirty && (
                    <button onClick={handleReset}
                      className="ml-2 inline-flex items-center gap-1 h-6 px-2 rounded-lg text-[10px] font-bold border transition-all active:scale-95"
                      style={{background:'rgba(220,38,38,0.06)',color:'#dc2626',borderColor:'rgba(220,38,38,0.18)'}}>
                      <RotateCcw size={9}/> Reset
                    </button>
                  )}
                </p>
              </div>
            </div>
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search name, ID, email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 w-52 bg-slate-50 border-slate-200 rounded-xl text-sm"
              />
            </div>
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Dept */}
            <Select value={deptFilter} onValueChange={v => { setDeptFilter(v); setProgramFilter('all'); }}>
              <SelectTrigger className="h-8 w-36 bg-slate-50 border-slate-200 rounded-xl text-xs font-bold">
                <span>{deptFilter === 'all' ? 'All Colleges' : deptFilter}</span>
              </SelectTrigger>
              <SelectContent className="rounded-xl max-h-60">
                <SelectItem value="all" className="text-xs font-semibold">All Colleges</SelectItem>
                {(dbDepartments || []).sort((a, b) => a.deptID.localeCompare(b.deptID)).map(d => (
                  <SelectItem key={d.deptID} value={d.deptID} className="text-xs font-semibold">
                    <span className="font-bold mr-1" style={{ color: navy }}>[{d.deptID}]</span>{d.departmentName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Program */}
            <Select value={programFilter} onValueChange={setProgramFilter} disabled={deptFilter === 'all' || availablePrograms.length === 0}>
              <SelectTrigger className="h-8 w-36 bg-slate-50 border-slate-200 rounded-xl text-xs font-bold disabled:opacity-50">
                <span>{programFilter === 'all' ? 'All Programs' : programFilter}</span>
              </SelectTrigger>
              <SelectContent className="rounded-xl max-h-60">
                <SelectItem value="all" className="text-xs font-semibold">All Programs</SelectItem>
                {availablePrograms.map(p => (
                  <SelectItem key={p.code} value={p.code} className="text-xs font-semibold">
                    <span className="font-bold mr-1 whitespace-nowrap inline-block" style={{ color: navy, fontFamily: "'DM Mono',monospace" }}>{p.code}</span>{' '}{p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 ml-auto">
              {([
                { f: 'date' as const, label: 'Date' },
                { f: 'name' as const, label: 'Name' },
                { f: 'dept' as const, label: 'Dept' },
              ]).map(opt => (
                <button key={opt.f}
                  onClick={() => {
                    if (sortField === opt.f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                    else { setSortField(opt.f); setSortDir('asc'); }
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
                  style={sortField === opt.f ? { background: navy, color: 'white' } : { color: '#64748b' }}>
                  {opt.label}
                  {sortField === opt.f && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={20} />
            <span className="text-sm font-medium">Loading...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-slate-400 text-sm font-medium">No pending visitors.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100">
                  <TableHead className={`pl-5 ${thStyle}`}>Visitor</TableHead>
                  <TableHead className={thStyle}>Student ID</TableHead>
                  <TableHead className={thStyle}>Email</TableHead>
                  <TableHead className={thStyle}>Dept</TableHead>
                  <TableHead className={`hidden md:table-cell ${thStyle}`}>Program</TableHead>
                  <TableHead className={`hidden sm:table-cell ${thStyle}`}>Requested</TableHead>
                  <TableHead className={`text-right pr-5 ${thStyle}`}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(v => {
                  const hasRealId = !!v.id && !v.id.startsWith('TEMP-') && /^\d{2}-\d{5}-\d{3}$/.test(v.id);
                  return (
                    <TableRow key={v.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors" style={{ height: '68px' }}>

                      {/* Name */}
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg,hsl(43,85%,50%),hsl(38,90%,40%))' }}>
                            {(v.firstName || 'V')[0]}{(v.lastName || 'V')[0]}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">
                              {(v.lastName || '').toUpperCase()}, {v.firstName}
                            </p>
                            {v.middleName && <p className="text-slate-400 text-xs">{v.middleName}</p>}
                          </div>
                        </div>
                      </TableCell>

                      {/* Student ID */}
                      <TableCell>
                        {hasRealId ? (
                          <span className="font-bold text-xs px-2.5 py-1 rounded-lg font-mono"
                            style={{ background: `${navy}0d`, color: navy }}>
                            {v.id}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                            Not set
                          </span>
                        )}
                      </TableCell>

                      {/* Email */}
                      <TableCell>
                        <span className="text-slate-500 text-xs font-medium truncate max-w-[160px] block">
                          {v.email}
                        </span>
                      </TableCell>

                      {/* Dept */}
                      <TableCell>
                        {v.deptID ? (
                          <span className="font-bold text-xs px-2.5 py-1.5 rounded-lg"
                            style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                            {v.deptID}
                          </span>
                        ) : (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                            PENDING
                          </span>
                        )}
                      </TableCell>

                      {/* Program */}
                      <TableCell className="hidden md:table-cell">
                        {v.program ? (
                          <span className="font-bold text-xs px-2.5 py-1 rounded-lg"
                            style={{ background: 'hsl(262,83%,58%,0.1)', color: 'hsl(262,83%,45%)', fontFamily: "'DM Mono',monospace" }}>
                            {v.program}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </TableCell>

                      {/* Date */}
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-xs text-slate-400 font-medium">
                          {v.addedAt ? format(new Date(v.addedAt), 'MMM d, h:mm a') : '—'}
                        </span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right pr-5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => openEdit(v)}
                            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-all active:scale-95">
                            <Edit3 size={16} />
                          </button>

                          {isSuperAdmin ? (
                            <>
                              <button onClick={() => { setVisitorToDelete(v); setIsDeleteOpen(true); }}
                                className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all active:scale-95">
                                <Trash2 size={16} />
                              </button>
                              <button onClick={() => handleApprove(v)} disabled={isApproving === v.id}
                                className="h-9 px-3 rounded-xl font-semibold text-xs flex items-center gap-1.5 text-white transition-all active:scale-95 disabled:opacity-50"
                                style={{ background: 'linear-gradient(135deg,#059669,#047857)' }}>
                                {isApproving === v.id
                                  ? <Loader2 size={13} className="animate-spin" />
                                  : <CheckCircle size={13} />}
                                Promote
                              </button>
                            </>
                          ) : (
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-400 flex items-center gap-1">
                              <ShieldAlert size={11} /> SuperAdmin only
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

      {/* ── Edit Dialog ── */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[560px] border-none p-0 overflow-hidden" style={{ borderRadius: '1.25rem' }}>
          <div className="px-7 py-5 text-white" style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,32%))` }}>
            <DialogTitle className="text-xl font-bold text-white" style={{ fontFamily: "'Playfair Display',serif" }}>
              Edit Visitor Profile
            </DialogTitle>
            <DialogDescription className="text-white/55 text-xs mt-1 uppercase tracking-widest font-medium">
              Assign academic information before promoting
            </DialogDescription>
          </div>

          <div className="p-6 space-y-4 bg-white">
            {/* Name */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'First Name',  val: editFirstName,  set: setEditFirstName  },
                { label: 'Middle Name', val: editMiddleName, set: setEditMiddleName },
                { label: 'Last Name',   val: editLastName,   set: setEditLastName   },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-slate-400 font-bold text-xs mb-1.5 uppercase tracking-wide">{f.label}</p>
                  <Input value={f.val} onChange={e => f.set(e.target.value)}
                    className="h-10 rounded-xl border-slate-200 bg-slate-50 text-sm font-medium" />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-slate-400 font-bold text-xs uppercase tracking-wide flex items-center gap-1.5">
                <GraduationCap size={11} /> Academic Info
              </span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>

            {/* Department */}
            <div>
              <p className="text-slate-400 font-bold text-xs mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <Building2 size={11} /> College / Department
              </p>
              <Select value={editDeptId} onValueChange={v => { setEditDeptId(v); setEditProgram(''); }}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50 font-semibold text-sm">
                  <SelectValue placeholder="Select College" />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-64">
                  {dbDepartments?.map(d => (
                    <SelectItem key={d.deptID} value={d.deptID} className="font-semibold text-sm">
                      <span className="font-bold mr-2 text-xs" style={{ color: navy }}>[{d.deptID}]</span>
                      {d.departmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Program */}
            <div>
              <p className="text-slate-400 font-bold text-xs mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <GraduationCap size={11} /> Program
                {!editDeptId && <span className="text-amber-500 ml-1 font-normal normal-case">(Select Department first)</span>}
              </p>
              <Select value={editProgram} onValueChange={setEditProgram} disabled={!editDeptId}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50 font-semibold text-sm disabled:opacity-50">
                  <SelectValue placeholder={!editDeptId ? 'Select a department first' : 'Select Program'} />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-64">
                  {sortedPrograms.map(p => (
                    <SelectItem key={p.code} value={p.code} className="font-semibold text-sm py-2">
                      <span className="font-bold mr-2 text-xs px-1.5 py-0.5 rounded"
                        style={{ background: `${navy}08`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                        {p.code}
                      </span>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex-row gap-2">
            <button onClick={() => setIsEditOpen(false)}
              className="flex-1 h-11 rounded-xl font-semibold text-sm border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all active:scale-95">
              Cancel
            </button>
            <button onClick={saveEdits}
              className="flex-1 h-11 rounded-xl font-semibold text-sm text-white transition-all active:scale-95"
              style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,32%))` }}>
              Save Changes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Alert ── */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="rounded-2xl p-6 w-[calc(100vw-2rem)] max-w-sm mx-auto border-red-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 font-bold text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>
              Remove Visitor
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 text-sm leading-relaxed">
              Remove <strong>{visitorToDelete?.firstName} {visitorToDelete?.lastName}</strong> from the pending queue? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-4 flex-row gap-2">
            <AlertDialogCancel className="flex-1 rounded-xl h-11 font-semibold text-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="flex-1 bg-red-600 text-white rounded-xl h-11 font-semibold text-sm">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </>
  );
}