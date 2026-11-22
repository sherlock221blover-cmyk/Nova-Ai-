import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckSquare,
  FileText,
  Globe,
  HeartHandshake,
  Languages,
  Mail,
  MessageSquare,
  Mic,
  SmilePlus,
} from 'lucide-react';
import { NovaAvatarStage } from './NovaAvatarStage';
import { GoogleSignInButton } from './GoogleSignInButton';
import { MOOD_OPTIONS } from './MoodCheckInModal';
import { novaFetch, parseJsonResponse } from '../lib/firebase';
import {
  CalendarEventItem,
  GoogleTaskItem,
  MemoryItem,
  UserProfile,
} from '../types/nova';

interface HomeViewProps {
  userName: string | null;
  profile: UserProfile | null;
  memories: MemoryItem[];
  events: CalendarEventItem[];
  tasks: GoogleTaskItem[];
  isSignedIn: boolean;
  hasWorkspaceToken: boolean;
  isLoggingIn: boolean;
  onSignIn: () => void;
  onStartVoice: () => void;
  onOpenChatWithPrompt: (prompt?: string) => void;
  onOpenPlanner: () => void;
  onOpenWellbeing: (tab?: 'breathing' | 'grounding' | 'resources') => void;
  onOpenMoodCheckIn: () => void;
}

type AssistTool = 'summarize' | 'translate' | 'study_plan' | 'draft_message';

export const HomeView: React.FC<HomeViewProps> = ({
  userName,
  profile,
  memories,
  events,
  tasks,
  isSignedIn,
  hasWorkspaceToken,
  isLoggingIn,
  onSignIn,
  onStartVoice,
  onOpenChatWithPrompt,
  onOpenPlanner,
  onOpenWellbeing,
  onOpenMoodCheckIn,
}) => {
  const [activeTool, setActiveTool] = useState<AssistTool | null>(null);
  const [toolInput, setToolInput] = useState('');
  const [targetLang, setTargetLang] = useState('Spanish');
  const [toolResult, setToolResult] = useState('');
  const [toolLoading, setToolLoading] = useState(false);
  const [toolError, setToolError] = useState('');

  const displayName = profile?.preferredName || userName?.split(' ')[0] || 'Muhib';
  const openTasks = tasks.filter((t) => t.status === 'needsAction');
  const currentMoodMeta = MOOD_OPTIONS.find((m) => m.id === profile?.currentMood);

  const quickStarters = [
    'Hey NOVA, how are you today?',
    'Help me organize my schedule for today',
    "I'm going out with friends tonight!",
    "I'm feeling stressed and could use some support",
  ];

  const runAssistTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTool || !toolInput.trim()) return;
    setToolLoading(true);
    setToolError('');
    setToolResult('');
    try {
      const res = await novaFetch('/api/nova/assist', {
        task: activeTool,
        input: toolInput.trim(),
        targetLanguage: targetLang,
        profile: {
          preferredName: profile?.preferredName,
          preferredLanguage: profile?.preferredLanguage,
          currentMood: profile?.currentMood,
          currentMoodNote: profile?.currentMoodNote,
        },
      });
      const data = await parseJsonResponse<{ text?: string }>(
        res,
        'Could not complete request.'
      );
      setToolResult(data.text || '');
    } catch (err) {
      setToolError(err instanceof Error ? err.message : 'Assistant tool failed.');
    } finally {
      setToolLoading(false);
    }
  };

  const formatEventTime = (ev: CalendarEventItem) => {
    const raw = ev.start?.dateTime || ev.start?.date;
    if (!raw) return 'Upcoming';
    const d = new Date(raw);
    return ev.start?.dateTime
      ? d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
        {/* Left Focal Anchor: NOVA 3D Holographic Portrait */}
        <div className="lg:col-span-5 flex flex-col">
          <NovaAvatarStage
            state="idle"
            onStartVoice={onStartVoice}
            onOpenChat={() => onOpenChatWithPrompt()}
          />
        </div>

        {/* Right Companion Hub */}
        <div className="lg:col-span-7 flex flex-col justify-between gap-6">
          {/* Welcome Header */}
          <div className="rounded-3xl bg-[#0D1B38]/90 border border-sky-400/15 p-6 sm:p-7 space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-medium text-sky-300 tracking-wide">
                Personal AI Companion · Voice, Search &amp; Memory
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white tracking-tight text-balance">
                Heyyy, {displayName}! I&apos;m happy you&apos;re here. What shall we do together today?
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
                Chat with me by text or live voice, ask me to search the web with verified sources,
                manage your Google Calendar and Tasks, or save things you want me to remember.
              </p>
            </div>

            {/* Mood Check-In Action */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onOpenMoodCheckIn}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/35 text-sky-100 text-sm font-medium inline-flex items-center gap-2 transition-colors"
              >
                <SmilePlus className="w-4 h-4 text-sky-300 shrink-0" />
                <span>How are you feeling?</span>
              </button>

              {currentMoodMeta && (
                <span className="text-xs text-slate-300">
                  Current mood: <span aria-hidden="true">{currentMoodMeta.emoji}</span>{' '}
                  <strong className="font-medium text-white">{currentMoodMeta.label}</strong> ·
                  NOVA is tailored to your mood
                </span>
              )}
            </div>

            {(!isSignedIn || !hasWorkspaceToken) && (
              <div className="pt-2 border-t border-sky-400/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  {isSignedIn
                    ? 'Reconnect Google to refresh Calendar, Tasks, and Chat permissions.'
                    : 'Sign in with Google to save long-term memories and connect Calendar, Tasks, and Chat.'}
                </p>
                <GoogleSignInButton
                  onClick={onSignIn}
                  disabled={isLoggingIn}
                  label={isSignedIn ? 'Reconnect Google' : 'Sign in with Google'}
                />
              </div>
            )}

            {/* Quick Conversation Starters */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-400">
                  Quick conversation starters
                </span>
                <button
                  type="button"
                  onClick={() => onOpenWellbeing('breathing')}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium text-sky-300 hover:text-sky-200 hover:bg-white/5 inline-flex items-center gap-1.5 transition-colors"
                >
                  <HeartHandshake className="w-3.5 h-3.5 shrink-0" />
                  Calm &amp; Well-Being Space
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {quickStarters.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => onOpenChatWithPrompt(prompt)}
                    className="min-h-[44px] text-left px-4 py-2.5 rounded-xl bg-[#081126] hover:bg-[#112247] border border-sky-400/15 hover:border-sky-400/35 text-sm text-slate-200 flex items-center justify-between gap-2 transition-colors"
                  >
                    <span className="truncate">{prompt}</span>
                    <ArrowRight className="w-4 h-4 text-sky-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Live Overview: Schedule, Tasks & Memories */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={onOpenPlanner}
              className="text-left rounded-2xl bg-[#0D1B38]/85 hover:bg-[#112247] border border-sky-400/15 p-4 space-y-2 transition-colors"
            >
              <div className="flex items-center justify-between text-sky-300">
                <Calendar className="w-5 h-5" />
                <span className="font-mono text-xs tabular-nums text-slate-400">
                  {hasWorkspaceToken ? `${events.length} upcoming` : 'Connect'}
                </span>
              </div>
              <p className="font-display text-sm font-semibold text-slate-100">Calendar</p>
              <p className="text-xs text-slate-400 truncate">
                {events[0]
                  ? `${events[0].summary} · ${formatEventTime(events[0])}`
                  : hasWorkspaceToken
                  ? 'No upcoming events'
                  : 'Sign in to view events'}
              </p>
            </button>

            <button
              type="button"
              onClick={onOpenPlanner}
              className="text-left rounded-2xl bg-[#0D1B38]/85 hover:bg-[#112247] border border-sky-400/15 p-4 space-y-2 transition-colors"
            >
              <div className="flex items-center justify-between text-sky-300">
                <CheckSquare className="w-5 h-5" />
                <span className="font-mono text-xs tabular-nums text-slate-400">
                  {hasWorkspaceToken ? `${openTasks.length} open` : 'Connect'}
                </span>
              </div>
              <p className="font-display text-sm font-semibold text-slate-100">Tasks &amp; Reminders</p>
              <p className="text-xs text-slate-400 truncate">
                {openTasks[0]
                  ? openTasks[0].title
                  : hasWorkspaceToken
                  ? 'All caught up!'
                  : 'Sign in to sync tasks'}
              </p>
            </button>

            <button
              type="button"
              onClick={onStartVoice}
              className="text-left rounded-2xl bg-[#0D1B38]/85 hover:bg-[#112247] border border-sky-400/15 p-4 space-y-2 transition-colors"
            >
              <div className="flex items-center justify-between text-sky-300">
                <Mic className="w-5 h-5" />
                <span className="font-mono text-xs tabular-nums text-slate-400">
                  {memories.length} memories
                </span>
              </div>
              <p className="font-display text-sm font-semibold text-slate-100">Live Companion</p>
              <p className="text-xs text-slate-400 truncate">
                Tap to speak naturally with NOVA
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* Assistant Quick Tools Section */}
      <section className="rounded-3xl bg-[#0D1B38]/80 border border-sky-400/15 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Quick Intelligence Tools
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Summarize notes · Translate languages · Build study plans · Draft messages
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'summarize' as const, label: 'Summarize', icon: FileText },
              { id: 'translate' as const, label: 'Translate', icon: Languages },
              { id: 'study_plan' as const, label: 'Study Plan', icon: BookOpen },
              { id: 'draft_message' as const, label: 'Draft Message', icon: Mail },
            ].map((tool) => {
              const Icon = tool.icon;
              const isSelected = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    setActiveTool(isSelected ? null : tool.id);
                    setToolResult('');
                    setToolError('');
                  }}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'bg-[#081126] text-slate-200 border border-sky-400/15 hover:border-sky-400/35'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {tool.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeTool && (
          <form onSubmit={runAssistTool} className="space-y-4 pt-2 border-t border-sky-400/10">
            {activeTool === 'translate' && (
              <div className="flex items-center gap-3">
                <label htmlFor="translate-lang" className="text-xs text-slate-300 shrink-0">
                  Target language:
                </label>
                <select
                  id="translate-lang"
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-sm text-slate-100 focus:outline-none focus:border-sky-400"
                >
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                  <option value="Japanese">Japanese</option>
                  <option value="Urdu">Urdu</option>
                  <option value="Arabic">Arabic</option>
                  <option value="Hindi">Hindi</option>
                  <option value="English">English</option>
                </select>
              </div>
            )}

            <textarea
              value={toolInput}
              onChange={(e) => setToolInput(e.target.value)}
              rows={3}
              placeholder={
                activeTool === 'summarize'
                  ? 'Paste an article, lecture notes, or document text to summarize...'
                  : activeTool === 'translate'
                  ? 'Enter text to translate...'
                  : activeTool === 'study_plan'
                  ? 'Describe what you want to learn and your timeline (e.g., Linear Algebra in 2 weeks)...'
                  : 'Tell NOVA who you are messaging and what you want to say...'
              }
              className="w-full rounded-2xl bg-[#081126] border border-sky-400/20 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
            />

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onOpenChatWithPrompt(toolInput || undefined)}
                className="min-h-[44px] text-xs text-sky-300 hover:text-sky-200 inline-flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Continue in full chat
              </button>

              <button
                type="submit"
                disabled={toolLoading || !toolInput.trim()}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-sm inline-flex items-center gap-2 transition-colors"
              >
                <Globe className="w-4 h-4" />
                {toolLoading ? 'Working...' : 'Run Assistant'}
              </button>
            </div>

            {toolError && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-400/25 p-3 text-xs text-rose-200">
                {toolError}
              </div>
            )}

            {toolResult && (
              <div className="rounded-2xl bg-[#081126] border border-sky-400/20 p-4 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                {toolResult}
              </div>
            )}
          </form>
        )}
      </section>
    </div>
  );
};
