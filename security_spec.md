# NOVA AI Firestore Security Specification

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every user document (`/users/{userId}`) and subcollection record (`memories`, `messages`, `automations`) belongs strictly to a single verified Firebase Auth user (`request.auth.uid == userId` and `request.auth.token.email_verified == true`).
2. **No PII in Firestore**: User emails, phone numbers, and street addresses are never stored in Firestore documents; only `uid` and non-sensitive companion preferences are persisted.
3. **Master Gate Relational Integrity**: Subcollection writes (`memories`, `messages`, `automations`) require the parent `/users/{userId}` profile document to exist via `exists()` (except `allow list`, which avoids `get()`/`exists()` and enforces `resource.data.uid == request.auth.uid`).
4. **Immutable Ownership & Creation Timestamps**: `uid`, `id`, and `createdAt` cannot be modified after document creation; `createdAt` must equal `request.time` on create, and `updatedAt` must equal `request.time` on update.
5. **Bounded Payloads & Strict Schemas**: Every string enforces explicit `.size()` bounds matching `firebase-blueprint.json`, every array is bounded (`<= 10`), and every create/update checks exact allowed keys (`hasAll`/`hasOnly` on create, `affectedKeys().hasOnly(...)` on update).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Cross-User Read/Write Spoof**: Authenticated user B attempts to read or write `/users/userA/memories/mem1`. -> **DENIED** (`request.auth.uid != userId`).
2. **Unverified Email Bypass**: Authenticated user with `email_verified: false` attempts to create `/users/userA`. -> **DENIED** (`email_verified != true`).
3. **UID Field Hijack**: User A creates `/users/userA/memories/mem1` with `{ uid: "userB", ... }`. -> **DENIED** (`data.uid != request.auth.uid`).
4. **Shadow Field Injection (Ghost Field)**: User A creates `/users/userA` with an extra `{ isAdmin: true }` field. -> **DENIED** (`keys().hasOnly(...)`).
5. **Shadow Update Injection**: User A updates `/users/userA` adding `{ role: "superadmin" }`. -> **DENIED** (`affectedKeys().hasOnly(...)`).
6. **ID Poisoning / Resource Exhaustion**: User A writes `/users/userA/memories/<150-char-invalid-id!@#>` -> **DENIED** (`!isValidId(memoryId)`).
7. **Denial of Wallet String Overflow**: User A writes a 50KB `content` string into `/users/userA/memories/m1` (max 500 chars). -> **DENIED** (`content.size() > 500`).
8. **Unbounded Array Injection**: User A writes 25 URLs into `sourceUrls` in `/users/userA/messages/msg1` (max 10). -> **DENIED** (`sourceUrls.size() > 10`).
9. **Client-Spoofed Timestamp**: User A creates a memory with `createdAt: Timestamp(2020-01-01)`. -> **DENIED** (`createdAt != request.time`).
10. **Immutable Field Mutation**: User A updates a memory's `createdAt` or `id` or `uid`. -> **DENIED** (`affectedKeys().hasOnly(...)` + equality invariant).
11. **Invalid Enum Poisoning**: User A sets `voiceName: "EvilVoice"` or `category: "password_vault"`. -> **DENIED** (enum allowlist check).
12. **Blanket List Query Scraping**: User B runs `list` on `/users/userA/memories` without owning `userA`. -> **DENIED** (`isOwner(userId)` + `resource.data.uid == request.auth.uid`).
