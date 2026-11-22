import React, { useState } from 'react';
import { Check, Edit3, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { ConfirmationRequest, MemoryCategory, MemoryItem } from '../types/nova';
import { addMemory, deleteMemory, updateMemory } from '../lib/firestoreService';
import { GoogleSignInButton } from './GoogleSignInButton';

interface MemoryViewProps {
  uid: string | null;
  memories: MemoryItem[];
  isLoggingIn: boolean;
  onSignIn: () => void;
  onRequestConfirm: (req: ConfirmationRequest) => void;
}

const CATEGORIES: Array<{ id: 'all' | MemoryCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'identity', label: 'Identity' },
  { id: 'preference', label: 'Preferences' },
  { id: 'interest', label: 'Interests' },
  { id: 'goal', label: 'Goals' },
  { id: 'language', label: 'Language' },
  { id: 'note', label: 'Notes' },
];

export const MemoryView: React.FC<MemoryViewProps> = ({
  uid,
  memories,
  isLoggingIn,
  onSignIn,
  onRequestConfirm,
}) => {
  const [filter, setFilter] = useState<'all' | MemoryCategory>('all');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('preference');
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<MemoryCategory>('preference');
  const [editContent, setEditContent] = useState('');

  const filtered =
    filter === 'all' ? memories : memories.filter((m) => m.category === filter);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !newContent.trim()) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await addMemory(uid, newCategory, newContent.trim(), 'manual');
      setNewContent('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save memory.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (memoryId: string) => {
    if (!uid || !editContent.trim()) return;
    setErrorMsg('');
    try {
      await updateMemory(uid, memoryId, editCategory, editContent.trim());
      setEditingId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update memory.');
    }
  };

  const handleDelete = (item: MemoryItem) => {
    if (!uid) return;
    onRequestConfirm({
      title: 'Delete Memory',
      description: 'NOVA will immediately forget this item and stop using it in future chats.',
      details: [item.content],
      confirmLabel: 'Delete Memory',
      destructive: true,
      onConfirm: async () => {
        await deleteMemory(uid, item.id);
      },
    });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Long-Term Memory</h1>
          <p className="text-sm text-slate-300 mt-1">
            Review, edit, or delete what NOVA remembers about your preferences and goals.
          </p>
        </div>
        <div className="text-xs text-sky-300 inline-flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Passwords and payment details are never stored</span>
        </div>
      </div>

      {!uid ? (
        <div className="rounded-3xl bg-[#0D1B38] border border-sky-400/20 p-6 sm:p-8 text-center space-y-4">
          <h2 className="font-display text-lg font-semibold text-white">
            Sign in to unlock persistent memory
          </h2>
          <p className="text-sm text-slate-300 max-w-md mx-auto">
            Your memories are stored privately in your own database space so you can review or
            erase them anytime.
          </p>
          <GoogleSignInButton onClick={onSignIn} disabled={isLoggingIn} />
        </div>
      ) : (
        <>
          {/* Add Memory Form */}
          <form
            onSubmit={handleAdd}
            className="rounded-2xl bg-[#0D1B38] border border-sky-400/15 p-5 space-y-4"
          >
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Add a memory for NOVA
            </h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                aria-label="Memory category"
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-sm text-slate-100 focus:outline-none focus:border-sky-400"
              >
                <option value="preference">Preference</option>
                <option value="identity">Identity / Nickname</option>
                <option value="interest">Interest / Hobby</option>
                <option value="goal">Goal / Project</option>
                <option value="language">Language / Style</option>
                <option value="note">General Note</option>
              </select>

              <input
                type="text"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                maxLength={500}
                placeholder="e.g., Call me Alex, and I enjoy late-night astronomy reading"
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
              />

              <button
                type="submit"
                disabled={saving || !newContent.trim()}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                {saving ? 'Saving...' : 'Remember'}
              </button>
            </div>
            {errorMsg && <p className="text-xs text-rose-300">{errorMsg}</p>}
          </form>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setFilter(cat.id)}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  filter === cat.id
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'bg-[#0D1B38] text-slate-300 hover:text-white border border-sky-400/10'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Memory List */}
          {filtered.length === 0 ? (
            <div className="rounded-2xl bg-[#0D1B38]/60 border border-sky-400/10 p-8 text-center text-sm text-slate-400">
              No memories stored in this category yet. Add one above or ask NOVA to remember something in chat.
            </div>
          ) : (
            <div className="divide-y divide-sky-400/10 rounded-2xl bg-[#0D1B38] border border-sky-400/15 overflow-hidden">
              {filtered.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <div key={item.id} className="p-4 sm:p-5 space-y-3">
                    {isEditing ? (
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value as MemoryCategory)}
                          className="min-h-[44px] px-3 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-xs text-slate-100"
                        >
                          <option value="preference">Preference</option>
                          <option value="identity">Identity</option>
                          <option value="interest">Interest</option>
                          <option value="goal">Goal</option>
                          <option value="language">Language</option>
                          <option value="note">Note</option>
                        </select>
                        <input
                          type="text"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          maxLength={500}
                          className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#081126] border border-sky-400/30 text-sm text-slate-100"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(item.id)}
                            className="min-h-[44px] px-3.5 rounded-xl bg-sky-500 text-slate-950 font-semibold text-xs inline-flex items-center gap-1"
                          >
                            <Check className="w-4 h-4" />
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="min-h-[44px] px-3 rounded-xl border border-slate-700 text-xs text-slate-300 inline-flex items-center gap-1"
                          >
                            <X className="w-4 h-4" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <div className="text-xs text-sky-300 flex items-center gap-2">
                            <span className="capitalize font-medium">{item.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-400">
                              {item.source === 'assistant' ? 'Suggested in chat' : 'Added by you'}
                            </span>
                          </div>
                          <p className="text-sm text-slate-100 leading-relaxed break-words">
                            {item.content}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(item.id);
                              setEditCategory(item.category);
                              setEditContent(item.content);
                            }}
                            aria-label="Edit memory"
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-sky-300 hover:bg-white/5 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            aria-label="Delete memory"
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
