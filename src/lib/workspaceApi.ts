import {
  CalendarEventItem,
  GoogleChatMessage,
  GoogleChatSpace,
  GoogleTaskItem,
  GoogleTaskListItem,
} from '../types/nova';

export class WorkspaceApiError extends Error {
  status: number;
  isChatAppMissing?: boolean;
  isConsumerChatRestriction?: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    if (status === 404 && message.toLowerCase().includes('chat app not found')) {
      this.isChatAppMissing = true;
    }
    if (
      status === 403 ||
      message.toLowerCase().includes('workspace') ||
      message.toLowerCase().includes('gmail.com')
    ) {
      this.isConsumerChatRestriction = true;
    }
  }
}

async function workspaceFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  let res: Response | null = null;
  let lastNetErr: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      });
      break;
    } catch (err) {
      lastNetErr = err;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  if (!res) {
    const raw = lastNetErr instanceof Error ? lastNetErr.message : '';
    throw new WorkspaceApiError(
      raw && !raw.toLowerCase().includes('failed to fetch')
        ? raw
        : 'Could not reach Google Workspace API. Please check your internet connection and retry.',
      0
    );
  }

  if (res.status === 204) {
    return {} as T;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = data?.error?.message || `Google API request failed (${res.status})`;
    throw new WorkspaceApiError(errMsg, res.status);
  }
  return data as T;
}

// --- Google Calendar ---

export async function listCalendarEvents(
  accessToken: string,
  maxResults = 15
): Promise<CalendarEventItem[]> {
  const timeMin = new Date().toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(
    timeMin
  )}&maxResults=${maxResults}`;
  const data = await workspaceFetch<{ items?: CalendarEventItem[] }>(url, accessToken);
  return data.items || [];
}

export async function createCalendarEvent(
  accessToken: string,
  input: { summary: string; description?: string; startIso: string; endIso: string; location?: string }
): Promise<CalendarEventItem> {
  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  return workspaceFetch<CalendarEventItem>(url, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      summary: input.summary,
      description: input.description || '',
      location: input.location || '',
      start: { dateTime: input.startIso },
      end: { dateTime: input.endIso },
    }),
  });
}

export async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
    eventId
  )}`;
  await workspaceFetch(url, accessToken, { method: 'DELETE' });
}

// --- Google Tasks ---

export async function listTaskLists(accessToken: string): Promise<GoogleTaskListItem[]> {
  const url = 'https://tasks.googleapis.com/tasks/v1/users/@me/lists';
  const data = await workspaceFetch<{ items?: GoogleTaskListItem[] }>(url, accessToken);
  return data.items || [];
}

export async function listTasks(
  accessToken: string,
  taskListId = '@default'
): Promise<GoogleTaskItem[]> {
  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
    taskListId
  )}/tasks?showCompleted=true&showHidden=false&maxResults=40`;
  const data = await workspaceFetch<{ items?: GoogleTaskItem[] }>(url, accessToken);
  return data.items || [];
}

export async function createTask(
  accessToken: string,
  taskListId = '@default',
  input: { title: string; notes?: string; dueIso?: string }
): Promise<GoogleTaskItem> {
  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`;
  return workspaceFetch<GoogleTaskItem>(url, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      notes: input.notes || undefined,
      due: input.dueIso || undefined,
    }),
  });
}

export async function updateTaskStatus(
  accessToken: string,
  taskListId: string,
  taskId: string,
  completed: boolean
): Promise<GoogleTaskItem> {
  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
    taskListId
  )}/tasks/${encodeURIComponent(taskId)}`;
  return workspaceFetch<GoogleTaskItem>(url, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({
      status: completed ? 'completed' : 'needsAction',
    }),
  });
}

export async function deleteTask(
  accessToken: string,
  taskListId: string,
  taskId: string
): Promise<void> {
  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
    taskListId
  )}/tasks/${encodeURIComponent(taskId)}`;
  await workspaceFetch(url, accessToken, { method: 'DELETE' });
}

// --- Google Chat ---

export async function listChatSpaces(accessToken: string): Promise<GoogleChatSpace[]> {
  const url = 'https://chat.googleapis.com/v1/spaces?pageSize=25';
  const data = await workspaceFetch<{ spaces?: GoogleChatSpace[] }>(url, accessToken);
  return data.spaces || [];
}

export async function listChatMessages(
  accessToken: string,
  spaceName: string
): Promise<GoogleChatMessage[]> {
  const url = `https://chat.googleapis.com/v1/${spaceName}/messages?pageSize=20`;
  const data = await workspaceFetch<{ messages?: GoogleChatMessage[] }>(url, accessToken);
  return data.messages || [];
}

export async function sendChatMessage(
  accessToken: string,
  spaceName: string,
  text: string
): Promise<GoogleChatMessage> {
  const url = `https://chat.googleapis.com/v1/${spaceName}/messages`;
  return workspaceFetch<GoogleChatMessage>(url, accessToken, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}
