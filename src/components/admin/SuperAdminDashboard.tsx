"use client";

import { useState } from 'react';
import { LiveClock } from '@/components/LiveClock';
import { StatsCards } from './StatsCards';
import { UserManagement } from './UserManagement';
import { TemporaryVisitorManagement } from './TemporaryVisitorManagement';
import { LiveFeed } from './LiveFeed';
import { ReportModule } from './ReportModule';
import { AdminAccessManagement } from './AdminAccessManagement';
import { DepartmentManagement } from './DepartmentManagement';
import { VisitorChart } from './VisitorChart';
import { AnalyticsBreakdown } from './AnalyticsBreakdown';
import { CurrentVisitors } from './CurrentVisitors';
import { NoTapWidget } from './NoTapWidget';
import { MissedTapOutTab } from './MissedTapOutTab';
import { AuditLogTab } from './AuditLogTab';
import { PurposeManagement } from './PurposeManagement';
import { CredentialRequestsTab } from './CredentialRequestsTab';
import {
  Users, LayoutDashboard, FileText,
  LogOut, ShieldCheck, Clock, Building2, MapPin, Scan, Activity, AlertTriangle, BookOpen, Shield, Menu, X as XIcon, ClipboardList,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserRecord } from '@/lib/firebase-schema';
import { User } from 'firebase/auth';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';

interface SuperAdminDashboardProps {
  onSwitchToStudent?: () => void;
  onExit?: () => void;
  adminData?: UserRecord | null;
  user: User | null;
}

const navy = 'hsl(221,72%,22%)';
const navyGrad = 'linear-gradient(135deg,hsl(221,72%,18%),hsl(221,72%,24%))';

export default function SuperAdminDashboard({ onExit, adminData, user, onSwitchToStudent }: SuperAdminDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [showKioskInfo, setShowKioskInfo] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // All hooks must be called at the top level
  const db = useFirestore();
  
  // Credential request count badge
  const credReqRef = useMemoFirebase(
    () => query(collection(db, 'credential_requests'), where('status', 'in', ['pending', 'pending_verification'])), 
    [db]
  );
  const { data: pendingReqs } = useCollection<any>(credReqRef);
  const credReqCount = pendingReqs?.length || 0;

  // Pending visitors count for notification dot
  const pendingQuery = useMemoFirebase(
    () => query(collection(db, 'users'), where('status', '==', 'pending')),
    [db]
  );
  const { data: pendingUsers } = useCollection<UserRecord>(pendingQuery);
  const pendingCount = pendingUsers?.length || 0;

  // Derived state (no hooks here)
  const displayName = adminData
    ? [adminData.firstName, adminData.middleName, adminData.lastName].filter(Boolean).join(' ')
    : user?.displayName || 'Super Administrator';
  const dept = adminData?.deptID ? `${adminData.deptID}${adminData.program ? ' · ' + adminData.program : ''}` : 'Super Admin';
  const initials = displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  // Flat list kept for header title lookup and mobile nav
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'presence', label: 'Live Presence', icon: MapPin },
    { id: 'traffic', label: 'Live Traffic', icon: Activity },
    { id: 'missed', label: 'Missed Tap-Outs', icon: AlertTriangle },
    { id: 'users', label: 'Registry', icon: Users },
    { id: 'temp', label: 'Pending', icon: Clock },
    { id: 'purposes', label: 'Visit Purposes', icon: BookOpen },
    { id: 'access', label: 'Staff Access', icon: ShieldCheck },
    { id: 'departments', label: 'Departments', icon: Building2 },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'auditlog', label: 'Audit Log', icon: Shield },
    { id: 'requests', label: 'Requests', icon: ClipboardList },
  ];

  // Grouped nav for the sidebar
  const navGroups = [
    {
      title: '🏠 General',
      items: [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      ],
    },
    {
      title: '📊 Monitoring & Real-Time Data',
      items: [
        { id: 'presence', label: 'Live Presence', icon: MapPin },
        { id: 'traffic', label: 'Live Traffic', icon: Activity },
        { id: 'missed', label: 'Missed Tap-Outs', icon: AlertTriangle },
      ],
    },
    {
      title: '🗂 Records & Registries',
      items: [
        { id: 'users', label: 'Registry', icon: Users },
        { id: 'temp', label: 'Pending', icon: Clock },
        { id: 'purposes', label: 'Visit Purposes', icon: BookOpen },
        { id: 'requests', label: 'Requests', icon: ClipboardList },
      ],
    },
    {
      title: '👥 Staff & Organisation',
      items: [
        { id: 'access', label: 'Staff Access', icon: ShieldCheck },
        { id: 'departments', label: 'Departments', icon: Building2 },
      ],
    },
    {
      title: '📑 Reporting & Auditing',
      items: [
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'auditlog', label: 'Audit Log', icon: Shield },
      ],
    },
  ] as const;

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-4 sm:space-y-6">
            <StatsCards />
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
              <div className="xl:col-span-1"><VisitorChart /></div>
              <div className="xl:col-span-2"><AnalyticsBreakdown /></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-start">
              <div className="lg:col-span-2"><LiveFeed /></div>
              <div className="lg:col-span-1 flex flex-col gap-4">
                <NoTapWidget />
                <Card className="school-card overflow-visible">
                  <CardHeader className="px-4 py-3 border-b border-slate-100">
                    <CardTitle className="text-lg font-bold text-slate-800" style={{ fontFamily: "'Playfair Display',serif" }}>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pb-4">
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { icon: Users, label: 'Registry', id: 'users', color: navy },
                        { icon: MapPin, label: 'Live Presence', id: 'presence', color: '#059669' },
                        { icon: Activity, label: 'Live Traffic', id: 'traffic', color: '#0891b2' },
                        { icon: FileText, label: 'Reports', id: 'reports', color: '#d97706' },
                        { icon: Clock, label: 'Pending', id: 'temp', color: '#7c3aed' },
                        { icon: Scan, label: 'Kiosk', id: 'kiosk', color: '#64748b' },
                      ] as const).map(item => (
                        <button key={item.id}
                          onClick={() => item.id === 'kiosk' ? setShowKioskInfo(true) : setActiveTab(item.id)}
                          className="relative flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all text-center active:scale-95">
                          <div className="p-2.5 rounded-xl" style={{ background: `${item.color}18`, color: item.color }}>
                            <item.icon size={20} />
                          </div>
                          <span className="font-semibold text-slate-700 text-sm leading-tight">{item.label}</span>
                          {/* Pending badge on quick action card */}
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
      case 'presence':
        return <CurrentVisitors />;
      case 'traffic':
        return <LiveFeed />;
      case 'users':
        return <UserManagement isSuperAdmin={true} />;
      case 'temp':
        return <TemporaryVisitorManagement isSuperAdmin={true} />;
      case 'reports':
        return <ReportModule isSuperAdmin={true} />;
      case 'access':
        return <AdminAccessManagement isSuperAdmin={true} />;
      case 'departments':
        return <DepartmentManagement />;
      case 'missed':
        return <MissedTapOutTab />;
      case 'purposes':
        return <PurposeManagement />;
      case 'auditlog':
        return <AuditLogTab />;
      case 'requests':
        return <CredentialRequestsTab />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* ══ SIDEBAR ══ */}
      <aside className="hidden lg:flex w-64 xl:w-72 flex-col flex-shrink-0 sticky top-0 h-screen"
        style={{ background: navyGrad, borderRight: '1px solid rgba(255,255,255,0.08)', boxShadow: '4px 0 32px rgba(0,0,0,0.2)' }}>

        {/* Logo */}
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0">
            <img src="/neu_logo.png" alt="NEU" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
          </div>
          <div>
            <p className="text-white font-bold text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>NEU Library</p>
            <p className="text-white/40 font-medium" style={{ fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Super Admin</p>
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

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.2) transparent" }}>
          {navGroups.map(group => (
            <div key={group.title}>
              {/* Group title */}
              <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: 'rgba(255,255,255,0.30)', letterSpacing: '0.12em' }}>
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <button key={item.id} onClick={() => setActiveTab(item.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left"
                    style={{
                      background: activeTab === item.id ? 'rgba(255,255,255,0.14)' : 'transparent',
                      color: activeTab === item.id ? 'white' : 'rgba(255,255,255,0.45)',
                      borderLeft: activeTab === item.id ? '3px solid hsl(43,85%,55%)' : '3px solid transparent',
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

        {/* Bottom: switcher + sign out */}
        <div className="p-4 border-t border-white/10 space-y-2">
          {onSwitchToStudent && (
            <>
              <button onClick={() => setConfirmSwitch(true)}
                className="w-full flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-sm font-bold transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)' }}>
                <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.9)', color: 'hsl(221,72%,22%)' }}>Admin</span>
                <span className="text-white/30">|</span>
                <span className="text-white/50 hover:text-white/80 transition-colors text-[11px] font-bold">Student</span>
              </button>
            </>
          )}
          <button onClick={onExit}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-base font-semibold transition-all text-left"
            style={{ color: 'rgba(255,255,255,0.35)' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = '#f87171';
              (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.1)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)';
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}>
            <LogOut size={17} /> Sign Out
          </button>
        </div>
      </aside>

      {/* ══ MAIN ══ */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top header bar */}
        <div className="sticky top-0 z-40 px-4 sm:px-6 py-3 flex items-center justify-between border-b"
          style={{ background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(20px)', borderColor: 'rgba(10,26,77,0.08)' }}>
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl transition-all active:scale-95"
              style={{ background: `${navy}0d`, color: navy }}
              aria-label="Open menu">
              <Menu size={22} />
            </button>
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                {navItems.find(n => n.id === activeTab)?.label || 'Overview'}
              </h1>
              <p className="text-slate-400 text-sm font-medium mt-0.5 hidden sm:block">{dept}</p>
            </div>
          </div>
          <LiveClock variant="dark" className="hidden sm:flex" />
        </div>

        {/* ── MOBILE HAMBURGER DRAWER ── */}
        {menuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[60] lg:hidden"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
              onClick={() => setMenuOpen(false)}
            />
            {/* Drawer */}
            <div
              className="fixed top-0 left-0 bottom-0 z-[70] lg:hidden flex flex-col w-72"
              style={{ background: navyGrad, boxShadow: '4px 0 32px rgba(0,0,0,0.35)', paddingBottom: 'env(safe-area-inset-bottom,0px)' }}>

              {/* Drawer header */}
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

              {/* Grouped nav — same as desktop sidebar */}
              <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.2) transparent" }}>
                {navGroups.map(group => (
                  <div key={group.title}>
                    <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: 'rgba(255,255,255,0.30)', letterSpacing: '0.12em' }}>
                      {group.title}
                    </p>
                    <div className="space-y-0.5">
                      {group.items.map(item => (
                        <button key={item.id}
                          onClick={() => { setActiveTab(item.id); setMenuOpen(false); }}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all text-left active:scale-95"
                          style={{
                            background: activeTab === item.id ? 'rgba(255,255,255,0.14)' : 'transparent',
                            color: activeTab === item.id ? 'white' : 'rgba(255,255,255,0.55)',
                            borderLeft: activeTab === item.id ? '3px solid hsl(43,85%,55%)' : '3px solid transparent',
                          }}>
                          <item.icon size={18} />
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

              {/* Bottom actions — switcher + sign out */}
              <div className="p-4 border-t border-white/10 space-y-2">
                {onSwitchToStudent && (
                  <button onClick={() => { setMenuOpen(false); setConfirmSwitch(true); }}
                    className="w-full flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl text-sm font-bold transition-all active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
                    <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.9)', color: 'hsl(221,72%,22%)' }}>Admin</span>
                    <span className="text-white/30">|</span>
                    <span className="text-white/55 text-[11px] font-bold">Student</span>
                  </button>
                )}
                <button
                  onClick={() => { setMenuOpen(false); onExit?.(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-left transition-all active:scale-95"
                  style={{ color: '#f87171', background: 'rgba(248,113,113,0.1)' }}>
                  <LogOut size={16} /> Sign Out
                </button>
              </div>
            </div>
          </>
        )}

        {/* Page content — smooth fade transition */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6 space-y-4 sm:space-y-5" style={{ scrollbarWidth: "thin", scrollbarColor: "hsl(221,72%,70%) transparent" }}>
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
              <div className="p-2.5 rounded-xl text-white" style={{ background: 'hsl(221,72%,22%)' }}>
                <Users size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>Switch to Student View?</h3>
                <p className="text-slate-400 text-sm">You will be redirected to the Student Dashboard.</p>
              </div>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              Your admin session is preserved — you can switch back anytime using the <strong>Admin | Student</strong> toggle in the sidebar.
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setConfirmSwitch(false)}
                className="flex-1 h-11 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                Stay in Admin
              </button>
              <button onClick={() => { setConfirmSwitch(false); onSwitchToStudent?.(); }}
                className="flex-1 h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all"
                style={{ background: 'hsl(221,72%,22%)' }}>
                Switch to Student
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}