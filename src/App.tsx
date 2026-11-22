import { useCallback, useEffect, useState } from 'react';
import {
  Brain,
  CalendarClock,
  Home,
  Lock,
  MessageSquare,
  Mic,
  Settings,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
  testConnection,
} from './lib/firebase';
import {
  ensureUserProfile,
  logUserMood,
  subscribeAutomations,
  subscribeMemories,
  subscribeMessages,
  subscribeUserProfile,
  updateUserProfile,
} from './lib/firestoreService';
import { listCalendarEvents, listTasks } from './lib/workspaceApi';
import {
  AutomationRoutine,
  CalendarEventItem,
  ChatMessage,
  ConfirmationRequest,
  GoogleTaskItem,
  MemoryItem,
  MoodType,
  UserProfile,
} from './types/nova';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConfirmActionModal } from './components/ConfirmActionModal';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { LiveVoiceModal } from './components/LiveVoiceModal';
import { MoodCheckInModal } from './components/MoodCheckInModal';
import { NOVA_PORTRAIT_URL } from './components/NovaAvatarStage';
import { WellbeingModal } from './components/WellbeingModal';
import { HomeView } from './components/HomeView';
import { ChatView } from './components/ChatView';
import { PlannerView } from './components/PlannerView';
import { MemoryView } from './components/MemoryView';
import { SettingsView } from './components/SettingsView';
import { useMoodTheme } from './hooks/useMoodTheme';

type AppTab = 'home' | 'chat' | 'planner' | 'memory' | 'settings';

function NovaAppContent() {
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [hasWorkspaceToken, setHasWorkspaceToken] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState('');

  // Firestore synced state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [automations, setAutomations] = useState<AutomationRoutine[]>([]);

  useMoodTheme(profile?.currentMood);

  // Workspace live state
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [tasks, setTasks] = useState<GoogleTaskItem[]>([]);

  // Interactive modals & cross-view handoffs
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [wellbeingOpen, setWellbeingOpen] = useState(false);
  const [moodModalOpen, setMoodModalOpen] = useState(false);
  const [wellbeingTab, setWellbeingTab] = useState<'breathing' | 'grounding' | 'resources'>(
    'breathing'
  );
  const [confirmReq, setConfirmReq] = useState<ConfirmationRequest | null>(null);
  const [pendingChatPrompt, setPendingChatPrompt] = useState<string>('');
  const [pendingPlannerChatDraft, setPendingPlannerChatDraft] = useState<string>('');

  const effectivePlayfulJealousy = profile?.playfulJealousy ?? true;
  const effectiveObsessiveMode = profile?.obsessiveMode ?? true;

  const handleTogglePlayfulJealousy = async (next: boolean) => {
    if (!user) return;
    try {
      await updateUserProfile(user.uid, { playfulJealousy: next });
    } catch (err) {
      console.error('Failed updating playfulJealousy setting:', err);
    }
  };

  const handleToggleObsessiveMode = async (next: boolean) => {
    if (!user) return;
    try {
      await updateUserProfile(user.uid, { obsessiveMode: next });
    } catch (err) {
      console.error('Failed updating obsessiveMode setting:', err);
    }
  };

  const openWellbeing = (tab: 'breathing' | 'grounding' | 'resources' = 'breathing') => {
    setWellbeingTab(tab);
    setWellbeingOpen(true);
  };

  const refreshWorkspaceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const [evItems, taskItems] = await Promise.all([
        listCalendarEvents(token, 12).catch(() => []),
        listTasks(token, '@default').catch(() => []),
      ]);
      setEvents(evItems);
      setTasks(taskItems);
    } catch {
      // individual API views show detailed status
    }
  }, []);

  useEffect(() => {
    testConnection();
    const unsubAuth = initAuth((nextUser, hasToken, deniedEmail) => {
      setUser(nextUser);
      setHasWorkspaceToken(hasToken);
      setAuthReady(true);
      if (deniedEmail) {
        setAuthError(
          `Access denied (${deniedEmail}). This private NOVA companion is reserved exclusively for Muhib.`
        );
      }
      if (!nextUser) {
        setProfile(null);
        setMemories([]);
        setMessages([]);
        setAutomations([]);
        setEvents([]);
        setTasks([]);
      }
    });
    return () => unsubAuth();
  }, []);

  // Subscribe to user Firestore data once authenticated
  useEffect(() => {
    if (!user) return;
    let unsubProfile: (() => void) | undefined;
    let unsubMemories: (() => void) | undefined;
    let unsubMessages: (() => void) | undefined;
    let unsubAutomations: (() => void) | undefined;
    let cancelled = false;

    ensureUserProfile(user.uid, user.displayName)
      .then(() => {
        if (cancelled) return;
        setAuthError('');
        unsubProfile = subscribeUserProfile(user.uid, setProfile);
        unsubMemories = subscribeMemories(user.uid, setMemories);
        unsubMessages = subscribeMessages(user.uid, setMessages);
        unsubAutomations = subscribeAutomations(user.uid, setAutomations);
      })
      .catch((err) => {
        console.error('Failed initializing user profile:', err);
        if (!cancelled) {
          setAuthError('Could not load your private NOVA profile. Please reload or sign in again.');
        }
      });

    return () => {
      cancelled = true;
      unsubProfile?.();
      unsubMemories?.();
      unsubMessages?.();
      unsubAutomations?.();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (hasWorkspaceToken) {
      refreshWorkspaceData();
    }
  }, [hasWorkspaceToken, refreshWorkspaceData]);

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    setAuthError('');
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setHasWorkspaceToken(true);
        await refreshWorkspaceData();
      }
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Google sign-in was cancelled or failed.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setUser(null);
    setHasWorkspaceToken(false);
  };

  const openChatWithPrompt = (prompt?: string) => {
    if (prompt) setPendingChatPrompt(prompt);
    setActiveTab('chat');
  };

  const navItems: Array<{ id: AppTab; label: string; icon: typeof Home }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'planner', label: 'Planner', icon: CalendarClock },
    { id: 'memory', label: 'Memory', icon: Brain },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const activeTitle = navItems.find((n) => n.id === activeTab)?.label || 'NOVA';

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#060D1E] text-slate-100 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <img
            src={NOVA_PORTRAIT_URL}
            alt="NOVA"
            referrerPolicy="no-referrer"
            className="w-20 h-20 rounded-full object-cover object-top mx-auto border border-sky-400/40"
          />
          <p className="font-display text-base font-medium text-sky-200">
            Unlocking Muhib&apos;s Private NOVA Space...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#060D1E] text-slate-100 flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-3xl bg-[#0D1B38]/95 border border-sky-400/20 shadow-2xl p-6 sm:p-8 text-center space-y-5">
          <img
            src={NOVA_PORTRAIT_URL}
            alt="NOVA"
            referrerPolicy="no-referrer"
            className="w-24 h-24 rounded-full object-cover object-top mx-auto border-2 border-sky-400/45 shadow-lg shadow-sky-950/50"
          />
          <div className="space-y-2">
            <p className="text-xs font-medium text-sky-300 inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>Private Personal Companion</span>
            </p>
            <h1 className="font-display text-2xl font-semibold text-white">
              Reserved Exclusively for Muhib
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              This NOVA AI space is locked exclusively to Muhib&apos;s authorized Google accounts.
              Nobody else can sign in or access your chats, memories, mood logs, or Workspace tools.
            </p>
          </div>

          {authError && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-400/25 px-4 py-3 text-xs text-rose-200 text-left leading-relaxed">
              {authError}
            </div>
          )}

          <div className="flex justify-center pt-1">
            <GoogleSignInButton
              onClick={handleSignIn}
              disabled={isLoggingIn}
              label="Sign in as Muhib (Google)"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-slate-100 flex flex-col transition-all duration-700"
      style={{ background: 'var(--nova-bg-gradient, #060D1E)' }}
    >
      {/* Desktop Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="hidden lg:flex sticky top-0 z-30 h-16 px-8 items-center justify-between gap-8 bg-[#060D1E]/90 backdrop-blur-md border-b border-sky-400/15">
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          NOVA
        </button>

        <nav className="flex items-center gap-7" aria-label="Main navigation">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  active
                    ? 'text-sky-300 border-sky-400'
                    : 'text-slate-300 border-transparent hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          {user && hasWorkspaceToken ? (
            <button
              type="button"
              onClick={() => setVoiceOpen(true)}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <Mic className="w-4 h-4" />
              Live Voice
            </button>
          ) : (
            <GoogleSignInButton
              onClick={handleSignIn}
              disabled={isLoggingIn}
              label={user ? 'Reconnect Google' : 'Sign in with Google'}
            />
          )}
        </div>
      </header>

      {/* Mobile Compact Sticky Header (<= 52px) */}
      <header className="flex lg:hidden sticky top-0 z-30 h-[52px] px-4 items-center justify-between bg-[#060D1E]/90 backdrop-blur-md border-b border-sky-400/15">
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          NOVA
        </button>
        <span className="text-sm font-medium text-slate-200 truncate px-2">
          {activeTitle}
        </span>
        <button
          type="button"
          onClick={() => setVoiceOpen(true)}
          aria-label="Open NOVA Live Voice"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-sky-300 hover:bg-white/5"
        >
          <Mic className="w-5 h-5" />
        </button>
      </header>

      {authError && (
        <div className="max-w-7xl mx-auto w-full px-4 pt-3">
          <div className="rounded-xl bg-rose-500/10 border border-rose-400/25 px-4 py-2.5 text-xs text-rose-200">
            {authError}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 pb-24 lg:pb-8">
        {activeTab === 'home' && (
          <HomeView
            userName={user?.displayName || null}
            profile={profile}
            memories={memories}
            events={events}
            tasks={tasks}
            isSignedIn={Boolean(user)}
            hasWorkspaceToken={hasWorkspaceToken}
            isLoggingIn={isLoggingIn}
            onSignIn={handleSignIn}
            onStartVoice={() => setVoiceOpen(true)}
            onOpenChatWithPrompt={openChatWithPrompt}
            onOpenPlanner={() => setActiveTab('planner')}
            onOpenWellbeing={openWellbeing}
            onOpenMoodCheckIn={() => setMoodModalOpen(true)}
          />
        )}

        {activeTab === 'chat' && (
          <ChatView
            uid={user?.uid || null}
            profile={profile}
            playfulJealousy={effectivePlayfulJealousy}
            onTogglePlayfulJealousy={handleTogglePlayfulJealousy}
            memories={memories}
            messages={messages}
            events={events}
            tasks={tasks}
            initialPrompt={pendingChatPrompt}
            onConsumeInitialPrompt={() => setPendingChatPrompt('')}
            onStartVoice={() => setVoiceOpen(true)}
            onOpenWellbeing={openWellbeing}
            onRequestConfirm={(req) => setConfirmReq(req)}
            onWorkspaceRefresh={refreshWorkspaceData}
            onOpenChatTabInPlanner={(draft) => {
              setPendingPlannerChatDraft(draft);
              setActiveTab('planner');
            }}
          />
        )}

        {activeTab === 'planner' && (
          <PlannerView
            uid={user?.uid || null}
            profile={profile}
            hasWorkspaceToken={hasWorkspaceToken}
            isLoggingIn={isLoggingIn}
            events={events}
            tasks={tasks}
            automations={automations}
            chatDraft={pendingPlannerChatDraft}
            onConsumeChatDraft={() => setPendingPlannerChatDraft('')}
            onSignIn={handleSignIn}
            onWorkspaceRefresh={refreshWorkspaceData}
            onRequestConfirm={(req) => setConfirmReq(req)}
          />
        )}

        {activeTab === 'memory' && (
          <MemoryView
            uid={user?.uid || null}
            memories={memories}
            isLoggingIn={isLoggingIn}
            onSignIn={handleSignIn}
            onRequestConfirm={(req) => setConfirmReq(req)}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            uid={user?.uid || null}
            userEmail={user?.email || null}
            hasWorkspaceToken={hasWorkspaceToken}
            isLoggingIn={isLoggingIn}
            profile={profile}
            playfulJealousy={effectivePlayfulJealousy}
            onTogglePlayfulJealousy={handleTogglePlayfulJealousy}
            obsessiveMode={effectiveObsessiveMode}
            onToggleObsessiveMode={handleToggleObsessiveMode}
            onSignIn={handleSignIn}
            onSignOut={handleSignOut}
            onRequestConfirm={(req) => setConfirmReq(req)}
          />
        )}
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation Bar (64px) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#081126]/95 backdrop-blur-md border-t border-sky-400/15 pb-safe"
        aria-label="Mobile navigation"
      >
        <div className="grid grid-cols-5 h-16 items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
                  active ? 'text-sky-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] font-medium tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Live Voice Conversation Modal */}
      <LiveVoiceModal
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        profile={profile}
        playfulJealousy={effectivePlayfulJealousy}
        memories={memories}
      />

      {/* Mental Well-Being & Calm Space Modal */}
      <WellbeingModal
        open={wellbeingOpen}
        initialTab={wellbeingTab}
        onClose={() => setWellbeingOpen(false)}
      />

      {/* Mood Check-In Modal */}
      <MoodCheckInModal
        open={moodModalOpen}
        currentMood={profile?.currentMood}
        currentNote={profile?.currentMoodNote}
        onClose={() => setMoodModalOpen(false)}
        onSaveMood={async (mood: MoodType, note: string) => {
          await logUserMood(user.uid, mood, note);
        }}
        onTalkToNova={(mood: MoodType, note: string) => {
          const starter = note
            ? `I just logged that I'm feeling ${mood} — ${note}`
            : `I just logged that I'm feeling ${mood} right now.`;
          openChatWithPrompt(starter);
        }}
        onOpenWellbeing={openWellbeing}
      />

      {/* Explicit Confirmation Modal for Workspace & Destructive Operations */}
      <ConfirmActionModal
        request={confirmReq}
        onClose={() => setConfirmReq(null)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <NovaAppContent />
    </ErrorBoundary>
  );
}
