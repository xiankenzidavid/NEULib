"use client";

import { useState } from 'react';
import { LiveClock } from '@/components/LiveClock';
import { OverviewDashboard } from './OverviewDashboard';
import { UserManagement } from './UserManagement';
import { TemporaryVisitorManagement } from './TemporaryVisitorManagement';
import { LiveFeed } from './LiveFeed';
import { ReportModule } from './ReportModule';
import { AdminAccessManagement } from './AdminAccessManagement';
import { DepartmentManagement } from './DepartmentManagement';
import { CurrentVisitors } from './CurrentVisitors';
import { AuditLogTab } from './AuditLogTab';
import { LogHistory } from './LogHistory';
import { PurposeManagement } from './PurposeManagement';
import { CredentialRequestsTab } from './CredentialRequestsTab';
import {
  Users, LayoutDashboard, FileText, LogOut, ShieldCheck,
  Clock, Building2, MapPin, Scan, Menu, X as XIcon,
  ClipboardList, History, BookOpen, Shield, LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserRecord } from '@/lib/firebase-schema';
import { User } from 'firebase/auth';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';

// Explicit type for nav items — avoids literal tuple conflicts from `as const`
interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

// Defined outside component so TypeScript doesn't re-narrow inside JSX
const NAV_GROUPS: NavGroup[] = [
  {
    title: '🏠 General',
    items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    title: '📊 Monitoring',
    items: [
      { id: 'presence', label: 'Live Presence', icon: MapPin },
      { id: 'history',  label: 'Log History',   icon: History },
    ],
  },
  {
    title: '🗂 Records',
    items: [
      { id: 'users',    label: 'Registry',      icon: Users },
      { id: 'temp',     label: 'Pending',        icon: Clock },
      { id: 'purposes', label: 'Visit Purposes', icon: BookOpen },
      { id: 'requests', label: 'Requests',       icon: ClipboardList },
    ],
  },
  {
    title: '👥 Staff & Organisation',
    items: [
      { id: 'access',      label: 'Staff Access',  icon: ShieldCheck },
      { id: 'departments', label: 'Departments',   icon: Building2 },
    ],
  },
  {
    title: '📑 Reporting & Auditing',
    items: [
      { id: 'reports',  label: 'Reports',   icon: FileText },
      { id: 'auditlog', label: 'Audit Log', icon: Shield },
    ],
  },
];

const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap(g => g.items);

interface UnifiedAdminDashboardProps {
  onSwitchToStudent?: () => void;
  onExit?: () => void;
  adminData?: UserRecord | null;
  user: User | null;
  isSuperAdmin: boolean;
}

const navy     = 'hsl(221,72%,22%)';
const navyGrad = 'linear-gradient(135deg,hsl(221,72%,18%),hsl(221,72%,24%))';

export default function UnifiedAdminDashboard({
  onExit, adminData, user, isSuperAdmin, onSwitchToStudent,
}: UnifiedAdminDashboardProps) {
  const [activeTab,     setActiveTab]     = useState('overview');
  const [showKioskInfo, setShowKioskInfo] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);

  const db = useFirestore();

  // Pending visitors badge
  const pendingQuery = useMemoFirebase(
    () => query(collection(db, 'users'), where('status', '==', 'pending')),
    [db]
  );
  const { data: pendingUsers } = useCollection<UserRecord>(pendingQuery);
  const pendingCount = pendingUsers?.length || 0;

  // Credential requests badge
  const credReqRef = useMemoFirebase(
    () => query(collection(db, 'credential_requests'), where('status', 'in', ['pending', 'pending_verification'])),
    [db]
  );
  const { data: pendingReqs } = useCollection<any>(credReqRef);
  const credReqCount = pendingReqs?.length || 0;

  const displayName = adminData
    ? [adminData.firstName, adminData.middleName, adminData.lastName].filter(Boolean).join(' ')
    : user?.displayName || (isSuperAdmin ? 'Super Administrator' : 'Library Staff');
  const roleLabel = isSuperAdmin ? 'Super Admin' : 'Library Staff';
  const dept      = adminData?.deptID
    ? `${adminData.deptID}${adminData.program ? ' · ' + adminData.program : ''}`
    : roleLabel;
  const initials  = displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  // ── UNIFIED nav — both Admin and Super Admin see ALL tabs ─────────────────
  const navGroups = NAV_GROUPS;
  const allNavItems = ALL_NAV_ITEMS;

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-4 sm:space-y-6">
            <OverviewDashboard />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-start">
              <div className="lg:col-span-2"><LiveFeed /></div>
              <div className="lg:col-span-1 flex flex-col gap-4">
                <Card className="school-card overflow-visible">
                  <CardHeader className="px-4 py-3 border-b border-slate-100">
                    <CardTitle className="text-lg font-bold text-slate-800" style={{ fontFamily: "'Playfair Display',serif" }}>
                      Quick Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pb-4">
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { icon: Users,    label: 'Registry',      id: 'users',    color: navy },
                        { icon: MapPin,   label: 'Live Presence', id: 'presence', color: '#059669' },
                        { icon: FileText, label: 'Reports',       id: 'reports',  color: '#d97706' },
                        { icon: Clock,    label: 'Pending',       id: 'temp',     color: '#7c3aed' },
                        { icon: Scan,     label: 'Kiosk',         id: 'kiosk',    color: '#64748b' },
                      ] as const).map(item => (
                        <button key={item.id}
                          onClick={() => item.id === 'kiosk' ? setShowKioskInfo(true) : setActiveTab(item.id)}
                          className="relative flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all text-center active:scale-95">
                          <div className="p-2.5 rounded-xl" style={{ background: `${item.color}18`, color: item.color }}>
                            <item.icon size={20} />
                          </div>
                          <span className="font-semibold text-slate-700 text-sm leading-tight">{item.label}</span>
                          {item.id === 'temp' && pendingCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold shadow"
                              style={{ background: 'hsl(43,85%,55%)', color: 'hsl(221,72%,15%)' }}>
                              {pendingCount}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        );
      case 'presence':     return <CurrentVisitors />;
      case 'history':      return <LogHistory />;
      case 'users':        return <UserManagement isSuperAdmin={isSuperAdmin} />;
      case 'temp':         return <TemporaryVisitorManagement isSuperAdmin={isSuperAdmin} />;
      case 'reports':      return <ReportModule isSuperAdmin={isSuperAdmin} />;
      case 'purposes':     return <PurposeManagement />;
      case 'requests':     return <CredentialRequestsTab />;
      case 'access':       return <AdminAccessManagement isSuperAdmin={isSuperAdmin} />;
      case 'departments':  return <DepartmentManagement />;
      case 'auditlog':     return <AuditLogTab />;
      default: return null;
    }
  };

  // ── Shared sidebar nav renderer ───────────────────────────────────────────
  const NavItems = ({ onItemClick }: { onItemClick?: () => void }) => (
    <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.2) transparent' }}>
      {navGroups.map(group => (
        <div key={group.title}>
          <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'rgba(255,255,255,0.30)', letterSpacing: '0.12em' }}>
            {group.title}
          </p>
          <div className="space-y-0.5">
            {group.items.map(item => (
              <button key={item.id}
                onClick={() => { setActiveTab(item.id); onItemClick?.(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left"
                style={{
                  background:  activeTab === item.id ? 'rgba(255,255,255,0.14)' : 'transparent',
                  color:       activeTab === item.id ? 'white' : 'rgba(255,255,255,0.45)',
                  borderLeft:  activeTab === item.id ? '3px solid hsl(43,85%,55%)' : '3px solid transparent',
                }}
                onMouseEnter={e => {
                  if (activeTab !== item.id) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)';
                    (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.75)';
                  }
                }}
                onMouseLeave={e => {
                  if (activeTab !== item.id) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)';
                  }
                }}>
                <item.icon size={17} />
                <span className="flex-1">{item.label}</span>
                {item.id === 'temp' && pendingCount > 0 && (
                  <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold"
                    style={{ background: 'hsl(43,85%,55%)', color: 'hsl(221,72%,15%)' }}>
                    {pendingCount}
                  </span>
                )}
                {item.id === 'requests' && credReqCount > 0 && (
                  <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold"
                    style={{ background: '#ef4444', color: 'white' }}>
                    {credReqCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  // ── Bottom actions ────────────────────────────────────────────────────────
  const BottomActions = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="p-4 border-t border-white/10 space-y-2">
      {onSwitchToStudent && (
        <button onClick={() => { onItemClick?.(); setConfirmSwitch(true); }}
          className="w-full flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-sm font-bold transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.9)', color: navy }}>Admin</span>
          <span className="text-white/30">|</span>
          <span className="text-white/50 text-[11px] font-bold">Student</span>
        </button>
      )}
      <button onClick={() => { onItemClick?.(); onExit?.(); }}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left"
        style={{ color: 'rgba(255,255,255,0.35)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.1)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
        <LogOut size={17} /> Sign Out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* ══ SIDEBAR (desktop) ══ */}
      <aside className="hidden lg:flex w-64 xl:w-72 flex-col flex-shrink-0 sticky top-0 h-screen"
        style={{ background: navyGrad, borderRight: '1px solid rgba(255,255,255,0.08)', boxShadow: '4px 0 32px rgba(0,0,0,0.2)' }}>

        {/* Logo */}
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0">
            <img src="/neu_logo.png" alt="NEU" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
          </div>
          <div>
            <p className="text-white font-bold text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>NEU Library</p>
            <p className="text-white/40 font-medium" style={{ fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {isSuperAdmin ? 'Super Admin' : 'Staff Console'}
            </p>
          </div>
        </div>

        {/* User card */}
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,hsl(43,85%,55%),hsl(38,90%,48%))', color: 'hsl(221,72%,12%)' }}>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-base leading-tight truncate">{displayName}</p>
            <p className="text-white/45 font-medium truncate" style={{ fontSize: '0.82rem' }}>{dept}</p>
          </div>
        </div>

        <NavItems />
        <BottomActions />
      </aside>

      {/* ══ MAIN ══ */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <div className="sticky top-0 z-40 px-4 sm:px-6 py-3 flex items-center justify-between border-b"
          style={{ background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(20px)', borderColor: 'rgba(10,26,77,0.08)' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl transition-all active:scale-95"
              style={{ background: `${navy}0d`, color: navy }}
              aria-label="Open menu">
              <Menu size={22} />
            </button>
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                {allNavItems.find(n => n.id === activeTab)?.label || 'Overview'}
              </h1>
              <p className="text-slate-400 text-sm font-medium mt-0.5 hidden sm:block">{dept}</p>
            </div>
          </div>
          <LiveClock variant="dark" className="hidden sm:flex" />
        </div>

        {/* ── MOBILE DRAWER ── */}
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-[60] lg:hidden"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
              onClick={() => setMenuOpen(false)} />
            <div className="fixed top-0 left-0 bottom-0 z-[70] lg:hidden flex flex-col w-72"
              style={{ background: navyGrad, boxShadow: '4px 0 32px rgba(0,0,0,0.35)', paddingBottom: 'env(safe-area-inset-bottom,0px)' }}>
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,hsl(43,85%,55%),hsl(38,90%,48%))', color: 'hsl(221,72%,12%)' }}>
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm leading-tight truncate max-w-[150px]">{displayName}</p>
                    <p className="text-white/45 font-medium truncate max-w-[150px]" style={{ fontSize: '0.75rem' }}>{dept}</p>
                  </div>
                </div>
                <button onClick={() => setMenuOpen(false)}
                  className="p-2 rounded-xl hover:bg-white/10 transition-all text-white/50 hover:text-white flex-shrink-0">
                  <XIcon size={18} />
                </button>
              </div>
              <NavItems onItemClick={() => setMenuOpen(false)} />
              <BottomActions onItemClick={() => setMenuOpen(false)} />
            </div>
          </>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6 space-y-4 sm:space-y-5"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(221,72%,70%) transparent' }}>
          <div key={activeTab} className="animate-in fade-in duration-200">
            {renderContent()}
          </div>
        </main>
      </div>

      {/* Kiosk modal */}
      {showKioskInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}><Scan size={20} /></div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>Enter Visitor Kiosk</h3>
                <p className="text-slate-400 text-sm">Switch to kiosk terminal</p>
              </div>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              Use the kiosk to <strong>check yourself in/out</strong>. Enter your <strong>Staff ID</strong> at the terminal.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowKioskInfo(false)}
                className="flex-1 h-11 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button onClick={() => { setShowKioskInfo(false); onExit?.(); }}
                className="flex-1 h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2"
                style={{ background: navy }}>
                <Scan size={15} /> Go to Kiosk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Switch */}
      {confirmSwitch && (
        <div className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 99999, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
                <Users size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>Switch to Student View?</h3>
                <p className="text-slate-400 text-sm">You will be redirected to the Student Dashboard.</p>
              </div>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              Your admin session is preserved — switch back anytime using the <strong>Admin | Student</strong> toggle.
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setConfirmSwitch(false)}
                className="flex-1 h-11 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                Stay in Admin
              </button>
              <button onClick={() => { setConfirmSwitch(false); onSwitchToStudent?.(); }}
                className="flex-1 h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all"
                style={{ background: navy }}>
                Switch to Student
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}