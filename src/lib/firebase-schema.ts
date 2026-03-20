/**
 * NEU Library Portal — Firestore Data Schema (Unified /users collection)
 *
 * MIGRATION: /students + /admins + /temporary_visitors → /users/{id}
 *
 * /users/{id}
 *   id       = doc ID (studentId e.g. "XX-YYYYY-ZZZ", adminId, or "TEMP-...")
 *   role     = 'student' | 'admin' | 'super_admin' | 'visitor'
 *   status   = 'active' | 'pending' | 'blocked'
 */

export type UserRole   = 'student' | 'admin' | 'super_admin' | 'visitor';
export type UserStatus = 'active' | 'pending' | 'blocked';

/**
 * /users/{id}
 * Single collection for ALL users — students, admins, super admins, visitors.
 */
export interface UserRecord {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  deptID?: string;
  program?: string;
  temporaryId?: string;   // "TEMP-{ts}" for visitors until promoted
  addedAt?: string;       // ISO timestamp of registration
}

// ── Legacy aliases — keeps existing components working without full rewrite ──

/** @deprecated use UserRecord with role='student' */
export interface StudentRecord extends UserRecord {
  studentId: string;   // = id
  isBlocked: boolean;  // = status === 'blocked'
}

/** @deprecated use UserRecord with role='admin'|'super_admin' */
export interface AdminRecord extends UserRecord {
  adminId: string;       // = id
  isSuperAdmin: boolean; // = role === 'super_admin'
  name?: string;         // legacy single-field name (kept for old docs)
}

/** @deprecated use UserRecord with role='visitor' */
export interface TemporaryVisitor extends UserRecord {
  temporaryStudentId: string; // = temporaryId
}

export function toStudentRecord(u: UserRecord): StudentRecord {
  return { ...u, studentId: u.id, isBlocked: u.status === 'blocked' };
}
export function toAdminRecord(u: UserRecord): AdminRecord {
  return { ...u, adminId: u.id, isSuperAdmin: u.role === 'super_admin' };
}
export function toTemporaryVisitor(u: UserRecord): TemporaryVisitor {
  return { ...u, temporaryStudentId: u.temporaryId || u.id };
}

// ── Other collections (unchanged) ──────────────────────────────────────────

export interface DepartmentRecord { deptID: string; departmentName: string; }
export interface ProgramRecord    { id: string; deptID: string; code: string; name: string; }
export interface ProgramEntry     { code: string; name: string; }

export interface LibraryLogRecord {
  id: string;
  studentId: string;
  deptID: string;
  checkInTimestamp: string;
  checkOutTimestamp?: string;
  purpose: string;
  studentName?: string;
}

// ── Static reference data ───────────────────────────────────────────────────

export const DEPARTMENTS: Record<string, string> = {
  LIBRARY: 'Library', // for staff/faculty who don't belong to a specific dept
  ABM:     'College of Accountancy',
  CAS:     'College of Arts and Sciences',
  CBA:     'College of Business Administration',
  CEA:     'College of Engineering and Architecture',
  CED:     'College of Education',
  CICS:    'College of Informatics and Computing Studies',
  CMT:     'College of Medical Technology',
  COA:     'College of Agriculture',
  COC:     'College of Communication',
  COM:     'College of Midwifery',
  COMS:    'College of Music',
  CON:     'College of Nursing',
  CPT:     'College of Physical Therapy',
  CRIM:    'College of Criminology',
  CRT:     'College of Respiratory Therapy',
  SOIR:    'School of International Relations'
};

export const DEPARTMENT_LIST = Object.entries(DEPARTMENTS).map(([deptID, departmentName]) => ({ deptID, departmentName }));

export const PROGRAMS: Record<string, ProgramEntry[]> = {
  LIBRARY: [
    { code: 'LIBRARY-STAFF', name: 'Staff/Faculty' },
  ],

  ABM: [
    { code: 'ABM-STAFF', name: 'Staff/Faculty' },
    { code: 'BSAIS', name: 'Bachelor of Science in Accounting Information System' },
    { code: 'BSA', name: 'Bachelor of Science in Accountancy' },
  ],

  CAS: [
    { code: 'CAS-STAFF', name: 'Staff/Faculty' },
    { code: 'BAEcon', name: 'Bachelor of Arts in Economics' },
    { code: 'BAPolSci', name: 'Bachelor of Arts in Political Science' },
    { code: 'BPA', name: 'Bachelor of Public Administration' },
    { code: 'BSBio', name: 'Bachelor of Science in Biology' },
    { code: 'BSPsych', name: 'Bachelor of Science in Psychology' },
  ],

  CBA: [
    { code: 'CBA-STAFF', name: 'Staff/Faculty' },
    { code: 'BSBA-FM', name: 'Bachelor of Science in Business Administration Major in Financial Management' },
    { code: 'BSBA-HRDM', name: 'Bachelor of Science in Business Administration Major in Human Resource Development Management' },
    { code: 'BSBA-LM', name: 'Bachelor of Science in Business Administration Major in Legal Management' },
    { code: 'BSBA-MM', name: 'Bachelor of Science in Business Administration Major in Marketing Management' },
    { code: 'BSEntrep', name: 'Bachelor of Science in Entrepreneurship' },
    { code: 'BSREM', name: 'Bachelor of Science in Real Estate Management' },
  ],

  CEA: [
    { code: 'CEA-STAFF', name: 'Staff/Faculty' },
    { code: 'BSArch', name: 'Bachelor of Science in Architecture' },
    { code: 'BSAstro', name: 'Bachelor of Science in Astronomy' },
    { code: 'BSCE', name: 'Bachelor of Science in Civil Engineering' },
    { code: 'BSEE', name: 'Bachelor of Science in Electrical Engineering' },
    { code: 'BSECE', name: 'Bachelor of Science in Electronics Engineering' },
    { code: 'BSIE', name: 'Bachelor of Science in Industrial Engineering' },
    { code: 'BSME', name: 'Bachelor of Science in Mechanical Engineering' },
  ],

  CED: [
    { code: 'CED-STAFF', name: 'Staff/Faculty' },
    { code: 'BEEd', name: 'Bachelor of Elementary Education' },
    { code: 'BEEd-Preschool', name: 'Bachelor of Elementary Education with Specialization in Preschool Education' },
    { code: 'BEEd-SpEd', name: 'Bachelor of Elementary Education with Specialization in Special Education' },
    { code: 'BSEd-English', name: 'Bachelor of Secondary Education Major in English' },
    { code: 'BSEd-Filipino', name: 'Bachelor of Secondary Education Major in Filipino' },
    { code: 'BSEd-Math', name: 'Bachelor of Secondary Education Major in Mathematics' },
    { code: 'BSEd-MAPE', name: 'Bachelor of Secondary Education Major in Music, Arts, and Physical Education' },
    { code: 'BSEd-Science', name: 'Bachelor of Secondary Education Major in Science' },
    { code: 'BSEd-SocStud', name: 'Bachelor of Secondary Education Major in Social Studies' },
    { code: 'BSEd-TLE', name: 'Bachelor of Secondary Education Major in Technology and Livelihood Education' },
  ],

  CICS: [
    { code: 'CICS-STAFF', name: 'Staff/Faculty' },
    { code: 'BLIS', name: 'Bachelor of Library and Information Science' },
    { code: 'BSCS', name: 'Bachelor of Science in Computer Science' },
    { code: 'BSEMC-DAT', name: 'Bachelor of Science in Entertainment and Multimedia Computing with Specialization in Digital Animation Technology' },
    { code: 'BSEMC-GD', name: 'Bachelor of Science in Entertainment and Multimedia Computing with Specialization in Game Development' },
    { code: 'BSIS', name: 'Bachelor of Science in Information System' },
    { code: 'BSIT', name: 'Bachelor of Science in Information Technology' },
  ],

  CMT: [
    { code: 'CMT-STAFF', name: 'Staff/Faculty' },
    { code: 'BSMT', name: 'Bachelor of Science in Medical Technology' },
  ],

  COA: [
    { code: 'COA-STAFF', name: 'Staff/Faculty' },
    { code: 'BSAgri', name: 'Bachelor of Science in Agriculture' },
  ],

  COC: [
    { code: 'COC-STAFF', name: 'Staff/Faculty' },
    { code: 'BABroadcast', name: 'Bachelor of Arts in Broadcasting' },
    { code: 'BAComm', name: 'Bachelor of Arts in Communication' },
    { code: 'BAJournalism', name: 'Bachelor of Arts in Journalism' },
  ],

  COM: [
    { code: 'COM-STAFF', name: 'Staff/Faculty' },
    { code: 'DM', name: 'Diploma in Midwifery' },
  ],

  COMS: [
    { code: 'COMS-STAFF', name: 'Staff/Faculty' },
    { code: 'BM-Choral', name: 'Bachelor of Music in Choral Conducting' },
    { code: 'BM-MusicEd', name: 'Bachelor of Music in Music Education' },
    { code: 'BM-Piano', name: 'Bachelor of Music in Piano' },
    { code: 'BM-Voice', name: 'Bachelor of Music in Voice' },
  ],

  CON: [
    { code: 'CON-STAFF', name: 'Staff/Faculty' },
    { code: 'BSN', name: 'Bachelor of Science in Nursing' },
  ],

  CPT: [
    { code: 'CPT-STAFF', name: 'Staff/Faculty' },
    { code: 'BSPT', name: 'Bachelor of Science in Physical Therapy' },
  ],

  CRIM: [
    { code: 'CRIM-STAFF', name: 'Staff/Faculty' },
    { code: 'BSCrim', name: 'Bachelor of Science in Criminology' },
  ],

  CRT: [
    { code: 'CRT-STAFF', name: 'Staff/Faculty' },
    { code: 'BSRT', name: 'Bachelor of Science in Respiratory Therapy' },
  ],

  SOIR: [
    { code: 'SOIR-STAFF', name: 'Staff/Faculty' },
    { code: 'BAFS', name: 'Bachelor of Arts in Foreign Service' },
  ],
};


export function getProgramsByDeptID(deptID: string): ProgramEntry[] { return PROGRAMS[deptID] || []; }
export function getProgramNameByCode(deptID: string, code: string): string { return PROGRAMS[deptID]?.find(p => p.code === code)?.name || code; }
export function getProgramCode(deptID: string, programName: string): string { return PROGRAMS[deptID]?.find(p => p.name === programName)?.code || ''; }
export function getProgramSeedData(): Omit<ProgramRecord, 'id'>[] {
  const records: Omit<ProgramRecord, 'id'>[] = [];
  Object.entries(PROGRAMS).forEach(([deptID, programs]) => programs.forEach(p => records.push({ deptID, code: p.code, name: p.name })));
  return records;
}