# NEU Library Portal

[![NEU Library Portal](https://img.shields.io/badge/NEU%20Library-Portal-blue?style=for-the-badge)](https://shawndavidsdomingo-neu-library.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-11-orange?style=for-the-badge&logo=firebase)](https://firebase.google.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)

> **Institutional Presence & Visitor Management System for the New Era University Library**

**Live Site → [https://shawndavidsdomingo-neu-library.vercel.app/](https://shawndavidsdomingo-neu-library.vercel.app/)**

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [User Roles & Access Control](#user-roles--access-control)
- [Feature Deep-Dive](#feature-deep-dive)
  - [Visitor Kiosk Terminal](#1-visitor-kiosk-terminal)
  - [Student Portal](#2-student-portal)
  - [Visitor Registration](#3-visitor-registration)
  - [Staff Console](#4-staff-console)
  - [Super Admin Console](#5-super-admin-console)
- [Firestore Data Schema](#firestore-data-schema)
- [Security Rules](#security-rules)
- [Design System](#design-system)
- [AI Integration](#ai-integration)
- [Smart Logic: No-Tap & Midnight Cut-off](#smart-logic-no-tap--midnight-cut-off)
- [PDF Reports](#pdf-reports)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Known Limitations](#known-limitations)
- [Changelog](#changelog)

---

## Overview

The **NEU Library Portal** is a full-stack, real-time visitor management system built for the New Era University Library. It replaces manual paper-based logbooks with a digital system that supports:

- **RFID-simulated check-in/check-out** at a self-service kiosk terminal
- **Google Institutional Login** for students and staff (`@neu.edu.ph`)
- **Live administrative dashboards** with real-time Firestore listeners
- **AI-powered attendance reports** via Google Gemini (Genkit)
- **Role-based access control** for students, staff, and super admins
- **Automated missed tap-out detection** with in-app student notifications

The system is deployed as a **static export** on GitHub Pages and communicates directly with Firebase (Firestore + Auth), with no custom backend server required.

---

## Key Features

| Feature | Description |
|---|---|
| 🖥️ Visitor Kiosk | RFID-simulated check-in and smart checkout terminal |
| 🎓 Student Portal | Personal attendance history, charts, analytics, and notifications |
| 🛡️ Staff Console | Registry management, live feed, reports, and pending approvals |
| 👑 Super Admin Console | Full CRUD, staff access management, departments, AI reports |
| 📊 Analytics Dashboard | Department and purpose breakdowns with interactive Recharts |
| 🤖 AI Summary | Genkit + Gemini generates scholarly trend analysis from log data |
| 📄 PDF Export | Downloadable visit reports filtered by date range |
| 🔔 Notifications | Admin-to-student in-app messaging for missed tap-outs |
| 📢 Bulk Notify | Send missed tap-out alerts to all pending students at once |
| 🎯 Purpose Management | Super Admins manage visit purposes live from Firestore |
| 📤 CSV Export | Download full or filtered registry as a CSV file |
| 🔍 Audit Log | Immutable record of every admin action with actor, target, timestamp |
| 🔥 Visit Streak | Students see current and best consecutive visit streaks |
| 📋 Credential Requests | Students request name/ID/dept changes; admins review with granular approval |
| ⏱ Occupancy Verification | 3-hour auto-prompt confirms presence; admin can manually trigger at any time |
| 🔴 Request Notification Dot | Red badge on Requests nav item counts pending credential change requests |
| ⚠️ Missed Tap-Out Tab | Full management table for students who forgot to check out |
| 🕐 Live Clock | Real-time clock displayed across all dashboards |
| 📱 Responsive | Fully mobile-responsive with a bottom navigation bar |
| 🔒 Firestore Rules | Server-enforced security with institutional email gating |

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| [Next.js](https://nextjs.org/) | 15.5 | React framework, App Router, static export |
| [React](https://react.dev/) | 19.2 | UI library |
| [TypeScript](https://www.typescriptlang.org/) | 5 | Type safety |
| [Tailwind CSS](https://tailwindcss.com/) | 3.4 | Utility-first styling |
| [shadcn/ui](https://ui.shadcn.com/) | — | Radix-based component library |
| [Lucide React](https://lucide.dev/) | 0.475 | Icon library |
| [Recharts](https://recharts.org/) | 2.15 | Interactive data charts |
| [date-fns](https://date-fns.org/) | 3.6 | Date manipulation |
| [React Hook Form](https://react-hook-form.com/) | 7.54 | Form management |
| [Zod](https://zod.dev/) | 3.24 | Schema validation |

### Backend / Infrastructure
| Technology | Version | Purpose |
|---|---|---|
| [Firebase](https://firebase.google.com/) | 11.10 | Auth, Firestore real-time DB |
| [Genkit](https://firebase.google.com/docs/genkit) | 1.28 | AI orchestration framework |
| [Google Gemini](https://ai.google.dev/) | 1.5 Flash/Pro | AI-powered visit summaries |
| [jsPDF](https://github.com/parallax/jsPDF) | 2.5 | PDF generation |
| [jspdf-autotable](https://github.com/simonbengtsson/jsPDF-AutoTable) | 3.8 | Table rendering in PDFs |
| [SWR](https://swr.vercel.app/) | 2.3 | Stale-while-revalidate caching |

### Deployment
| Technology | Purpose |
|---|---|
| [GitHub Pages](https://pages.github.com/) | Static hosting |
| [GitHub Actions](https://github.com/features/actions) | CI/CD pipeline |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      GitHub Pages (CDN)                     │
│              Next.js 15 Static Export (/NEULib/)            │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS
          ┌──────────────────┴───────────────────┐
          │                                       │
   ┌──────▼──────┐                       ┌───────▼───────┐
   │  Firebase   │                       │ Google Gemini │
   │    Auth     │                       │  (Genkit AI)  │
   │  Firestore  │                       │ Visit Summary │
   └──────┬──────┘                       └───────────────┘
          │ Real-time listeners (onSnapshot)
   ┌──────▼────────────────────────────────────────┐
   │              Firestore Collections            │
   │  /users   /library_logs   /departments        │
   │  /programs  /notifications                    │
   └───────────────────────────────────────────────┘
```

The app uses **real-time Firestore listeners** (`onSnapshot`) for all live data via a custom `useCollection` and `useDoc` hook layer. All writes use a **non-blocking fire-and-forget pattern** (`setDocumentNonBlocking`, `updateDocumentNonBlocking`) to keep the UI responsive. A global `FirebaseErrorListener` component catches Firestore permission errors and surfaces them to the user.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                  # Main router — handles all view transitions
│   ├── layout.tsx                # Root layout with background image + fonts
│   ├── globals.css               # Global styles, custom utility classes
│   └── api/ai-summary/route.ts   # Server route for AI visit summary
│
├── components/
│   ├── terminal/
│   │   └── TerminalView.tsx      # Visitor kiosk check-in/out terminal
│   ├── student/
│   │   ├── StudentDashboard.tsx  # Student personal portal
│   │   └── VisitorDashboard.tsx  # New visitor registration flow
│   ├── admin/
│   │   ├── AdminDashboard.tsx    # Role router (staff vs super admin)
│   │   ├── SuperAdminDashboard.tsx
│   │   ├── StaffDashboard.tsx
│   │   ├── StatsCards.tsx        # KPI summary cards with filters
│   │   ├── LiveFeed.tsx          # Real-time check-in/out activity feed
│   │   ├── CurrentVisitors.tsx   # Live presence table (inside right now)
│   │   ├── VisitorChart.tsx      # Daily traffic bar chart
│   │   ├── AnalyticsBreakdown.tsx # Dept + purpose pie/bar charts
│   │   ├── NoTapWidget.tsx       # Mini widget: unwarned missed tap-outs
│   │   ├── MissedTapOutTab.tsx   # Full tab: missed tap-outs, bulk notify, message picker
│   │   ├── PurposeManagement.tsx # Super Admin tab: manage /visit_purposes collection
│   │   ├── AuditLogTab.tsx       # Super Admin tab: read-only audit trail
│   │   ├── ReportModule.tsx      # PDF report generator
│   │   ├── UserManagement.tsx    # Student/user CRUD registry
│   │   ├── AdminAccessManagement.tsx  # Staff role management
│   │   ├── TemporaryVisitorManagement.tsx # Pending visitor approvals
│   │   ├── DepartmentManagement.tsx
│   │   ├── ImportStudentDialog.tsx    # Bulk CSV import
│   │   └── AddEditUserDialog.tsx
│   ├── LiveClock.tsx             # Live digital clock component
│   └── FirebaseErrorListener.tsx # Global Firestore error handler
│
├── lib/
│   └── audit-logger.ts           # writeAuditLog() utility called on every admin action
│
├── firebase/
│   ├── index.ts                  # Firebase initialization
│   ├── config.ts                 # Firebase project config
│   ├── provider.tsx              # FirebaseProvider context
│   ├── client-provider.tsx       # Client-side wrapper
│   ├── firestore/
│   │   ├── use-collection.tsx    # Real-time collection hook
│   │   └── use-doc.tsx           # Real-time document hook
│   ├── non-blocking-updates.tsx  # Fire-and-forget write helpers
│   ├── non-blocking-login.tsx    # Fire-and-forget auth helpers
│   ├── error-emitter.ts          # Typed pub/sub event emitter
│   └── errors.ts                 # FirestorePermissionError class
│
├── ai/
│   ├── genkit.ts                 # Genkit + Google AI initialization
│   ├── dev.ts                    # Genkit dev server entry
│   └── flows/
│       └── ai-powered-visit-summary-flow.ts  # AI summary flow
│
├── lib/
│   ├── firebase-schema.ts        # TypeScript types + static reference data
│   ├── utils.ts                  # cn() utility
│   └── placeholder-images.ts
│
├── hooks/
│   ├── use-toast.ts
│   └── use-mobile.tsx
│
└── components/ui/                # shadcn/ui component library
    └── [accordion, alert, avatar, badge, button, calendar,
        card, chart, checkbox, dialog, dropdown-menu, form,
        input, label, popover, progress, radio-group, scroll-area,
        select, separator, sheet, skeleton, slider, switch,
        table, tabs, textarea, toast, toaster, tooltip, ...]
```

---

## User Roles & Access Control

The system has four user roles, all stored in the unified `/users` Firestore collection:

```
Role          Description                          Access
────────────────────────────────────────────────────────────────
student       Registered NEU student               Student Portal
visitor       Unverified / pending registration    Visitor Registration
admin         Library staff member                 Staff Console
super_admin   Full-access administrator            Super Admin Console
```

### Role Determination Flow

```
Google Login
     │
     ▼
Lookup /users by email
     │
     ├─ role = 'admin' or 'super_admin' ──► Admin Console (or Student Portal if via Student button)
     │
     ├─ role = 'student' ─────────────────► Student Portal
     │
     ├─ role = 'visitor' ─────────────────► Visitor Dashboard (pending)
     │
     └─ not found + @neu.edu.ph ──────────► Visitor Registration flow
```

### Admin vs Super Admin Capabilities

| Feature | Staff (Admin) | Super Admin |
|---|---|---|
| View dashboards & analytics | ✅ | ✅ |
| Manage student registry | ✅ | ✅ |
| View/approve pending visitors | ✅ | ✅ |
| Generate PDF reports | ✅ | ✅ |
| Notify students (missed tap-out) | ✅ | ✅ |
| Delete logs or user records | ❌ | ✅ |
| Manage staff access / promote roles | ❌ | ✅ |
| Manage departments | ❌ | ✅ |
| Toggle super admin on other users | ❌ | ✅ |

### Role Switching
Staff and super admins who log in via the **Student Portal** button are automatically detected and shown an **Admin ↔ Student** toggle button in the sidebar, allowing seamless switching between views without re-authenticating.

---

## Feature Deep-Dive

### 1. Visitor Kiosk Terminal

**File:** `src/components/terminal/TerminalView.tsx`

The kiosk is the primary physical touchpoint for library visitors. It supports two identification methods:

**RFID Simulation**
- A single input field accepts a Student ID (format: `YY-XXXXX-ZZZ`)
- On submission, the system queries `/users` by ID and retrieves the user profile
- If the student has an open session today → **Check Out** (logs `checkOutTimestamp`)
- If no active session → **Check Out** (creates new log with `checkInTimestamp`)
- Blocked users are shown an access-denied screen

**Google Institutional Login**
- Restricted to `@neu.edu.ph` Google accounts
- Performs the same smart check-in/check-out logic after identity resolution

**Purpose of Visit Selection**
After identity is confirmed, the student selects their visit purpose:
- Reading Books
- Research
- Computer Use
- Assignments

**Smart Cut-off Logic**
- If a student's last open session is from a **previous day**, it is treated as stale
- The terminal starts a **fresh new session** rather than closing the old one
- Stale sessions are automatically flagged as **"No Tap"** in all admin views

---

### 2. Student Portal

**File:** `src/components/student/StudentDashboard.tsx`

Students log in with their `@neu.edu.ph` Google account to access their personal dashboard.

**Tabs:**
- **Overview** — Total visits, total study hours, most frequent purpose, weekly activity summary
- **History** — Sortable/filterable full attendance log table with duration per session
- **Analytics** — Personal bar chart (visits per day) and purpose breakdown pie chart with custom date range
- **Messages** — In-app notifications from admins (e.g. missed tap-out warnings). Unread count badge on tab
- **Profile** — Student ID, department, program, email, account status

**Admin ↔ Student Toggle**
Admins who access the Student Portal see a toggle button in the sidebar and mobile nav to switch back to the Admin Console without re-logging in.

---

### 3. Visitor Registration

**File:** `src/components/student/VisitorDashboard.tsx`

New `@neu.edu.ph` users who are not yet in the system are routed to a guided registration flow where they:
1. Confirm their name (pre-filled from Google)
2. Enter their Student ID
3. Select their department and program
4. Submit — creating a `/users` doc with `role: 'visitor'` and `status: 'pending'`

Their record then appears in the **Pending Visitors** tab of the admin console for approval.

---

### 4. Staff Console

**File:** `src/components/admin/StaffDashboard.tsx`

Navigation tabs available to regular staff (`admin` role):

| Tab | Description |
|---|---|
| Overview | KPI cards, traffic chart, analytics breakdown, live feed, no-tap widget, quick actions |
| Live Presence | Real-time table of who is currently inside the library today |
| Live Traffic | Scrollable feed of recent check-in/check-out events |
| Registry | Full student registry with search, filter, block/unblock toggle, add/edit/delete |
| Pending | Visitor approval queue with notification dot badge |
| Reports | Date-range PDF report generator |
| Missed Tap-Outs | Full management table for missed tap-outs with message picker |

---

### 5. Super Admin Console

**File:** `src/components/admin/SuperAdminDashboard.tsx`

All staff tabs **plus** additional exclusive tabs:

| Tab | Description |
|---|---|
| Staff Access | Register new staff, promote students to admin/super admin, revoke access |
| Missed Tap-Outs | Full table + bulk notify with message picker |
| Visit Purposes | Add, edit, hide, delete visit purposes shown in kiosk |
| Audit Log | Read-only chronological record of all admin actions |
| Departments | Add, edit, and manage NEU college departments |

**Staff Access Management** features:
- Register new staff directly by name, Staff ID, and email
- Search existing students by email or Student ID and promote them to admin/super admin
- Toggle super admin status per-user
- Revoke admin access (demotes back to student)

---

## Firestore Data Schema

All users are stored in a **single unified collection** (`/users`). Document IDs are the user's institutional ID, not the Firebase UID.

### `/users/{id}`

```typescript
interface UserRecord {
  id:          string;       // Doc ID = student/staff ID
  firstName:   string;
  middleName?: string;
  lastName:    string;
  email:       string;
  role:        'student' | 'admin' | 'super_admin' | 'visitor';
  status:      'active' | 'pending' | 'blocked';
  deptID?:     string;       // e.g. "CICS"
  program?:    string;       // e.g. "BSIT"
  temporaryId?: string;      // For unverified visitors
  addedAt?:    string;       // ISO timestamp
}
```

### `/library_logs/{logId}`

```typescript
interface LibraryLogRecord {
  id:                  string;
  studentId:           string;   // Linked to /users
  deptID:              string;
  checkInTimestamp:    string;   // ISO 8601
  checkOutTimestamp?:  string;   // ISO 8601, absent if still inside
  purpose:             string;
  studentName?:        string;   // Denormalized for performance
}
```

### `/departments/{deptID}`

```typescript
interface DepartmentRecord {
  deptID:         string;   // e.g. "CICS"
  departmentName: string;   // e.g. "College of Informatics and Computing Studies"
}
```

### `/notifications/{notifId}`

```typescript
{
  studentId:   string;
  studentName: string;
  logId:       string;            // Linked to /library_logs
  type:        'no_tap_warning';
  message:     string;
  sentAt:      string;            // ISO timestamp
  read:        boolean;           // true when student acknowledges
}
```

### `/visit_purposes/{purposeId}`

```typescript
interface VisitPurpose {
  id:      string;   // slug e.g. "reading-books"
  label:   string;   // display label e.g. "Reading Books"
  value:   string;   // stored value in logs
  order:   number;   // display order in kiosk
  active:  boolean;  // whether shown in kiosk
}
```

### `/credential_requests/{reqId}`

```typescript
interface CredentialRequest {
  studentId:   string;            // doc ID of requesting student
  studentName: string;
  email:       string;
  type:        'name' | 'student_id' | 'dept_program';
  status:      'pending' | 'pending_verification' | 'approved' | 'partial' | 'revoked';
  current:     Record<string, string>;   // snapshot of fields before change
  requested:   Record<string, string>;   // what the student wants changed
  reason:      string;
  requiresVerification?: boolean;        // true for ID and dept_program changes
  verified?:   boolean;                  // toggled by admin after physical check
  adminNote?:  string;                   // revocation reason
  approvedFields?: Record<string, string>; // only for partial name approvals
  createdAt:   string;
  updatedAt:   string;
}
```

**Security:** Firestore rule — students can create; NEU staff can read/update; owner can delete.

**Student ID change flow:** Because user doc IDs equal student IDs, an ID change copies the full user document to the new doc ID and deletes the old doc atomically.

### `/audit_logs/{logId}`

```typescript
interface AuditLogRecord {
  action:      string;   // e.g. 'user.block', 'role.promote', 'user.delete'
  actorId:     string;   // Firebase UID of admin who acted
  actorName:   string;
  actorEmail:  string;
  targetId?:   string;   // ID of affected user/record
  targetName?: string;
  detail?:     string;   // Human-readable description
  timestamp:   string;   // ISO 8601
}
```

**Audit Action Types:** `user.block`, `user.unblock`, `user.delete`, `user.edit`, `user.add`, `user.import`, `role.promote`, `role.demote`, `role.toggle_super`, `staff.add`, `staff.revoke`, `notification.send`, `dept.add`, `dept.delete`, `purpose.add`, `purpose.delete`, `purpose.toggle`

### `/programs/{programId}`

```typescript
interface ProgramRecord {
  id:     string;
  deptID: string;
  code:   string;   // e.g. "BSIT"
  name:   string;   // e.g. "Bachelor of Science in Information Technology"
}
```

### Supported Departments

The system ships with 16 NEU colleges pre-seeded:

| Code | College |
|---|---|
| LIBRARY | Library |
| ABM | College of Accountancy |
| CAS | College of Arts and Sciences |
| CBA | College of Business Administration |
| CICS | College of Informatics and Computing Studies |
| CRIM | College of Criminology |
| CED | College of Education |
| CEA | College of Engineering and Architecture |
| CON | College of Nursing |
| CMT | College of Medical Technology |
| COC | College of Communication |
| CPT | College of Physical Therapy |
| CRT | College of Respiratory Therapy |
| COMS | College of Music |
| COM | College of Midwifery |
| COA | College of Agriculture |
| SOIR | School of International Relations |

---

## Security Rules

**File:** `firestore.rules`

The rules are designed around the constraint that **Firestore document IDs are student/staff IDs, not Firebase UIDs** — making UID-based role lookups inside rules impossible without a mirror collection.

```
Collection        Read                    Write
──────────────────────────────────────────────────────────────────
/users            Any authenticated user  NEU email, owner, or self
/library_logs     Any signed-in user      Any authenticated user
/departments      Public                  NEU institutional email
/programs         Public                  NEU institutional email
/notifications    Any signed-in user      Any authenticated user
/visit_purposes   Public (kiosk anon.)    NEU institutional email
/audit_logs       NEU institutional email Auth users create only (immutable)
```

Key design decisions:
- **Owner email** (`shawndavidsobremontedomingo@gmail.com`) has unrestricted access as a hardcoded fallback
- **Deletes** are restricted to the owner email only
- **UI-layer RBAC** handles finer-grained role enforcement (e.g. only super admins see the Staff Access tab)
- NEU institutional emails (`@neu.edu.ph`) are trusted for writes since only enrolled users can obtain them

---

## Design System

### Color Palette

| Token | Value | Usage |
|---|---|---|
| Primary (Navy) | `hsl(221, 72%, 22%)` | Buttons, active states, headings |
| Navy Light | `hsl(221, 60%, 35%)` | Hover states, gradients |
| Gold / Accent | `hsl(43, 85%, 55%)` | Highlights, notification badges, active nav |
| Background | Translucent white over `neulibrary.jpg` | Global |
| Destructive | `hsl(0, 72%, 51%)` | Errors, block actions |
| Emerald | `#059669` | Success states, acknowledged status |
| Amber | `hsl(38, 90%, 48%)` | Warnings, missed tap-outs, notified status |

### Typography

| Font | Weight | Usage |
|---|---|---|
| Playfair Display | 600, 700, 800 | All headings (`font-headline`) |
| DM Sans | 300–700 | Body text (`font-body`) |
| DM Mono | 400, 500 | IDs, timestamps, code (`font-mono`) |

### Background

A fixed, full-viewport image (`/NEULib/neulibrary.jpg`) with a navy gradient overlay sits at `z-index: -50` across all views:

```css
background: linear-gradient(
  160deg,
  rgba(10, 26, 77, 0.52) 0%,
  rgba(10, 26, 77, 0.28) 50%,
  rgba(10, 26, 77, 0.44) 100%
)
```

### Custom CSS Classes

| Class | Description |
|---|---|
| `.school-card` | White frosted glass card with navy shadow |
| `.smart-stat-card` | KPI stat card with hover lift effect |
| `.kiosk-button` | Large selection button on the home screen |
| `.glass-panel` | Pure frosted-glass surface |
| `.live-dot` | Pulsing red dot for live indicators |
| `.hero-title` | Large gradient headline text |

### Component Library

Built on **shadcn/ui** with **Radix UI** primitives:
Accordion, Alert, AlertDialog, Avatar, Badge, Button, Calendar, Card, Carousel, Chart, Checkbox, Collapsible, Dialog, DropdownMenu, Form, Input, Label, Menubar, Popover, Progress, RadioGroup, ScrollArea, Select, Separator, Sheet, Skeleton, Slider, Switch, Table, Tabs, Textarea, Toast, Toaster, Tooltip

---

## AI Integration

**Files:** `src/ai/genkit.ts`, `src/ai/flows/ai-powered-visit-summary-flow.ts`, `src/app/api/ai-summary/route.ts`

The AI Visit Summary feature uses **Firebase Genkit** with the **Google Gemini** model family to generate a scholarly analysis of library visit trends.

### API Key Security

The Gemini API key is a **server-side-only secret**. It must **never** be hardcoded in source files or prefixed with `NEXT_PUBLIC_`.

```bash
# .env.local  (git-ignored — never committed)
GEMINI_API_KEY=your_key_here
```

Set this variable in your deployment platform (Vercel → Settings → Environment Variables, or Firebase App Hosting → env config). The `/api/ai-summary` route reads `process.env.GEMINI_API_KEY` at runtime; the browser never sees it.

### How It Works

1. Admin selects a date range and clicks **AI Insights** in `ReportModule.tsx`
2. The app calls `/api/ai-summary` (a Next.js server-side API route), passing up to 50 visit records
3. The route checks `process.env.GEMINI_API_KEY` — if unset, returns 503 immediately
4. Genkit sends a structured prompt to Gemini covering peak hours, purposes, departments, and actionable insights
5. The response is displayed in the report card

### Model Fallback Chain

```
googleai/gemini-2.0-flash-exp  →  googleai/gemini-1.5-flash  →  googleai/gemini-1.5-pro
```

### Statistical Fallback (always available)

If all AI models fail (quota exceeded, key not set, network error, or 503), the system automatically computes a **client-side statistical summary** from raw log data — no API call needed. The summary includes:

- Peak activity hour with visit count
- Most common visit purpose (out of N unique purposes)
- Most active department
- Unique student count
- Average completed session duration

This means the AI Insights button **always produces useful output** regardless of API availability.

---

## Smart Logic: No-Tap & Midnight Cut-off

### Missed Tap-Out Detection

A session is classified as **"No Tap"** when:
- `checkInTimestamp` is from a **previous calendar day**, AND
- `checkOutTimestamp` is **absent**

This is evaluated client-side at render time — no scheduled job or cloud function is needed.

```typescript
const isNoTap = !log.checkOutTimestamp && !isToday(parseISO(log.checkInTimestamp));
```

### Midnight Cut-off

When a student taps in on a new day, the system checks their most recent log. If that log is stale (previous day, no checkout):
- The stale log is **ignored** for checkout purposes
- A **new check-in session** is created
- The stale log is permanently flagged as No Tap in all views and reports

### Visit Streak Gamification

The Student Portal Overview displays two streak metrics computed entirely client-side:

- **Current Streak** — consecutive calendar days with at least one library visit ending today or yesterday. If the last visit was two or more days ago, the streak resets to 0.
- **Best Streak** — the longest consecutive run of visit days in the student's full history.

```typescript
// A day counts toward the streak only if the session was completed
// (has checkOutTimestamp) or is active today — stale no-taps are excluded.
const visitDays = new Set(logs.filter(l =>
  l.checkOutTimestamp || isToday(parseISO(l.checkInTimestamp))
).map(l => format(parseISO(l.checkInTimestamp), 'yyyy-MM-dd')));
```

### Missed Tap-Out Tab

The **Missed Tap-Outs** admin tab (`MissedTapOutTab.tsx`) provides:
- A full sortable/filterable data table of all stale sessions (de-duplicated per student)
- Status badges: **Pending** (not yet notified), **Notified** (message sent, awaiting acknowledgement), **Acknowledged** (student read the notification)
- A **message picker modal** triggered by the Notify / Re-notify button

### Notification Message Presets

**Bulk Notify All Pending** — A red banner appears at the top of the tab whenever there are unnotified students. Clicking "Notify All Pending" opens a bulk message modal with the same 4 presets. Each student receives an individual notification with their specific missed date substituted in automatically. A progress counter shows how many were sent successfully.

**Self-Service Tap-Out** — Students see an **"I Have Already Left"** button on missed tap-out notifications in their Messages tab. Clicking it writes the `checkOutTimestamp` (approximated from the notification's `sentAt`) to the stale log and marks the notification as read — reducing admin workload without any manual intervention.

When notifying a student individually, admins choose from 4 preset messages or write a custom one:

| Preset | Style |
|---|---|
| Standard System Alert | Formal, system-generated tone |
| Friendly Reminder | Warm, casual tone |
| Formal Notice | Official institutional language |
| Polite Follow-Up | Gentle, empathetic tone |

The `[DATE]` placeholder in each preset is automatically replaced with the actual missed clock-in date before sending. A **live message preview** updates in real-time as the admin types or selects a preset.

---

## PDF Reports

**File:** `src/components/admin/ReportModule.tsx`

Admins can generate a downloadable PDF attendance report using **jsPDF + jspdf-autotable**:

**Report Contents:**
- NEU Library header with branding
- Selected date range
- Total visits per college/department (table)
- Purpose of visit percentage breakdown (table)
- Optional AI-generated narrative summary (Genkit)
- Page numbers and generation timestamp

**Filtering:**
- Custom start and end date
- Filter by department
- Filter by visit purpose

---

## Deployment

The app is deployed as a **Next.js static export** (`output: 'export'`) to **GitHub Pages** via GitHub Actions.

### GitHub Actions Workflow

**File:** `.github/workflows/nextjs.yml`

```
Push to main branch
       │
       ▼
Install dependencies (npm ci)
       │
       ▼
Build (next build) with Firebase env secrets
       │
       ▼
Upload /out directory as artifact
       │
       ▼
Deploy to GitHub Pages
```

### Base Path

The app is served from `/NEULib/` — all asset paths, images, and the background photo use this prefix:

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/NEULib',
  assetPrefix: '/NEULib',
};
```

---

## Environment Variables

> ⚠️ **Security**: Never hardcode API keys in source files. All secrets must be in `.env.local` (local dev) or your deployment platform's environment settings (production). The `.env.local` file is git-ignored and never committed.

Copy `.env.local.example` to `.env.local` and fill in your values:

```bash
cp .env.local.example .env.local
```

Set these in your GitHub repository's **Secrets** (for CI) or in a local `.env.local` file:

```env
# Firebase project configuration
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Google Gemini API key (for AI summary feature)
GOOGLE_GENAI_API_KEY=
```

> ⚠️ **Note:** `NEXT_PUBLIC_*` variables are embedded into the static bundle at build time and will be visible in the client-side JavaScript. For a production deployment, consider restricting the Firebase API key in the Google Cloud Console to your deployed domain.

---

## Local Development

### Prerequisites

- Node.js 20+
- npm
- Firebase CLI (for deploying rules): `npm install -g firebase-tools`

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/shawndavidsdomingo/NEULib.git
cd NEULib

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env.local
# Fill in your Firebase and Gemini API credentials

# 4. Start the development server (Turbopack, port 9002)
npm run dev
```

Open [http://localhost:9002/NEULib](http://localhost:9002/NEULib)

### Available Scripts

| Script | Command | Description |
|---|---|---|
| Dev server | `npm run dev` | Starts Next.js with Turbopack on port 9002 |
| Build | `npm run build` | Production static export to `/out` |
| Lint | `npm run lint` | ESLint check |
| Type check | `npm run typecheck` | TypeScript check without emit |
| Genkit dev | `npm run genkit:dev` | Start Genkit developer UI |
| Genkit watch | `npm run genkit:watch` | Genkit with file watching |

### Deploying Firestore Rules

After modifying `firestore.rules`, deploy to Firebase:

```bash
firebase login
firebase deploy --only firestore:rules
```

---

## Known Limitations

- **Static export + API routes:** The `/api/ai-summary` route uses Next.js Route Handlers which are **not supported** in a fully static export. The AI summary either needs to be called client-side directly, or the app needs to be redeployed to a platform that supports server-side rendering (Vercel, Firebase App Hosting).
- **No push notifications:** Student notifications are in-app only. Students must open the portal to see messages.
- **RFID simulation only:** The kiosk uses a text input to simulate RFID — physical hardware integration requires a separate RFID reader bridging solution.
- **Single-region Firestore:** All data is stored in the default Firebase Firestore region. For production at scale, consider multi-region configuration.
- **Firestore UID mismatch:** User document IDs are student/staff IDs, not Firebase UIDs. This limits Firestore Security Rules from doing server-side role lookups by UID, so fine-grained write controls rely on institutional email matching.

---

## Changelog

### Current (v0.1 — Institutional Release)

- ✅ Visitor Kiosk terminal with RFID simulation and Google Login
- ✅ Smart check-in/check-out with midnight cut-off logic
- ✅ Student Portal with personal analytics and notification inbox
- ✅ Visitor registration and pending approval workflow
- ✅ Staff Console with 6 navigation tabs
- ✅ Super Admin Console with 8 navigation tabs
- ✅ Real-time analytics: department breakdown (pie), purpose breakdown (bar), daily traffic (bar)
- ✅ Live Presence and Live Traffic tabs
- ✅ KPI Stats Cards with department, purpose, and visitor-type filters
- ✅ Missed Tap-Outs tab with message picker (4 presets + custom)
- ✅ NoTap Widget on overview dashboard
- ✅ Pending visitor notification dot on nav
- ✅ Admin ↔ Student view switching
- ✅ AI-powered visit summary (Genkit + Gemini) with statistical fallback
- ✅ PDF report export with date range filtering
- ✅ Bulk CSV student import
- ✅ Staff Access Management (promote, demote, register, revoke)
- ✅ Department Management CRUD
- ✅ Responsive layout with mobile bottom navigation
- ✅ Live Clock component
- ✅ GitHub Actions CI/CD to GitHub Pages

### Latest Refinements (UI Cleanup & Logic)
- ✅ **Landing Page 2+2 Layout** — Two primary kiosk-style cards (Kiosk, Admin) + two compact action buttons (Register, Request Credential) in a clean 2-column row
- ✅ **Register button** — Checks NEU Mail; if already registered shows a kiosk-style popup with 5s countdown then redirects to kiosk; if new user proceeds to registration form
- ✅ **Removed duplicate Live Presence** — `traffic` tab removed; single `presence` tab (Live Presence / CurrentVisitors) in both SuperAdmin and Staff dashboards
- ✅ **Verify button removed** from Live Presence — flow is now direct Tap → Reason → Welcome Message; no student prompts
- ✅ **Admin Welcome Screen** — changed from solid navy "blue screen" to neutral `backdrop-filter: blur(16px)` with white card and gold avatar; integrates naturally with the dashboard behind it
- ✅ **Student ID auto-dash in Request Credential** — `CredentialRequestModal` Student ID field now uses strict clean-then-format logic: strips all non-digits, rebuilds `XX-XXXXX-XXX` from scratch, preventing `24-128644-444` type errors
- ✅ **Firestore auth race fix** — `/users` read rule relaxed to `isSignedIn()` (was `isAuthenticatedUser()`); `getIdToken(true)` forced before every `resolveUserByEmail` call; retry-with-backoff added for permission errors
- ✅ **Admin whitelist routing** — owner email path now sets `resolvedUser` with `super_admin` role before routing to AdminDashboard

### Previous Updates
- ✅ **Audit Log Full View** — expand icon on each row opens a modal with the complete untruncated detail, actor info, target, and ISO timestamp
- ✅ **AI statistical fallback** — clicking AI Insights now always produces output; if the API is unavailable, a full statistical summary (peak hour, top purpose, top dept, avg duration, unique students) is computed client-side
- ✅ **API key security** — removed hardcoded Gemini API key from all source files; key is now read from `GEMINI_API_KEY` env var (server-side only, never exposed to browser); added `.env.local.example` template

### Previous Fixes
- ✅ **Credential requests closed after action** — Approve/Revoke buttons hidden once a request is approved, partially approved, or revoked; replaced with a read-only status indicator
- ✅ **Student ID change now works** — Copies user doc to new ID, deletes old doc; student is notified with their new ID
- ✅ **Admin/Student switch persists on refresh** — Admin state saved to `sessionStorage` so refresh no longer loses the switcher button
- ✅ **Red notification badge on Requests nav** — Live count of pending/pending-verification requests shown in sidebar and mobile drawer
- ✅ **Smooth themed scrollbars** — All overflow areas use `scrollbarWidth: thin` with navy-toned track colors matching the UI
- ✅ **Occupancy verification** — 3-hour auto-dialog on student portal; manual "Verify" button per active session in Live Presence
- ✅ **Credential Request system** — Full workflow: student submits → admin reviews with granular name-field approval → registry auto-updates → student notified

### Previous Updates
- ✅ Bulk Notify All Pending with per-student date substitution
- ✅ Visit Purposes management tab (Firestore-backed, live kiosk update)
- ✅ CSV registry export (full or filtered)
- ✅ Admin Audit Log tab with full action history
- ✅ `writeAuditLog()` utility hooked into UserManagement actions
- ✅ Visit streak (current + best) on Student Portal overview
- ✅ Self-service "I Have Already Left" button on missed tap-out notifications
- ✅ `/visit_purposes` and `/audit_logs` Firestore collections + security rules

---

## License

© 2026 New Era University Library. All Rights Reserved.
This system was developed for institutional use at New Era University, No. 9 Central Avenue, Quezon City, Philippines.

---

*Built with ❤️ for the NEU Library — bridging physical presence with digital intelligence.*
