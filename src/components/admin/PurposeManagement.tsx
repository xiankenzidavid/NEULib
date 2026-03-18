"use client";

import { useState, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Loader2, Search, Edit2, Check, X, BookOpen, GripVertical } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useFirestore, useCollection, useMemoFirebase,
  setDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking,
} from '@/firebase';
import { doc, collection, setDoc } from 'firebase/firestore';
import { writeAuditLog } from '@/lib/audit-logger';

interface VisitPurpose {
  id:      string;   // doc ID = slug e.g. "reading-books"
  label:   string;   // display label e.g. "Reading Books"
  value:   string;   // stored value in logs e.g. "Reading Books"
  order:   number;   // display order
  active:  boolean;  // whether shown in kiosk
}

const navy = 'hsl(221,72%,22%)';
const card: React.CSSProperties = {
  background:     'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border:         '1px solid rgba(255,255,255,0.9)',
  boxShadow:      '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius:   '1rem',
};

const DEFAULT_PURPOSES: Omit<VisitPurpose, 'id'>[] = [
  { label: 'Reading Books',  value: 'Reading Books',  order: 1, active: true },
  { label: 'Research',       value: 'Research',       order: 2, active: true },
  { label: 'Computer Use',   value: 'Computer Use',   order: 3, active: true },
  { label: 'Assignments',    value: 'Assignments',    order: 4, active: true },
];

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function PurposeManagement() {
  const db = useFirestore();
  const { toast } = useToast();
  const { user } = useUser();

  const [newLabel,    setNewLabel]    = useState('');
  const [searchTerm,  setSearchTerm]  = useState('');
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editLabel,   setEditLabel]   = useState('');
  const [isSeeding,   setIsSeeding]   = useState(false);

  const purposesRef = useMemoFirebase(() => collection(db, 'visit_purposes'), [db]);
  const { data: purposes, isLoading } = useCollection<VisitPurpose>(purposesRef);

  const sorted = useMemo(() => {
    if (!purposes) return [];
    const s = searchTerm.toLowerCase();
    return [...purposes]
      .filter(p => !s || p.label.toLowerCase().includes(s))
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.label.localeCompare(b.label));
  }, [purposes, searchTerm]);

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label) { toast({ title: 'Label required', variant: 'destructive' }); return; }
    const id    = toSlug(label);
    const order = (purposes?.length ?? 0) + 1;
    await setDoc(doc(db, 'visit_purposes', id), {
      id, label, value: label, order, active: true,
    });
    toast({ title: 'Purpose Added', description: `"${label}" is now available in the kiosk.` });
    writeAuditLog(db, user, 'purpose.add', { detail: `Admin added purpose: "${label}"` });
    setNewLabel('');
  };

  const handleToggleActive = (p: VisitPurpose) => {
    updateDocumentNonBlocking(doc(db, 'visit_purposes', p.id), { active: !p.active });
    toast({ title: p.active ? 'Purpose Hidden' : 'Purpose Visible',
      description: `"${p.label}" ${p.active ? 'will no longer appear' : 'is now shown'} in the kiosk.` });
  };

  const handleDelete = (p: VisitPurpose) => {
    setConfirmDeletePurpose({ id: p.id, label: p.label });
  };

  const executeDeletePurpose = useCallback(() => {
    if (!confirmDeletePurpose) return;
    deleteDocumentNonBlocking(doc(db, 'visit_purposes', confirmDeletePurpose.id));
    writeAuditLog(db, user, 'purpose.remove', { detail: `Admin removed purpose: "${confirmDeletePurpose.label}"` });
    toast({ title: 'Purpose Removed', description: `"${confirmDeletePurpose.label}" removed from kiosk.` });
    setConfirmDeletePurpose(null);
  }, [confirmDeletePurpose, db, user]);

  const handleSaveEdit = (id: string) => {
    const label = editLabel.trim();
    if (!label) return;
    updateDocumentNonBlocking(doc(db, 'visit_purposes', id), { label, value: label });
    setEditingId(null);
    toast({ title: 'Updated' });
  };

  const handleSeedDefaults = async () => {
    if (!confirm('Seed the 4 default purposes? Existing purposes will NOT be overwritten.')) return;
    setIsSeeding(true);
    try {
      for (const p of DEFAULT_PURPOSES) {
        const id = toSlug(p.label);
        await setDoc(doc(db, 'visit_purposes', id), { id, ...p }, { merge: true });
      }
      toast({ title: 'Defaults Seeded', description: '4 default purposes added.' });
    } catch {
      toast({ title: 'Seed Failed', variant: 'destructive' });
    } finally { setIsSeeding(false); }
  };

  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* Header card */}
      <div style={card} className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
              <BookOpen size={18} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
                Visit Purposes
              </h2>
              <p className="text-slate-400 font-medium text-sm mt-0.5">
                Manage the purposes shown in the Visitor Kiosk
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-8 h-9 w-44 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium"
              />
            </div>

            <button
              onClick={handleSeedDefaults}
              disabled={isSeeding}
              className="h-9 px-3 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-1.5 disabled:opacity-60"
            >
              {isSeeding ? <Loader2 size={12} className="animate-spin" /> : <GripVertical size={12} />}
              Seed Defaults
            </button>
          </div>
        </div>

        {/* Add form */}
        <div className="flex gap-2">
          <Input
            placeholder="New purpose label, e.g. Thesis Writing"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="flex-1 h-10 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium"
          />
          <button
            onClick={handleAdd}
            disabled={!newLabel.trim()}
            className="h-10 px-4 rounded-xl font-bold text-sm text-white flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            style={{ background: navy }}
          >
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={card} className="overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={18} />
            <span className="text-sm font-medium">Loading purposes…</span>
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-16 text-center">
            <BookOpen size={28} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-400 text-sm font-medium">
              {(purposes?.length ?? 0) === 0
                ? 'No purposes yet. Add one above or seed the defaults.'
                : 'No matches.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="h-10 border-slate-100">
                <TableHead className="pl-5 text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80">#</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80">Label (shown in kiosk)</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80">Stored Value</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80">Visibility</TableHead>
                <TableHead className="text-right pr-5 text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((p, i) => (
                <TableRow key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors" style={{ height: 56 }}>

                  {/* Order */}
                  <TableCell className="pl-5">
                    <span className="text-xs font-bold text-slate-400 tabular-nums" style={{ fontFamily: "'DM Mono',monospace" }}>
                      {p.order ?? i + 1}
                    </span>
                  </TableCell>

                  {/* Label */}
                  <TableCell>
                    {editingId === p.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editLabel}
                          onChange={e => setEditLabel(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(p.id); if (e.key === 'Escape') setEditingId(null); }}
                          className="h-8 w-44 text-sm rounded-lg"
                          autoFocus
                        />
                        <button onClick={() => handleSaveEdit(p.id)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600">
                          <Check size={14} />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="font-semibold text-slate-900 text-sm">{p.label}</span>
                    )}
                  </TableCell>

                  {/* Stored value */}
                  <TableCell>
                    <span className="text-xs font-mono text-slate-400 px-2 py-1 bg-slate-100 rounded-lg">{p.value}</span>
                  </TableCell>

                  {/* Visibility toggle */}
                  <TableCell>
                    <button
                      onClick={() => handleToggleActive(p)}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all active:scale-95"
                      style={p.active
                        ? { background: 'rgba(5,150,105,0.1)', color: '#059669' }
                        : { background: 'rgba(100,116,139,0.1)', color: '#64748b' }}
                    >
                      <span className={`w-2 h-2 rounded-full ${p.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {p.active ? 'Visible' : 'Hidden'}
                    </button>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right pr-5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => { setEditingId(p.id); setEditLabel(p.label); }}
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2 text-xs font-semibold text-slate-400">
          <BookOpen size={12} />
          <span>{purposes?.filter(p => p.active).length ?? 0} active</span>
          <span>·</span>
          <span>{purposes?.filter(p => !p.active).length ?? 0} hidden</span>
          <span>·</span>
          <span className="text-slate-300">Changes apply to the kiosk immediately</span>
        </div>
      </div>
    </div>


      {/* ── Confirm Delete Purpose Modal ── */}
      {confirmDeletePurpose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.2s ease-out' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
            style={{ animation: 'scaleIn 0.25s ease-out' }}>
            <div className="px-7 py-6 border-b border-slate-100 text-center">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(220,38,38,0.08)' }}>
                <Trash2 size={22} className="text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                Confirm Remove
              </h3>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                Are you sure you want to remove{' '}
                <strong className="text-slate-800">"{confirmDeletePurpose.label}"</strong>?
                Existing logs using this purpose will not be affected.
              </p>
            </div>
            <div className="px-7 py-5 flex gap-3">
              <button onClick={() => setConfirmDeletePurpose(null)}
                className="flex-1 h-11 rounded-2xl font-semibold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all active:scale-95">
                Cancel
              </button>
              <button onClick={executeDeletePurpose}
                className="flex-1 h-11 rounded-2xl font-bold text-sm text-white transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)', boxShadow: '0 4px 14px rgba(220,38,38,0.3)' }}>
                Confirm Remove
              </button>
            </div>
          </div>
          <style>{`
            @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
            @keyframes scaleIn { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
          `}</style>
        </div>
      )}  );
}