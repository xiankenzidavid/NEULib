/**
 * formatStudentId — global utility for student ID masking
 *
 * Format: XX-XXXXX-XXX (2-5-3 segments, max 10 digits)
 *
 * Logic:
 *  1. Strip ALL non-numeric characters from input (handles pre-formatted strings with dashes)
 *  2. Cap at 10 digits
 *  3. Insert dash after 2nd digit
 *  4. Insert dash after 7th digit
 *
 * Usage:
 *   import { formatStudentId } from '@/lib/student-id-formatter';
 *   onChange={e => setValue(formatStudentId(e.target.value))}
 */
export function formatStudentId(raw: string): string {
  // Email/non-ID passthrough
  if (raw.includes('@')) return raw;

  // 1. Strip everything except digits
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 10);

  // 2. Build formatted string from clean digits
  if (digits.length <= 2)  return digits;
  if (digits.length <= 7)  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 7)}-${digits.slice(7)}`;
}
