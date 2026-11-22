import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  AutomationRoutine,
  ChatMessage,
  MemoryCategory,
  MemoryItem,
  MoodLogItem,
  MoodType,
  UserProfile,
} from '../types/nova';

const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

function makeSafeId(prefix: string): string {
  const raw = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return SAFE_ID_REGEX.test(raw) ? raw.slice(0, 128) : `${prefix}_${Date.now()}`;
}

export function clampStr(val: string, maxLen: number): string {
  return (val ?? '').trim().slice(0, maxLen);
}

export async function ensureUserProfile(
  uid: string,
  _displayName?: string | null
): Promise<UserProfile> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (existingSnap.exists()) {
    return existingSnap.data() as UserProfile;
  }

  const newProfile: UserProfile = {
    uid,
    preferredName: 'Muhib',
    preferredLanguage: 'English',
    voiceName: 'Kore',
    voiceStyle: 'warm',
    autoSpeak: false,
    webSearchDefault: false,
    autoMemoryExtract: true,
    playfulJealousy: true,
    obsessiveMode: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, newProfile);
    return newProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void
) {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as UserProfile) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<
    Pick<
      UserProfile,
      | 'preferredName'
      | 'preferredLanguage'
      | 'voiceName'
      | 'voiceStyle'
      | 'autoSpeak'
      | 'webSearchDefault'
      | 'autoMemoryExtract'
      | 'playfulJealousy'
      | 'obsessiveMode'
    >
  >
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const sanitized: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (patch.preferredName !== undefined) {
      sanitized.preferredName = clampStr(patch.preferredName, 64);
    }
    if (patch.preferredLanguage !== undefined) {
      const lang = clampStr(patch.preferredLanguage, 32);
      sanitized.preferredLanguage = lang.length >= 2 ? lang : 'English';
    }
    if (patch.voiceName !== undefined) {
      sanitized.voiceName = patch.voiceName === 'Zephyr' ? 'Zephyr' : 'Kore';
    }
    if (patch.voiceStyle !== undefined) {
      sanitized.voiceStyle = ['warm', 'calm', 'playful'].includes(patch.voiceStyle)
        ? patch.voiceStyle
        : 'warm';
    }
    if (patch.autoSpeak !== undefined) sanitized.autoSpeak = Boolean(patch.autoSpeak);
    if (patch.webSearchDefault !== undefined)
      sanitized.webSearchDefault = Boolean(patch.webSearchDefault);
    if (patch.autoMemoryExtract !== undefined)
      sanitized.autoMemoryExtract = Boolean(patch.autoMemoryExtract);
    if (patch.playfulJealousy !== undefined)
      sanitized.playfulJealousy = Boolean(patch.playfulJealousy);
    if (patch.obsessiveMode !== undefined)
      sanitized.obsessiveMode = Boolean(patch.obsessiveMode);

    await updateDoc(doc(db, 'users', uid), sanitized);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// --- Mood Tracking ---

export async function logUserMood(
  uid: string,
  mood: MoodType,
  note = ''
): Promise<void> {
  const id = makeSafeId('mood');
  const path = `users/${uid}/moods/${id}`;
  const cleanNote = clampStr(note, 240);
  try {
    const batch = writeBatch(db);
    const moodRef = doc(db, 'users', uid, 'moods', id);
    const userRef = doc(db, 'users', uid);

    batch.set(moodRef, {
      id,
      uid,
      mood,
      note: cleanNote,
      createdAt: serverTimestamp(),
    });

    batch.update(userRef, {
      currentMood: mood,
      currentMoodNote: cleanNote,
      currentMoodUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeMoodLogs(
  uid: string,
  onData: (items: MoodLogItem[]) => void
) {
  const path = `users/${uid}/moods`;
  const q = query(
    collection(db, 'users', uid, 'moods'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(10)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as MoodLogItem));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// --- Memories ---

export function subscribeMemories(uid: string, onData: (items: MemoryItem[]) => void) {
  const path = `users/${uid}/memories`;
  const q = query(
    collection(db, 'users', uid, 'memories'),
    where('uid', '==', uid),
    orderBy('updatedAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as MemoryItem));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function addMemory(
  uid: string,
  category: MemoryCategory,
  content: string,
  source: 'manual' | 'assistant' = 'manual'
): Promise<MemoryItem> {
  const id = makeSafeId('mem');
  const path = `users/${uid}/memories/${id}`;
  const cleanContent = clampStr(content, 500);
  if (!cleanContent) {
    throw new Error('Memory content cannot be empty.');
  }
  const item: MemoryItem = {
    id,
    uid,
    category,
    content: cleanContent,
    source,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'users', uid, 'memories', id), item);
    return item;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateMemory(
  uid: string,
  memoryId: string,
  category: MemoryCategory,
  content: string
): Promise<void> {
  const path = `users/${uid}/memories/${memoryId}`;
  const cleanContent = clampStr(content, 500);
  if (!cleanContent) {
    throw new Error('Memory content cannot be empty.');
  }
  try {
    await updateDoc(doc(db, 'users', uid, 'memories', memoryId), {
      category,
      content: cleanContent,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteMemory(uid: string, memoryId: string): Promise<void> {
  const path = `users/${uid}/memories/${memoryId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'memories', memoryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Chat Messages ---

export function subscribeMessages(uid: string, onData: (items: ChatMessage[]) => void) {
  const path = `users/${uid}/messages`;
  const q = query(
    collection(db, 'users', uid, 'messages'),
    where('uid', '==', uid),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as ChatMessage));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function addMessage(
  uid: string,
  role: 'user' | 'assistant',
  text: string,
  usedSearch = false,
  sources: { url: string; title: string }[] = []
): Promise<ChatMessage> {
  const id = makeSafeId('msg');
  const path = `users/${uid}/messages/${id}`;
  const cleanText = clampStr(text, 8000) || '...';
  const boundedSources = sources.slice(0, 10);
  const item: ChatMessage = {
    id,
    uid,
    role,
    text: cleanText,
    usedSearch: Boolean(usedSearch),
    sourceUrls: boundedSources.map((s) => clampStr(s.url, 1024)).filter(Boolean),
    sourceTitles: boundedSources.map((s) => clampStr(s.title, 240) || 'Web source'),
    createdAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'users', uid, 'messages', id), item);
    return item;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function clearAllMessages(uid: string): Promise<void> {
  const path = `users/${uid}/messages`;
  try {
    const q = query(collection(db, 'users', uid, 'messages'), where('uid', '==', uid));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Automation Routines ---

export function subscribeAutomations(
  uid: string,
  onData: (items: AutomationRoutine[]) => void
) {
  const path = `users/${uid}/automations`;
  const q = query(
    collection(db, 'users', uid, 'automations'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as AutomationRoutine));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function addAutomation(
  uid: string,
  routine: Omit<AutomationRoutine, 'id' | 'uid' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  const id = makeSafeId('auto');
  const path = `users/${uid}/automations/${id}`;
  const docData: AutomationRoutine = {
    id,
    uid,
    title: clampStr(routine.title, 120) || 'Routine',
    description: clampStr(routine.description, 400) || 'Scheduled companion assistant routine',
    actionType: routine.actionType,
    scheduleTime: clampStr(routine.scheduleTime, 16) || '09:00',
    enabled: Boolean(routine.enabled),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'users', uid, 'automations', id), docData);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function toggleAutomation(
  uid: string,
  automationId: string,
  enabled: boolean
): Promise<void> {
  const path = `users/${uid}/automations/${automationId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'automations', automationId), {
      enabled: Boolean(enabled),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAutomation(uid: string, automationId: string): Promise<void> {
  const path = `users/${uid}/automations/${automationId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'automations', automationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
