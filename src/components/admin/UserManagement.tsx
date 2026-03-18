"use client";

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, Loader2, UserPlus, Edit2, GraduationCap,
  Filter, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Upload, FileDown,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, updateDocumentNonBlocking, deleteDocumentNonBlocking, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import { StudentRecord, DepartmentRecord, ProgramRecord } from '@/lib/firebase-schema';
import { writeAuditLog } from '@/lib/audit-logger';
import { useUser } from '@/firebase';
import { AddEditUserDialog } from './AddEditUserDialog';
import { ImportStudentDialog } from './ImportStudentDialog';

interface UserManagementProps { isSuperAdmin: boolean; }

const navy = 'hsl(221,72%,22%)';

export function UserManagement({ isSuperAdmin }: UserManagementProps) {
  const [searchTerm,   setSearchTerm]   = useState('');
  const [deptFilter,   setDeptFilter]   = useState('All Departments');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [programFilter, setProgramFilter] = useState('All Programs');
  const [sortField,    setSortField]    = useState<'id' | 'lastName' | 'deptID' | 'program' | 'role'>('lastName');
  const [sortOrder,    setSortOrder]    = useState<'asc' | 'desc'>('asc');
  const [roleFilter,   setRoleFilter]   = useState('All');
  const [editingStudent,   setEditingStudent]   = useState<StudentRecord | null>(null);
  const [isDialogOpen,     setIsDialogOpen]     = useState(false);
  const [isImportOpen,     setIsImportOpen]     = useState(false);
  const [studentToDelete,  setStudentToDelete]  = useState<{ id: string; name: string } | null>(null);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);

  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();

  const deptsRef = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: dbDepartments, isLoading: isDeptsLoading } = useCollection<DepartmentRecord>(deptsRef);
  const studentsRef = useMemoFirebase(() => query(collection(db, 'users'), where('role', 'in', ['student', 'admin', 'super_admin'])), [db]);
  const { data: students, isLoading } = useCollection<StudentRecord>(studentsRef);

  // Fetch all programs from Firestore for code lookups
  const programsQuery = useMemoFirebase(() => collection(db, 'programs'), [db]);
  const { data: allPrograms } = useCollection<ProgramRecord>(programsQuery);
  const programMap = useMemo(() => {
    const m: Record<string, ProgramRecord> = {};
    // Key by both code (new) and name (legacy fallback for existing students)
    allPrograms?.forEach(p => {
      m[`${p.deptID}::${p.code}`] = p;  // new: stored as code
      m[`${p.deptID}::${p.name}`] = p;  // legacy: stored as full name
    });
    return m;
  }, [allPrograms]);

  const formatFullName = (s: StudentRecord) => `${(s.lastName || '').toUpperCase()}, ${s.firstName}`;
const getRoleBadge = (s: StudentRecord) => s.role === 'admin' || s.role === 'super_admin' ? 'Staff' : 'Student';

  const processedStudents = useMemo(() => {
    if (!students) return [];
    return students
      .filter(s => {
        const search = searchTerm.toLowerCase();
        const matchesSearch =
          formatFullName(s).toLowerCase().includes(search) ||
          (s.email || '').toLowerCase().includes(search) ||
          (s.id || '').toLowerCase().includes(search) ||
          (s.program || '').toLowerCase().includes(search);
        const matchesDept    = deptFilter    === 'All Departments' || s.deptID   === deptFilter;
        const matchesStatus  = statusFilter  === 'All Status' ||
          (statusFilter === 'Active' && s.status !== 'blocked') || (statusFilter === 'Blocked' && s.status === 'blocked');
        const matchesProgram = programFilter === 'All Programs' || s.program === programFilter;
        const isStaff = s.role === 'admin' || s.role === 'super_admin' || (s.program || '').toUpperCase().includes('STAFF');
        const matchesRole = roleFilter === 'All' ||
          (roleFilter === 'Student' && !isStaff) ||
          (roleFilter === 'Staff' && isStaff);
        return matchesSearch && matchesDept && matchesStatus && matchesProgram && matchesRole;
      })
      .sort((a, b) => {
        let vA: string, vB: string;
        if (sortField === 'role') {
          const roleLabel = (s: StudentRecord) => {
            if (s.role === 'admin' || s.role === 'super_admin' || (s.program || '').toUpperCase().includes('STAFF')) return 'Staff';
            return 'Student';
          };
          vA = roleLabel(a); vB = roleLabel(b);
        } else if (sortField === 'program') {
          vA = (programMap[`${a.deptID}::${a.program}`]?.name || a.program || '').toLowerCase();
          vB = (programMap[`${b.deptID}::${b.program}`]?.name || b.program || '').toLowerCase();
        } else {
          vA = ((a as any)[sortField] || '').toLowerCase();
          vB = ((b as any)[sortField] || '').toLowerCase();
        }
        return sortOrder === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
      });
  }, [students, searchTerm, deptFilter, statusFilter, programFilter, sortField, sortOrder, roleFilter]);

  const toggleBlockStatus = (studentId: string, current: boolean) => {
    const newStatus = !current ? 'blocked' : 'active';
    const student = students?.find(s => s.id === studentId);
    updateDocumentNonBlocking(doc(db, 'users', studentId), { status: newStatus });
    writeAuditLog(db, user, newStatus === 'blocked' ? 'user.block' : 'user.unblock', {
      targetId:   studentId,
      targetName: student ? `${student.firstName} ${student.lastName}` : studentId,
      detail:     `Status set to ${newStatus}`,
    });
    toast({ title: "Status Updated", description: `Student access ${newStatus}.` });
  };

  const confirmDelete = () => {
    if (!isSuperAdmin || !studentToDelete) return;
    deleteDocumentNonBlocking(doc(db, 'users', studentToDelete.id));
    writeAuditLog(db, user, 'user.delete', {
      targetId:   studentToDelete.id,
      targetName: studentToDelete.name,
      detail:     'Student record permanently deleted',
    });
    toast({ title: "Record Deleted" });
    setIsDeleteAlertOpen(false);
  };

  const toggleSort = (field: 'id' | 'lastName' | 'deptID' | 'program' | 'role') => {
    if (sortField === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('asc'); }
  };

  const SortIcon = ({ field }: { field: 'id' | 'lastName' | 'deptID' | 'program' | 'role' }) => {
    if (sortField !== field) return <ArrowUpDown size={13} className="ml-1.5 opacity-40" />;
    return sortOrder === 'asc'
      ? <ArrowUp size={13} className="ml-1.5" style={{ color: navy }} />
      : <ArrowDown size={13} className="ml-1.5" style={{ color: navy }} />;
  };

  const thStyle = "font-bold text-sm uppercase tracking-wide text-slate-500";

  const exportCSV = (mode: 'all' | 'filtered' = 'all') => {
    // Always export from the full database (students), not just visible filtered rows
    const source = mode === 'filtered' ? processedStudents : (students || []);
    if (!source.length) { toast({ title: 'No data to export', variant: 'destructive' }); return; }
    // Columns match import template exactly so exported files can be re-imported
    const headers = ['id', 'firstName', 'middleName', 'lastName', 'email', 'deptID', 'program'];
    const rows = source.map(s => [
      s.id          || '',
      s.firstName   || '',
      s.middleName  || '',
      s.lastName    || '',
      s.email       || '',
      s.deptID      || '',
      s.program     || '',
    ]);
    const csvContent = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `NEU_Students_${mode}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'CSV Exported', description: `${source.length} student records downloaded.` });
  };

  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans',sans-serif" }}>
      <Card className="school-card">
        <CardHeader className="p-5 sm:p-6 border-b border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
                <GraduationCap size={18} />
              </div>
              <div>
                <CardTitle className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>
                  Library Registry
                </CardTitle>
                <CardDescription className="text-slate-400 font-semibold text-xs uppercase tracking-wide mt-0.5">
                  Academic Records
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input placeholder="Search name, ID, program..."
                  className="pl-9 w-48 sm:w-56 h-10 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium"
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>

              {/* Dept filter */}
              <Select value={deptFilter} onValueChange={v => { setDeptFilter(v); setProgramFilter('All Programs'); }}>
                <SelectTrigger className="w-36 h-10 bg-slate-50 border-slate-200 rounded-xl font-semibold text-sm">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Filter size={13} className="flex-shrink-0" style={{ color: navy }} />
                    <span className="truncate font-bold" style={{ fontFamily: "'DM Mono',monospace", fontSize: '0.8rem' }}>
                      {deptFilter === 'All Departments' ? 'Dept' : deptFilter}
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="All Departments" className="font-semibold">All Departments</SelectItem>
                  {dbDepartments?.map(d => (
                    <SelectItem key={d.deptID} value={d.deptID} className="font-semibold">
                      <span className="font-bold mr-2" style={{ fontFamily: "'DM Mono',monospace" }}>{d.deptID}</span>
                      {d.departmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Program filter — only active when dept selected */}
              {deptFilter !== 'All Departments' && (
                <Select value={programFilter} onValueChange={setProgramFilter}>
                  <SelectTrigger className="w-40 h-10 bg-slate-50 border-slate-200 rounded-xl font-semibold text-sm">
                    <SelectValue placeholder="All Programs" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-60">
                    <SelectItem value="All Programs" className="font-semibold">All Programs</SelectItem>
                    {allPrograms?.filter(p => p.deptID === deptFilter)
                      .sort((a, b) => a.code.localeCompare(b.code))
                      .map(p => (
                        <SelectItem key={p.code} value={p.code} className="font-semibold text-sm py-2">
                          <span className="font-bold mr-2 text-xs px-1.5 py-0.5 rounded" style={{ background:'hsl(221,72%,22%,0.08)', color:'hsl(221,72%,22%)', fontFamily:"'DM Mono',monospace" }}>{p.code}</span>
                          {p.name}
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Status filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32 h-10 bg-slate-50 border-slate-200 rounded-xl font-semibold text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="All Status" className="font-semibold">All Status</SelectItem>
                  <SelectItem value="Active" className="font-semibold">Active</SelectItem>
                  <SelectItem value="Blocked" className="font-semibold">Blocked</SelectItem>
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-36 h-10 bg-slate-50 border-slate-200 rounded-xl font-semibold text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="All" className="font-semibold">All Roles</SelectItem>
                  <SelectItem value="Student" className="font-semibold">Student</SelectItem>
                  <SelectItem value="Staff" className="font-semibold">Staff / Faculty</SelectItem>
                </SelectContent>
              </Select>

              {/* Actions */}
              <div className="relative flex items-center gap-1">
                <Button variant="outline" onClick={() => setIsImportOpen(true)}
                  className="h-10 px-4 rounded-xl font-semibold text-sm gap-2 border-slate-200 text-slate-600 rounded-r-none border-r-0">
                  <Upload size={15} /> Import
                </Button>
                <Button variant="outline" onClick={() => exportCSV('all')} title="Export all students from database"
                  className="h-10 px-4 rounded-xl font-semibold text-sm gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-l-none">
                  <FileDown size={15} /> Export
                </Button>
              </div>
              <Button onClick={() => { setEditingStudent(null); setIsDialogOpen(true); }}
                className="h-10 px-4 rounded-xl font-semibold text-sm gap-2 text-white"
                style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,32%))`, border: 'none' }}>
                <UserPlus size={15} /> Register
              </Button>
            </div>
          </div>

          {/* Results count */}
          <p className="text-slate-400 text-xs font-medium mt-3">
            {processedStudents.length} student{processedStudents.length !== 1 ? 's' : ''} found
          </p>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto no-scrollbar">
            <Table>
              <TableHeader className="bg-slate-50/70">
                {/* 6 columns: Name | Student ID | Dept | Program | Status | Actions */}
                <TableRow className="border-b border-slate-100 h-12">
                  <TableHead className={`pl-5 cursor-pointer hover:bg-slate-100/60 transition-colors ${thStyle}`}
                    onClick={() => toggleSort('lastName')}>
                    <div className="flex items-center">Student <SortIcon field="lastName" /></div>
                  </TableHead>
                  <TableHead className={`cursor-pointer hover:bg-slate-100/60 transition-colors ${thStyle}`}
                    onClick={() => toggleSort('id')}>
                    <div className="flex items-center">ID Number <SortIcon field="id" /></div>
                  </TableHead>
                  <TableHead className={`cursor-pointer hover:bg-slate-100/60 transition-colors ${thStyle}`}
                    onClick={() => toggleSort('deptID')}>
                    <div className="flex items-center">Dept <SortIcon field="deptID" /></div>
                  </TableHead>
                  {/* Separate Program column */}
                  <TableHead className={`cursor-pointer hover:bg-slate-100/60 transition-colors ${thStyle} hidden md:table-cell`}
                    onClick={() => toggleSort('program')}>
                    <div className="flex items-center">Program <SortIcon field="program" /></div>
                  </TableHead>
                  <TableHead className={`cursor-pointer hover:bg-slate-100/60 transition-colors ${thStyle}`}
                    onClick={() => toggleSort('role')}>
                    Role <SortIcon field="role" />
                  </TableHead>
                  <TableHead className={thStyle}>Access</TableHead>
                  <TableHead className={`text-center ${thStyle}`}>Edit</TableHead>
                  <TableHead className={`text-center ${thStyle}`}>Admin Access</TableHead>
                  <TableHead className={`text-center ${thStyle}`}>Remove</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40 text-center">
                      <Loader2 className="animate-spin inline-block" style={{ color: navy }} size={24} />
                    </TableCell>
                  </TableRow>
                ) : processedStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40 text-center text-slate-400 text-sm italic font-medium">
                      No matching records.
                    </TableCell>
                  </TableRow>
                ) : (
                  processedStudents.map(s => {
                    const programEntry = programMap[`${s.deptID}::${s.program}`] || null;

                    return (
                      <TableRow key={s.id}
                        className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                        style={{ height: '68px' }}>

                        {/* Student name + email */}
                        <TableCell className="pl-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                              style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,35%))` }}>
                              {(s.firstName || 'S')[0]}{(s.lastName || 'S')[0]}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm leading-tight">{formatFullName(s)}</p>
                              <p className="text-slate-400 text-xs font-medium mt-0.5 truncate max-w-[180px]">{s.email}</p>
                            </div>
                          </div>
                        </TableCell>

                        {/* Student ID */}
                        <TableCell>
                          <span className="font-bold text-sm" style={{ color: navy, fontFamily: "'DM Mono',monospace" }}>
                            {s.id}
                          </span>
                        </TableCell>

                        {/* Department — code only */}
                        <TableCell>
                          <span className="font-bold text-xs px-2.5 py-1.5 rounded-lg"
                            style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                            {s.deptID}
                          </span>
                        </TableCell>

                        {/* Program — separate column */}
                        <TableCell className="hidden md:table-cell">
                          {programEntry ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-bold text-xs px-2.5 py-1 rounded-lg w-fit"
                                style={{ background: 'hsl(262,83%,58%,0.1)', color: 'hsl(262,83%,45%)', fontFamily: "'DM Mono',monospace" }}>
                                {programEntry.code}
                              </span>
                              <span className="text-slate-500 text-xs font-medium leading-tight max-w-[200px] truncate" title={programEntry.name}>
                                {programEntry.name}
                              </span>
                            </div>
                          ) : s.program ? (
                            <span className="text-slate-400 text-xs font-medium italic truncate max-w-[160px] block" title={s.program}>
                              {s.program}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs font-medium italic">—</span>
                          )}
                        </TableCell>

                        {/* Role */}
                        <TableCell>
                          {(s.role === 'admin' || s.role === 'super_admin' || (s.program || '').toUpperCase().includes('STAFF')) ? (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                              style={{ background: 'hsl(221,72%,22%,0.08)', color: 'hsl(221,72%,22%)' }}>
                              Staff / Faculty
                            </span>
                          ) : (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                              style={{ background: 'hsl(43,85%,52%,0.12)', color: 'hsl(38,90%,35%)' }}>
                              Student
                            </span>
                          )}
                        </TableCell>
                        {/* Access (was Status) */}
                        <TableCell className="align-middle">
                          {s.status === 'blocked' ? (
                            <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-red-50 text-red-500 border border-red-100">
                              Blocked
                            </span>
                          ) : (
                            <span className="text-xs font-bold px-3 py-1.5 rounded-full border"
                              style={{ background: `${navy}08`, color: navy, borderColor: `${navy}20` }}>
                              Active
                            </span>
                          )}
                        </TableCell>

                        {/* Edit */}
                        <TableCell className="text-center align-middle">
                          <button
                            onClick={() => { setEditingStudent(s); setIsDialogOpen(true); }}
                            title="Edit"
                            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-all active:scale-95 mx-auto">
                            <Edit2 size={16} />
                          </button>
                        </TableCell>

                        {/* Admin Access */}
                        <TableCell className="text-center align-middle">
                          {isSuperAdmin ? (
                            <button
                              title={s.role === 'admin' || s.role === 'super_admin' ? 'Revoke Admin' : 'Grant Admin'}
                              onClick={() => {
                                const newRole = (s.role === 'admin' || s.role === 'super_admin') ? 'student' : 'admin';
                                updateDocumentNonBlocking(doc(db, 'users', s.id), { role: newRole });
                                writeAuditLog(db, user, newRole === 'admin' ? 'role.promote' : 'role.demote', {
                                  targetId:   s.id,
                                  targetName: `${s.firstName} ${s.lastName}`,
                                  detail:     `Role changed to ${newRole}`,
                                });
                                toast({ title: newRole === 'admin' ? 'Admin access granted' : 'Reverted to Student', description: `${s.firstName} ${s.lastName}` });
                              }}
                              className="text-xs font-bold px-2.5 py-1 rounded-lg border transition-all active:scale-95 mx-auto block"
                              style={
                                (s.role === 'admin' || s.role === 'super_admin')
                                  ? { background: 'hsl(221,72%,22%,0.08)', color: 'hsl(221,72%,22%)', borderColor: 'hsl(221,72%,22%,0.2)' }
                                  : { background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0' }
                              }>
                              {(s.role === 'admin' || s.role === 'super_admin') ? '−Admin' : '+Admin'}
                            </button>
                          ) : (
                            <Switch checked={s.status !== 'blocked'} onCheckedChange={() => toggleBlockStatus(s.id, s.status === 'blocked')} />
                          )}
                        </TableCell>

                        {/* Remove */}
                        <TableCell className="text-center align-middle">
                          {isSuperAdmin ? (
                            <button
                              title="Remove"
                              onClick={() => { setStudentToDelete({ id: s.id, name: s.firstName }); setIsDeleteAlertOpen(true); }}
                              className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all active:scale-95 mx-auto">
                              <Trash2 size={16} />
                            </button>
                          ) : (
                            <span className="text-slate-200 text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AddEditUserDialog student={editingStudent} open={isDialogOpen} onOpenChange={setIsDialogOpen} />
      <ImportStudentDialog open={isImportOpen} onOpenChange={setIsImportOpen} />

      {isSuperAdmin && (
        <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
          <AlertDialogContent className="rounded-2xl p-6 w-[calc(100vw-2rem)] max-w-sm mx-auto border-red-100">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-600 font-bold text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>
                Confirm Remove
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-600 text-sm leading-relaxed">
                Are you sure you want to remove <strong>{studentToDelete?.name}</strong>'s record? This action cannot be undone and may affect associated library logs.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="pt-4 flex-row gap-2">
              <AlertDialogCancel className="flex-1 rounded-xl h-11 font-semibold text-sm">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete}
                className="flex-1 rounded-xl h-11 font-semibold text-sm text-white" style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}