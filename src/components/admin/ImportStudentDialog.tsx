"use client";

import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import { Upload, FileText, Loader2, Download, Table as TableIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { DepartmentRecord } from '@/lib/firebase-schema';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ImportStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * CSV FORMAT (must match export):
 * id,firstName,middleName,lastName,email,deptID,program
 *
 * - id: student ID in format YY-XXXXX-ZZZ
 * - middleName: optional, leave blank if none
 * - program: program code (e.g. BSIT, BSCS)
 */

export function ImportStudentDialog({ open, onOpenChange }: ImportStudentDialogProps) {
  const [isImporting,  setIsImporting]  = useState(false);
  const [preview,      setPreview]      = useState<string[][] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selectedDept, setSelectedDept] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const db = useFirestore();

  const deptQuery = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: dbDepartments } = useCollection<DepartmentRecord>(deptQuery);

  // The exact columns used in both import and export
  const IMPORT_HEADERS = ['id', 'firstName', 'middleName', 'lastName', 'email', 'deptID', 'program'];
  const REQUIRED = ['id', 'firstName', 'lastName', 'deptID'];

  const handleDownloadTemplate = () => {
    const dept = selectedDept && selectedDept !== 'MASTER' ? selectedDept : 'CICS';
    const rows = [
      IMPORT_HEADERS.join(','),
      `24-00001-001,Juan,Dela,Cruz,juan.cruz@neu.edu.ph,${dept},BSIT`,
      `24-00002-002,Maria,,Santos,maria.santos@neu.edu.ph,${dept},BSCS`,
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = selectedDept && selectedDept !== 'MASTER'
      ? `neu_template_${selectedDept.toLowerCase()}.csv`
      : 'neu_template_master.csv';
    a.click(); URL.revokeObjectURL(url);
    toast({ title: "Template Downloaded" });
  };

  const parseCSV = (text: string): string[][] => {
    // Handle quoted fields with commas inside
    return text
      .split('\n')
      .filter(l => l.trim())
      .map(line => {
        const cols: string[] = [];
        let cur = ''; let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { inQ = !inQ; }
          else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
          else cur += ch;
        }
        cols.push(cur.trim());
        return cols;
      });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreviewError(null);
    setPreview(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = (e.target?.result as string).replace(/\r/g, '');
      const rows = parseCSV(text);
      if (rows.length < 2) { setPreviewError("File is empty or has no data rows."); return; }

      const headers = rows[0].map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
      const missingCols = IMPORT_HEADERS.filter(h => !headers.includes(h.toLowerCase()));
      if (missingCols.length > 0) {
        setPreviewError(`Missing columns: ${missingCols.join(', ')}. Expected: ${IMPORT_HEADERS.join(', ')}`);
        return;
      }
      // Show preview (first 3 data rows)
      setPreview(rows.slice(0, 4));
    };
    reader.readAsText(file);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    let successCount = 0; let skipCount = 0;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = (e.target?.result as string).replace(/\r/g, '');
        const rows = parseCSV(text);
        if (rows.length < 2) throw new Error("Empty file");

        const rawHeaders = rows[0];
        const headers = rawHeaders.map(h => h.toLowerCase().trim());

        // Map header names to our expected fields (flexible matching)
        const colMap: Record<string, number> = {};
        IMPORT_HEADERS.forEach(field => {
          const idx = headers.findIndex(h =>
            h === field.toLowerCase() ||
            h === field.toLowerCase().replace(/id$/, 'id') ||
            (field === 'id' && (h === 'studentid' || h === 'id')) ||
            (field === 'deptID' && (h === 'deptid' || h === 'dept' || h === 'department'))
          );
          if (idx >= 0) colMap[field] = idx;
        });

        // Check required
        const missing = REQUIRED.filter(f => colMap[f] === undefined);
        if (missing.length > 0) {
          toast({ title: "Import Failed", description: `Missing columns: ${missing.join(', ')}`, variant: "destructive" });
          return;
        }

        for (let i = 1; i < rows.length; i++) {
          const vals = rows[i];
          const get = (field: string) => (vals[colMap[field]] || '').trim();

          const id        = get('id');
          const firstName = get('firstName');
          const lastName  = get('lastName');
          const deptID    = get('deptID');

          if (!id || !firstName || !lastName || !deptID) { skipCount++; continue; }
          if (!/^\d{2}-\d{5}-\d{3}$/.test(id)) { skipCount++; continue; }

          const userRef = doc(db, 'users', id);
          setDocumentNonBlocking(userRef, {
            id,
            firstName,
            middleName: get('middleName') || '',
            lastName,
            email:      get('email') || '',
            deptID,
            program:    get('program') || '',
            role:       'student',
            status:     'active',
          }, { merge: true });
          successCount++;
        }

        toast({
          title: "Import Successful",
          description: `${successCount} students imported. ${skipCount > 0 ? `${skipCount} rows skipped (invalid format).` : ''}`,
        });
        onOpenChange(false);
      } catch (err: any) {
        toast({ title: "Import Error", description: err.message || "Check the file format.", variant: "destructive" });
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setPreview(null);
      }
    };
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] rounded-[2rem] border-primary/20 p-0 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-primary px-8 py-8 text-white relative overflow-hidden">
          <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10"><TableIcon size={100} /></div>
          <DialogTitle className="font-headline text-2xl flex items-center gap-3 relative z-10">
            <Upload size={28} /> Bulk Student Import
          </DialogTitle>
          <DialogDescription className="text-primary-foreground/70 mt-2 font-medium relative z-10">
            Upload a CSV file to register multiple students at once.
          </DialogDescription>
        </div>

        <div className="p-7 space-y-6 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Left: Template download */}
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Download size={13} className="text-primary" /> Step 1: Download Template
              </p>
              <Select value={selectedDept} onValueChange={setSelectedDept}>
                <SelectTrigger className="h-10 rounded-xl bg-slate-50 border-slate-200 font-semibold text-sm">
                  <SelectValue placeholder="Select department (optional)" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="MASTER" className="font-semibold">All Departments</SelectItem>
                  {dbDepartments?.map(d => (
                    <SelectItem key={d.deptID} value={d.deptID} className="font-semibold text-sm">
                      [{d.deptID}] {d.departmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="w-full h-10 rounded-xl font-bold gap-2 border-primary/20 hover:bg-primary/5 text-primary"
                onClick={handleDownloadTemplate}>
                <Download size={15} /> Download CSV Template
              </Button>

              {/* Column reference */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Required CSV Columns</p>
                <code className="block text-[11px] font-mono bg-white p-3 rounded-xl border text-primary overflow-x-auto whitespace-nowrap shadow-inner">
                  {IMPORT_HEADERS.join(',')}
                </code>
                <ul className="text-[11px] text-slate-500 space-y-0.5 font-medium">
                  <li><span className="font-bold text-slate-700">id</span> — Student ID: YY-XXXXX-ZZZ</li>
                  <li><span className="font-bold text-slate-700">middleName</span> — Optional, leave blank</li>
                  <li><span className="font-bold text-slate-700">program</span> — Program code (e.g. BSIT)</li>
                </ul>
              </div>
            </div>

            {/* Right: Upload */}
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Upload size={13} className="text-primary" /> Step 2: Upload File
              </p>

              <div className="flex flex-col items-center justify-center p-6 bg-primary/5 rounded-2xl border-2 border-dashed border-primary/20 space-y-4 hover:bg-primary/[0.08] transition-all">
                <div className="w-16 h-16 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg rotate-3">
                  <Upload size={32} />
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-900">Upload CSV File</p>
                  <p className="text-xs text-slate-400 mt-0.5">Must match the template format</p>
                </div>
                <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleImport} disabled={isImporting} />
                <Button className="w-full h-12 rounded-xl font-bold" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
                  {isImporting ? <><Loader2 className="animate-spin mr-2" size={16} /> Importing...</> : <><Upload size={16} className="mr-2" /> Select & Import CSV</>}
                </Button>
              </div>

              {/* Error */}
              {previewError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-100">
                  <AlertCircle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-600 font-medium">{previewError}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-7 py-4 bg-slate-50 border-t flex justify-between items-center">
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
            <CheckCircle2 size={13} className="text-emerald-500" /> ID format validated on import
          </div>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl font-bold h-10 px-6">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}