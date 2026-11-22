import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages.readonly',
  'https://www.googleapis.com/auth/chat.messages.create',
] as const;

export const OWNER_EMAIL = 'raorashidiqbal1120@gmail.com';
export const AUTHORIZED_OWNER_EMAILS = [
  'raorashidiqbal1120@gmail.com',
  'muhibalipangay1120@gmail.com',
  'muhibalipangay1120@gmail.con',
] as const;
export const OWNER_NAME = 'Muhib';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: 'select_account',
});

// Strictly in-memory token cache — never persisted to localStorage or sessionStorage
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export function isAuthorizedOwnerUser(user: User | null): boolean {
  const emailLower = user?.email?.toLowerCase() || '';
  return Boolean(
    user &&
      user.emailVerified &&
      (AUTHORIZED_OWNER_EMAILS as readonly string[]).includes(emailLower)
  );
}

export async function getOwnerIdToken(forceRefresh = false): Promise<string> {
  const user = auth.currentUser;
  if (!user || !isAuthorizedOwnerUser(user)) {
    throw new Error('Authentication required. Only Muhib can access this private NOVA app.');
  }
  return user.getIdToken(forceRefresh);
}

export async function parseJsonResponse<T = Record<string, unknown>>(
  res: Response,
  fallbackError = 'Request failed.'
): Promise<T> {
  const raw = await res.text();
  let parsed: Record<string, unknown> = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      if (!res.ok) {
        throw new Error(`${fallbackError} (HTTP ${res.status})`);
      }
      throw new Error('Received an unexpected non-JSON response from NOVA server.');
    }
  }
  if (!res.ok) {
    const errMsg = typeof parsed.error === 'string' && parsed.error ? parsed.error : fallbackError;
    throw new Error(errMsg);
  }
  return parsed as T;
}

export async function novaFetch(path: string, body: unknown): Promise<Response> {
  let idToken = await getOwnerIdToken(false);
  const payload = JSON.stringify(body);
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: payload,
      });

      if (res.status === 401 && attempt === 0) {
        idToken = await getOwnerIdToken(true);
        continue;
      }

      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
        continue;
      }

      return res;
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
        continue;
      }
    }
  }

  const msg = lastError instanceof Error ? lastError.message : '';
  if (msg.toLowerCase().includes('failed to fetch') || lastError instanceof TypeError) {
    throw new Error(
      'Unable to reach the NOVA server right now (network connection interrupted). Please retry in a moment or reload the page.'
    );
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to contact NOVA server.');
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firestore connection failed: the client is offline.');
      return false;
    }
    // Permission denied on /test/connection means Firestore is reachable and security rules are active
    return true;
  }
}

export const initAuth = (
  onAuthChange: (
    user: User | null,
    hasWorkspaceToken: boolean,
    deniedEmail?: string | null
  ) => void
) => {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      if (!isAuthorizedOwnerUser(user)) {
        const unauthorizedEmail = user.email || 'unknown account';
        cachedAccessToken = null;
        if (!isSigningIn) {
          auth.signOut().catch(() => {});
          onAuthChange(null, false, unauthorizedEmail);
        }
        return;
      }
      onAuthChange(user, Boolean(cachedAccessToken), null);
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      onAuthChange(null, false, null);
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    let result;
    try {
      result = await signInWithPopup(auth, provider);
    } catch (popupErr: unknown) {
      const errCode = (popupErr as { code?: string })?.code || '';
      const errMsg = (popupErr as { message?: string })?.message || '';
      if (
        errCode === 'auth/unauthorized-domain' ||
        errCode === 'auth/popup-blocked' ||
        errCode === 'auth/popup-closed-by-user' ||
        errMsg.includes('unauthorized domain') ||
        errMsg.includes('popup')
      ) {
        // Fallback to redirect flow which works across all custom or preview domains
        await import('firebase/auth').then((m) => m.signInWithRedirect(auth, provider));
        return null;
      }
      throw popupErr;
    }

    if (!isAuthorizedOwnerUser(result.user)) {
      cachedAccessToken = null;
      await auth.signOut().catch(() => {});
      throw new Error(
        `Access denied (${result.user.email || 'unauthorized account'}). This private NOVA companion is exclusively reserved for Muhib.`
      );
    }
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Workspace access token.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const logout = async (): Promise<void> => {
  cachedAccessToken = null;
  await auth.signOut();
};

export const PROJECT_ID = firebaseConfig.projectId;
