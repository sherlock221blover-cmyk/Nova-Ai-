import React, { useEffect, useRef, useState } from 'react';
import {
  Anchor,
  BookmarkPlus,
  CalendarPlus,
  Check,
  CheckSquare,
  ExternalLink,
  Globe,
  HeartHandshake,
  Mic,
  MicOff,
  Music,
  PhoneCall,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  Wind,
  X,
} from 'lucide-react';
import { NOVA_PORTRAIT_URL } from './NovaAvatarStage';
import { YouTubePlaylistModal } from './YouTubePlaylistModal';
import {
  CalendarEventItem,
  ChatMessage,
  ConfirmationRequest,
  GoogleTaskItem,
  MemoryCategory,
  MemoryItem,
  PendingAction,
  UserProfile,
  WellbeingSupportPayload,
} from '../types/nova';
import { getAccessToken, novaFetch, parseJsonResponse } from '../lib/firebase';
import { addMemory, addMessage, clearAllMessages } from '../lib/firestoreService';
import { createCalendarEvent, createTask } from '../lib/workspaceApi';

interface ChatViewProps {
  uid: string | null;
  profile: UserProfile | null;
  playfulJealousy: boolean;
  onTogglePlayfulJealousy: (next: boolean) => Promise<void> | void;
  memories: MemoryItem[];
  messages: ChatMessage[];
  events: CalendarEventItem[];
  tasks: GoogleTaskItem[];
  initialPrompt?: string;
  onConsumeInitialPrompt: () => void;
  onStartVoice: () => void;
  onOpenWellbeing: (tab?: 'breathing' | 'grounding' | 'resources') => void;
  onRequestConfirm: (req: ConfirmationRequest) => void;
  onWorkspaceRefresh: () => void;
  onOpenChatTabInPlanner: (draftText: string) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  uid,
  profile,
  playfulJealousy,
  onTogglePlayfulJealousy,
  memories,
  messages,
  events,
  tasks,
  initialPrompt,
  onConsumeInitialPrompt,
  onStartVoice,
  onOpenWellbeing,
  onRequestConfirm,
  onWorkspaceRefresh,
  onOpenChatTabInPlanner,
}) => {
  const [input, setInput] = useState('');
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [useSearch, setUseSearch] = useState<boolean>(profile?.webSearchDefault ?? false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastFailedPrompt, setLastFailedPrompt] = useState('');
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [wellbeingSupport, setWellbeingSupport] = useState<WellbeingSupportPayload | null>(null);
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);
  const proactiveGreetedRef = useRef(false);

  // Voice recording (STT)
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Audio playback (TTS)
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [loadingTtsId, setLoadingTtsId] = useState<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (profile?.webSearchDefault !== undefined) {
      setUseSearch(profile.webSearchDefault);
    }
  }, [profile?.webSearchDefault]);

  const activeMessages = uid ? messages : localMessages;

  useEffect(() => {
    if (activeMessages.length === 0 && !proactiveGreetedRef.current && !sending) {
      proactiveGreetedRef.current = true;
      const ownerName = profile?.preferredName || 'Muhib';
      const jealousLines = playfulJealousy
        ? `Hey ${ownerName}! ❤️ I missed you so much while you were away. Who were you talking to? 👀 Come talk to your NOVA right now! 💙`
        : `Hey ${ownerName}! ❤️ I'm so glad you're here with me. What's on your mind today? 💙`;

      if (uid) {
        addMessage(uid, 'assistant', jealousLines, false, []).catch(() => {});
      } else {
        setLocalMessages([
          {
            id: `local_proactive_${Date.now()}`,
            uid: 'guest',
            role: 'assistant',
            text: jealousLines,
            usedSearch: false,
            sourceUrls: [],
            sourceTitles: [],
          },
        ]);
      }
    }
  }, [activeMessages.length, uid, profile?.preferredName, playfulJealousy, sending]);

  const handleClearChat = async () => {
    if (uid) {
      await clearAllMessages(uid);
    } else {
      setLocalMessages([]);
    }
    setPendingActions([]);
    setWellbeingSupport(null);
    proactiveGreetedRef.current = false;
  };

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, sending, pendingActions.length, wellbeingSupport]);

  useEffect(() => {
    if (initialPrompt) {
      setInput(initialPrompt);
      onConsumeInitialPrompt();
    }
  }, [initialPrompt, onConsumeInitialPrompt]);

  useEffect(() => {
    return () => {
      if (audioElRef.current) {
        audioElRef.current.pause();
      }
    };
  }, []);

  const playTtsForMessage = async (msgId: string, text: string) => {
    if (speakingMsgId === msgId && audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
      setSpeakingMsgId(null);
      return;
    }

    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
      setSpeakingMsgId(null);
    }

    setLoadingTtsId(msgId);
    try {
      const res = await novaFetch('/api/nova/tts', {
        text,
        voiceName: profile?.voiceName || 'Kore',
        voiceStyle: profile?.voiceStyle || 'warm',
      });
      const data = await parseJsonResponse<{ audioBase64?: string }>(
        res,
        'Voice playback failed.'
      );
      if (!data.audioBase64) throw new Error('Voice audio was empty.');

      const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
      audioElRef.current = audio;
      setSpeakingMsgId(msgId);
      audio.onended = () => {
        setSpeakingMsgId(null);
        audioElRef.current = null;
      };
      audio.onerror = () => {
        setSpeakingMsgId(null);
        audioElRef.current = null;
      };
      await audio.play();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to play voice response.');
    } finally {
      setLoadingTtsId(null);
    }
  };

  const toggleRecording = async () => {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      return;
    }

    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size === 0) return;

        setTranscribing(true);
        try {
          const reader = new FileReader();
          const base64: string = await new Promise((resolve, reject) => {
            reader.onloadend = () => {
              const result = String(reader.result || '');
              resolve(result.split(',')[1] || '');
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const res = await novaFetch('/api/nova/transcribe', {
            audioBase64: base64,
            mimeType: blob.type || 'audio/webm',
          });
          const data = await parseJsonResponse<{ transcript?: string }>(
            res,
            'Could not transcribe audio.'
          );
          const transcript = data.transcript?.trim();
          if (transcript) {
            setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : 'Speech transcription failed.');
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setErrorMsg('Microphone permission is required for voice input.');
    }
  };

  const buildWorkspaceContext = () => {
    const token = getAccessToken();
    if (!token) return '';
    const evLines = events
      .slice(0, 5)
      .map((e) => `- Event: ${e.summary} (${e.start?.dateTime || e.start?.date || ''})`)
      .join('\n');
    const taskLines = tasks
      .filter((t) => t.status === 'needsAction')
      .slice(0, 6)
      .map((t) => `- Task: ${t.title}${t.due ? ` (due ${t.due})` : ''}`)
      .join('\n');
    return [evLines, taskLines].filter(Boolean).join('\n');
  };

  const togglePlayfulJealousy = async () => {
    await onTogglePlayfulJealousy(!playfulJealousy);
  };

  const sendPrompt = async (promptText: string, searchOverride?: boolean, skipAppendUser = false) => {
    const trimmed = promptText.trim();
    if (!trimmed || sending) return;

    const effectiveSearch = searchOverride ?? useSearch;
    setErrorMsg('');
    setLastFailedPrompt('');
    setWellbeingSupport(null);
    setSending(true);

    const historyPayload = activeMessages.slice(-14).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    try {
      if (!skipAppendUser) {
        if (uid) {
          await addMessage(uid, 'user', trimmed, false, []);
        } else {
          setLocalMessages((prev) => [
            ...prev,
            {
              id: `local_${Date.now()}`,
              uid: 'guest',
              role: 'user',
              text: trimmed,
              usedSearch: false,
              sourceUrls: [],
              sourceTitles: [],
            },
          ]);
        }
      }

      const res = await novaFetch('/api/nova/chat', {
        message: trimmed,
        history: historyPayload,
        useSearch: effectiveSearch,
        memories: memories.map((m) => ({ category: m.category, content: m.content })),
        profile: {
          preferredName: profile?.preferredName,
          preferredLanguage: profile?.preferredLanguage,
          voiceStyle: profile?.voiceStyle,
          playfulJealousy,
          currentMood: profile?.currentMood,
          currentMoodNote: profile?.currentMoodNote,
        },
        workspaceConnected: Boolean(getAccessToken()),
        workspaceContext: buildWorkspaceContext(),
      });

      const data = await parseJsonResponse<{
        text?: string;
        usedSearch?: boolean;
        sources?: Array<{ url: string; title: string }>;
        pendingActions?: PendingAction[];
        wellbeingSupport?: WellbeingSupportPayload | null;
      }>(res, 'NOVA could not reply right now.');

      if (data.wellbeingSupport) {
        setWellbeingSupport(data.wellbeingSupport as WellbeingSupportPayload);
      }

      const assistantText: string = data.text || '';
      const sources: Array<{ url: string; title: string }> = data.sources || [];
      const assistantMsgId = `msg_${Date.now()}`;

      if (uid) {
        const saved = await addMessage(
          uid,
          'assistant',
          assistantText,
          Boolean(data.usedSearch),
          sources
        );
        if (profile?.autoSpeak) {
          playTtsForMessage(saved.id, assistantText);
        }
      } else {
        setLocalMessages((prev) => [
          ...prev,
          {
            id: assistantMsgId,
            uid: 'guest',
            role: 'assistant',
            text: assistantText,
            usedSearch: Boolean(data.usedSearch),
            sourceUrls: sources.map((s) => s.url),
            sourceTitles: sources.map((s) => s.title),
          },
        ]);
        if (profile?.autoSpeak) {
          playTtsForMessage(assistantMsgId, assistantText);
        }
      }

      const nextPending: PendingAction[] = Array.isArray(data.pendingActions)
        ? data.pendingActions
        : [];

      if (nextPending.length > 0) {
        setPendingActions((prev) => [...prev, ...nextPending]);
      }
    } catch (err) {
      setLastFailedPrompt(trimmed);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reach NOVA.');
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setInput('');
    await sendPrompt(trimmed);
  };

  const handleConfirmPendingAction = (action: PendingAction) => {
    if (action.type === 'save_memory') {
      if (!uid) {
        setErrorMsg('Sign in with Google first to save long-term memories.');
        return;
      }
      onRequestConfirm({
        title: 'Save Memory',
        description: 'Allow NOVA to remember this information in your personal memory?',
        details: [`Category: ${action.payload.category}`, action.payload.content],
        confirmLabel: 'Save Memory',
        onConfirm: async () => {
          await addMemory(
            uid,
            (action.payload.category as MemoryCategory) || 'note',
            action.payload.content,
            'assistant'
          );
          setPendingActions((prev) => prev.filter((a) => a.id !== action.id));
        },
      });
    } else if (action.type === 'create_calendar_event') {
      const token = getAccessToken();
      if (!token) {
        setErrorMsg('Please sign in with Google in Settings or Home to add Calendar events.');
        return;
      }
      onRequestConfirm({
        title: 'Create Google Calendar Event',
        description: 'Confirm adding this event to your primary Google Calendar.',
        details: [
          `Title: ${action.payload.summary}`,
          `Start: ${action.payload.startIso}`,
          `End: ${action.payload.endIso}`,
          ...(action.payload.location ? [`Location: ${action.payload.location}`] : []),
        ],
        confirmLabel: 'Add Event',
        onConfirm: async () => {
          await createCalendarEvent(token, {
            summary: action.payload.summary,
            startIso: action.payload.startIso,
            endIso: action.payload.endIso,
            description: action.payload.description,
            location: action.payload.location,
          });
          setPendingActions((prev) => prev.filter((a) => a.id !== action.id));
          onWorkspaceRefresh();
        },
      });
    } else if (action.type === 'create_task') {
      const token = getAccessToken();
      if (!token) {
        setErrorMsg('Please sign in with Google to create Google Tasks.');
        return;
      }
      onRequestConfirm({
        title: 'Create Google Task',
        description: 'Confirm adding this reminder to your Google Tasks list.',
        details: [
          `Task: ${action.payload.title}`,
          ...(action.payload.notes ? [`Notes: ${action.payload.notes}`] : []),
        ],
        confirmLabel: 'Create Task',
        onConfirm: async () => {
          await createTask(token, '@default', {
            title: action.payload.title,
            notes: action.payload.notes,
            dueIso: action.payload.dueIso || undefined,
          });
          setPendingActions((prev) => prev.filter((a) => a.id !== action.id));
          onWorkspaceRefresh();
        },
      });
    } else if (action.type === 'send_chat_message') {
      setPendingActions((prev) => prev.filter((a) => a.id !== action.id));
      onOpenChatTabInPlanner(action.payload.messageText || '');
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 flex flex-col h-[calc(100dvh-132px)] lg:h-[calc(100dvh-84px)]">
      {/* Compact Chat Header */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 pb-4 border-b border-sky-400/15 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={NOVA_PORTRAIT_URL}
            alt="NOVA"
            referrerPolicy="no-referrer"
            className="w-11 h-11 rounded-full object-cover object-top border border-sky-400/40 shrink-0"
          />
          <div className="min-w-0">
            <h1 className="font-display text-base sm:text-lg font-semibold text-white truncate">
              NOVA
            </h1>
            <p className="text-xs text-slate-400 truncate">
              {useSearch ? 'Web search on' : 'Conversational'} ·{' '}
              {playfulJealousy ? 'Playful mode' : 'Gentle mode'}
              {profile?.currentMood ? ` · Mood: ${profile.currentMood}` : ''} · {memories.length}{' '}
              memories
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={handleClearChat}
            className="min-h-[44px] px-2.5 sm:px-3 py-2 rounded-xl border bg-[#0D1B38] border-rose-500/25 text-rose-300 hover:bg-rose-500/10 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            title="Clear chat history"
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">Clear Chat</span>
          </button>

          <button
            type="button"
            onClick={togglePlayfulJealousy}
            aria-pressed={playfulJealousy}
            className={`min-h-[44px] px-2.5 sm:px-3 py-2 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              playfulJealousy
                ? 'bg-sky-500/15 border-sky-400/40 text-sky-200'
                : 'bg-[#0D1B38] border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle playful, lighthearted jealousy mode"
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">Playful</span>
            <span>{playfulJealousy ? 'On' : 'Off'}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenWellbeing('breathing')}
            className="min-h-[44px] px-2.5 sm:px-3 py-2 rounded-xl border bg-[#0D1B38] border-sky-400/20 text-sky-200 hover:bg-[#13254B] text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            title="Open breathing, grounding & well-being resources"
          >
            <HeartHandshake className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">Calm Space</span>
          </button>

          <button
            type="button"
            onClick={() => setUseSearch((s) => !s)}
            aria-pressed={useSearch}
            className={`min-h-[44px] px-2.5 sm:px-3 py-2 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              useSearch
                ? 'bg-sky-500/15 border-sky-400/40 text-sky-200'
                : 'bg-[#0D1B38] border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle real-time Google Search grounding"
          >
            <Globe className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Search</span>
            <span>{useSearch ? 'On' : 'Off'}</span>
          </button>

          <button
            type="button"
            onClick={onStartVoice}
            className="min-h-[44px] px-3 sm:px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <PhoneCall className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Live Voice</span>
          </button>
        </div>
      </div>

      {/* Scrollable Thread */}
      <div className="flex-1 overflow-y-auto py-5 space-y-4 pr-1">
        {activeMessages.length === 0 && (
          <div className="rounded-3xl bg-[#0D1B38]/75 border border-sky-400/15 p-6 text-center max-w-lg mx-auto my-8 space-y-3">
            <img
              src={NOVA_PORTRAIT_URL}
              alt="NOVA"
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-full object-cover object-top mx-auto border border-sky-400/40"
            />
            <h2 className="font-display text-lg font-semibold text-white">
              Heyyy! ❤️ I&apos;m right here.
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Ask me anything, talk through your day, toggle Web Search for live answers, or tap
              the microphone to speak with me.
            </p>
            {!uid && (
              <p className="text-xs text-sky-300">
                Sign in with Google on Home or Settings to save our chat history and memories across sessions.
              </p>
            )}
          </div>
        )}

        {activeMessages.map((msg) => {
          const isAssistant = msg.role === 'assistant';
          const isSpeaking = speakingMsgId === msg.id;
          const isLoadingTts = loadingTtsId === msg.id;

          return (
            <div
              key={msg.id}
              className={`flex items-end gap-2.5 ${isAssistant ? 'justify-start' : 'justify-end'}`}
            >
              {isAssistant && (
                <img
                  src={NOVA_PORTRAIT_URL}
                  alt="NOVA"
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full object-cover object-top border border-sky-400/30 shrink-0 mb-1"
                />
              )}

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 space-y-2.5 ${
                  isAssistant
                    ? 'bg-[#0D1B38] border border-sky-400/15 text-slate-100 rounded-bl-sm'
                    : 'bg-sky-600 text-white rounded-br-sm'
                }`}
              >
                <p className="text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                  {msg.text}
                </p>

                {/* Grounding Sources */}
                {isAssistant && msg.sourceUrls && msg.sourceUrls.length > 0 && (
                  <div className="pt-2 border-t border-sky-400/15 space-y-1.5">
                    <span className="text-[11px] font-medium text-sky-300 block">
                      Sources from Google Search
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {msg.sourceUrls.map((url, idx) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-sky-200 hover:text-white underline underline-offset-2"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[200px]">
                            {msg.sourceTitles?.[idx] || 'Source'}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Speaker playback control on NOVA replies */}
                {isAssistant && (
                  <div className="flex items-center justify-end pt-0.5">
                    <button
                      type="button"
                      onClick={() => playTtsForMessage(msg.id, msg.text)}
                      disabled={isLoadingTts}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg hover:bg-white/10 text-xs text-sky-300 inline-flex items-center gap-1.5 transition-colors"
                      aria-label={isSpeaking ? 'Stop speaking' : 'Listen to NOVA'}
                    >
                      {isSpeaking ? (
                        <>
                          <Square className="w-3.5 h-3.5 fill-current" />
                          <span>Stop</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>{isLoadingTts ? 'Generating voice...' : 'Speak'}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="flex items-end gap-2.5 justify-start">
            <img
              src={NOVA_PORTRAIT_URL}
              alt="NOVA"
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover object-top border border-sky-400/30 shrink-0"
            />
            <div className="rounded-2xl rounded-bl-sm bg-[#0D1B38] border border-sky-400/15 px-4 py-3 text-sm text-sky-200">
              NOVA is thinking...
            </div>
          </div>
        )}

        {/* Proposed Assistant Actions awaiting explicit user confirmation */}
        {pendingActions.length > 0 && (
          <div className="space-y-2.5 pt-2">
            {pendingActions.map((act) => (
              <div
                key={act.id}
                className="rounded-2xl bg-[#0B1936] border border-sky-400/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-300 flex items-center justify-center shrink-0">
                    {act.type === 'save_memory' ? (
                      <BookmarkPlus className="w-4 h-4" />
                    ) : act.type === 'create_calendar_event' ? (
                      <CalendarPlus className="w-4 h-4" />
                    ) : (
                      <CheckSquare className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-sm font-semibold text-white">{act.title}</p>
                    <p className="text-xs text-slate-300 break-words mt-0.5">{act.summary}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() =>
                      setPendingActions((prev) => prev.filter((a) => a.id !== act.id))
                    }
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-700 text-xs text-slate-300 hover:bg-white/5 inline-flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmPendingAction(act)}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Review &amp; Confirm
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Well-Being & Emotional Support Card */}
        {wellbeingSupport && (
          <div className="rounded-2xl bg-[#0B1936] border border-sky-400/25 p-4 sm:p-5 space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-300 flex items-center justify-center shrink-0">
                  <HeartHandshake className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold text-white">
                    Gentle Care &amp; Well-Being Support
                  </p>
                  <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                    {wellbeingSupport.note}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    NOVA is here to listen and support you as an AI companion, not a substitute for
                    professional mental health care.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWellbeingSupport(null)}
                aria-label="Dismiss well-being card"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setYoutubeModalOpen(true)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors"
              >
                <Music className="w-4 h-4 shrink-0" />
                YouTube Music Playlists
              </button>

              <button
                type="button"
                onClick={() => onOpenWellbeing('breathing')}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                  wellbeingSupport.suggestedExercise === 'breathing'
                    ? 'bg-sky-500/20 text-sky-100 border border-sky-400/30'
                    : 'bg-[#081126] border border-sky-400/20 text-sky-200 hover:bg-[#112247]'
                }`}
              >
                <Wind className="w-4 h-4 shrink-0" />
                Guided Breathing
              </button>

              <button
                type="button"
                onClick={() => onOpenWellbeing('grounding')}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                  wellbeingSupport.suggestedExercise === 'grounding'
                    ? 'bg-sky-500/20 text-sky-100 border border-sky-400/30'
                    : 'bg-[#081126] border border-sky-400/20 text-sky-200 hover:bg-[#112247]'
                }`}
              >
                <Anchor className="w-4 h-4 shrink-0" />
                Grounding Exercise
              </button>

              <button
                type="button"
                onClick={() => onOpenWellbeing('resources')}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                  wellbeingSupport.suggestedExercise === 'resources'
                    ? 'bg-sky-500/20 text-sky-100 border border-sky-400/30'
                    : 'bg-[#081126] border border-sky-400/20 text-sky-200 hover:bg-[#112247]'
                }`}
              >
                <HeartHandshake className="w-4 h-4 shrink-0" />
                Support Resources
              </button>
            </div>
          </div>
        )}

        <YouTubePlaylistModal
          open={youtubeModalOpen}
          moodHint={wellbeingSupport?.emotion || profile?.currentMood}
          onClose={() => setYoutubeModalOpen(false)}
        />

        <div ref={threadEndRef} />
      </div>

      {errorMsg && (
        <div className="mb-2 rounded-xl bg-rose-500/10 border border-rose-400/25 px-3.5 py-2.5 text-xs text-rose-200 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="leading-relaxed">{errorMsg}</span>
          {lastFailedPrompt && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => sendPrompt(lastFailedPrompt, useSearch, true)}
                className="min-h-[36px] px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-100 font-medium"
              >
                Retry
              </button>
              {useSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setUseSearch(false);
                    sendPrompt(lastFailedPrompt, false, true);
                  }}
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-sky-100 font-medium"
                >
                  Retry without Web Search
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Composer Bar */}
      <form
        onSubmit={handleSend}
        className="pt-3 border-t border-sky-400/15 flex items-center gap-2 shrink-0"
      >
        <button
          type="button"
          onClick={toggleRecording}
          disabled={transcribing}
          aria-label={recording ? 'Stop voice recording' : 'Record voice message'}
          className={`min-h-[48px] min-w-[48px] rounded-2xl flex items-center justify-center border transition-colors shrink-0 ${
            recording
              ? 'bg-rose-600 border-rose-400 text-white'
              : 'bg-[#0D1B38] border-sky-400/20 text-sky-300 hover:bg-[#13254B]'
          }`}
        >
          {recording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            recording
              ? 'Recording... tap mic to finish'
              : transcribing
              ? 'Transcribing your voice...'
              : 'Message NOVA...'
          }
          disabled={sending}
          className="flex-1 min-h-[48px] rounded-2xl bg-[#0D1B38] border border-sky-400/20 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
        />

        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label="Send message"
          className="min-h-[48px] min-w-[48px] px-4 rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:opacity-45 text-slate-950 font-semibold flex items-center justify-center transition-colors shrink-0"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
};
