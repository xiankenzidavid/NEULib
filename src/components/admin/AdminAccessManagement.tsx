"use client";

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  UserPlus, Loader2, Key, Shield, BadgeCheck,
  Building2, GraduationCap, UserX, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection, useMemoFirebase, setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import { UserRecord, DepartmentRecord, ProgramRecord } from '@/lib/firebase-schema';
import { useUser } from '@/firebase';
import { writeAuditLog } from '@/lib/audit-logger';
import { SuccessCard } from '@/components/ui/SuccessCard';

function fullName(u: UserRecord) {
  return [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ') || u.id;
}
function initials(u: UserRecord) {
  return [u.firstName?.[0], u.lastName?.[0]].filter(Boolean).join('').toUpperCase() || 'S';
}

const navy = 'hsl(221,72%,22%)';

export function AdminAccessManagement({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [newFirstName,  setNewFirstName]  = useState('');
  const [newMiddleName, setNewMiddleName] = useState('');
  const [newLastName,   setNewLastName]   = useState('');
  const [newAdminId,    setNewAdminId]    = useState('');
  const [newEmail,      setNewEmail]      = useState('');
  const [newDeptId,     setNewDeptId]     = useState('');
  const [newProgram,    setNewProgram]    = useState('');

  const [staffToRevoke,     setStaffToRevoke]     = useState<{ id: string; name: string } | null>(null);
  const [isRevokeAlertOpen, setIsRevokeAlertOpen] = useState(false);
  const [registryOpen,      setRegistryOpen]      = useState(true);
  const [successCard,       setSuccessCard]       = useState<{ title: string; description: string; color?: 'green' | 'navy' | 'amber' } | null>(null);

  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();

  const deptsRef = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: depts } = useCollection<DepartmentRecord>(deptsRef);

  const newProgramsRef = useMemoFirebase(
    () => newDeptId ? query(collection(db, 'programs'), where('deptID', '==', newDeptId)) : null,
    [db, newDeptId]
  );
  const { data: newPrograms } = useCollection<ProgramRecord>(newProgramsRef);

  const adminsQuery = useMemoFirebase(
    () => query(collection(db, 'users'), where('role', 'in', ['admin', 'super_admin'])),
    [db]
  );
  const { data: adminList, isLoading } = useCollection<UserRecord>(adminsQuery);

  const sortedAdmins = useMemo(() =>
    (adminList || []).sort((a, b) => fullName(a).localeCompare(fullName(b))),
    [adminList]
  );

  const sortedNewPrograms = (newPrograms || []).sort((a, b) => a.code.localeCompare(b.code));

  // ── Register new staff — always as 'admin', never 'super_admin' ───────────
  const handleAddAdmin = () => {
    if (!newFirstName.trim() || !newLastName.trim() || !newAdminId.trim() || !newEmail.trim()) {
      toast({ title: 'Validation Error', description: 'First name, last name, Staff ID, and email are required.', variant: 'destructive' });
      return;
    }
    const data: UserRecord = {
      id:         newAdminId.trim(),
      firstName:  newFirstName.trim(),
      middleName: newMiddleName.trim() || '',
      lastName:   newLastName.trim(),
      email:      newEmail.trim().toLowerCase(),
      role:       'admin',   // always 'admin' — super_admin cannot be granted here
      status:     'active',
      deptID:     newDeptId || '',
      program:    newProgram || '',
    };
    setDocumentNonBlocking(doc(db, 'users', newAdminId.trim()), data, { merge: true });
    writeAuditLog(db, user, 'role.promote', {
      targetId:   newAdminId.trim(),
      targetName: `${data.firstName} ${data.lastName}`,
      detail:     'Registered as admin via Staff Access',
    });
    setSuccessCard({
      title: 'Staff Registered',
      description: `${fullName(data)} is now an authorized admin and can access the dashboard.`,
      color: 'green',
    });
    setNewFirstName(''); setNewMiddleName(''); setNewLastName('');
    setNewAdminId(''); setNewEmail(''); setNewDeptId(''); setNewProgram('');
  };

  // ── Revoke — sets role back to 'student' ──────────────────────────────────
  const confirmRevoke = () => {
    if (!staffToRevoke) return;
    updateDocumentNonBlocking(doc(db, 'users', staffToRevoke.id), { role: 'student', status: 'active' });
    writeAuditLog(db, user, 'role.demote', {
      targetId:   staffToRevoke.id,
      targetName: staffToRevoke.name,
      detail:     'Admin access revoked — role set to student',
    });
    setSuccessCard({
      title: 'Access Revoked',
      description: `${staffToRevoke.name} has been set back to Student. Their account and logs are preserved.`,
      color: 'amber',
    });
    setIsRevokeAlertOpen(false); setStaffToRevoke(null);
  };

  const thStyle = 'font-bold text-xs uppercase tracking-wide text-slate-500 bg-slate-50/80';

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
    <div className="space-y-6" style={{ fontFamily: "'DM Sans',sans-serif" }}>
      {/* ── Staff Access Registry ─────────────────────────────────────────── */}
      <Card className="school-card">
        <button className="w-full text-left" onClick={() => setRegistryOpen(o => !o)}>
          <CardHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors rounded-t-2xl">
            <div className="flex items-center gap-2">
              <Key size={18} style={{ color: navy }} />
              <div>
                <CardTitle className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                  Staff Access Registry
                </CardTitle>
                <CardDescription className="mt-0.5 text-slate-400 text-sm">
                  {sortedAdmins.length} staff member{sortedAdmins.length !== 1 ? 's' : ''} registered
                </CardDescription>
              </div>
            </div>
            {registryOpen
              ? <ChevronUp size={18} className="text-slate-400 flex-shrink-0" />
              : <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />}
          </CardHeader>
        </button>

        {registryOpen && (
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="h-11 border-slate-100">
                    <TableHead className={`pl-5 ${thStyle}`}>Name</TableHead>
                    <TableHead className={thStyle}>Staff ID</TableHead>
                    <TableHead className={`hidden sm:table-cell ${thStyle}`}>Email</TableHead>
                    <TableHead className={thStyle}>Dept</TableHead>
                    <TableHead className={thStyle}>Role</TableHead>
                    {/* Only super admins can revoke */}
                    <TableHead className={`text-right pr-5 ${thStyle}`}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <Loader2 className="animate-spin inline-block mr-2" style={{ color: navy }} size={20} />
                      </TableCell>
                    </TableRow>
                  ) : sortedAdmins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-slate-400 italic text-sm">
                        No staff registered yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedAdmins.map(admin => (
                      <TableRow key={admin.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors" style={{ height: 64 }}>

                        {/* Name */}
                        <TableCell className="pl-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0"
                              style={{
                                background: admin.role === 'super_admin' ? `${navy}12` : 'rgba(100,116,139,0.1)',
                                color: admin.role === 'super_admin' ? navy : '#64748b',
                              }}>
                              {initials(admin)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{fullName(admin)}</p>
                              {admin.program && (
                                <p className="text-xs font-mono text-slate-400">{admin.program}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Staff ID */}
                        <TableCell>
                          <span className="font-bold text-sm" style={{ color: navy, fontFamily: "'DM Mono',monospace" }}>
                            {admin.id}
                          </span>
                        </TableCell>

                        {/* Email */}
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-xs text-slate-500 font-medium">{admin.email || '—'}</span>
                        </TableCell>

                        {/* Dept */}
                        <TableCell>
                          {admin.deptID ? (
                            <span className="font-bold text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap"
                              style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                              {admin.deptID}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </TableCell>

                        {/* Role badge — read-only, no toggle */}
                        <TableCell>
                          {admin.role === 'super_admin' ? (
                            <Badge className="bg-primary/10 text-primary border-none text-[9px] uppercase tracking-widest px-2 py-1 rounded-full gap-1 font-bold">
                              <BadgeCheck size={10} /> Super Admin
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-400 border-slate-200 text-[9px] uppercase tracking-widest px-2 py-1 rounded-full gap-1 font-bold">
                              <Shield size={10} /> Admin
                            </Badge>
                          )}
                        </TableCell>

                        {/* Actions — Revoke only, and only for non-super-admin targets */}
                        <TableCell className="text-right pr-5">
                          {/* Cannot revoke a super_admin; only super_admin actor can revoke regular admins */}
                          {admin.role !== 'super_admin' && isSuperAdmin ? (
                            <button
                              onClick={() => { setStaffToRevoke({ id: admin.id, name: fullName(admin) }); setIsRevokeAlertOpen(true); }}
                              title="Revoke admin access — set back to student"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95"
                              style={{ background: 'rgba(239,68,68,0.07)', color: '#dc2626', borderColor: 'rgba(239,68,68,0.2)' }}>
                              <UserX size={13} /> Revoke
                            </button>
                          ) : (
                            <span className="text-slate-200 text-xs font-medium">
                              {admin.role === 'super_admin' ? 'Protected' : '—'}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Footer note */}
            <div className="px-5 py-3 border-t border-slate-100 text-xs font-medium text-slate-400">
              To promote a student to Admin, the student must submit a <strong>Request Admin Privilege</strong> via the Credential Requests tab.
              Super Admin status cannot be granted by anyone through the UI.
            </div>
          </CardContent>
        )}
      </Card>

      {/* Revoke alert */}
      <AlertDialog open={isRevokeAlertOpen} onOpenChange={setIsRevokeAlertOpen}>
        <AlertDialogContent className="rounded-3xl p-6 w-[calc(100vw-2rem)] max-w-sm mx-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-red-600" style={{ fontFamily: "'Playfair Display',serif" }}>
              Revoke Admin Access
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 text-sm leading-relaxed">
              Revoke admin privileges for <strong>{staffToRevoke?.name}</strong>?
              Their role will be set back to <strong>Student</strong> — their account and all logs are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-4 flex-row gap-2">
            <AlertDialogCancel className="flex-1 rounded-xl h-11 font-semibold text-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevoke}
              className="flex-1 rounded-xl h-11 font-semibold text-sm text-white"
              style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
              Confirm Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </>
  );
}