"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  configureApiHooks,
  login as apiLogin,
  logout as apiLogout,
  readStoredEmail,
  readStoredTokens,
  readStoredUser,
  refreshSession as apiRefresh,
  register as apiRegister,
  storeEmail,
  storeTokens,
  storeUser,
  tokenExpiryMs,
} from "@/lib/api";
import { ApiError, describeError } from "@/lib/errors";
import type { AuthResponse, LoginRequest, PublicUser, RegisterRequest, Tokens } from "@/lib/types";

/**
 * Session state for the whole client.
 *
 * `refreshSession` is used silently for reads. Money actions instead call
 * `reauthenticate`, which blocks on a password prompt: a moved 250 ETB that the
 * user never authorised is worse than making them type a password again.
 */

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export interface ReauthRequest {
  reason: string;
}

interface AuthContextValue {
  status: SessionStatus;
  user: PublicUser | null;
  email: string | null;
  accessToken: string | null;
  beginLogin: (body: LoginRequest) => Promise<AuthResponse>;
  beginRegistration: (body: RegisterRequest) => Promise<AuthResponse>;
  signOut: () => Promise<void>;
  /** Called by the API layer on a silent 401. */
  refreshSession: () => Promise<boolean>;
  /** Called by the API layer on a money-action 401. */
  reauthenticate: (reason?: string) => Promise<boolean>;
  /** Prompt state for <ReauthDialog/>. */
  reauthRequest: ReauthRequest | null;
  reauthError: string | null;
  /** Proves identity again. Resolves true only when the session was restored. */
  submitReauth: (password: string) => Promise<boolean>;
  /** Refusing to re-auth is always allowed — the action simply does not run. */
  cancelReauth: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface StoredSession {
  user: PublicUser | null;
  tokens: Tokens;
  expiresAt: number | null;
}

function hydrate(): StoredSession | null {
  const tokens = readStoredTokens();
  if (!tokens) return null;
  return { tokens, user: readStoredUser(), expiresAt: tokenExpiryMs(tokens) };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [reauthRequest, setReauthRequest] = useState<ReauthRequest | null>(null);

  const tokensRef = useRef<Tokens | null>(null);
  const expiryRef = useRef<number | null>(null);
  const refreshInFlight = useRef<Promise<boolean> | null>(null);
  const reauthResolver = useRef<((ok: boolean) => void) | null>(null);
  const reauthPending = useRef(false);

  const applySession = useCallback((next: Tokens, profile: PublicUser | null) => {
    tokensRef.current = next;
    expiryRef.current = tokenExpiryMs(next);
    setTokens(next);
    storeTokens(next);
    if (profile) {
      setUser(profile);
      setEmail(profile.email);
      storeEmail(profile.email);
      storeUser(profile);
    }
    setStatus("authenticated");
  }, []);

  const clearSession = useCallback(() => {
    tokensRef.current = null;
    expiryRef.current = null;
    setTokens(null);
    setUser(null);
    storeTokens(null);
    storeUser(null);
    setStatus("unauthenticated");
  }, []);

  /* bootstrap: trust the stored session, refresh it if the claim looks stale. */
  useEffect(() => {
    let cancelled = false;
    const stored = hydrate();
    if (!stored?.tokens) {
      setStatus("unauthenticated");
      return;
    }
    tokensRef.current = stored.tokens;
    expiryRef.current = stored.expiresAt;
    setTokens(stored.tokens);
    setUser(stored.user);
    setEmail(readStoredEmail() ?? stored.user?.email ?? null);

    const knownToBeExpired = stored.expiresAt !== null && stored.expiresAt - Date.now() < 30_000;
    if (!knownToBeExpired) {
      setStatus("authenticated");
      return;
    }
    void apiRefresh(stored.tokens.refreshToken)
      .then((result) => {
        if (cancelled) return;
        applySession(result.tokens, result.user ?? null);
      })
      .catch(() => {
        if (!cancelled) clearSession();
      });
    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession]);

  const doRefresh = useCallback((): Promise<boolean> => {
    const current = tokensRef.current;
    if (!current?.refreshToken) return Promise.resolve(false);
    if (refreshInFlight.current) return refreshInFlight.current;

    const promise = apiRefresh(current.refreshToken)
      .then((result) => {
        applySession(result.tokens, result.user ?? null);
        return true;
      })
      .catch((err: unknown) => {
        // Rotated-token reuse nukes the family: we must not keep a dead session.
        if (err instanceof ApiError && (err.code === "TOKEN_EXPIRED" || err.status === 401)) {
          clearSession();
        }
        return false;
      })
      .finally(() => {
        refreshInFlight.current = null;
      });

    refreshInFlight.current = promise;
    return promise;
  }, [applySession, clearSession]);

  const reauthenticate = useCallback(
    (reason?: string) => {
      if (reauthPending.current) return Promise.resolve(false);
      reauthPending.current = true;
      setReauthError(null);
      setReauthRequest({
        reason:
          reason ??
          "Your session ended while a money movement was in progress. Confirm your password to send it.",
      });
      return new Promise<boolean>((resolve) => {
        reauthResolver.current = resolve;
      });
    },
    [],
  );

  const [reauthError, setReauthError] = useState<string | null>(null);

  const releaseReauth = useCallback((ok: boolean) => {
    reauthPending.current = false;
    const resolve = reauthResolver.current;
    reauthResolver.current = null;
    setReauthRequest(null);
    setReauthError(null);
    resolve?.(ok);
  }, []);

  const submitReauth = useCallback(
    async (password: string) => {
      const account = email ?? user?.email ?? null;
      if (!account) {
        setReauthError("We no longer know which account to re-authenticate. Sign in again.");
        releaseReauth(false);
        return false;
      }
      try {
        const result = await apiLogin({ email: account, password });
        applySession(result.tokens, result.user);
        releaseReauth(true);
        return true;
      } catch (err) {
        // Stay open: a mistyped password must not silently cancel the transfer.
        setReauthError(describeError(err, "Sign in"));
        return false;
      }
    },
    [applySession, email, releaseReauth, user],
  );

  const cancelReauth = useCallback(() => {
    releaseReauth(false);
  }, [releaseReauth]);

  const beginLogin = useCallback(
    async (body: LoginRequest) => {
      const result = await apiLogin(body);
      applySession(result.tokens, result.user);
      return result;
    },
    [applySession],
  );

  const beginRegistration = useCallback(
    async (body: RegisterRequest) => {
      const result = await apiRegister(body);
      applySession(result.tokens, result.user);
      return result;
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    const current = tokensRef.current;
    const refreshToken = current?.refreshToken ?? null;
    clearSession();
    try {
      await apiLogout(refreshToken);
    } catch {
      /* signing out locally is what matters */
    }
  }, [clearSession]);

  useEffect(() => {
    configureApiHooks({
      getAccessToken: () => tokensRef.current?.accessToken ?? null,
      refreshSession: doRefresh,
      reauthenticate: () => reauthenticate(),
    });
    return () => configureApiHooks(null);
  }, [doRefresh, reauthenticate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      email,
      accessToken: tokens?.accessToken ?? null,
      beginLogin,
      beginRegistration,
      signOut,
      refreshSession: doRefresh,
      reauthenticate,
      reauthRequest,
      reauthError,
      submitReauth,
      cancelReauth,
    }),
    [
      status,
      user,
      email,
      tokens?.accessToken,
      beginLogin,
      beginRegistration,
      signOut,
      doRefresh,
      reauthenticate,
      reauthRequest,
      reauthError,
      submitReauth,
      cancelReauth,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
