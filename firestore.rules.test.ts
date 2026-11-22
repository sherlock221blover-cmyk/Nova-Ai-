/**
 * Security Rules Adversarial Verification Spec ("Dirty Dozen" Payloads)
 * Designed to verify that every unauthorized, spoofed, oversized, or schema-breaking
 * Firestore write/read is rejected by firestore.rules.
 */

export interface DirtyPayloadCase {
  id: number;
  name: string;
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyPayloadCase[] = [
  {
    id: 1,
    name: 'Cross-user read/write spoof',
    path: '/users/userA/memories/mem_1',
    operation: 'create',
    auth: { uid: 'userB', email_verified: true },
    payload: { id: 'mem_1', uid: 'userA', category: 'note', content: 'hi', source: 'manual' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email bypass',
    path: '/users/userA',
    operation: 'create',
    auth: { uid: 'userA', email_verified: false },
    payload: { uid: 'userA', preferredName: 'Alex', preferredLanguage: 'English', voiceName: 'Kore', voiceStyle: 'warm', autoSpeak: false, webSearchDefault: true, autoMemoryExtract: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'UID field hijack inside owned path',
    path: '/users/userA/memories/mem_2',
    operation: 'create',
    auth: { uid: 'userA', email_verified: true },
    payload: { id: 'mem_2', uid: 'userB', category: 'note', content: 'hijack', source: 'manual' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow ghost field on create',
    path: '/users/userA',
    operation: 'create',
    auth: { uid: 'userA', email_verified: true },
    payload: { uid: 'userA', preferredName: 'Alex', preferredLanguage: 'English', voiceName: 'Kore', voiceStyle: 'warm', autoSpeak: false, webSearchDefault: true, autoMemoryExtract: true, isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow ghost field on update',
    path: '/users/userA',
    operation: 'update',
    auth: { uid: 'userA', email_verified: true },
    payload: { preferredName: 'Alex', role: 'superadmin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Path variable ID poisoning',
    path: '/users/userA/memories/invalid$id!with*bad&chars',
    operation: 'create',
    auth: { uid: 'userA', email_verified: true },
    payload: { id: 'invalid$id!with*bad&chars', uid: 'userA', category: 'note', content: 'test', source: 'manual' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'String size overflow (Denial of Wallet)',
    path: '/users/userA/memories/mem_3',
    operation: 'create',
    auth: { uid: 'userA', email_verified: true },
    payload: { id: 'mem_3', uid: 'userA', category: 'note', content: 'x'.repeat(2000), source: 'manual' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Unbounded array injection on ChatMessage',
    path: '/users/userA/messages/msg_1',
    operation: 'create',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      id: 'msg_1',
      uid: 'userA',
      role: 'assistant',
      text: 'Search result',
      usedSearch: true,
      sourceUrls: Array.from({ length: 25 }, (_, i) => `https://example.com/${i}`),
      sourceTitles: Array.from({ length: 25 }, (_, i) => `Title ${i}`),
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Client-spoofed createdAt timestamp',
    path: '/users/userA/memories/mem_4',
    operation: 'create',
    auth: { uid: 'userA', email_verified: true },
    payload: { id: 'mem_4', uid: 'userA', category: 'note', content: 'backdated', source: 'manual', createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immutable createdAt mutation on update',
    path: '/users/userA/memories/mem_1',
    operation: 'update',
    auth: { uid: 'userA', email_verified: true },
    payload: { content: 'updated', createdAt: '2026-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Invalid enum value poisoning',
    path: '/users/userA',
    operation: 'update',
    auth: { uid: 'userA', email_verified: true },
    payload: { voiceName: 'UnauthorizedVoice' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unauthorized list query across users',
    path: '/users/userA/memories',
    operation: 'list',
    auth: { uid: 'userB', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
];
