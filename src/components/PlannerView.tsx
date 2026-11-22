import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Circle,
  ExternalLink,
  MessageCircle,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Workflow,
} from 'lucide-react';
import {
  AutomationActionType,
  AutomationRoutine,
  CalendarEventItem,
  ConfirmationRequest,
  GoogleChatMessage,
  GoogleChatSpace,
  GoogleTaskItem,
  GoogleTaskListItem,
  UserProfile,
} from '../types/nova';
import { getAccessToken, novaFetch, parseJsonResponse, PROJECT_ID } from '../lib/firebase';
import {
  createCalendarEvent,
  createTask,
  deleteCalendarEvent,
  deleteTask,
  listChatMessages,
  listChatSpaces,
  listTaskLists,
  listTasks,
  sendChatMessage,
  updateTaskStatus,
  WorkspaceApiError,
} from '../lib/workspaceApi';
import {
  addAutomation,
  deleteAutomation,
  toggleAutomation,
} from '../lib/firestoreService';
import { GoogleSignInButton } from './GoogleSignInButton';

interface PlannerViewProps {
  uid: string | null;
  profile: UserProfile | null;
  hasWorkspaceToken: boolean;
  isLoggingIn: boolean;
  events: CalendarEventItem[];
  tasks: GoogleTaskItem[];
  automations: AutomationRoutine[];
  initialTab?: 'calendar' | 'tasks' | 'chat' | 'automations';
  chatDraft?: string;
  onConsumeChatDraft: () => void;
  onSignIn: () => void;
  onWorkspaceRefresh: () => Promise<void>;
  onRequestConfirm: (req: ConfirmationRequest) => void;
}

export const PlannerView: React.FC<PlannerViewProps> = ({
  uid,
  profile,
  hasWorkspaceToken,
  isLoggingIn,
  events,
  tasks,
  automations,
  initialTab = 'calendar',
  chatDraft = '',
  onConsumeChatDraft,
  onSignIn,
  onWorkspaceRefresh,
  onRequestConfirm,
}) => {
  const [tab, setTab] = useState<'calendar' | 'tasks' | 'chat' | 'automations'>(initialTab);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Calendar form
  const [evTitle, setEvTitle] = useState('');
  const [evStart, setEvStart] = useState('');
  const [evEnd, setEvEnd] = useState('');
  const [evLocation, setEvLocation] = useState('');

  // Tasks state
  const [taskLists, setTaskLists] = useState<GoogleTaskListItem[]>([]);
  const [selectedListId, setSelectedListId] = useState('@default');
  const [activeTasks, setActiveTasks] = useState<GoogleTaskItem[]>(tasks);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [taskDue, setTaskDue] = useState('');

  // Google Chat state
  const [chatSpaces, setChatSpaces] = useState<GoogleChatSpace[]>([]);
  const [selectedSpace, setSelectedSpace] = useState('');
  const [chatMessages, setChatMessages] = useState<GoogleChatMessage[]>([]);
  const [chatMessageInput, setChatMessageInput] = useState('');
  const [chatError, setChatError] = useState<{
    message: string;
    isAppMissing?: boolean;
    isConsumer?: boolean;
  } | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);

  // Automations state
  const [autoTitle, setAutoTitle] = useState('');
  const [autoDesc, setAutoDesc] = useState('');
  const [autoType, setAutoType] = useState<AutomationActionType>('briefing');
  const [autoTime, setAutoTime] = useState('08:30');
  const [briefingOutput, setBriefingOutput] = useState('');
  const [runningAuto, setRunningAuto] = useState(false);

  useEffect(() => {
    setActiveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    if (chatDraft) {
      setTab('chat');
      setChatMessageInput(chatDraft);
      onConsumeChatDraft();
    }
  }, [chatDraft, onConsumeChatDraft]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    listTaskLists(token)
      .then((lists) => {
        setTaskLists(lists);
        if (lists[0]?.id && selectedListId === '@default') {
          setSelectedListId(lists[0].id);
        }
      })
      .catch(() => {});
  }, [hasWorkspaceToken]);

  const loadSelectedTaskList = async (listId: string) => {
    const token = getAccessToken();
    if (!token) return;
    setSelectedListId(listId);
    try {
      const items = await listTasks(token, listId);
      setActiveTasks(items);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load tasks.');
    }
  };

  const loadChatSpaces = async () => {
    const token = getAccessToken();
    if (!token) return;
    setLoadingChat(true);
    setChatError(null);
    try {
      const spaces = await listChatSpaces(token);
      setChatSpaces(spaces);
      if (spaces[0]?.name) {
        setSelectedSpace(spaces[0].name);
        const msgs = await listChatMessages(token, spaces[0].name);
        setChatMessages(msgs);
      }
    } catch (err) {
      if (err instanceof WorkspaceApiError) {
        setChatError({
          message: err.message,
          isAppMissing: err.isChatAppMissing,
          isConsumer: err.isConsumerChatRestriction,
        });
      } else {
        setChatError({
          message: err instanceof Error ? err.message : 'Failed to load Google Chat spaces.',
        });
      }
    } finally {
      setLoadingChat(false);
    }
  };

  useEffect(() => {
    if (tab === 'chat' && hasWorkspaceToken && chatSpaces.length === 0 && !chatError) {
      loadChatSpaces();
    }
  }, [tab, hasWorkspaceToken]);

  const handleSelectSpace = async (spaceName: string) => {
    const token = getAccessToken();
    if (!token) return;
    setSelectedSpace(spaceName);
    setLoadingChat(true);
    setChatError(null);
    try {
      const msgs = await listChatMessages(token, spaceName);
      setChatMessages(msgs);
    } catch (err) {
      setChatError({
        message: err instanceof Error ? err.message : 'Failed to load messages.',
      });
    } finally {
      setLoadingChat(false);
    }
  };

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !evTitle.trim() || !evStart || !evEnd) return;

    const startIso = new Date(evStart).toISOString();
    const endIso = new Date(evEnd).toISOString();

    onRequestConfirm({
      title: 'Create Calendar Event',
      description: 'Confirm adding this event to your primary Google Calendar.',
      details: [
        `Title: ${evTitle.trim()}`,
        `Starts: ${new Date(evStart).toLocaleString()}`,
        `Ends: ${new Date(evEnd).toLocaleString()}`,
        ...(evLocation.trim() ? [`Location: ${evLocation.trim()}`] : []),
      ],
      confirmLabel: 'Create Event',
      onConfirm: async () => {
        await createCalendarEvent(token, {
          summary: evTitle.trim(),
          startIso,
          endIso,
          location: evLocation.trim(),
        });
        setEvTitle('');
        setEvLocation('');
        setStatusMsg('Calendar event created.');
        await onWorkspaceRefresh();
      },
    });
  };

  const handleDeleteEvent = (ev: CalendarEventItem) => {
    const token = getAccessToken();
    if (!token) return;
    onRequestConfirm({
      title: 'Delete Calendar Event',
      description: 'Are you sure you want to permanently remove this Google Calendar event?',
      details: [`Event: ${ev.summary}`],
      confirmLabel: 'Delete Event',
      destructive: true,
      onConfirm: async () => {
        await deleteCalendarEvent(token, ev.id);
        setStatusMsg('Calendar event deleted.');
        await onWorkspaceRefresh();
      },
    });
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !taskTitle.trim()) return;

    onRequestConfirm({
      title: 'Add Google Task',
      description: 'Confirm creating this reminder in Google Tasks.',
      details: [
        `Task: ${taskTitle.trim()}`,
        ...(taskDue ? [`Due: ${taskDue}`] : []),
      ],
      confirmLabel: 'Add Task',
      onConfirm: async () => {
        await createTask(token, selectedListId, {
          title: taskTitle.trim(),
          notes: taskNotes.trim() || undefined,
          dueIso: taskDue ? new Date(`${taskDue}T12:00:00Z`).toISOString() : undefined,
        });
        setTaskTitle('');
        setTaskNotes('');
        setTaskDue('');
        setStatusMsg('Task created.');
        await loadSelectedTaskList(selectedListId);
        await onWorkspaceRefresh();
      },
    });
  };

  const handleToggleTask = (task: GoogleTaskItem) => {
    const token = getAccessToken();
    if (!token) return;
    const nextDone = task.status !== 'completed';
    onRequestConfirm({
      title: nextDone ? 'Complete Task' : 'Reopen Task',
      description: `Mark "${task.title}" as ${nextDone ? 'completed' : 'needs action'} in Google Tasks?`,
      confirmLabel: nextDone ? 'Mark Completed' : 'Reopen Task',
      onConfirm: async () => {
        await updateTaskStatus(token, selectedListId, task.id, nextDone);
        await loadSelectedTaskList(selectedListId);
        await onWorkspaceRefresh();
      },
    });
  };

  const handleDeleteTask = (task: GoogleTaskItem) => {
    const token = getAccessToken();
    if (!token) return;
    onRequestConfirm({
      title: 'Delete Task',
      description: 'Permanently delete this task from Google Tasks?',
      details: [`Task: ${task.title}`],
      confirmLabel: 'Delete Task',
      destructive: true,
      onConfirm: async () => {
        await deleteTask(token, selectedListId, task.id);
        await loadSelectedTaskList(selectedListId);
        await onWorkspaceRefresh();
      },
    });
  };

  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !selectedSpace || !chatMessageInput.trim()) return;
    const spaceLabel =
      chatSpaces.find((s) => s.name === selectedSpace)?.displayName || selectedSpace;
    const textToSend = chatMessageInput.trim();

    onRequestConfirm({
      title: 'Send Google Chat Message',
      description: `Send this message to "${spaceLabel}" on your behalf?`,
      details: [textToSend],
      confirmLabel: 'Send Message',
      onConfirm: async () => {
        await sendChatMessage(token, selectedSpace, textToSend);
        setChatMessageInput('');
        setStatusMsg('Message sent to Google Chat.');
        const msgs = await listChatMessages(token, selectedSpace);
        setChatMessages(msgs);
      },
    });
  };

  const handleCreateAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !autoTitle.trim()) return;
    setErrorMsg('');
    try {
      await addAutomation(uid, {
        title: autoTitle.trim(),
        description: autoDesc.trim() || 'Authorized companion workflow',
        actionType: autoType,
        scheduleTime: autoTime || '08:30',
        enabled: true,
      });
      setAutoTitle('');
      setAutoDesc('');
      setStatusMsg('Automation routine saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save routine.');
    }
  };

  const handleRunRoutine = (routine: AutomationRoutine) => {
    onRequestConfirm({
      title: `Run "${routine.title}"`,
      description:
        'NOVA will review your current schedule and tasks to generate this assistant briefing.',
      details: [`Workflow: ${routine.actionType}`, `Scheduled time: ${routine.scheduleTime}`],
      confirmLabel: 'Run Now',
      onConfirm: async () => {
        setRunningAuto(true);
        try {
          const evSummary = events
            .slice(0, 6)
            .map((e) => `- ${e.summary} (${e.start?.dateTime || e.start?.date || ''})`)
            .join('\n');
          const taskSummary = activeTasks
            .filter((t) => t.status === 'needsAction')
            .slice(0, 8)
            .map((t) => `- ${t.title}`)
            .join('\n');

          const res = await novaFetch('/api/nova/assist', {
            task: 'briefing',
            input: `Routine: ${routine.title}\nDescription: ${routine.description}\n\nUpcoming Calendar Events:\n${
              evSummary || 'None'
            }\n\nOpen Tasks:\n${taskSummary || 'None'}`,
            profile: {
              preferredName: profile?.preferredName,
              preferredLanguage: profile?.preferredLanguage,
              currentMood: profile?.currentMood,
              currentMoodNote: profile?.currentMoodNote,
            },
          });
          const data = await parseJsonResponse<{ text?: string }>(res, 'Routine failed.');
          setBriefingOutput(data.text || '');
        } finally {
          setRunningAuto(false);
        }
      },
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">
            Planner &amp; Automation
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            Google Calendar, Google Tasks, Google Chat, and user-confirmed assistant routines.
          </p>
        </div>

        {hasWorkspaceToken && (
          <button
            type="button"
            onClick={() => onWorkspaceRefresh()}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0D1B38] hover:bg-[#13254B] border border-sky-400/20 text-xs font-medium text-sky-200 inline-flex items-center gap-2 self-start sm:self-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Sync Workspace
          </button>
        )}
      </div>

      {/* Segmented Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {[
          { id: 'calendar' as const, label: 'Calendar', icon: Calendar },
          { id: 'tasks' as const, label: 'Tasks', icon: CheckCircle2 },
          { id: 'chat' as const, label: 'Google Chat', icon: MessageCircle },
          { id: 'automations' as const, label: 'Automations', icon: Workflow },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'bg-[#0D1B38] text-slate-300 hover:text-white border border-sky-400/15'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </div>

      {statusMsg && (
        <div className="rounded-xl bg-sky-500/10 border border-sky-400/30 px-4 py-2.5 text-xs text-sky-200">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-400/30 px-4 py-2.5 text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      {!hasWorkspaceToken && tab !== 'automations' ? (
        <div className="rounded-3xl bg-[#0D1B38] border border-sky-400/20 p-6 sm:p-8 text-center space-y-4">
          <h2 className="font-display text-lg font-semibold text-white">
            Connect Google Workspace
          </h2>
          <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
            Sign in with Google to view and manage your Google Calendar events, Google Tasks, and
            Google Chat spaces. Every change always asks for your confirmation first.
          </p>
          <GoogleSignInButton onClick={onSignIn} disabled={isLoggingIn} />
        </div>
      ) : (
        <>
          {/* CALENDAR TAB */}
          {tab === 'calendar' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={handleCreateEvent}
                className="lg:col-span-5 rounded-2xl bg-[#0D1B38] border border-sky-400/15 p-5 space-y-4 h-fit"
              >
                <h2 className="font-display text-base font-semibold text-white">
                  Schedule New Event
                </h2>
                <div className="space-y-3">
                  <input
                    type="text"
                    required
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                    placeholder="Event title"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Start</label>
                      <input
                        type="datetime-local"
                        required
                        value={evStart}
                        onChange={(e) => setEvStart(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-xs text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">End</label>
                      <input
                        type="datetime-local"
                        required
                        value={evEnd}
                        onChange={(e) => setEvEnd(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-xs text-slate-100"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    value={evLocation}
                    onChange={(e) => setEvLocation(e.target.value)}
                    placeholder="Location (optional)"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Event
                </button>
              </form>

              <div className="lg:col-span-7 rounded-2xl bg-[#0D1B38] border border-sky-400/15 divide-y divide-sky-400/10 overflow-hidden">
                <div className="p-5 flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold text-white">
                    Upcoming Events
                  </h2>
                  <span className="font-mono text-xs tabular-nums text-slate-400">
                    {events.length} events
                  </span>
                </div>
                {events.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">
                    No upcoming events on your primary calendar.
                  </div>
                ) : (
                  events.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-4 sm:p-5 flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <p className="text-sm font-medium text-white break-words">
                          {ev.summary || '(Untitled event)'}
                        </p>
                        <p className="text-xs text-sky-300 font-mono tabular-nums">
                          {ev.start?.dateTime
                            ? new Date(ev.start.dateTime).toLocaleString()
                            : ev.start?.date || ''}
                        </p>
                        {ev.location && (
                          <p className="text-xs text-slate-400 truncate">{ev.location}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteEvent(ev)}
                        aria-label="Delete calendar event"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TASKS TAB */}
          {tab === 'tasks' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={handleCreateTask}
                className="lg:col-span-5 rounded-2xl bg-[#0D1B38] border border-sky-400/15 p-5 space-y-4 h-fit"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-base font-semibold text-white">
                    New Reminder / Task
                  </h2>
                  {taskLists.length > 0 && (
                    <select
                      value={selectedListId}
                      onChange={(e) => loadSelectedTaskList(e.target.value)}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[#081126] border border-sky-400/20 text-xs text-slate-200"
                    >
                      {taskLists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Task title"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-sm text-slate-100 placeholder:text-slate-500"
                />
                <input
                  type="date"
                  value={taskDue}
                  onChange={(e) => setTaskDue(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-sm text-slate-100"
                />
                <textarea
                  rows={2}
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-sm text-slate-100 placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create Task
                </button>
              </form>

              <div className="lg:col-span-7 rounded-2xl bg-[#0D1B38] border border-sky-400/15 divide-y divide-sky-400/10 overflow-hidden">
                <div className="p-5 flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold text-white">Your Tasks</h2>
                  <span className="font-mono text-xs tabular-nums text-slate-400">
                    {activeTasks.length} total
                  </span>
                </div>
                {activeTasks.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">
                    No tasks found in this list.
                  </div>
                ) : (
                  activeTasks.map((t) => {
                    const done = t.status === 'completed';
                    return (
                      <div
                        key={t.id}
                        className="p-4 flex items-center justify-between gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleTask(t)}
                          className="flex items-start gap-3 text-left min-w-0 flex-1 min-h-[44px] py-1"
                        >
                          {done ? (
                            <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                          ) : (
                            <Circle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <p
                              className={`text-sm font-medium break-words ${
                                done ? 'line-through text-slate-500' : 'text-slate-100'
                              }`}
                            >
                              {t.title}
                            </p>
                            {t.due && (
                              <p className="text-xs text-sky-300/80 font-mono tabular-nums mt-0.5">
                                Due {new Date(t.due).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(t)}
                          aria-label="Delete task"
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* GOOGLE CHAT TAB */}
          {tab === 'chat' && (
            <div className="space-y-4">
              {chatError ? (
                <div className="rounded-2xl bg-[#0D1B38] border border-amber-400/30 p-6 space-y-3">
                  <h2 className="font-display text-base font-semibold text-amber-200">
                    Google Chat Setup Notice
                  </h2>
                  <p className="text-sm text-slate-200 leading-relaxed">{chatError.message}</p>
                  <div className="text-xs text-slate-300 space-y-1.5 leading-relaxed">
                    <p>
                      1. Google Chat API requires a Business or Enterprise Google Workspace account
                      (consumer @gmail.com accounts do not have Google Chat API access).
                    </p>
                    <p>
                      2. If using a Workspace account, ensure the Google Chat app profile (App name,
                      Avatar URL, Description) is configured in Google Cloud Console:
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <a
                      href={`https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat?project=${PROJECT_ID}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Configure Chat App in Cloud Console
                    </a>
                    <button
                      type="button"
                      onClick={loadChatSpaces}
                      className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-700 text-xs text-slate-200 hover:bg-white/5"
                    >
                      Retry Connection
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-4 rounded-2xl bg-[#0D1B38] border border-sky-400/15 divide-y divide-sky-400/10 overflow-hidden h-fit">
                    <div className="p-4 flex items-center justify-between">
                      <h2 className="font-display text-sm font-semibold text-white">Spaces</h2>
                      <button
                        type="button"
                        onClick={loadChatSpaces}
                        className="text-xs text-sky-300 hover:text-sky-200"
                      >
                        Refresh
                      </button>
                    </div>
                    {chatSpaces.length === 0 ? (
                      <p className="p-4 text-xs text-slate-400">
                        {loadingChat ? 'Loading spaces...' : 'No Google Chat spaces available.'}
                      </p>
                    ) : (
                      chatSpaces.map((sp) => (
                        <button
                          key={sp.name}
                          type="button"
                          onClick={() => handleSelectSpace(sp.name)}
                          className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                            selectedSpace === sp.name
                              ? 'bg-sky-500/15 text-sky-200 font-medium'
                              : 'text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          {sp.displayName || sp.name}
                        </button>
                      ))
                    )}
                  </div>

                  <div className="lg:col-span-8 rounded-2xl bg-[#0D1B38] border border-sky-400/15 p-5 space-y-4">
                    <h2 className="font-display text-base font-semibold text-white">
                      Recent Messages
                    </h2>
                    <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
                      {chatMessages.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          {loadingChat ? 'Loading messages...' : 'Select a space to view messages.'}
                        </p>
                      ) : (
                        chatMessages.map((m) => (
                          <div
                            key={m.name}
                            className="rounded-xl bg-[#081126] border border-sky-400/10 p-3 space-y-1"
                          >
                            <div className="flex items-center justify-between text-xs text-sky-300">
                              <span>{m.sender?.displayName || 'Workspace Member'}</span>
                              {m.createTime && (
                                <span className="font-mono text-slate-500">
                                  {new Date(m.createTime).toLocaleTimeString()}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-200 break-words">
                              {m.text || '(Attachment or card message)'}
                            </p>
                          </div>
                        ))
                      )}
                    </div>

                    <form onSubmit={handleSendChatMessage} className="flex gap-2 pt-2">
                      <input
                        type="text"
                        value={chatMessageInput}
                        onChange={(e) => setChatMessageInput(e.target.value)}
                        placeholder="Write a Google Chat message..."
                        className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-sm text-slate-100 placeholder:text-slate-500"
                      />
                      <button
                        type="submit"
                        disabled={!selectedSpace || !chatMessageInput.trim()}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-sm inline-flex items-center gap-1.5"
                      >
                        <Send className="w-4 h-4" />
                        Send
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* AUTOMATIONS TAB */}
      {tab === 'automations' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateAutomation}
            className="lg:col-span-5 rounded-2xl bg-[#0D1B38] border border-sky-400/15 p-5 space-y-4 h-fit"
          >
            <h2 className="font-display text-base font-semibold text-white">
              Create Companion Routine
            </h2>
            {!uid ? (
              <p className="text-xs text-slate-400">
                Sign in with Google to save custom automation workflows.
              </p>
            ) : (
              <>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={autoTitle}
                  onChange={(e) => setAutoTitle(e.target.value)}
                  placeholder="Routine name (e.g., Morning Focus Briefing)"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-sm text-slate-100"
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <select
                    value={autoType}
                    onChange={(e) => setAutoType(e.target.value as AutomationActionType)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-xs text-slate-100"
                  >
                    <option value="briefing">Daily Briefing</option>
                    <option value="study_plan">Study Check-In</option>
                    <option value="task_sync">Task Review</option>
                    <option value="chat_digest">Message Digest</option>
                  </select>
                  <input
                    type="time"
                    value={autoTime}
                    onChange={(e) => setAutoTime(e.target.value)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-xs text-slate-100"
                  />
                </div>
                <textarea
                  rows={2}
                  maxLength={400}
                  value={autoDesc}
                  onChange={(e) => setAutoDesc(e.target.value)}
                  placeholder="What should NOVA prepare when you run this?"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#081126] border border-sky-400/20 text-sm text-slate-100"
                />
                <button
                  type="submit"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Save Routine
                </button>
              </>
            )}
          </form>

          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-2xl bg-[#0D1B38] border border-sky-400/15 divide-y divide-sky-400/10 overflow-hidden">
              <div className="p-5 flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-white">
                  Saved Routines
                </h2>
                <span className="text-xs text-slate-400">Always asks before running</span>
              </div>
              {automations.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  No automation routines yet. Create one to streamline your daily schedule.
                </div>
              ) : (
                automations.map((r) => (
                  <div
                    key={r.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{r.title}</p>
                      <p className="text-xs text-sky-300">
                        {r.actionType.replace('_', ' ')} · {r.scheduleTime}
                      </p>
                      <p className="text-xs text-slate-400 break-words">{r.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRunRoutine(r)}
                        disabled={runningAuto}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-xs font-medium text-sky-200 inline-flex items-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Run
                      </button>
                      {uid && (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleAutomation(uid, r.id, !r.enabled)}
                            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-700 text-xs text-slate-300 hover:bg-white/5"
                          >
                            {r.enabled ? 'Enabled' : 'Paused'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onRequestConfirm({
                                title: 'Delete Routine',
                                description: `Delete "${r.title}"?`,
                                confirmLabel: 'Delete',
                                destructive: true,
                                onConfirm: () => deleteAutomation(uid, r.id),
                              })
                            }
                            aria-label="Delete routine"
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {briefingOutput && (
              <div className="rounded-2xl bg-[#0D1B38] border border-sky-400/25 p-5 space-y-2">
                <h3 className="font-display text-sm font-semibold text-sky-300">
                  NOVA Routine Briefing
                </h3>
                <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {briefingOutput}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
