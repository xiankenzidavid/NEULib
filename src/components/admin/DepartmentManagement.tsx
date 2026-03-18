"use client";

import { useState, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Building2, Plus, Trash2, Loader2, Search, DatabaseBackup,
  ChevronRight, ChevronDown, GraduationCap, X, Edit2, Check, Save,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useFirestore, useCollection, useMemoFirebase,
  setDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking,
} from '@/firebase';
import { setDoc, collection, doc, query, where } from 'firebase/firestore';
import {
  DepartmentRecord, ProgramRecord, DEPARTMENTS, getProgramSeedData,
} from '@/lib/firebase-schema';

const navy = 'hsl(221,72%,22%)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.96)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.88)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1rem',
};

export function DepartmentManagement() {
  // Dept form state
  const [newDeptId,    setNewDeptId]    = useState('');
  const [newDeptName,  setNewDeptName]  = useState('');
  const [searchTerm,   setSearchTerm]   = useState('');
  const [isSeeding,    setIsSeeding]    = useState(false);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

  // Program add form state (per dept)
  const [newProgName, setNewProgName] = useState('');
  const [newProgCode, setNewProgCode] = useState('');

  // Program edit state
  const [editingProgId,   setEditingProgId]   = useState<string | null>(null);
  const [editProgName,    setEditProgName]     = useState('');
  const [editProgCode,    setEditProgCode]     = useState('');
  // ── Confirmation modal state ─────────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean; type: 'dept' | 'program'; id: string; name: string;
  } | null>(null);

  const { toast } = useToast();
  const db = useFirestore();

  // ── Firestore collections ──
  const deptRef = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: depts, isLoading: isDepsLoading } = useCollection<DepartmentRecord>(deptRef);

  const programsRef = useMemoFirebase(() => collection(db, 'programs'), [db]);
  const { data: allPrograms, isLoading: isProgsLoading } = useCollection<ProgramRecord>(programsRef);

  // Programs for currently expanded dept
  const deptPrograms = useMemo(() => {
    if (!allPrograms || !expandedDept) return [];
    return allPrograms
      .filter(p => p.deptID === expandedDept)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [allPrograms, expandedDept]);

  // ── Department CRUD ──
  const handleAddDept = () => {
    if (!newDeptId.trim() || !newDeptName.trim()) {
      toast({ title: "Required", description: "Code and name are required.", variant: "destructive" }); return;
    }
    const id = newDeptId.trim().toUpperCase();
    setDocumentNonBlocking(doc(db, 'departments', id), { deptID: id, departmentName: newDeptName.trim() }, { merge: true });
    setNewDeptId(''); setNewDeptName('');
    toast({ title: "Department Added" });
  };

  const handleDeleteDept = (id: string, name: string) => {
    setConfirmModal({ open: true, type: 'dept', id, name });
  };

  const executeDelete = useCallback(() => {
    if (!confirmModal) return;
    if (confirmModal.type === 'dept') {
      deleteDocumentNonBlocking(doc(db, 'departments', confirmModal.id));
      if (expandedDept === confirmModal.id) setExpandedDept(null);
      toast({ title: 'Department Removed' });
    } else {
      deleteDocumentNonBlocking(doc(db, 'programs', confirmModal.id));
      toast({ title: 'Program Removed' });
    }
    setConfirmModal(null);
  }, [confirmModal, db, expandedDept]);

  const handleSeedDepts = async () => {
    setIsSeeding(true);
    try {
      Object.entries(DEPARTMENTS).forEach(([id, name]) => {
        setDocumentNonBlocking(doc(db, 'departments', id), { deptID: id, departmentName: name }, { merge: true });
      });
      toast({ title: "Departments Synced", description: "16 colleges imported." });
    } catch { toast({ title: "Sync Failed", variant: "destructive" }); }
    finally { setIsSeeding(false); }
  };

  const handleSeedPrograms = async () => {
    setIsSeeding(true);
    try {
      const seed = getProgramSeedData();
      let count = 0;
      for (const prog of seed) {
        // Use code as the document ID so it's human-readable in Firestore
        const docId = `${prog.deptID}_${prog.code}`;
        await setDoc(doc(db, 'programs', docId), prog, { merge: true });
        count++;
      }
      toast({ title: "Programs Seeded", description: `${count} programs imported from institutional data.` });
    } catch (e) {
      toast({ title: "Seed Failed", description: String(e), variant: "destructive" });
    } finally { setIsSeeding(false); }
  };

  // ── Program CRUD ──
  const handleAddProgram = async () => {
    if (!expandedDept || !newProgName.trim() || !newProgCode.trim()) {
      toast({ title: "Required", description: "Program name and code are required.", variant: "destructive" }); return;
    }
    // Check for duplicate code within dept
    const duplicate = deptPrograms.find(p => p.code.toLowerCase() === newProgCode.trim().toLowerCase());
    if (duplicate) {
      toast({ title: "Duplicate Code", description: `Code "${newProgCode.trim().toUpperCase()}" already exists in this department.`, variant: "destructive" }); return;
    }
    try {
      const code = newProgCode.trim().toUpperCase();
      const docId = `${expandedDept}_${code}`;
      await setDoc(doc(db, 'programs', docId), {
        deptID: expandedDept,
        name:   newProgName.trim(),
        code,
      }, { merge: false });
      setNewProgName(''); setNewProgCode('');
      toast({ title: "Program Added", description: `${code} — ${newProgName.trim()}` });
    } catch (e) {
      toast({ title: "Failed to add program", variant: "destructive" });
    }
  };

  const handleDeleteProgram = (id: string, name: string) => {
    setConfirmModal({ open: true, type: 'program', id, name });
  };

  const startEditProgram = (prog: ProgramRecord) => {
    setEditingProgId(prog.id);
    setEditProgName(prog.name);
    setEditProgCode(prog.code);
  };

  const saveEditProgram = (id: string) => {
    if (!editProgName.trim() || !editProgCode.trim()) return;
    updateDocumentNonBlocking(doc(db, 'programs', id), {
      name: editProgName.trim(),
      code: editProgCode.trim().toUpperCase(),
    });
    setEditingProgId(null);
    toast({ title: "Program Updated" });
  };

  const cancelEdit = () => setEditingProgId(null);

  const filteredDepts = (depts || [])
    .filter(d =>
      d.deptID.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.departmentName.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => a.deptID.localeCompare(b.deptID));

  const thStyle = "font-bold text-sm uppercase tracking-wide text-slate-500 bg-slate-50/80";

  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* ── Top Controls Card ── */}
      <div style={card} className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <Building2 size={18} style={{ color: navy }} />
            <div>
              <h3 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
                Department & Program Registry
              </h3>
              <p className="text-slate-400 font-medium text-sm mt-0.5">Click a department row to manage its programs</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="pl-8 w-36 h-9 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium" />
            </div>
            <button onClick={handleSeedDepts} disabled={isSeeding}
              className="h-9 px-3 rounded-xl font-semibold text-xs flex items-center gap-1.5 border transition-all active:scale-95 disabled:opacity-50"
              style={{ borderColor: `${navy}25`, color: navy, background: `${navy}07` }}>
              {isSeeding ? <Loader2 size={12} className="animate-spin" /> : <DatabaseBackup size={13} />}
              Sync Depts
            </button>
            <button onClick={handleSeedPrograms} disabled={isSeeding}
              className="h-9 px-3 rounded-xl font-semibold text-xs flex items-center gap-1.5 border transition-all active:scale-95 disabled:opacity-50"
              style={{ borderColor: 'hsl(262,83%,58%,0.3)', color: 'hsl(262,83%,50%)', background: 'hsl(262,83%,58%,0.06)' }}>
              {isSeeding ? <Loader2 size={12} className="animate-spin" /> : <GraduationCap size={13} />}
              Seed Programs
            </button>
          </div>
        </div>

        {/* Add Dept form */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 p-3 rounded-xl"
          style={{ background: `${navy}05`, border: `1px solid ${navy}0f` }}>
          <div>
            <p className="text-slate-400 font-semibold text-xs mb-1 uppercase tracking-wide">Dept Code</p>
            <Input placeholder="e.g. CICS" value={newDeptId} onChange={e => setNewDeptId(e.target.value.toUpperCase())}
              className="h-9 bg-white border-slate-200 rounded-xl font-bold text-sm" />
          </div>
          <div className="sm:col-span-2">
            <p className="text-slate-400 font-semibold text-xs mb-1 uppercase tracking-wide">Full Name</p>
            <Input placeholder="College of..." value={newDeptName} onChange={e => setNewDeptName(e.target.value)}
              className="h-9 bg-white border-slate-200 rounded-xl font-medium text-sm" />
          </div>
          <div className="flex items-end">
            <button onClick={handleAddDept}
              className="w-full h-9 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 text-white active:scale-95 transition-all"
              style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,32%))` }}>
              <Plus size={14} /> Add Dept
            </button>
          </div>
        </div>
      </div>

      {/* ── Department Table ── */}
      <div style={card} className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="h-11 border-slate-100">
              <TableHead className={`pl-4 w-24 ${thStyle}`}>Code</TableHead>
              <TableHead className={thStyle}>Department</TableHead>
              <TableHead className={`text-center w-28 ${thStyle}`}>Programs</TableHead>
              <TableHead className={`text-right pr-4 w-14 ${thStyle}`}></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isDepsLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-28 text-center">
                  <Loader2 className="animate-spin inline-block" style={{ color: navy }} size={20} />
                </TableCell>
              </TableRow>
            ) : filteredDepts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-28 text-center text-slate-400 text-sm italic">
                  No departments. Add one above or sync institutional data.
                </TableCell>
              </TableRow>
            ) : (
              filteredDepts.flatMap(d => {
                const progCount = allPrograms?.filter(p => p.deptID === d.deptID).length ?? 0;
                const isExpanded = expandedDept === d.deptID;

                return [
                  /* ── Dept row ── */
                  <TableRow key={d.deptID}
                    className="border-b border-slate-50 h-14 transition-colors cursor-pointer"
                    style={{ background: isExpanded ? `${navy}04` : undefined }}
                    onClick={() => setExpandedDept(isExpanded ? null : d.deptID)}>

                    <TableCell className="pl-4">
                      <span className="font-bold text-sm px-2.5 py-1.5 rounded-lg"
                        style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                        {d.deptID}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isExpanded
                          ? <ChevronDown size={15} style={{ color: navy, flexShrink: 0 }} />
                          : <ChevronRight size={15} className="text-slate-300 flex-shrink-0" />}
                        <span className="font-semibold text-slate-900 text-sm">{d.departmentName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-bold text-xs px-2.5 py-1 rounded-full"
                        style={{
                          background: progCount > 0 ? `${navy}0d` : 'rgba(0,0,0,0.04)',
                          color: progCount > 0 ? navy : '#94a3b8',
                        }}>
                        {isProgsLoading ? '…' : progCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <button onClick={e => { e.stopPropagation(); handleDeleteDept(d.deptID, d.departmentName); }}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all active:scale-95">
                        <Trash2 size={14} />
                      </button>
                    </TableCell>
                  </TableRow>,

                  /* ── Expanded programs panel ── */
                  ...(isExpanded ? [
                    <TableRow key={`${d.deptID}-panel`} className="border-b border-slate-100">
                      <TableCell colSpan={4} className="p-0">
                        <div className="p-4 sm:p-5" style={{ background: `${navy}03` }}>

                          {/* Panel header */}
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                              <GraduationCap size={16} style={{ color: navy }} />
                              <div>
                                <p className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>
                                  {d.departmentName}
                                </p>
                                <p className="text-slate-400 text-xs font-medium">{deptPrograms.length} program{deptPrograms.length !== 1 ? 's' : ''}</p>
                              </div>
                            </div>
                            <button onClick={() => setExpandedDept(null)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 transition-all">
                              <X size={13} />
                            </button>
                          </div>

                          {/* Add program form */}
                          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-4 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                            <div className="sm:col-span-1">
                              <p className="text-slate-400 font-semibold text-xs mb-1 uppercase tracking-wide">Code</p>
                              <Input placeholder="e.g. BSCS"
                                value={newProgCode}
                                onChange={e => setNewProgCode(e.target.value.toUpperCase())}
                                className="h-9 border-slate-200 bg-slate-50 rounded-xl font-bold text-sm"
                                style={{ fontFamily: "'DM Mono',monospace" }}
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <p className="text-slate-400 font-semibold text-xs mb-1 uppercase tracking-wide">Program Name</p>
                              <Input placeholder="Bachelor of Science in..."
                                value={newProgName}
                                onChange={e => setNewProgName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddProgram()}
                                className="h-9 border-slate-200 bg-slate-50 rounded-xl font-medium text-sm"
                              />
                            </div>
                            <div className="sm:col-span-1 flex items-end">
                              <button onClick={handleAddProgram}
                                className="w-full h-9 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 text-white active:scale-95 transition-all"
                                style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,32%))` }}>
                                <Plus size={14} /> Add
                              </button>
                            </div>
                          </div>

                          {/* Programs list */}
                          {isProgsLoading ? (
                            <div className="py-6 flex items-center justify-center gap-2 text-slate-400">
                              <Loader2 size={16} className="animate-spin" />
                              <span className="text-sm">Loading programs...</span>
                            </div>
                          ) : deptPrograms.length === 0 ? (
                            <div className="py-6 text-center">
                              <p className="text-slate-400 text-sm font-medium">No programs yet.</p>
                              <p className="text-slate-300 text-xs mt-1">Add one above, or use "Seed Programs" to import all institutional programs.</p>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-slate-100 overflow-hidden bg-white">
                              <table className="w-full">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wide w-28">Code</th>
                                    <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wide">Program Name</th>
                                    <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wide w-24">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {deptPrograms.map(prog => (
                                    <tr key={prog.id} className="hover:bg-slate-50 transition-colors">
                                      <td className="px-4 py-3">
                                        {editingProgId === prog.id ? (
                                          <Input value={editProgCode} onChange={e => setEditProgCode(e.target.value.toUpperCase())}
                                            className="h-8 w-24 text-sm font-bold border-slate-200 rounded-lg"
                                            style={{ fontFamily: "'DM Mono',monospace" }}
                                            autoFocus
                                          />
                                        ) : (
                                          <span className="font-bold text-sm px-2.5 py-1.5 rounded-lg"
                                            style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                                            {prog.code}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3">
                                        {editingProgId === prog.id ? (
                                          <Input value={editProgName} onChange={e => setEditProgName(e.target.value)}
                                            className="h-8 text-sm border-slate-200 rounded-lg font-medium"
                                            onKeyDown={e => e.key === 'Enter' && saveEditProgram(prog.id)}
                                          />
                                        ) : (
                                          <span className="text-slate-800 text-sm font-medium">{prog.name}</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          {editingProgId === prog.id ? (
                                            <>
                                              <button onClick={() => saveEditProgram(prog.id)}
                                                className="w-8 h-8 flex items-center justify-center rounded-lg text-white active:scale-95 transition-all"
                                                style={{ background: navy }}>
                                                <Check size={14} />
                                              </button>
                                              <button onClick={cancelEdit}
                                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 active:scale-95 transition-all">
                                                <X size={14} />
                                              </button>
                                            </>
                                          ) : (
                                            <>
                                              <button onClick={() => startEditProgram(prog)}
                                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 active:scale-95 transition-all">
                                                <Edit2 size={14} />
                                              </button>
                                              <button onClick={() => handleDeleteProgram(prog.id, prog.name)}
                                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 active:scale-95 transition-all">
                                                <Trash2 size={14} />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>,
                  ] : []),
                ];
              })
            )}
          </TableBody>
        </Table>
      </div>
      {/* ── Confirmation Modal ── */}
      {confirmModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.2s ease-out' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
            style={{ animation: 'scaleIn 0.25s ease-out' }}>
            <div className="px-7 py-6 border-b border-slate-100 text-center">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(220,38,38,0.08)' }}>
                <Trash2 size={22} className="text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                Confirm Delete
              </h3>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                Are you sure you want to delete{' '}
                <strong className="text-slate-800">"{confirmModal.name}"</strong>?{' '}
                This action cannot be undone and may affect associated student records.
              </p>
            </div>
            <div className="px-7 py-5 flex gap-3">
              <button onClick={() => setConfirmModal(null)}
                className="flex-1 h-11 rounded-2xl font-semibold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all active:scale-95">
                Cancel
              </button>
              <button onClick={executeDelete}
                className="flex-1 h-11 rounded-2xl font-bold text-sm text-white transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)', boxShadow: '0 4px 14px rgba(220,38,38,0.3)' }}>
                Confirm Delete
              </button>
            </div>
          </div>
          <style>{`
            @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
            @keyframes scaleIn { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
          `}</style>
        </div>
      )}
    </div>
  );
}