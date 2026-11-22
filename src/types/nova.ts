export type VoiceName = 'Kore' | 'Zephyr';
export type VoiceStyle = 'warm' | 'calm' | 'playful';
export type MemoryCategory = 'preference' | 'identity' | 'interest' | 'goal' | 'language' | 'note';
export type AutomationActionType = 'briefing' | 'study_plan' | 'task_sync' | 'chat_digest';
export type MoodType =
  | 'happy'
  | 'calm'
  | 'excited'
  | 'tired'
  | 'stressed'
  | 'anxious'
  | 'sad'
  | 'overwhelmed';

export interface UserProfile {
  uid: string;
  preferredName: string;
  preferredLanguage: string;
  voiceName: VoiceName;
  voiceStyle: VoiceStyle;
  autoSpeak: boolean;
  webSearchDefault: boolean;
  autoMemoryExtract: boolean;
  playfulJealousy?: boolean;
  currentMood?: MoodType;
  currentMoodNote?: string;
  currentMoodUpdatedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MoodLogItem {
  id: string;
  uid: string;
  mood: MoodType;
  note: string;
  createdAt?: unknown;
}

export interface WellbeingSupportPayload {
  emotion: 'sadness' | 'anxiety' | 'stress' | 'overwhelm';
  suggestedExercise: 'breathing' | 'grounding' | 'resources';
  note: string;
}

export interface MemoryItem {
  id: string;
  uid: string;
  category: MemoryCategory;
  content: string;
  source: 'manual' | 'assistant';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GroundingSource {
  url: string;
  title: string;
}

export interface ChatMessage {
  id: string;
  uid: string;
  role: 'user' | 'assistant';
  text: string;
  usedSearch: boolean;
  sourceUrls: string[];
  sourceTitles: string[];
  createdAt?: unknown;
}

export interface AutomationRoutine {
  id: string;
  uid: string;
  title: string;
  description: string;
  actionType: AutomationActionType;
  scheduleTime: string;
  enabled: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PendingAction {
  id: string;
  type: 'save_memory' | 'create_calendar_event' | 'create_task' | 'send_chat_message';
  title: string;
  summary: string;
  payload: Record<string, string>;
}

export interface ConfirmationRequest {
  title: string;
  description: string;
  details?: string[];
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

export interface CalendarEventItem {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  htmlLink?: string;
}

export interface GoogleTaskListItem {
  id: string;
  title: string;
}

export interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status: 'needsAction' | 'completed';
  completed?: string;
}

export interface GoogleChatSpace {
  name: string;
  displayName?: string;
  spaceType?: string;
  singleUserBotDm?: boolean;
}

export interface GoogleChatMessage {
  name: string;
  text?: string;
  createTime?: string;
  sender?: {
    displayName?: string;
    type?: string;
  };
}
