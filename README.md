<div align="center">

# 📚 NEU Library Portal

**A real-time, serverless library visitor management system for New Era University.**
*Built to replace paper logbooks — one tap at a time.*

[![Live on Firebase](https://img.shields.io/badge/🔥_Firebase-shawnitzkydavidson--neu--library.web.app-orange?style=for-the-badge)](https://shawnitzkydavidson-neu-library.web.app/)
[![Live on Vercel](https://img.shields.io/badge/▲_Vercel-shawndavidsdomingo--neu--library.vercel.app-black?style=for-the-badge)](https://shawndavidsdomingo-neu-library.vercel.app/)

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-11-orange?style=flat-square&logo=firebase)](https://firebase.google.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)

> **2026 Information Management 2 — Midterm Project**
> New Era University · College of Informatics and Computing Studies

</div>

---

## What Is This?

The **NEU Library Portal** replaces manual paper logbooks with a live digital system. A self-service kiosk lets students tap in and out using their Student ID or institutional Google account. Library staff and administrators get a full dashboard to monitor who's inside right now, review visit history, manage credentials, generate reports, and pull AI-powered insights — all without a custom backend.

Everything runs serverless: Next.js exports to static files, Firebase handles authentication and real-time data, and Vercel or Firebase Hosting delivers it to the world.

---

## Live Deployments

| Platform | URL |
|---|---|
| 🔥 Firebase Hosting | https://shawnitzkydavidson-neu-library.web.app/ |
| ▲ Vercel | https://shawndavidsdomingo-neu-library.vercel.app/ |

---

## Key Features

### 🖥️ Self-Service Kiosk Terminal
A touchpoint-style terminal where students identify themselves via **Student ID (RFID simulation)** or **@neu.edu.ph Google login**, pick their visit purpose, and check in or out. The system automatically determines whether to open or close a session. Auto-resets after 5 seconds.

### 🔐 Smart Authentication & Auto-Registration
New `@neu.edu.ph` users are detected at the kiosk and automatically redirected to the registration form — no separate "Register" button needed. Duplicate Student ID detection prevents double registrations.

### 🚫 Blocked User Intercept
Two distinct blocked-user scenarios handled gracefully:
- Blocked student **not** inside → 5-second auto-dismiss alert
- Blocked student **currently inside** → persistent "contact the admin" modal, no auto-dismiss

### 📋 Contact Admin / Credential Requests
Students authenticate with Google from the landing page or kiosk success screen and submit change requests (name, student ID, department, admin privilege, or unblock). All require physical verification at the Admin Office before approval. Blocked students can only submit unblock requests.

### 🕐 Live Presence Monitoring
Real-time table of everyone currently inside the library. Sortable columns, force-checkout on block, and a per-row "Contact Admin" action — all updating live via Firestore `onSnapshot`.

### 📂 Log History — Sessions & Blocked Attempts
Two-tab archive: all check-in/out session records, and every denied entry attempt. Both fully filterable, sortable, and paginated.

### 🗃️ Student Registry
Full student database with search, department/status filters, block/unblock toggle, add/edit/delete, and bulk CSV import.

### ⏳ Pending Visitor Approvals
New registrations that require admin verification queue up here with a live badge count on the nav item.

### 🎯 Visit Purpose Management
Super admins control what reasons appear on the kiosk in real time — add, reorder, show/hide, or delete purposes directly from the dashboard. Changes reflect on the kiosk immediately.

### ✅ Credential Request Review
Admins review student-submitted credential change requests with a physical verification gate (`Mark Verified` must be clicked before `Approve` is available). Full revoke flow with preset or custom reason.

### 👥 Staff Access Management
Register new staff accounts, promote students to admin or super admin, demote, or revoke access entirely.

### 🏛️ Department Management
Add and manage all NEU college departments. 16 pre-seeded colleges shipped out of the box.

### 📊 Reports Hub
- Three PDF templates: **Activity & Engagement** (gold), **Violation Report** (red), **Comprehensive Operations** (navy)
- CSV export for session records
- **Top 5 Visitors** panel always visible in the right column
- **AI Insights** panel generated below filters on click

### 🤖 AI-Powered Insights
Gemini-powered trend analysis via Firebase Genkit. Always produces output — falls back to a fully client-side statistical summary (peak hour, top purpose, top department, unique student count, avg duration) if the API is unavailable.

### 🔍 Audit Log
Every admin action ever taken — immutable, timestamped, with actor, target, and detail. Covers 20+ action types from `user.block` to `purpose.toggle`.

### 📄 Pagination
All five data-heavy admin tables have consistent **25 / 50 / 100 / Custom** rows-per-page controls with gold active state and smooth scroll-to-top on page change.

### 🔄 Student ID Change Cascade
When an ID change is approved, `studentId` is updated atomically across `/library_logs`, `/blocked_attempts`, and `/credential_requests` — so historical records always reflect the current identity.

### 🔒 Firestore Security Rules
Institutional email gating (`@neu.edu.ph`) on all writes. Create-only audit logs (immutable). Fine-grained role enforcement handled at the UI layer via the `isSuperAdmin` prop.

### 📱 Responsive Design
Fully mobile-responsive layout with a bottom navigation bar on small screens.

---



There are **four views** the app can show. Everything routes through `page.tsx`.

```
Landing Page (selection)
    │
    ├─ Kiosk button ─────────────────────► Kiosk Terminal (terminal)
    │                                           │
    │                                           └─ New @neu.edu.ph user → Registration Page (registration)
    │                                                                           │
    │                                                                           └─ On submit → back to Kiosk Terminal
    │
    ├─ Admin button ─► Google Sign-In ──────────────────────────────────────► Admin Dashboard (admin)
    │
    └─ Contact Admin ─► Google Sign-In ─► Credential Request Modal (overlay)
```

---

## View 1 — Landing Page

Three interactive elements on the landing screen:

| Element | Who it's for | What it does |
|---|---|---|
| **Kiosk** card | Everyone | Opens the self-service kiosk terminal |
| **Admin** card | Staff & Super Admins | Google Sign-In popup → routes to Admin Dashboard |
| **Contact Admin** button | Registered students | Google Sign-In → opens Credential Request Modal |

There is **no "Register" button**. First-time students go to the Kiosk, sign in with their `@neu.edu.ph` Google account, and the system detects they're new and redirects them to the Registration Page automatically.

Error states handled on the landing page:
- **Wrong domain** — non-`@neu.edu.ph` email used for Admin or Contact Admin → friendly popup
- **Not registered as staff** — valid NEU email but no admin role → instructions to contact a Super Admin
- **Not registered at all** — valid NEU email but no user record → instructions to register via Kiosk
- **ID not found** — Student ID typed at kiosk not in database → instructions to register via Google login at the Kiosk

---

## View 2 — Kiosk Terminal

The **only interface students use day-to-day.** Walks through up to four steps:

### Step 1 — Authentication (`auth`)

**RFID / ID Scan**
- Student types their Student ID (`XX-YYYYY-ZZZ` format) — simulates an RFID scan
- System does a `getDoc` lookup on `/users/{studentId}`
- Found + active → skip to Step 3 (purpose)
- Found + **blocked** → access denied
  - If blocked student has an **open session today** (was blocked while inside): persistent modal — *"You have been blocked while inside. Please contact the Admin."* No auto-dismiss, no entry.
  - If blocked student is **not** currently inside: amber alert with 5-second countdown auto-dismiss
- Not found → popup explaining how to register via Google login at the Kiosk

**Institutional Login (Google)**
- Restricted to `@neu.edu.ph` accounts
- Found in `/users` → proceed to Step 3
- **Not found** → automatically redirected to Registration Page

### Step 2 — Department/Program (`dept`)
Only shown for newly registered students who didn't complete dept selection during registration. Dropdowns populated live from `/departments` and `/programs`.

### Step 3 — Purpose of Visit (`purpose`)

Student picks why they're visiting. Options loaded live from `/visit_purposes` in Firestore (admin-controlled, ordered by the `order` field). Fallback defaults if collection is empty:
- Reading & Private Study
- Thesis & Research
- Computer Usage
- Academic Assignments

On confirmation:
- **Check-in** → new `/library_logs` document created (`checkInTimestamp`)
- **Check-out** → existing open log updated (`checkOutTimestamp`) + session duration computed

The system knows whether to check in or out based on whether the student has an open session (no `checkOutTimestamp`) from today.

### Step 4 — Success Screen (`success`)

Shows student name, department, action (Checked In / Checked Out), and — on checkout — the session duration. Auto-resets to Step 1 after a 5-second countdown.

**"Contact Admin" button** is available here. After identifying via Google Sign-In, the student can open the Credential Request Modal without leaving the kiosk.

---

## View 3 — Registration Page

Triggered automatically when a `@neu.edu.ph` user signs into the kiosk but is not found in `/users`. The student fills in:

- Full name (pre-filled from Google account, editable)
- Student ID (`XX-YYYYY-ZZZ` — validated and auto-dashed as the student types)
- Department and Program (dropdowns from Firestore)

On submit, a `/users` document is created with `role: 'student'` and `status: 'active'`. The student is immediately passed back to the kiosk terminal — no admin approval required.

**Duplicate ID protection:** the form checks both the Firestore doc ID and a `where('id', '==', ...)` query. If the ID already exists on another account, a clear error is shown.

---

## View 4 — Admin Dashboard

Accessible only to `admin` and `super_admin` roles. Both roles share one unified dashboard — all tabs are visible to both.

### Navigation Groups & Tabs

**🏠 General**
| Tab | ID | Description |
|---|---|---|
| Overview | `overview` | KPI summary cards with quick-action links |

**📊 Monitoring**
| Tab | ID | Description |
|---|---|---|
| Live Presence | `presence` | Real-time table of everyone currently inside; sortable; force-checkout on block |
| Log History | `history` | Two sub-tabs: *Sessions* (all check-in/out records) and *Blocked Attempts* (every denied entry) |

**🗂 Records**
| Tab | ID | Description |
|---|---|---|
| Registry | `users` | Full student database — search, filter, block/unblock, add/edit/delete, CSV import |
| Pending | `temp` | Visitor registration approval queue |
| Visit Purposes | `purposes` | Add, edit, reorder, show/hide purposes displayed on the kiosk |
| Requests | `requests` | Review and act on credential change requests from students |

**👥 Staff & Organisation**
| Tab | ID | Description |
|---|---|---|
| Staff Access | `access` | Register staff, promote/demote roles, revoke access |
| Departments | `departments` | Add and manage NEU college departments |

**📑 Reporting & Auditing**
| Tab | ID | Description |
|---|---|---|
| Reports | `reports` | PDF/CSV report generator, AI Insights, Top Visitors panel |
| Audit Log | `auditlog` | Immutable chronological record of every admin action |

### Role Differences

Both `admin` and `super_admin` see all tabs. The `isSuperAdmin` flag is passed into individual components to unlock privileged actions within them:

| Action | Admin | Super Admin |
|---|:---:|:---:|
| View all tabs and data | ✅ | ✅ |
| Block / unblock students | ✅ | ✅ |
| Generate reports | ✅ | ✅ |
| Approve credential requests | ✅ | ✅ |
| Approve pending visitors | ✅ | ✅ |
| Manage visit purposes | ✅ | ✅ |
| **Delete** users or logs | ❌ | ❌ |
| Promote / demote roles | ❌ | ✅ |
| Manage departments | ❌ | ✅ |
| Manage staff access | ❌ | ✅ |

---

## Credential Request System

Students access this via the **Contact Admin** button (landing page or kiosk success screen). After Google Sign-In, the `CredentialRequestModal` opens.

### Request Types

| Type | Who can submit | Requires physical verification |
|---|---|---|
| `name` | Active students | ✅ Yes |
| `student_id` | Active students | ✅ Yes |
| `dept_program` | Active students | ✅ Yes |
| `admin_privilege` | Active students | ✅ Yes |
| `unblock_request` | Blocked students only | ✅ Yes |

**Access rule:** blocked students can only see and submit `unblock_request` — all other types are greyed out with the label "Unavailable while account is blocked." Active students cannot submit `unblock_request`.

### Admin Review Flow (Requests Tab)

1. Request arrives with `status: 'pending'`
2. Admin opens the request card in the Requests tab
3. For requests with `requiresVerification: true`, the admin must click **Mark Verified** after the student physically presents credentials at the Admin Office — this is a gating step before Approve is available
4. Admin approves → change is applied to `/users`; an audit log entry is written
5. Admin can also revoke with a preset or custom reason

### Student ID Change Cascade

When a student ID change is approved, all historical records are updated atomically across three collections:

```
/library_logs        — all session records with old studentId
/blocked_attempts    — all denied entry records with old studentId
/credential_requests — all previous requests with old studentId
```

The cascade queries by **both** `req.studentId` (the numeric ID stored in records) and `actualDocId` (the Firestore doc key) — handling cases where the user doc was originally keyed by email instead of numeric ID.

> **Root cause of the recurring sync bug (now fixed):** `blocked_attempts` had `allow update: if false` in Firestore rules, silently rejecting every batch update. Changed to allow updates by NEU institutional email accounts.

---

## Smart Logic

### No Tap-Out Detection

No cloud functions or scheduled jobs. Evaluated purely at render time:

```typescript
const isNoTap = !log.checkOutTimestamp && !isToday(parseISO(log.checkInTimestamp));
```

### Midnight Cut-off

When a student taps in on a new day with a stale open session from yesterday, the system **ignores the stale session** and opens a fresh check-in. The old log stays permanently flagged as No Tap — historical integrity is preserved.

### Session Reattribution on Credential Changes

When a name, ID, or dept/program change is approved and the student is currently checked in, the system closes the current session and opens a new one with the updated credentials. Historical sessions are never modified — they keep their snapshotted name/dept/program from check-in time.

---

## AI Integration

**File:** `src/app/api/ai-summary/route.ts` · `src/ai/genkit.ts`

The **AI Insights** button in Reports sends up to 50 filtered session records to a Gemini-powered Genkit flow that returns a narrative trend analysis: peak hours, top departments, common purposes, and actionable insights.

### Model Fallback Chain
```
gemini-2.0-flash-exp  →  gemini-1.5-flash  →  gemini-1.5-pro
```

### Statistical Fallback (always available)

If all models fail, a **client-side statistical summary** is computed instantly with no API call: peak hour, top purpose, most active department, unique student count, average session duration.

**The AI Insights button always produces output.**

> Full Gemini AI requires the Vercel deployment (server-side route). Firebase Hosting (static) uses the statistical fallback.

---

## PDF Reports

Three templates generated client-side with **jsPDF + autotable**. Each includes the NEU logo (`/public/neu-logo.png`), date range, filter context, and page numbers.

| Template | Filter mode | Accent | Contents |
|---|---|---|---|
| Activity & Engagement | `ACTIVE` | Gold | KPI cards, attendance trend chart, session table |
| Restricted Access & Violation | `BLOCKED` | Red | Denied attempt KPIs, most frequent violator, violation log |
| Comprehensive Operations | `ALL` | Navy | Combined KPIs, stacked traffic chart, merged session + blocked table |

---

## Firestore Schema

### `/users/{studentId}`
```typescript
interface UserRecord {
  id:          string;    // Doc ID = student/staff ID
  firstName:   string;
  middleName?: string;
  lastName:    string;
  email:       string;    // @neu.edu.ph
  role:        'student' | 'admin' | 'super_admin' | 'visitor';
  status:      'active' | 'pending' | 'blocked';
  deptID?:     string;
  program?:    string;
  addedAt?:    string;
}
```

### `/library_logs/{logId}`
```typescript
interface LibraryLogRecord {
  studentId:           string;
  studentName:         string;  // Denormalized snapshot at check-in
  deptID:              string;
  program?:            string;
  purpose:             string;
  checkInTimestamp:    string;  // ISO 8601
  checkOutTimestamp?:  string;  // Absent = still inside or no tap-out
}
```

Log IDs are deterministic (`libraryLogId()`) to prevent duplicates on rapid re-submission.

### `/blocked_attempts/{id}`
```typescript
{
  studentId:   string;
  studentName: string;
  deptID:      string;
  program?:    string;
  timestamp:   string;
}
```

### `/credential_requests/{reqId}`
```typescript
interface CredentialRequest {
  studentId:             string;
  studentName:           string;
  email:                 string;
  type:                  'name' | 'student_id' | 'dept_program' | 'admin_privilege' | 'unblock_request';
  status:                'pending' | 'pending_verification' | 'approved' | 'revoked';
  current:               Record<string, string>;
  requested:             Record<string, string>;
  reason:                string;
  requiresVerification?: boolean;
  verified?:             boolean;
  adminNote?:            string;
  createdAt:             string;
  updatedAt:             string;
}
```

### `/visit_purposes/{id}`
```typescript
interface VisitPurpose {
  id:      string;    // slug
  label:   string;    // shown on kiosk
  value:   string;    // stored in logs
  order:   number;    // kiosk display order
  active:  boolean;   // false = hidden from kiosk
}
```

### `/audit_logs/{id}`
```typescript
interface AuditLogRecord {
  action:      string;
  actorId:     string;
  actorName:   string;
  actorEmail:  string;
  targetId?:   string;
  targetName?: string;
  detail?:     string;
  timestamp:   string;
}
```

**Action types:** `user.block` · `user.unblock` · `user.delete` · `user.edit` · `user.add` · `user.import` · `role.promote` · `role.demote` · `role.toggle_super` · `staff.add` · `staff.revoke` · `notification.send` · `dept.add` · `dept.delete` · `purpose.add` · `purpose.delete` · `purpose.toggle`

### Supported Departments (16 NEU Colleges)

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

```
Collection              Read                       Write / Update
──────────────────────────────────────────────────────────────────────────
/users                  Any authenticated user     NEU email · owner · self
/library_logs           Any signed-in user         Any authenticated user
/blocked_attempts       NEU email · owner          Create: any signed-in
                                                   Update: NEU email · owner
/departments            Public                     NEU institutional email
/programs               Public                     NEU institutional email
/visit_purposes         Public (kiosk anon.)       NEU institutional email
/credential_requests    NEU email · owner          Students (create) · NEU (update)
/audit_logs             NEU institutional email    Any auth user (create only)
/notifications          Any signed-in user         Any authenticated user
```

Because doc IDs are student IDs (not Firebase UIDs), UID-based role lookups inside rules are not possible. Fine-grained role enforcement is handled at the UI layer (`isSuperAdmin` prop).

---

## Pagination

All five admin tables have consistent rows-per-page controls:

| Table | Page var | RPP var |
|---|---|---|
| Live Presence | `cvPage` | `cvRpp` |
| Log History — Sessions | `lhPage` | `lhRpp` |
| Log History — Blocked | `lhBPage` | `lhBRpp` |
| Registry | `umPage` | `umRpp` |
| Requests | `crPage` | `crRpp` |
| Audit Log | `alPage` | `alRpp` |

Presets: **25 / 50 / 100** + **Custom** (10–500 via prompt). Active page shown in **gold**. Every page change scrolls smoothly to the top.

---

## Design System

### Colors
| Token | Value | Usage |
|---|---|---|
| Navy | `hsl(221, 72%, 22%)` | Buttons, active states, headings |
| Gold | `hsl(43, 85%, 55%)` | Highlights, badges, active pagination |
| Emerald | `#059669` | Success states |
| Red | `hsl(0, 72%, 51%)` | Errors, blocked states |
| Amber | `hsl(38, 90%, 48%)` | Warnings, missed tap-outs |

### Typography
| Font | Usage |
|---|---|
| Playfair Display | All headings |
| DM Sans | Body, UI |
| DM Mono | Student IDs, timestamps |

### Background
Fixed full-viewport NEU Library photo (`neulibrary.jpg`) with navy gradient overlay at `z-index: -50`.

---

## Tech Stack

### Frontend
| Technology | Version | Role |
|---|---|---|
| Next.js | 15.5 | Framework, static export |
| React | 19.2 | UI |
| TypeScript | 5 | Type safety |
| Tailwind CSS | 3.4 | Styling |
| shadcn/ui | — | Component library |
| Recharts | 2.15 | Charts |
| jsPDF + autotable | 2.5 / 3.8 | PDF generation |
| date-fns | 3.6 | Date utilities |

### Backend & Infrastructure
| Technology | Version | Role |
|---|---|---|
| Firebase Auth | 11.10 | Google SSO |
| Cloud Firestore | 11.10 | Real-time database |
| Firebase Genkit | 1.28 | AI orchestration |
| Google Gemini | 1.5 Flash/Pro | AI summaries |
| Vercel + Firebase Hosting | — | Deployment |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│         Static Export (Vercel / Firebase Hosting)         │
│         Next.js 15 · App Router · TypeScript              │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTPS
        ┌──────────────┴─────────────┐
        │                            │
 ┌──────▼──────┐             ┌───────▼───────┐
 │  Firebase   │             │  Google Gemini│
 │    Auth     │             │  via Genkit   │
 │  Firestore  │             └───────────────┘
 └──────┬──────┘
        │ onSnapshot (real-time)
 ┌──────▼──────────────────────────────────┐
 │          Firestore Collections           │
 │  /users            /library_logs         │
 │  /blocked_attempts /departments          │
 │  /programs         /visit_purposes       │
 │  /credential_requests /audit_logs        │
 └──────────────────────────────────────────┘
```

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                        # Router: landing → kiosk → registration → admin
│   ├── layout.tsx                      # Root layout, background, fonts
│   ├── globals.css                     # Global styles
│   └── api/ai-summary/route.ts         # Gemini AI server route (Vercel only)
│
├── components/
│   ├── terminal/
│   │   └── TerminalView.tsx            # Kiosk: auth → dept → purpose → success
│   ├── student/
│   │   ├── RegistrationPage.tsx        # Auto-triggered registration form
│   │   └── CredentialRequestModal.tsx  # Student credential change form
│   └── admin/
│       ├── AdminDashboard.tsx          # Role resolver → UnifiedAdminDashboard
│       ├── UnifiedAdminDashboard.tsx   # Single dashboard, all admin tabs
│       ├── WelcomeMessage.tsx          # First-login welcome screen
│       ├── OverviewDashboard.tsx       # Overview tab
│       ├── CurrentVisitors.tsx         # Live Presence tab
│       ├── LogHistory.tsx              # Log History tab
│       ├── UserManagement.tsx          # Registry tab
│       ├── TemporaryVisitorManagement.tsx  # Pending tab
│       ├── PurposeManagement.tsx       # Visit Purposes tab
│       ├── CredentialRequestsTab.tsx   # Requests tab
│       ├── AdminAccessManagement.tsx   # Staff Access tab
│       ├── DepartmentManagement.tsx    # Departments tab
│       ├── ReportModule.tsx            # Reports tab
│       └── AuditLogTab.tsx             # Audit Log tab
│
├── firebase/
│   ├── index.ts                        # Firebase init + hook exports
│   ├── provider.tsx                    # FirebaseProvider context
│   ├── firestore/
│   │   ├── use-collection.tsx          # onSnapshot collection hook
│   │   └── use-doc.tsx                 # onSnapshot document hook
│   └── non-blocking-updates.tsx        # Fire-and-forget write helpers
│
├── lib/
│   ├── firebase-schema.ts              # All TypeScript interfaces + DEPARTMENTS + PROGRAMS constants
│   ├── firestore-ids.ts                # Deterministic doc ID generators
│   ├── student-id-formatter.ts         # Auto-dash XX-YYYYY-ZZZ formatter
│   └── audit-logger.ts                 # writeAuditLog() utility
│
└── ai/
    ├── genkit.ts                       # Genkit + Google AI init
    └── flows/
        └── ai-powered-visit-summary-flow.ts
```

---

## Local Development

### Prerequisites
- Node.js 20+
- npm
- Firebase CLI: `npm install -g firebase-tools`

### Setup

```bash
git clone https://github.com/shawndavidsdomingo/NEULib.git
cd NEULib
npm install
cp .env.example .env.local   # fill in Firebase config + Gemini key
npm run dev                  # http://localhost:9002
```

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server (Turbopack, port 9002) |
| `npm run build` | Static export to `/out` |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run genkit:dev` | Genkit developer UI |

### Deploy Firestore Rules

```bash
firebase login
firebase deploy --only firestore:rules
```

---

## Environment Variables

```env
# Firebase — safe to expose, but restrict domain in Google Cloud Console
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Owner bypass email
NEXT_PUBLIC_SUPER_ADMIN_EMAIL=

# Gemini — server-side only. NEVER use NEXT_PUBLIC_ prefix.
GEMINI_API_KEY=
```

---

## Known Limitations

- **AI on Firebase Hosting** — The `/api/ai-summary` route needs server-side execution. Firebase Hosting serves static files, so AI falls back to the statistical summary there. Full Gemini AI works on **Vercel**.
- **RFID simulation** — The kiosk uses a text input. Physical hardware integration requires a separate RFID reader bridge.
- **No push notifications** — There is no push notification system in this build.
- **Firestore UID mismatch** — Doc IDs are student IDs, not Firebase UIDs. Server-side role enforcement relies on institutional email matching.

---

## Changelog

### v0.3 — Pagination & Reports
- ✅ Rows-per-page pagination (25/50/100/Custom) on all admin tables — gold active, scroll-to-top
- ✅ Three-template PDF engine: Activity/gold, Violations/red, Comprehensive/navy
- ✅ NEU logo in PDF headers from `/public/neu-logo.png`
- ✅ Reports Hub two-column layout: filters left, Top Visitors (5) right
- ✅ AI Insights panel renders full-width below filters, does not displace Top Visitors

### v0.2 — Credential Requests & Security
- ✅ Full credential request system: name, student_id, dept_program, admin_privilege, unblock_request
- ✅ All types require physical verification before approval
- ✅ ID change cascade across library_logs, blocked_attempts, credential_requests
- ✅ Root cause fix: `blocked_attempts` `allow update: if false` → now allows NEU admin updates
- ✅ Cascade queries both `req.studentId` and `actualDocId`
- ✅ Blocked users can only access unblock_request in Contact Admin

### v0.1 — Initial Release
- ✅ Self-service kiosk: RFID sim + Google Login, check-in/out, midnight cut-off
- ✅ Blocked user intercept with 5s auto-dismiss or persistent modal (if inside)
- ✅ Auto-registration flow for new @neu.edu.ph users
- ✅ Unified Admin Dashboard (all tabs, both roles)
- ✅ Live Presence, Log History, Registry, Reports, Audit Log
- ✅ AI insights with statistical fallback
- ✅ Staff Access, Department, Visit Purpose management
- ✅ Bulk CSV import
- ✅ Deterministic Firestore IDs (no duplicate check-ins)
- ✅ Firestore security rules
- ✅ Dual deployment: Vercel + Firebase Hosting

---

## License

© 2026 New Era University Library. All Rights Reserved.
Developed for institutional use at New Era University, No. 9 Central Avenue, Quezon City, Philippines.

---

<div align="center">

*Built with ❤️ for the NEU Library — bridging physical presence with digital intelligence.*

**[🔥 Firebase](https://shawnitzkydavidson-neu-library.web.app/) · [▲ Vercel](https://shawndavidsdomingo-neu-library.vercel.app/)**

</div>
