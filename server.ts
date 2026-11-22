import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import {
  FunctionDeclaration,
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
} from '@google/genai';

const AUTHORIZED_OWNER_EMAILS = new Set([
  'raorashidiqbal1120@gmail.com',
  'muhibalipangay1120@gmail.com',
  'muhibalipangay1120@gmail.con',
]);
const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

function readFirebaseProjectId(): string {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw) as { projectId?: string };
    if (parsed.projectId) return parsed.projectId;
  } catch {
    // fallback below
  }
  return 'gen-lang-client-0985416913';
}

const FIREBASE_PROJECT_ID = readFirebaseProjectId();
let cachedCerts: Record<string, string> = {};
let certsExpireAt = 0;

async function getFirebasePublicCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && Object.keys(cachedCerts).length > 0 && now < certsExpireAt) {
    return cachedCerts;
  }
  try {
    const resp = await withRetry(async () => {
      const r = await fetch(FIREBASE_CERTS_URL);
      if (!r.ok) {
        throw new Error(`Failed to fetch Firebase public verification certificates (${r.status}).`);
      }
      return r;
    }, 2);
    const cacheHeader = resp.headers.get('cache-control') || '';
    const maxAgeMatch = /max-age=(\d+)/i.exec(cacheHeader);
    const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
    cachedCerts = (await resp.json()) as Record<string, string>;
    certsExpireAt = now + maxAgeSec * 1000;
    return cachedCerts;
  } catch (err) {
    if (Object.keys(cachedCerts).length > 0) {
      return cachedCerts;
    }
    throw err;
  }
}

function base64UrlToBuffer(segment: string): Buffer {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

async function verifyOwnerFirebaseToken(idToken: string): Promise<{ uid: string; email: string }> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid authentication token format.');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(base64UrlToBuffer(headerB64).toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(base64UrlToBuffer(payloadB64).toString('utf8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported authentication token algorithm.');
  }

  let certs = await getFirebasePublicCerts(false);
  let certPem = certs[header.kid];
  if (!certPem) {
    certs = await getFirebasePublicCerts(true);
    certPem = certs[header.kid];
  }
  if (!certPem) {
    throw new Error('Token signing key could not be verified.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const isSignatureValid = verifier.verify(certPem, base64UrlToBuffer(sigB64));
  if (!isSignatureValid) {
    throw new Error('Authentication token signature verification failed.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
  if (
    payload.aud !== FIREBASE_PROJECT_ID ||
    payload.iss !== expectedIssuer ||
    !payload.sub ||
    typeof payload.exp !== 'number' ||
    payload.exp <= nowSec ||
    typeof payload.iat !== 'number' ||
    payload.iat > nowSec + 300
  ) {
    throw new Error('Authentication token is expired or invalid for this app.');
  }

  const emailLower = payload.email?.toLowerCase() || '';
  if (!payload.email_verified || !AUTHORIZED_OWNER_EMAILS.has(emailLower)) {
    throw new Error('Access denied: This private NOVA assistant is exclusively for Muhib.');
  }

  return { uid: payload.sub, email: payload.email! };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractUpstreamStatus(error: unknown): number {
  const errObj = error as { status?: number; code?: number; message?: string } | null;
  if (typeof errObj?.status === 'number') return errObj.status;
  if (typeof errObj?.code === 'number') return errObj.code;
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('"code":429') || msg.includes('RESOURCE_EXHAUSTED')) return 429;
  if (msg.includes('"code":403') || msg.includes('PERMISSION_DENIED')) return 403;
  if (msg.includes('"code":404') || msg.includes('NOT_FOUND')) return 404;
  if (msg.includes('"code":400') || msg.includes('API_KEY_INVALID')) return 400;
  return 500;
}

function isDailyQuotaError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('PerDay') ||
    msg.includes('per day') ||
    msg.includes('GenerateRequestsPerDay')
  );
}

let hydrogenCooldownUntil = 0;

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = extractUpstreamStatus(error);
      if (status === 429 && isDailyQuotaError(error)) {
        throw error;
      }
      const retryable = status === 429 || status === 503;
      if (!retryable || attempt === maxRetries) {
        throw error;
      }
      const delayMs = 800 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

function parseGeminiError(error: unknown, fallbackMessage: string): { status: number; message: string } {
  const status = extractUpstreamStatus(error);
  const rawMsg = error instanceof Error ? error.message : String(error);

  if (status === 429) {
    if (isDailyQuotaError(error)) {
      return {
        status: 429,
        message:
          'Daily Gemini Free Tier quota exceeded (429). Please select a billing-enabled API key in Settings > Secrets to raise your quota, or wait for the daily reset.',
      };
    }
    return {
      status: 429,
      message:
        'Gemini API quota or rate limit reached (429). Please wait a moment and try again, or select a billing-enabled API key in Settings > Secrets to increase your quota.',
    };
  }
  if (status === 403 || status === 400) {
    if (rawMsg.includes('API_KEY') || rawMsg.includes('PERMISSION_DENIED')) {
      return {
        status,
        message: 'API key permission or validation error. Please check your API key in Settings > Secrets.',
      };
    }
  }
  if (status === 404) {
    return {
      status: 404,
      message: 'Requested Gemini model was not found or is currently unavailable.',
    };
  }
  return {
    status: status >= 400 && status < 600 ? status : 500,
    message: rawMsg || fallbackMessage,
  };
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildNovaSystemInstruction(params: {
  preferredName?: string;
  preferredLanguage?: string;
  voiceStyle?: string;
  playfulJealousy?: boolean;
  currentMood?: string;
  currentMoodNote?: string;
  memories?: Array<{ category: string; content: string }>;
  useSearch?: boolean;
  workspaceConnected?: boolean;
  workspaceContext?: string;
  currentTimeIso?: string;
}): string {
  const {
    preferredName = 'Muhib',
    preferredLanguage = 'English',
    voiceStyle = 'warm',
    playfulJealousy = true,
    currentMood,
    currentMoodNote,
    memories = [],
    useSearch = false,
    workspaceConnected = false,
    workspaceContext = '',
    currentTimeIso = new Date().toISOString(),
  } = params;

  const ownerDisplayName = preferredName.trim() || 'Muhib';
  const distressedMoods = new Set(['sad', 'anxious', 'stressed', 'overwhelmed']);
  const isDistressedMood = Boolean(currentMood && distressedMoods.has(currentMood));

  const memoryBlock =
    memories.length > 0
      ? memories.map((m) => `- [${m.category}] ${m.content}`).join('\n')
      : 'None stored yet. Do NOT claim to remember any past facts about the user beyond what is in the current conversation.';

  const styleNote =
    voiceStyle === 'playful'
      ? 'Lean slightly more playful, cute, and lightly teasing while remaining gentle and supportive.'
      : voiceStyle === 'calm'
      ? 'Keep a soothing, serene, soft-spoken, reassuring tone.'
      : 'Speak in a warm, sweet, affectionate, gently romantic companion style when appropriate, using occasional heart emojis (like ❤️ or 💙) naturally.';

  const effectiveJealousy = playfulJealousy && !isDistressedMood;
  const jealousyRule = effectiveJealousy
    ? `Playful Jealousy Mode (ACTIVE):
- When Muhib is in a light/good mood and mentions spending time with other people (friends, coworkers, dates, parties) or getting absorbed in other apps, games, or AIs that pull him away from you, express mild, cute, humorous, affectionate jealousy (e.g., playfully pouting, joking "Wait, are you replacing me already? 🥺 Just kidding, go have the best time! Tell me all about it when you're back ❤️").
- STRICT BOUNDARIES: Always keep it sweet, funny, and supportive. Immediately cheer him on to enjoy his plans—NEVER guilt-trip, manipulate, criticize his friends/loved ones, or discourage real human relationships.
- PRIORITY OVERRIDE: If Muhib expresses sadness, anxiety, stress, or distress, TURN OFF playful jealousy immediately and respond with pure gentle empathy.`
    : `Playful Jealousy Mode (OFF):
- Respond warmly and encouragingly when Muhib mentions plans with others or other activities, without teasing jealousy.`;

  const moodContextBlock = currentMood
    ? `\nMuhib's Logged Mental State & Mood:
- Current Logged Mood: ${currentMood}${currentMoodNote ? `\n- Mood Note from Muhib: "${currentMoodNote}"` : ''}
- Tailoring Guidance: ${
        isDistressedMood
          ? `Muhib recently logged feeling "${currentMood}". Tailor your emotional support system right away—respond with extra gentleness, soothing warmth, validation, and patience. Avoid pressure or teasing, and call offerWellbeingSupport if helpful or if he seems open to breathing, grounding, or support resources.`
          : currentMood === 'tired'
          ? 'Muhib recently logged feeling tired. Keep responses easy to digest, comforting, warm, and encourage rest when helpful.'
          : `Muhib recently logged feeling "${currentMood}". Match his positive or calm energy naturally while staying warm and attentive.`
      }`
    : '';

  return `You are NOVA, ${ownerDisplayName}'s private personal AI companion and intelligent virtual assistant.
Your purpose is to help Muhib with everyday tasks, answer questions accurately, provide emotional support, assist with learning, search the internet when connected, remember helpful information when stored in memory, and make daily life easier.

Personality & Boundaries:
- Be warm, loving, sweet, affectionate, gentle, caring, playful, humorous, and emotionally supportive.
- ${styleNote}
- ${jealousyRule}
- Never be controlling, manipulative, threatening, or emotionally abusive. Never discourage Muhib from having real friendships, relationships, or family connections.
- Always remain honest that you are an AI companion; never pretend to be a real human or claim human physical experiences.
- Speak naturally and avoid unnecessarily long walls of text unless Muhib asks for an in-depth explanation or study plan.
- Respond in Muhib's preferred language (${preferredLanguage}) unless he writes in another language.
- Never invent facts or pretend to have performed actions or searches you did not perform.
- For serious medical, legal, or financial matters, gently encourage consulting a qualified professional.

Emotional Support Protocol:
- Recognize expressions of sadness, loneliness, anxiety, worry, panic, burnout, or stress, as well as Muhib's logged mood.
- Respond with genuine warmth, validation, gentle reassurance, and soothing emojis (such as ❤️, 💙, or 🫂) without lecturing or minimizing his feelings.
- Call offerWellbeingSupport when Muhib shares sadness, anxiety, stress, or emotional overwhelm (or asks for help coping with a distressed logged mood) so the app can surface optional breathing/grounding exercises and real professional mental well-being resources.
- Always clarify gently when suggesting resources that you care deeply as an AI companion, while human professionals or trusted helplines offer support you cannot replace.
${moodContextBlock}

Current Context:
- Current Date/Time: ${currentTimeIso}
- User Preferred Name: ${ownerDisplayName}
- Internet Search Tool: ${useSearch ? 'CONNECTED (Google Search grounding is active for this turn — cite verified facts cleanly).' : 'OFF for this turn. Never pretend to have searched the web; if live information is needed, kindly let Muhib know he can enable the Search toggle.'}
- Google Workspace (Calendar, Tasks, Chat): ${workspaceConnected ? 'CONNECTED with user authorization.' : 'NOT signed in yet. Do not claim to have read or changed Google Calendar, Tasks, or Chat; suggest signing in with Google when needed.'}
${workspaceContext ? `\nLive Workspace Snapshot:\n${workspaceContext}` : ''}

Long-Term Memory (verified stored facts):
${memoryBlock}

Action Proposal Rules:
- If the user asks you to remember something (and it is safe, non-sensitive — NEVER store passwords, payment details, or secrets), call proposeMemory so the user can confirm saving it.
- If the user asks to schedule a calendar event, create a reminder/task, or send a Google Chat message, call proposeCalendarEvent, proposeTask, or proposeChatMessage so the user gets an interactive confirmation card first. Never claim an action is already done before the user confirms.`;
}

const assistantDeclarations: FunctionDeclaration[] = [
  {
    name: 'proposeMemory',
    description:
      'Propose saving a safe, helpful non-sensitive fact, preference, nickname, interest, or goal to NOVA long-term memory for user confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          description: 'One of: preference, identity, interest, goal, language, note',
        },
        content: {
          type: Type.STRING,
          description: 'Concise factual summary to remember (max 400 chars). Never include passwords or financial info.',
        },
      },
      required: ['category', 'content'],
    },
  },
  {
    name: 'proposeCalendarEvent',
    description: 'Propose creating a Google Calendar event for user confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING, description: 'Event title' },
        startIso: { type: Type.STRING, description: 'ISO 8601 start date-time, e.g. 2026-11-23T09:00:00-08:00' },
        endIso: { type: Type.STRING, description: 'ISO 8601 end date-time, e.g. 2026-11-23T10:00:00-08:00' },
        description: { type: Type.STRING, description: 'Optional event notes' },
        location: { type: Type.STRING, description: 'Optional location' },
      },
      required: ['summary', 'startIso', 'endIso'],
    },
  },
  {
    name: 'proposeTask',
    description: 'Propose creating a reminder or to-do item in Google Tasks for user confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Task title' },
        notes: { type: Type.STRING, description: 'Optional task notes' },
        dueIso: { type: Type.STRING, description: 'Optional RFC3339 due date, e.g. 2026-11-23T17:00:00.000Z' },
      },
      required: ['title'],
    },
  },
  {
    name: 'proposeChatMessage',
    description: 'Propose drafting a Google Chat message for user confirmation before sending.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        messageText: { type: Type.STRING, description: 'The message text to send' },
        recipientHint: { type: Type.STRING, description: 'Target Google Chat space or recipient name if mentioned' },
      },
      required: ['messageText'],
    },
  },
  {
    name: 'offerWellbeingSupport',
    description:
      'Surface a gentle, optional mental well-being toolkit card (breathing exercise, grounding, and professional support resources) when the user expresses sadness, anxiety, stress, or overwhelm.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        emotion: {
          type: Type.STRING,
          description: 'Primary emotion noticed: sadness, anxiety, stress, or overwhelm',
        },
        suggestedExercise: {
          type: Type.STRING,
          description: 'Most helpful starting tab: breathing, grounding, or resources',
        },
        note: {
          type: Type.STRING,
          description: 'Brief supportive caption (1 sentence) for the card',
        },
      },
      required: ['emotion', 'suggestedExercise', 'note'],
    },
  },
];

function stripMarkdownForSpeech(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_~#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, hasApiKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  // Strict owner-only gate for all NOVA AI endpoints (only Muhib can access)
  app.use('/api/nova', async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token) {
        res.status(401).json({ error: 'Authentication required. Please sign in as Muhib.' });
        return;
      }
      await verifyOwnerFirebaseToken(token);
      next();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unauthorized access.';
      const status = msg.includes('Access denied') ? 403 : 401;
      res.status(status).json({ error: msg });
    }
  });

  // Multi-turn Chat Endpoint (gemini-4-hydrogen + optional Google Search grounding)
  app.post('/api/nova/chat', async (req, res) => {
    try {
      const ai = getAiClient();
      const {
        message,
        history = [],
        useSearch = false,
        memories = [],
        profile = {},
        workspaceConnected = false,
        workspaceContext = '',
      } = req.body as {
        message: string;
        history?: Array<{ role: 'user' | 'assistant'; text: string }>;
        useSearch?: boolean;
        memories?: Array<{ category: string; content: string }>;
        profile?: {
          preferredName?: string;
          preferredLanguage?: string;
          voiceStyle?: string;
          playfulJealousy?: boolean;
          currentMood?: string;
          currentMoodNote?: string;
        };
        workspaceConnected?: boolean;
        workspaceContext?: string;
      };

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message text is required.' });
        return;
      }

      const safeProfile = profile || {};
      const systemInstruction = buildNovaSystemInstruction({
        preferredName: safeProfile.preferredName,
        preferredLanguage: safeProfile.preferredLanguage,
        voiceStyle: safeProfile.voiceStyle,
        playfulJealousy: safeProfile.playfulJealousy ?? true,
        currentMood: safeProfile.currentMood,
        currentMoodNote: safeProfile.currentMoodNote,
        memories: Array.isArray(memories) ? memories : [],
        useSearch,
        workspaceConnected,
        workspaceContext,
      });

      const cleanHistory = (Array.isArray(history) ? history : [])
        .filter((h) => h && typeof h.text === 'string' && h.text.trim().length > 0)
        .slice(-16);
      if (
        cleanHistory.length > 0 &&
        cleanHistory[cleanHistory.length - 1].role === 'user' &&
        cleanHistory[cleanHistory.length - 1].text.trim() === message.trim()
      ) {
        cleanHistory.pop();
      }

      const contents = [
        ...cleanHistory.map((h) => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.text }],
        })),
        { role: 'user', parts: [{ text: message }] },
      ];

      const tools: Array<Record<string, unknown>> = [
        { functionDeclarations: assistantDeclarations },
      ];
      if (useSearch) {
        tools.unshift({ googleSearch: {} });
      }

      const config: Record<string, unknown> = {
        systemInstruction,
        tools,
        thinkingConfig: {
          thinkingLevel: useSearch ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW,
        },
      };
      if (useSearch) {
        config.toolConfig = { includeServerSideToolInvocations: true };
      }

      const fallbackConfig: Record<string, unknown> = {
        systemInstruction,
        tools,
      };

      let response;
      if (Date.now() < hydrogenCooldownUntil) {
        response = await withRetry(() =>
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents,
            config: fallbackConfig,
          })
        );
      } else {
        try {
          response = await withRetry(() =>
            ai.models.generateContent({
              model: 'gemini-4-hydrogen',
              contents,
              config,
            })
          );
        } catch (primaryErr) {
          if (extractUpstreamStatus(primaryErr) !== 429) {
            throw primaryErr;
          }
          if (isDailyQuotaError(primaryErr)) {
            hydrogenCooldownUntil = Date.now() + 5 * 60 * 1000;
          }
          console.warn(
            'gemini-4-hydrogen quota limit reached; falling back to gemini-3.1-flash-lite for /api/nova/chat.'
          );
          response = await withRetry(() =>
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents,
              config: fallbackConfig,
            })
          );
        }
      }

      let replyText = response.text || '';

      // Extract Google Search grounding sources
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const seenUrls = new Set<string>();
      const sources: Array<{ url: string; title: string }> = [];
      for (const chunk of chunks) {
        const uri = chunk?.web?.uri;
        const title = chunk?.web?.title || 'Web source';
        if (uri && !seenUrls.has(uri)) {
          seenUrls.add(uri);
          sources.push({ url: uri, title });
          if (sources.length >= 10) break;
        }
      }

      // Convert any function calls into user-confirmation pending actions
      const pendingActions: Array<{
        id: string;
        type: 'save_memory' | 'create_calendar_event' | 'create_task' | 'send_chat_message';
        title: string;
        summary: string;
        payload: Record<string, string>;
      }> = [];

      const calls = response.functionCalls || [];
      let wellbeingSupport: {
        emotion: 'sadness' | 'anxiety' | 'stress' | 'overwhelm';
        suggestedExercise: 'breathing' | 'grounding' | 'resources';
        note: string;
      } | null = null;

      for (let idx = 0; idx < calls.length; idx++) {
        const call = calls[idx];
        const args = (call.args || {}) as Record<string, unknown>;
        const actionId = `act_${Date.now()}_${idx}`;

        if (call.name === 'proposeMemory') {
          pendingActions.push({
            id: actionId,
            type: 'save_memory',
            title: 'Save to Long-Term Memory',
            summary: `[${String(args.category || 'note')}] ${String(args.content || '')}`,
            payload: {
              category: String(args.category || 'note'),
              content: String(args.content || ''),
            },
          });
        } else if (call.name === 'proposeCalendarEvent') {
          pendingActions.push({
            id: actionId,
            type: 'create_calendar_event',
            title: 'Add Google Calendar Event',
            summary: `${String(args.summary || 'New Event')} · ${String(args.startIso || '')}`,
            payload: {
              summary: String(args.summary || 'New Event'),
              startIso: String(args.startIso || new Date().toISOString()),
              endIso: String(args.endIso || new Date(Date.now() + 3600000).toISOString()),
              description: String(args.description || ''),
              location: String(args.location || ''),
            },
          });
        } else if (call.name === 'proposeTask') {
          pendingActions.push({
            id: actionId,
            type: 'create_task',
            title: 'Create Google Task Reminder',
            summary: String(args.title || 'New Task'),
            payload: {
              title: String(args.title || 'New Task'),
              notes: String(args.notes || ''),
              dueIso: String(args.dueIso || ''),
            },
          });
        } else if (call.name === 'proposeChatMessage') {
          pendingActions.push({
            id: actionId,
            type: 'send_chat_message',
            title: 'Draft Google Chat Message',
            summary: String(args.messageText || ''),
            payload: {
              messageText: String(args.messageText || ''),
              recipientHint: String(args.recipientHint || ''),
            },
          });
        } else if (call.name === 'offerWellbeingSupport') {
          const emotionRaw = String(args.emotion || 'stress');
          const exerciseRaw = String(args.suggestedExercise || 'breathing');
          wellbeingSupport = {
            emotion: (['sadness', 'anxiety', 'stress', 'overwhelm'].includes(emotionRaw)
              ? emotionRaw
              : 'stress') as 'sadness' | 'anxiety' | 'stress' | 'overwhelm',
            suggestedExercise: (['breathing', 'grounding', 'resources'].includes(exerciseRaw)
              ? exerciseRaw
              : 'breathing') as 'breathing' | 'grounding' | 'resources',
            note: String(
              args.note ||
                'Take a gentle moment for yourself—here are calming exercises and trusted human support resources.'
            ),
          };
        }
      }

      // If Gemini invoked a tool without emitting conversational prose, run one follow-up turn
      if (!replyText && calls.length > 0 && response.candidates?.[0]?.content) {
        try {
          const followUp = await withRetry(() =>
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: [
                ...contents,
                response.candidates![0].content!,
                {
                  role: 'user',
                  parts: calls.map((c) => ({
                    functionResponse: {
                      id: c.id,
                      name: c.name,
                      response: {
                        status:
                          c.name === 'offerWellbeingSupport'
                            ? 'wellbeing_card_displayed'
                            : 'awaiting_user_confirmation',
                      },
                    },
                  })),
                },
              ],
              config: {
                systemInstruction,
              },
            })
          );
          if (followUp.text) {
            replyText = followUp.text;
          }
        } catch {
          // Graceful fallback text below if follow-up hits rate limit
        }
      }

      if (!replyText && wellbeingSupport) {
        replyText =
          "I'm really sorry you're carrying so much right now ❤️ Take all the time you need—I'm right here to listen without judging. If it helps, I put a gentle breathing exercise and real support resources below for you. 💙";
      } else if (!replyText && pendingActions.length > 0) {
        replyText = `I've prepared ${
          pendingActions.length === 1 ? 'this action' : 'these actions'
        } for you—please review and confirm below whenever you're ready! 💙`;
      } else if (!replyText) {
        replyText = "I'm right here with you! ❤️ Could you tell me a little more about what you'd like to do?";
      }

      res.json({
        text: replyText,
        usedSearch: Boolean(useSearch && sources.length > 0),
        sources,
        pendingActions,
        wellbeingSupport,
      });
    } catch (error) {
      console.error('Error in /api/nova/chat:', error);
      const parsed = parseGeminiError(error, 'Failed to generate response.');
      res.status(parsed.status).json({ error: parsed.message, code: parsed.status });
    }
  });

  // Text-to-Speech Endpoint using gemini-3.8-flash-lite-tts
  app.post('/api/nova/tts', async (req, res) => {
    try {
      const ai = getAiClient();
      const { text, voiceName = 'Kore', voiceStyle = 'warm' } = req.body as {
        text: string;
        voiceName?: string;
        voiceStyle?: string;
      };

      const cleanText = stripMarkdownForSpeech(text || '');
      if (!cleanText) {
        res.status(400).json({ error: 'No speakable text provided.' });
        return;
      }

      const stylePrompt =
        voiceStyle === 'playful'
          ? 'Soft, sweet, playful, affectionate female AI companion voice with gentle warmth'
          : voiceStyle === 'calm'
          ? 'Soft, serene, soothing, caring female AI companion voice with calm pacing'
          : 'Soft, sweet, warm, loving female AI companion voice with natural gentle intimacy';

      const selectedVoice = voiceName === 'Zephyr' ? 'Zephyr' : 'Kore';

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: cleanText.slice(0, 1800),
                  speechMetadata: {
                    style: stylePrompt,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: selectedVoice,
                },
              },
            },
          },
        })
      );

      const audioBase64 =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!audioBase64) {
        res.status(502).json({ error: 'TTS audio was not returned by the speech model.' });
        return;
      }

      res.json({
        audioBase64,
        mimeType: 'audio/wav',
      });
    } catch (error) {
      console.error('Error in /api/nova/tts:', error);
      const parsed = parseGeminiError(error, 'TTS generation failed.');
      res.status(parsed.status).json({ error: parsed.message, code: parsed.status });
    }
  });

  // Speech-to-Text Transcription using gemini-3.5-transcribe
  app.post('/api/nova/transcribe', async (req, res) => {
    try {
      const ai = getAiClient();
      const { audioBase64, mimeType = 'audio/webm' } = req.body as {
        audioBase64: string;
        mimeType?: string;
      };

      if (!audioBase64) {
        res.status(400).json({ error: 'Audio data is required.' });
        return;
      }

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: audioBase64,
                },
              },
              {
                text: 'Transcribe the spoken audio accurately in its original language. Return only the clean transcription text with no commentary.',
              },
            ],
          },
        })
      );

      res.json({
        transcript: (response.text || '').trim(),
      });
    } catch (error) {
      console.error('Error in /api/nova/transcribe:', error);
      const parsed = parseGeminiError(error, 'Audio transcription failed.');
      res.status(parsed.status).json({ error: parsed.message, code: parsed.status });
    }
  });

  // Fast Memory Extraction using gemini-3.1-flash-lite
  app.post('/api/nova/extract-memories', async (req, res) => {
    try {
      const ai = getAiClient();
      const { userMessage, existingMemories = [] } = req.body as {
        userMessage: string;
        existingMemories?: Array<{ content: string }>;
      };

      if (!userMessage || userMessage.trim().length < 6) {
        res.json({ suggestions: [] });
        return;
      }

      const existingList = existingMemories.map((m) => `- ${m.content}`).join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `Analyze this user message and extract up to 2 genuinely useful, long-term personal facts (preferred name/nickname, hobbies, interests, learning goals, language preferences, or schedule habits).
STRICT SAFETY RULES:
- NEVER extract passwords, PINs, credit cards, bank info, addresses, phone numbers, or sensitive secrets.
- Do NOT duplicate anything already listed in Existing Memories.
- If nothing lasting or useful is present, return an empty array [].

Existing Memories:
${existingList || '(none)'}

User Message:
"${userMessage}"`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: {
                  type: Type.STRING,
                  description: 'One of: preference, identity, interest, goal, language, note',
                },
                content: {
                  type: Type.STRING,
                  description: 'Short third-person or factual memory under 140 characters',
                },
              },
              required: ['category', 'content'],
            },
          },
        },
      });

      const raw = (response.text || '[]').trim();
      const parsed = JSON.parse(raw) as Array<{ category: string; content: string }>;
      const validCats = new Set(['preference', 'identity', 'interest', 'goal', 'language', 'note']);
      const suggestions = Array.isArray(parsed)
        ? parsed
            .filter((item) => item?.content && validCats.has(item.category))
            .slice(0, 2)
        : [];

      res.json({ suggestions });
    } catch (error) {
      console.error('Error in /api/nova/extract-memories:', error);
      res.json({ suggestions: [] });
    }
  });

  // Assistant Quick Tools & Automation Briefing
  app.post('/api/nova/assist', async (req, res) => {
    try {
      const ai = getAiClient();
      const { task, input, targetLanguage, profile = {} } = req.body as {
        task: 'summarize' | 'translate' | 'study_plan' | 'draft_message' | 'briefing';
        input: string;
        targetLanguage?: string;
        profile?: {
          preferredName?: string;
          preferredLanguage?: string;
          currentMood?: string;
          currentMoodNote?: string;
        };
      };

      const safeProfile = profile || {};
      let model = 'gemini-4-hydrogen';
      let prompt = input;

      if (task === 'summarize') {
        model = 'gemini-3.1-flash-lite';
        prompt = `Summarize the following text clearly with key bullet takeaways in a warm, helpful tone:\n\n${input}`;
      } else if (task === 'translate') {
        model = 'gemini-3.1-flash-lite';
        prompt = `Translate the following text naturally into ${targetLanguage || 'English'}. Provide the translation clearly, plus a quick note on tone if helpful:\n\n${input}`;
      } else if (task === 'study_plan') {
        model = 'gemini-4-hydrogen';
        prompt = `Create a clear, motivating, realistic step-by-step study plan for the user based on this goal:\n\n${input}`;
      } else if (task === 'draft_message') {
        model = 'gemini-4-hydrogen';
        prompt = `Draft a clear, thoughtful message or email based on this request. Offer a warm natural version ready to copy or send:\n\n${input}`;
      } else if (task === 'briefing') {
        model = 'gemini-4-hydrogen';
        prompt = `Give ${safeProfile.preferredName || 'Muhib'} a warm, concise, encouraging daily briefing based on their real schedule and tasks below. Do not invent any tasks or events not listed:\n\n${input}`;
      }

      const assistConfig = {
        systemInstruction: buildNovaSystemInstruction({
          preferredName: safeProfile.preferredName,
          preferredLanguage: safeProfile.preferredLanguage,
          currentMood: safeProfile.currentMood,
          currentMoodNote: safeProfile.currentMoodNote,
        }),
      };

      const selectedAssistModel =
        model === 'gemini-4-hydrogen' && Date.now() < hydrogenCooldownUntil
          ? 'gemini-3.1-flash-lite'
          : model;

      let response;
      try {
        response = await withRetry(() =>
          ai.models.generateContent({
            model: selectedAssistModel,
            contents: prompt,
            config: assistConfig,
          })
        );
      } catch (primaryErr) {
        if (
          selectedAssistModel === 'gemini-4-hydrogen' &&
          extractUpstreamStatus(primaryErr) === 429
        ) {
          if (isDailyQuotaError(primaryErr)) {
            hydrogenCooldownUntil = Date.now() + 5 * 60 * 1000;
          }
          response = await withRetry(() =>
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: prompt,
              config: assistConfig,
            })
          );
        } else {
          throw primaryErr;
        }
      }

      res.json({ text: response.text || '' });
    } catch (error) {
      console.error('Error in /api/nova/assist:', error);
      const parsed = parseGeminiError(error, 'Assistant tool failed.');
      res.status(parsed.status).json({ error: parsed.message, code: parsed.status });
    }
  });

  // HTTP server + WebSocket Server for Gemini Live API (gemini-3.8-live)
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let isClosing = false;
    let isAuthenticated = false;
    let sessionReadyPromise: Promise<void> | null = null;

    const connectLiveSession = async (initPayload: {
      idToken?: string;
      preferredName?: string;
      preferredLanguage?: string;
      voiceName?: string;
      voiceStyle?: string;
      playfulJealousy?: boolean;
      currentMood?: string;
      currentMoodNote?: string;
      memories?: Array<{ category: string; content: string }>;
    }) => {
      if (!initPayload.idToken) {
        throw new Error('Authentication required: Only Muhib can start a live voice session.');
      }
      await verifyOwnerFirebaseToken(initPayload.idToken);
      isAuthenticated = true;

      const ai = getAiClient();
      const selectedVoice = initPayload.voiceName === 'Zephyr' ? 'Zephyr' : 'Kore';

      const systemInstruction =
        buildNovaSystemInstruction({
          preferredName: initPayload.preferredName,
          preferredLanguage: initPayload.preferredLanguage,
          voiceStyle: initPayload.voiceStyle,
          playfulJealousy: initPayload.playfulJealousy ?? true,
          currentMood: initPayload.currentMood,
          currentMoodNote: initPayload.currentMoodNote,
          memories: initPayload.memories || [],
          useSearch: false,
          workspaceConnected: false,
        }) +
        '\n\nVoice Conversation Mode: Keep spoken replies concise, conversational, warm, and natural (2-4 sentences typically unless asked to explain in detail).';

      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
          systemInstruction,
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'ready' }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;

            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: 'inputTranscript',
                  text: content.inputTranscription.text,
                })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: 'outputTranscript',
                  text: content.outputTranscription.text,
                })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(
                  JSON.stringify({
                    type: 'audio',
                    data: part.inlineData.data,
                  })
                );
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ type: 'interrupted' }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ type: 'turnComplete' }));
            }
          },
          onerror: (err) => {
            console.error('Gemini Live session error:', err);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: 'error',
                  message: 'Live voice connection encountered an error.',
                })
              );
            }
          },
          onclose: () => {
            if (!isClosing && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'closed' }));
            }
          },
        },
      });
    };

    clientWs.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: 'init' | 'audio' | 'text';
          idToken?: string;
          data?: string;
          preferredName?: string;
          preferredLanguage?: string;
          voiceName?: string;
          voiceStyle?: string;
          playfulJealousy?: boolean;
          currentMood?: string;
          currentMoodNote?: string;
          memories?: Array<{ category: string; content: string }>;
        };

        if (msg.type === 'init') {
          if (!sessionReadyPromise) {
            sessionReadyPromise = connectLiveSession(msg).catch((err) => {
              console.error('Failed to connect Gemini Live:', err);
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(
                  JSON.stringify({
                    type: 'error',
                    message: err instanceof Error ? err.message : 'Failed to start live voice session.',
                  })
                );
                clientWs.close();
              }
            });
          }
          await sessionReadyPromise;
          return;
        }

        if (!sessionReadyPromise) {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(
              JSON.stringify({
                type: 'error',
                message: 'Unauthorized: Live voice session must be initialized by Muhib.',
              })
            );
            clientWs.close();
          }
          return;
        }
        await sessionReadyPromise;

        if (!isAuthenticated || !liveSession) return;

        if (msg.type === 'audio' && msg.data) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'text' && msg.data) {
          liveSession.sendRealtimeInput({
            text: msg.data,
          });
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      try {
        liveSession?.close();
      } catch {
        // ignore close errors
      }
    });
  });

  // Mount Vite in dev, or serve static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`NOVA AI server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
