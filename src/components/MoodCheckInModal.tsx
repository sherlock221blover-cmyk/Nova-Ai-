import React, { useEffect, useState } from 'react';
import { Check, HeartHandshake, MessageSquare, Sparkles, X } from 'lucide-react';
import { MoodType } from '../types/nova';

export const MOOD_OPTIONS: Array<{
  id: MoodType;
  label: string;
  emoji: string;
  distressed?: boolean;
}> = [
  { id: 'happy', label: 'Happy', emoji: '😊' },
  { id: 'calm', label: 'Calm', emoji: '😌' },
  { id: 'excited', label: 'Excited', emoji: '✨' },
  { id: 'tired', label: 'Tired', emoji: '😴' },
  { id: 'stressed', label: 'Stressed', emoji: '😣', distressed: true },
  { id: 'anxious', label: 'Anxious', emoji: '😰', distressed: true },
  { id: 'sad', label: 'Sad', emoji: '😢', distressed: true },
  { id: 'overwhelmed', label: 'Overwhelmed', emoji: '🫂', distressed: true },
];

interface MoodCheckInModalProps {
  open: boolean;
  currentMood?: MoodType;
  currentNote?: string;
  onClose: () => void;
  onSaveMood: (mood: MoodType, note: string) => Promise<void>;
  onTalkToNova: (mood: MoodType, note: string) => void;
  onOpenWellbeing: (tab?: 'breathing' | 'grounding' | 'resources') => void;
}

export const MoodCheckInModal: React.FC<MoodCheckInModalProps> = ({
  open,
  currentMood,
  currentNote,
  onClose,
  onSaveMood,
  onTalkToNova,
  onOpenWellbeing,
}) => {
  const [selectedMood, setSelectedMood] = useState<MoodType>(currentMood || 'calm');
  const [note, setNote] = useState(currentNote || '');
  const [saving, setSaving] = useState(false);
  const [savedMood, setSavedMood] = useState<MoodType | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedMood(currentMood || 'calm');
      setNote(currentNote || '');
      setSavedMood(null);
      setErrorMsg('');
    }
  }, [open, currentMood, currentNote]);

  if (!open) return null;

  const selectedMeta = MOOD_OPTIONS.find((m) => m.id === (savedMood || selectedMood));
  const isDistressed = Boolean(selectedMeta?.distressed);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');
    try {
      await onSaveMood(selectedMood, note.trim());
      setSavedMood(selectedMood);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save your mood right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-md p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="How are you feeling?"
    >
      <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#0D1B38] border border-sky-400/20 shadow-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">
              How are you feeling, Muhib?
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Log your current mood so NOVA can tailor her warmth, tone, and emotional support to
              you.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close mood check-in"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!savedMood ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {MOOD_OPTIONS.map((item) => {
                const active = selectedMood === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedMood(item.id)}
                    aria-pressed={active}
                    className={`min-h-[68px] px-3 py-2.5 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-colors ${
                      active
                        ? 'bg-sky-500/20 border-sky-400 text-white'
                        : 'bg-[#081126] border-sky-400/15 text-slate-300 hover:border-sky-400/35'
                    }`}
                  >
                    <span className="text-xl" aria-hidden="true">
                      {item.emoji}
                    </span>
                    <span className="text-xs font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div>
              <label htmlFor="mood-note" className="text-xs text-slate-300 block mb-1.5">
                What&apos;s on your mind? (optional)
              </label>
              <textarea
                id="mood-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={240}
                rows={2}
                placeholder="Share a quick thought or context for NOVA..."
                className="w-full rounded-2xl bg-[#081126] border border-sky-400/20 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
              />
            </div>

            {errorMsg && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-400/25 p-3 text-xs text-rose-200">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-sm inline-flex items-center gap-2 transition-colors"
              >
                <Check className="w-4 h-4" />
                {saving ? 'Saving...' : 'Log Mood'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#081126] border border-sky-400/25 p-4 space-y-2">
              <p className="text-sm font-semibold text-white flex items-center gap-2">
                <span aria-hidden="true">{selectedMeta?.emoji}</span>
                <span>Mood logged: {selectedMeta?.label}</span>
              </p>
              <p className="text-xs text-slate-300 leading-relaxed">
                {isDistressed
                  ? "Thank you for telling me how you're feeling ❤️ I've updated your emotional check-in so NOVA will be extra gentle and supportive with you right now."
                  : "Thank you for checking in ❤️ NOVA now knows how you're feeling and will match your vibe."}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5">
              {isDistressed && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenWellbeing('breathing');
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#081126] border border-sky-400/25 text-sky-200 hover:bg-[#112247] text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <HeartHandshake className="w-4 h-4" />
                  Open Calm Space
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onTalkToNova(savedMood, note.trim());
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5"
              >
                {isDistressed ? (
                  <MessageSquare className="w-4 h-4" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Talk to NOVA
              </button>

              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-white/5"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
