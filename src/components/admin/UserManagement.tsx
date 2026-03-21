"use client";

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search, Loader2, GraduationCap, Filter,
  ArrowUpDown, ArrowUp, ArrowDown, Upload, FileDown,
  ShieldOff, ShieldCheck, RotateCcw, Clock, X, Copy, Check,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, updateDocumentNonBlocking, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, doc, query, where, getDocs } from 'firebase/firestore';
import { UserRecord, DepartmentRecord, ProgramRecord, formatFullName } from '@/lib/firebase-schema';
import { writeAuditLog } from '@/lib/audit-logger';
import { ImportStudentDialog } from './ImportStudentDialog';
import { SuccessCard } from '@/components/ui/SuccessCard';

interface UserManagementProps { isSuperAdmin: boolean; }

const navy = 'hsl(221,72%,22%)';

type SortField = 'id' | 'lastName' | 'deptID' | 'program' | 'role' | 'status';

function sortWithStaffPinned<T>(items: T[], getKey: (item: T) => string, dir: 'asc' | 'desc' = 'asc'): T[] {
  return [...items].sort((a, b) => {
    const ka = getKey(a); const kb = getKey(b);
    const aS = ka === 'LIBRARY' || ka.toUpperCase().includes('STAFF');
    const bS = kb === 'LIBRARY' || kb.toUpperCase().includes('STAFF');
    if (aS && !bS) return -1; if (!aS && bS) return 1;
    return dir === 'asc' ? ka.localeCompare(kb) : kb.localeCompare(ka);
  });
}

// ── Profile Modal ──────────────────────────────────────────────────────────
function ProfileModal({
  student, deptName, programEntry, isSuperAdmin, currentActorId,
  onClose, onBlock,
}: {
  student: UserRecord;
  deptName: string;
  programEntry: ProgramRecord | null;
  isSuperAdmin: boolean;
  currentActorId?: string;
  onClose: () => void;
  onBlock: (u: UserRecord) => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<'id' | 'email' | null>(null);
  const s = student;

  const isBlocked       = s.status === 'blocked';
  const isStaff         = s.role === 'admin' || s.role === 'super_admin' || (s.program||'').toUpperCase().includes('STAFF');
  const isSuperAdminRec = s.role === 'super_admin';
  const isSelf          = s.id === currentActorId;
  const canToggle       = isSuperAdmin && !isSuperAdminRec && !isSelf;

  const accentColor  = isBlocked ? '#dc2626' : isStaff ? 'hsl(43,85%,50%)' : navy;
  const accessLabel  = isSuperAdminRec ? 'Super Admin' : isStaff ? 'Staff / Faculty' : 'Student';
  const initials     = [(s.firstName||'')[0], (s.lastName||'')[0]].filter(Boolean).join('').toUpperCase() || '?';

  const copyText = async (text: string, field: 'id' | 'email') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      toast({ title: 'Copied!', description: `${field === 'id' ? 'Student ID' : 'Email'} copied to clipboard.` });
      setTimeout(() => setCopied(null), 2000);
    } catch { toast({ title: 'Copy failed', variant: 'destructive' }); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.60)', backdropFilter: 'blur(8px)', animation: 'profileFadeIn 0.18s ease-out' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
        style={{ animation: 'profileScaleIn 0.22s ease-out', fontFamily: "'DM Sans',sans-serif" }}>

        {/* Accent top bar — colour changes by access level */}
        <div className="h-1.5" style={{ background: accentColor }} />

        {/* Header */}
        <div className="px-7 pt-6 pb-5 flex items-start gap-4 border-b border-slate-100">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-xl text-white flex-shrink-0 shadow-lg"
            style={{ background: isBlocked ? '#94a3b8' : `linear-gradient(135deg,${accentColor},${accentColor}bb)` }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className={`text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full flex items-center gap-1 w-fit ${isBlocked ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isBlocked ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
                {isBlocked ? 'RESTRICTED' : 'ACTIVE'}
              </span>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <X size={16} />
              </button>
            </div>
            <h2 className="text-xl font-bold text-slate-900 leading-tight" style={{ fontFamily: "'Playfair Display',serif" }}>
              {formatFullName(s)}
            </h2>
            <button onClick={() => copyText(s.id, 'id')}
              className="flex items-center gap-1.5 text-sm font-mono font-bold mt-1 group transition-colors hover:opacity-70"
              style={{ color: navy }}>
              {s.id}
              {copied === 'id' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} className="opacity-0 group-hover:opacity-60" />}
            </button>
          </div>
        </div>

        {/* Body — two-column */}
        <div className="px-7 py-5 grid grid-cols-2 gap-5">
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Academic Info</p>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-0.5">Department</p>
              <p className="text-sm font-semibold text-slate-800 leading-snug">{deptName || s.deptID || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-0.5">Program</p>
              {programEntry ? (
                <>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md inline-block mb-0.5"
                    style={{ background: 'hsl(262,83%,58%,0.08)', color: 'hsl(262,83%,45%)', fontFamily: "'DM Mono',monospace" }}>
                    {programEntry.code}
                  </span>
                  <p className="text-xs font-medium text-slate-600 leading-snug">{programEntry.name}</p>
                </>
              ) : <p className="text-sm font-semibold text-slate-800">{s.program || '—'}</p>}
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Access Details</p>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-0.5">Classification</p>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={isStaff ? { background: `${navy}10`, color: navy } : { background: 'hsl(43,85%,52%,0.12)', color: 'hsl(38,90%,35%)' }}>
                {accessLabel}
              </span>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-0.5">Access Level</p>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isBlocked ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                {isBlocked ? 'Restricted' : 'Active'}
              </span>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-0.5">Email</p>
              <button onClick={() => s.email && copyText(s.email, 'email')}
                className="flex items-center gap-1 text-xs font-medium text-slate-600 group hover:text-slate-900 transition-colors max-w-full">
                <span className="break-all text-left">{s.email || '—'}</span>
                {s.email && (copied === 'email' ? <Check size={10} className="text-emerald-500 flex-shrink-0" /> : <Copy size={10} className="opacity-0 group-hover:opacity-60 flex-shrink-0" />)}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 pb-6 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
          <button onClick={onClose}
            className="flex items-center gap-1.5 h-10 px-4 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
            <X size={13} /> Close
          </button>
          {canToggle && (
            <button onClick={() => { onBlock(s); onClose(); }}
              className="flex items-center gap-1.5 h-10 px-4 rounded-xl text-xs font-bold border transition-all active:scale-95 ml-auto"
              style={isBlocked
                ? { background: 'rgba(5,150,105,0.08)', color: '#059669', borderColor: 'rgba(5,150,105,0.2)' }
                : { background: 'rgba(239,68,68,0.07)', color: '#dc2626', borderColor: 'rgba(239,68,68,0.2)' }}>
              {isBlocked ? <><ShieldCheck size={13} /> Unblock User</> : <><ShieldOff size={13} /> Block User</>}
            </button>
          )}
        </div>
      </div>
      <style>{`
        @keyframes profileFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes profileScaleIn { from{opacity:0;transform:scale(0.93)} to{opacity:1;transform:scale(1)} }
      `}</style>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function UserManagement({ isSuperAdmin }: UserManagementProps) {
  const [searchTerm,    setSearchTerm]    = useState('');
  const [deptFilter,    setDeptFilter]    = useState('All Departments');
  const [statusFilter,  setStatusFilter]  = useState('All Status');
  const [programFilter, setProgramFilter] = useState('All Programs');
  const [roleFilter,    setRoleFilter]    = useState('All');
  const [sortField,     setSortField]     = useState<SortField>('lastName');
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('asc');
  const [isImportOpen,  setIsImportOpen]  = useState(false);
  const [umRpp,  setUmRpp]  = useState<number>(25);
  const [umPage, setUmPage] = useState(1);
  const [successCard,   setSuccessCard]   = useState<{ title: string; description: string; color?: 'green' | 'navy' | 'amber' } | null>(null);
  const [profileUser,   setProfileUser]   = useState<UserRecord | null>(null);

  const { toast } = useToast();
  const db        = useFirestore();
  const { user }  = useUser();

  const { data: currentUsers } = useCollection<UserRecord>(
    useMemoFirebase(() => user?.email ? query(collection(db, 'users'), where('email', '==', user.email)) : null, [db, user?.email])
  );
  const currentActorRole = currentUsers?.[0]?.role ?? (isSuperAdmin ? 'super_admin' : 'admin');
  const currentActorId   = currentUsers?.[0]?.id;

  const deptsRef    = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const studentsRef = useMemoFirebase(() => query(collection(db, 'users'), where('role', 'in', ['student', 'admin', 'super_admin'])), [db]);
  const programsRef = useMemoFirebase(() => collection(db, 'programs'), [db]);

  const { data: dbDepartments }           = useCollection<DepartmentRecord>(deptsRef);
  const { data: students, isLoading }     = useCollection<UserRecord>(studentsRef);
  const { data: allPrograms }             = useCollection<ProgramRecord>(programsRef);

  const programMap = useMemo(() => {
    const m: Record<string, ProgramRecord> = {};
    allPrograms?.forEach(p => { m[`${p.deptID}::${p.code}`] = p; m[`${p.deptID}::${p.name}`] = p; });
    return m;
  }, [allPrograms]);

  const deptNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    dbDepartments?.forEach(d => { m[d.deptID] = d.departmentName; });
    return m;
  }, [dbDepartments]);

  const sortedDepts  = useMemo(() => !dbDepartments ? [] : sortWithStaffPinned(dbDepartments, d => d.deptID), [dbDepartments]);
  const deptPrograms = useMemo(() => {
    if (!allPrograms || deptFilter === 'All Departments') return [];
    return sortWithStaffPinned(allPrograms.filter(p => p.deptID === deptFilter), p => p.code);
  }, [allPrograms, deptFilter]);

  const isStaffRecord = (u: UserRecord) =>
    u.role === 'admin' || u.role === 'super_admin' || (u.program||'').toUpperCase().includes('STAFF');

  // Three-state: asc → desc → reset to default
  const toggleSort = (field: SortField) => {
    if (sortField !== field) { setSortField(field); setSortDir('asc'); return; }
    if (sortDir === 'asc')   { setSortDir('desc'); return; }
    setSortField('lastName'); setSortDir('asc');
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={12} className="ml-1 opacity-35 inline" />;
    return sortDir === 'asc'
      ? <ArrowUp   size={12} className="ml-1 inline" style={{ color: navy }} />
      : <ArrowDown size={12} className="ml-1 inline" style={{ color: navy }} />;
  };

  const handleReset = useCallback(() => {
    setSearchTerm(''); setDeptFilter('All Departments'); setStatusFilter('All Status');
    setProgramFilter('All Programs'); setRoleFilter('All');
    setSortField('lastName'); setSortDir('asc');
  }, []);

  const isFiltersDirty = searchTerm !== '' || deptFilter !== 'All Departments' ||
    statusFilter !== 'All Status' || programFilter !== 'All Programs' || roleFilter !== 'All' ||
    sortField !== 'lastName' || sortDir !== 'asc';

  const processedStudents = useMemo(() => {
    if (!students) return [];
    return students.filter(s => {
      const srch = searchTerm.toLowerCase();
      const matchSearch = !srch || formatFullName(s).toLowerCase().includes(srch) ||
        (s.email||'').toLowerCase().includes(srch) || (s.id||'').toLowerCase().includes(srch) ||
        (s.program||'').toLowerCase().includes(srch);
      const matchDept   = deptFilter    === 'All Departments' || s.deptID  === deptFilter;
      const matchStatus = statusFilter  === 'All Status'
        || (statusFilter === 'Active'  && s.status !== 'blocked')
        || (statusFilter === 'Blocked' && s.status === 'blocked');
      const matchProg   = programFilter === 'All Programs' || s.program === programFilter;
      const matchRole   = roleFilter    === 'All'
        || (roleFilter === 'Student' && !isStaffRecord(s))
        || (roleFilter === 'Staff'   && isStaffRecord(s));
      return matchSearch && matchDept && matchStatus && matchProg && matchRole;
    }).sort((a, b) => {
      let vA = '', vB = '';
      if      (sortField === 'role')    { vA = isStaffRecord(a)?'Staff':'Student'; vB = isStaffRecord(b)?'Staff':'Student'; }
      else if (sortField === 'status')  { vA = a.status||''; vB = b.status||''; }
      else if (sortField === 'program') {
        vA = (programMap[`${a.deptID}::${a.program}`]?.name || a.program||'').toLowerCase();
        vB = (programMap[`${b.deptID}::${b.program}`]?.name || b.program||'').toLowerCase();
      } else { vA = ((a as any)[sortField]||'').toLowerCase(); vB = ((b as any)[sortField]||'').toLowerCase(); }
      if (sortField === 'deptID') {
        const aS = vA==='library'||vA.includes('staff'); const bS = vB==='library'||vB.includes('staff');
        if (aS&&!bS) return -1; if (!aS&&bS) return 1;
      }
      return sortDir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
    });
  }, [students, searchTerm, deptFilter, statusFilter, programFilter, sortField, sortDir, roleFilter, programMap]);

  // ── Force checkout on block ─────────────────────────────────────────────────
  const toggleBlockStatus = async (target: UserRecord) => {
    if ((target.role==='admin'||target.role==='super_admin') && currentActorRole==='admin') {
      toast({ title: 'Permission Denied', description: 'Only Super Administrators can block/unblock Admins.', variant: 'destructive' }); return;
    }
    if (target.role==='super_admin' && target.id===currentActorId) {
      toast({ title: 'Permission Denied', description: 'Cannot modify your own access.', variant: 'destructive' }); return;
    }
    const newStatus = target.status==='blocked' ? 'active' : 'blocked';
    await updateDocumentNonBlocking(doc(db, 'users', target.id), { status: newStatus });

    // If we are blocking the user, force checkout any active sessions.
    // We need to query ALL logs for this student and check for checkOutTimestamp being null/undefined/empty
    if (newStatus === 'blocked') {
      try {
        // Try multiple ID formats to handle any inconsistencies
        const possibleIds = [
          target.id,
          target.id.replace(/-/g, ''),
          target.id.split('-')[0] + target.id.split('-')[1] + target.id.split('-')[2],
          target.id.split('-')[0] + '-' + target.id.split('-')[1] + target.id.split('-')[2],
        ];
        
        let foundSessions = false;
        
        for (const idFormat of possibleIds) {
          const allLogsQuery = query(
            collection(db, 'library_logs'),
            where('studentId', '==', idFormat)
          );
          const allLogsSnap = await getDocs(allLogsQuery);
          
          // Filter for active sessions (checkOutTimestamp is falsy)
          const activeLogs = allLogsSnap.docs.filter(doc => {
            const data = doc.data();
            const isActive = !data.checkOutTimestamp || data.checkOutTimestamp === '';
            return isActive;
          });
          
          if (activeLogs.length > 0) {
            console.log(`Found ${activeLogs.length} active sessions for ${target.id} (format: ${idFormat})`);
            const now = new Date().toISOString();
            for (const logDoc of activeLogs) {
              await updateDocumentNonBlocking(doc(db, 'library_logs', logDoc.id), {
                checkOutTimestamp: now,
                systemNote: 'Force checked out — account blocked by admin',
              });
            }
            foundSessions = true;
            break;
          }
        }
        
        if (!foundSessions) {
          console.log(`No active sessions found for ${target.id}`);
        }
        
      } catch (error) {
        console.error('Force checkout error:', error);
        // Non-fatal — blocking still proceeds
      }
    }

    writeAuditLog(db, user, newStatus==='blocked' ? 'user.block' : 'user.unblock', {
      targetId: target.id, targetName: formatFullName(target), detail: `Library access set to ${newStatus}`,
    });
    setSuccessCard({
      title: newStatus==='blocked' ? 'Access Blocked' : 'Access Restored',
      description: `${formatFullName(target)}'s library access is now ${newStatus==='blocked'?'blocked':'active'}.`,
      color: newStatus==='blocked' ? 'amber' : 'green',
    });
  };

  const exportCSV = () => {
    if (!students?.length) { toast({ title: 'No data', variant: 'destructive' }); return; }
    const hdrs = ['id','firstName','middleName','lastName','email','deptID','program','role','status'];
    const rows = students.map(s => [s.id,s.firstName||'',s.middleName||'',s.lastName||'',s.email||'',s.deptID||'',s.program||'',s.role||'',s.status||'']);
    const csv  = [hdrs,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href=url; a.download=`NEU_Registry_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    setSuccessCard({ title:'CSV Exported', description:`${students.length} records downloaded.`, color:'navy' });
  };

  const thStyle = 'font-bold text-xs uppercase tracking-wide text-slate-500 select-none cursor-pointer hover:bg-slate-100/60 transition-colors';

  return (
    <>
      {successCard && <SuccessCard title={successCard.title} description={successCard.description} color={successCard.color} onClose={()=>setSuccessCard(null)} />}
      {profileUser && (
        <ProfileModal
          student={profileUser}
          deptName={deptNameMap[profileUser.deptID||'']||''}
          programEntry={programMap[`${profileUser.deptID}::${profileUser.program}`]||null}
          isSuperAdmin={isSuperAdmin}
          currentActorId={currentActorId}
          onClose={()=>setProfileUser(null)}
          onBlock={toggleBlockStatus}
        />
      )}

      <div className="space-y-4" style={{ fontFamily:"'DM Sans',sans-serif" }}>
        <Card className="school-card">
          <CardHeader className="p-5 sm:p-6 border-b border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}><GraduationCap size={18} /></div>
                <div>
                  <CardTitle className="font-bold text-slate-900 text-lg" style={{ fontFamily:"'Playfair Display',serif" }}>Library Registry</CardTitle>
                  <CardDescription className="text-slate-400 font-semibold text-xs uppercase tracking-wide mt-0.5">Immutable Academic Records</CardDescription>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input placeholder="Search name, ID, program..."
                    className="pl-9 w-52 sm:w-64 h-10 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium"
                    value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} />
                </div>

                <Select value={deptFilter} onValueChange={v=>{setDeptFilter(v);setProgramFilter('All Programs');}}>
                  <SelectTrigger className="w-36 h-10 bg-slate-50 border-slate-200 rounded-xl font-semibold text-sm">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Filter size={13} className="flex-shrink-0" style={{color:navy}} />
                      <span className="truncate font-bold" style={{fontFamily:"'DM Mono',monospace",fontSize:'0.8rem'}}>
                        {deptFilter==='All Departments' ? 'Department' : deptFilter}
                      </span>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="All Departments" className="font-semibold">All Departments</SelectItem>
                    {sortedDepts.map(d=>(
                      <SelectItem key={d.deptID} value={d.deptID} className="font-semibold">
                        <span className="font-bold mr-2" style={{fontFamily:"'DM Mono',monospace"}}>{d.deptID}</span>
                        {d.departmentName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {deptFilter!=='All Departments' && (
                  <Select value={programFilter} onValueChange={setProgramFilter}>
                    <SelectTrigger className="w-40 h-10 bg-slate-50 border-slate-200 rounded-xl font-semibold text-sm">
                      <SelectValue placeholder="All Programs" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl max-h-60">
                      <SelectItem value="All Programs" className="font-semibold">All Programs</SelectItem>
                      {deptPrograms.map(p=>(
                        <SelectItem key={p.code} value={p.code} className="font-semibold text-sm py-2">
                          <span className="font-bold mr-2 text-xs px-1.5 py-0.5 rounded whitespace-nowrap inline-block"
                            style={{background:'hsl(221,72%,22%,0.08)',color:'hsl(221,72%,22%)',fontFamily:"'DM Mono',monospace"}}>
                            {p.code}
                          </span>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32 h-10 bg-slate-50 border-slate-200 rounded-xl font-semibold text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="All Status" className="font-semibold">All Status</SelectItem>
                    <SelectItem value="Active"     className="font-semibold">Active</SelectItem>
                    <SelectItem value="Blocked"    className="font-semibold">Blocked</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-36 h-10 bg-slate-50 border-slate-200 rounded-xl font-semibold text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="All"     className="font-semibold">All Roles</SelectItem>
                    <SelectItem value="Staff"   className="font-semibold">Staff / Faculty</SelectItem>
                    <SelectItem value="Student" className="font-semibold">Student</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-1">
                  <button onClick={()=>setIsImportOpen(true)}
                    className="h-10 px-3 rounded-xl font-semibold text-sm gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center transition-all rounded-r-none border-r-0">
                    <Upload size={14}/> Import
                  </button>
                  <button onClick={exportCSV}
                    className="h-10 px-3 rounded-xl font-semibold text-sm gap-2 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center transition-all rounded-l-none">
                    <FileDown size={14}/> Export
                  </button>
                </div>

                {isFiltersDirty && (
                  <button onClick={handleReset}
                    className="flex items-center gap-1.5 h-10 px-3 rounded-xl text-xs font-bold border transition-all active:scale-95"
                    style={{background:'rgba(220,38,38,0.06)',color:'#dc2626',borderColor:'rgba(220,38,38,0.18)'}}>
                    <RotateCcw size={12}/> Reset
                  </button>
                )}
              </div>
            </div>
            <p className="text-slate-400 text-xs font-medium mt-3">
              {processedStudents.length} record{processedStudents.length!==1?'s':''} found
              <span className="ml-2 text-amber-500 font-semibold">· Click any row to view profile</span>
            </p>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/70">
                  <TableRow className="border-b border-slate-100 h-12">
                    <TableHead className={`pl-5 ${thStyle}`} onClick={()=>toggleSort('lastName')}>
                      Student <SortIcon field="lastName"/>
                    </TableHead>
                    <TableHead className={thStyle} onClick={()=>toggleSort('id')}>
                      ID Number <SortIcon field="id"/>
                    </TableHead>
                    <TableHead className={thStyle} onClick={()=>toggleSort('deptID')}>
                      Department <SortIcon field="deptID"/>
                    </TableHead>
                    <TableHead className={`${thStyle} hidden md:table-cell`} onClick={()=>toggleSort('program')}>
                      Program <SortIcon field="program"/>
                    </TableHead>
                    <TableHead className={thStyle} onClick={()=>toggleSort('role')}>
                      Role <SortIcon field="role"/>
                    </TableHead>
                    <TableHead className={thStyle} onClick={()=>toggleSort('status')}>
                      Access Level <SortIcon field="status"/>
                    </TableHead>
                    {isSuperAdmin && (
                      <TableHead className="font-bold text-xs uppercase tracking-wide text-slate-500 text-center">
                        Library Access
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="h-40 text-center">
                      <Loader2 className="animate-spin inline-block" style={{color:navy}} size={24}/>
                    </TableCell></TableRow>
                  ) : processedStudents.length===0 ? (
                    <TableRow><TableCell colSpan={7} className="h-40 text-center text-slate-400 text-sm italic">No matching records.</TableCell></TableRow>
                  ) : processedStudents.slice((umPage-1)*umRpp, umPage*umRpp).map(s => {
                    const programEntry    = programMap[`${s.deptID}::${s.program}`]||null;
                    const isBlocked       = s.status==='blocked';
                    const isSuperAdminRec = s.role==='super_admin';
                    const isSelf          = s.id===currentActorId;
                    const canToggle       = isSuperAdmin && !isSuperAdminRec && !isSelf;

                    return (
                      <TableRow key={s.id}
                        onClick={()=>setProfileUser(s)}
                        className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors cursor-pointer"
                        style={{height:'68px'}}>

                        {/* Name — no truncation */}
                        <TableCell className="pl-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                              style={{background:isBlocked?'#94a3b8':`linear-gradient(135deg,${navy},hsl(221,60%,35%))`}}>
                              {(s.firstName||'S')[0]}{(s.lastName||'S')[0]}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm leading-tight">{formatFullName(s)}</p>
                              <p className="text-slate-400 text-xs font-medium mt-0.5">{s.email}</p>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell onClick={e=>e.stopPropagation()}>
                          <span className="font-bold text-sm" style={{color:navy,fontFamily:"'DM Mono',monospace"}}>{s.id}</span>
                        </TableCell>

                        <TableCell>
                          <span className="font-bold text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap"
                            style={{background:`${navy}0d`,color:navy,fontFamily:"'DM Mono',monospace"}}>
                            {s.deptID}
                          </span>
                        </TableCell>

                        <TableCell className="hidden md:table-cell">
                          {programEntry ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-bold text-xs px-2.5 py-1 rounded-lg w-fit whitespace-nowrap"
                                style={{background:'hsl(262,83%,58%,0.1)',color:'hsl(262,83%,45%)',fontFamily:"'DM Mono',monospace"}}>
                                {programEntry.code}
                              </span>
                              <span className="text-slate-500 text-xs font-medium leading-tight">{programEntry.name}</span>
                            </div>
                          ) : s.program ? (
                            <span className="text-slate-400 text-xs font-medium italic">{s.program}</span>
                          ) : <span className="text-slate-300 text-xs italic">—</span>}
                        </TableCell>

                        <TableCell>
                          {isStaffRecord(s) ? (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                              style={{background:'hsl(221,72%,22%,0.08)',color:'hsl(221,72%,22%)'}}>
                              {s.role==='super_admin'?'Super Admin':'Staff'}
                            </span>
                          ) : (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                              style={{background:'hsl(43,85%,52%,0.12)',color:'hsl(38,90%,35%)'}}>
                              Student
                            </span>
                          )}
                        </TableCell>

                        <TableCell>
                          {isBlocked ? (
                            <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-red-50 text-red-500 border border-red-100">Blocked</span>
                          ) : (
                            <span className="text-xs font-bold px-3 py-1.5 rounded-full border"
                              style={{background:`${navy}08`,color:navy,borderColor:`${navy}20`}}>Active</span>
                          )}
                        </TableCell>

                        {isSuperAdmin && (
                          <TableCell className="text-center" onClick={e=>e.stopPropagation()}>
                            {canToggle ? (
                              <button onClick={()=>toggleBlockStatus(s)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95"
                                style={isBlocked
                                  ? {background:'rgba(5,150,105,0.08)',color:'#059669',borderColor:'rgba(5,150,105,0.2)'}
                                  : {background:'rgba(239,68,68,0.07)',color:'#dc2626',borderColor:'rgba(239,68,68,0.2)'}}>
                                {isBlocked ? <><ShieldCheck size={13}/> Unblock</> : <><ShieldOff size={13}/> Block</>}
                              </button>
                            ) : (
                              <span className="text-slate-200 text-xs font-medium">
                                {isSelf?'Yourself':isSuperAdminRec?'Protected':'—'}
                              </span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <ImportStudentDialog open={isImportOpen} onOpenChange={setIsImportOpen}/>
        {(() => {
            const _tot = processedStudents.length;
            const _pg  = Math.ceil(_tot / umRpp);
            if (_tot === 0) return null;
            return (
              <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-medium text-slate-400">
                    {(umPage-1)*umRpp+1}&ndash;{Math.min(umPage*umRpp,_tot)} of {_tot}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">Rows per page:</span>
                    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100">
                      {([25,50,100] as const).map(n=>(
                        <button key={n} onClick={()=>{ setUmRpp(n); setUmPage(1); }}
                          className="px-2.5 py-1 rounded-md text-xs font-bold transition-all"
                          style={umRpp===n?{background:'hsl(43,85%,50%)',color:'white'}:{color:'#64748b'}}>{n}</button>
                      ))}
                      <button onClick={()=>{const v=parseInt(prompt('Rows per page (10-500):',String(umRpp))||String(umRpp));if(!isNaN(v)&&v>=10&&v<=500){ setUmRpp(v); setUmPage(1);}}}
                        className="px-2.5 py-1 rounded-md text-xs font-bold text-slate-500 hover:bg-white transition-all">Custom</button>
                    </div>
                  </div>
                </div>
                {_pg>1&&(
                  <div className="flex items-center gap-1">
                    <button onClick={()=>{ setUmPage(1); window.scrollTo({top:0,behavior:'smooth'}); }} disabled={umPage===1} className="h-7 px-2 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">&#171;&#171;</button>
                    <button onClick={()=>{ setUmPage((p:number)=>Math.max(1,p-1)); window.scrollTo({top:0,behavior:'smooth'}); }} disabled={umPage===1} className="h-7 px-2.5 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">&#8249;</button>
                    {Array.from({length:_pg},(_,i)=>i+1)
                      .filter(p=>p===1||p===_pg||Math.abs(p-umPage)<=1)
                      .reduce<(number|string)[]>((acc,p,i,a)=>{if(i>0&&(p as number)-(a[i-1] as number)>1)acc.push('...');acc.push(p);return acc;},[])
                      .map((p,i)=>p==='...'?<span key={'e'+i} className="px-1 text-slate-400 text-xs">&#8230;</span>
                        :<button key={p} onClick={()=>{ setUmPage(p as number); window.scrollTo({top:0,behavior:'smooth'}); }} className="h-7 w-7 rounded-lg text-xs font-bold border transition-all"
                           style={umPage===p?{background:'hsl(43,85%,50%)',color:'white',border:'none'}:{borderColor:'#e2e8f0',color:'#64748b'}}>{p}</button>)}
                    <button onClick={()=>{ setUmPage((p:number)=>Math.min(_pg,p+1)); window.scrollTo({top:0,behavior:'smooth'}); }} disabled={umPage===_pg} className="h-7 px-2.5 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">&#8250;</button>
                    <button onClick={()=>{ setUmPage(_pg); window.scrollTo({top:0,behavior:'smooth'}); }} disabled={umPage===_pg} className="h-7 px-2 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30 transition-all">&#187;&#187;</button>
                  </div>
                )}
              </div>
            );
          })()}
      </div>
    </>
  );
}