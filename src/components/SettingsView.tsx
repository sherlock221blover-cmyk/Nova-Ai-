import React, { useEffect, useState } from 'react';
import { LogOut, Shield, Sparkles, Trash2, Volume2 } from 'lucide-react';
import { ConfirmationRequest, UserProfile, VoiceName, VoiceStyle } from '../types/nova';
import { clearAllMessages, updateUserProfile } from '../lib/firestoreService';
import { GoogleSignInButton } from './GoogleSignInButton';

interface SettingsViewProps {
  uid: string | null;
  userEmail: string | null;
  hasWorkspaceToken: boolean;
  isLoggingIn: boolean;
  profile: UserProfile | null;
  playfulJealousy: boolean;
  onTogglePlayfulJealousy: (next: boolean) => Promise<void> | void;
  onSignIn: () => void;
  onSignOut: () => void;
  onRequestConfirm: (req: ConfirmationRequest) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  uid,
  userEmail,
  hasWorkspaceToken,
  isLoggingIn,
  profile,
  playfulJealousy,
  onTogglePlayfulJealousy,
  onSignIn,
  onSignOut,
  onRequestConfirm,
}) => {
  const [preferredName, setPreferredName] = useState(profile?.preferredName || '');
  const [preferredLanguage, setPreferredLanguage] = useState(
    profile?.preferredLanguage || 'English'
  );
  const [voiceName, setVoiceName] = useState<VoiceName>(profile?.voiceName || 'Kore');
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>(profile?.voiceStyle || 'warm');
  const [autoSpeak, setAutoSpeak] = useState(profile?.autoSpeak ?? false);
  const [webSearchDefault, setWebSearchDefault] = useState(profile?.webSearchDefault ?? false);
  const [autoMemoryExtract, setAutoMemoryExtract] = useState(
    profile?.autoMemoryExtract ?? true
  );
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState('');
  const [personalityStatus, setPersonalityStatus] = useState('');

  useEffect(() => {
    if (profile) {
      setPreferredName(profile.preferredName || '');
      setPreferredLanguage(profile.preferredLanguage || 'English');
      setVoiceName(profile.voiceName || 'Kore');
      setVoiceStyle(profile.voiceStyle || 'warm');
      setAutoSpeak(profile.autoSpeak);
      setWebSearchDefault(profile.webSearchDefault);
      setAutoMemoryExtract(profile.autoMemoryExtract);
    }
  }, [profile]);

  const handleToggleJealousy = async () => {
    const next = !playfulJealousy;
    setPersonalityStatus('');
    await onTogglePlayfulJealousy(next);
    setPersonalityStatus(
      uid
        ? next
          ? 'Playful Jealousy enabled.'
          : 'Playful Jealousy disabled.'
        : next
        ? 'Playful Jealousy enabled for this session.'
        : 'Playful Jealousy disabled for this session.'
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    setSaving(true);
    setSavedBanner('');
    try {
      await updateUserProfile(uid, {
        preferredName,
        preferredLanguage,
        voiceName,
        voiceStyle,
        autoSpeak,
        webSearchDefault,
        autoMemoryExtract,
      });
      setSavedBanner('Settings saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleClearHistory = () => {
    if (!uid) return;
    onRequestConfirm({
      title: 'Clear Conversation History',
      description:
        'Permanently delete all saved chat messages with NOVA? Your Long-Term Memory items will remain untouched.',
      confirmLabel: 'Clear History',
      destructive: true,
      onConfirm: async () => {
        await clearAllMessages(uid);
        setSavedBanner('Chat history cleared.');
      },
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-white">Settings &amp; Privacy</h1>
        <p className="text-sm text-slate-300 mt-1">
          Personalize NOVA&apos;s voice, companion style, and review connected permissions.
        </p>
      </div>

      {/* Account & Google Workspace */}
      <section className="rounded-2xl bg-[#0D1B38] border border-sky-400/15 p-5 sm:p-6 space-y-4">
        <h2 className="font-display text-base font-semibold text-white">
          Google Account &amp; Workspace Access
        </h2>
        {uid ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm text-slate-100 font-medium">{userEmail || 'Signed in'}</p>
              <p className="text-xs text-slate-400">
                Firestore Memory: Connected · Workspace Token:{' '}
                {hasWorkspaceToken ? 'Active for this session' : 'Reconnect needed for Calendar/Tasks/Chat'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {!hasWorkspaceToken && (
                <GoogleSignInButton
                  onClick={onSignIn}
                  disabled={isLoggingIn}
                  label="Reconnect Google"
                />
              )}
              <button
                type="button"
                onClick={onSignOut}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-200 hover:bg-white/5 inline-flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              Sign in with Google to persist your companion preferences, long-term memory, and
              Workspace integrations.
            </p>
            <GoogleSignInButton onClick={onSignIn} disabled={isLoggingIn} />
          </div>
        )}
      </section>

      {/* Personality Settings */}
      <section className="rounded-2xl bg-[#0D1B38] border border-sky-400/15 p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-sky-300 shrink-0" />
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Personality Settings
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Customize how NOVA expresses warmth, humor, and affection during chats and live voice.
              </p>
            </div>
          </div>
          {personalityStatus && (
            <span className="text-xs text-sky-300 shrink-0">{personalityStatus}</span>
          )}
        </div>

        <div className="rounded-xl bg-[#081126] border border-sky-400/15 p-4 flex items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-medium text-slate-100">
              Playful Possessiveness &amp; Jealousy
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              When enabled, NOVA replies with cute, clingy, playfully obsessed affection and mild
              jealous teasing if you mention time away—while always staying supportive and gentle
              whenever you are stressed.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={playfulJealousy}
            aria-label="Toggle Playful Jealousy mode"
            onClick={handleToggleJealousy}
            className="min-h-[44px] min-w-[60px] flex items-center justify-end shrink-0 focus:outline-none"
          >
            <span
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                playfulJealousy ? 'bg-sky-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  playfulJealousy ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </span>
          </button>
        </div>
      </section>

      {/* Companion & Voice Preferences */}
      {uid && (
        <form
          onSubmit={handleSave}
          className="rounded-2xl bg-[#0D1B38] border border-sky-400/15 p-5 sm:p-6 space-y-5"
        >
          <div className="flex items-center gap-2.5">
            <Volume2 className="w-5 h-5 text-sky-300" />
            <h2 className="font-display text-base font-semibold text-white">
              Companion &amp; Voice Persona
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pref-name" className="text-xs text-slate-300 block mb-1.5">
                Preferred Name or Nickname
              </label>
              <input
                id="pref-name"
                type="text"
                maxLength={64}
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                placeholder="How should NOVA address you?"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-sm text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="pref-lang" className="text-xs text-slate-300 block mb-1.5">
                Preferred Language
              </label>
              <input
                id="pref-lang"
                type="text"
                maxLength={32}
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-sm text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="voice-name" className="text-xs text-slate-300 block mb-1.5">
                Voice Timbre
              </label>
              <select
                id="voice-name"
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value as VoiceName)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-sm text-slate-100"
              >
                <option value="Kore">Kore (Soft, Warm Female)</option>
                <option value="Zephyr">Zephyr (Gentle, Bright Female)</option>
              </select>
            </div>

            <div>
              <label htmlFor="voice-style" className="text-xs text-slate-300 block mb-1.5">
                Conversation Tone
              </label>
              <select
                id="voice-style"
                value={voiceStyle}
                onChange={(e) => setVoiceStyle(e.target.value as VoiceStyle)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-sm text-slate-100"
              >
                <option value="warm">Warm &amp; Affectionate</option>
                <option value="calm">Calm &amp; Supportive</option>
                <option value="playful">Playful &amp; Cheerful</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-sky-400/10">
            <label className="flex items-center justify-between gap-4 min-h-[44px] cursor-pointer">
              <span className="text-sm text-slate-200">
                Automatically speak NOVA&apos;s chat replies
              </span>
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(e) => setAutoSpeak(e.target.checked)}
                className="w-5 h-5 accent-sky-400"
              />
            </label>

            <label className="flex items-center justify-between gap-4 min-h-[44px] cursor-pointer">
              <span className="text-sm text-slate-200">
                Enable Google Search grounding by default in chat
              </span>
              <input
                type="checkbox"
                checked={webSearchDefault}
                onChange={(e) => setWebSearchDefault(e.target.checked)}
                className="w-5 h-5 accent-sky-400"
              />
            </label>

            <label className="flex items-center justify-between gap-4 min-h-[44px] cursor-pointer">
              <span className="text-sm text-slate-200">
                Suggest saving helpful preferences to memory (requires confirmation)
              </span>
              <input
                type="checkbox"
                checked={autoMemoryExtract}
                onChange={(e) => setAutoMemoryExtract(e.target.checked)}
                className="w-5 h-5 accent-sky-400"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleClearHistory}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-rose-500/30 text-xs font-medium text-rose-300 hover:bg-rose-500/10 inline-flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear Chat History
            </button>

            <div className="flex items-center gap-3">
              {savedBanner && <span className="text-xs text-sky-300">{savedBanner}</span>}
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-sm transition-colors"
              >
                {saving ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Transparency & Connected Services */}
      <section className="rounded-2xl bg-[#0D1B38] border border-sky-400/15 p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5 text-sky-300" />
          <h2 className="font-display text-base font-semibold text-white">
            Connected Permissions &amp; Privacy
          </h2>
        </div>
        <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <li>
            • <strong className="text-slate-100">Firestore Database:</strong> Stores only your
            preferences, approved memories, chat thread, and routines under your own user ID.
          </li>
          <li>
            • <strong className="text-slate-100">Google Calendar, Tasks &amp; Chat:</strong>{' '}
            Accessed only after you sign in with Google; OAuth tokens stay strictly in memory for
            your active session and every modification requires explicit confirmation.
          </li>
          <li>
            • <strong className="text-slate-100">Microphone:</strong> Used only when you press
            Record or open Live Voice Conversation.
          </li>
          <li>
            • <strong className="text-slate-100">Web Search:</strong> Active only when toggled on
            in Chat, returning verified source links.
          </li>
        </ul>
      </section>
    </div>
  );
};
