import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthUser } from '@light-weight/domain';
import { mapApiError, requestJson, setCsrfToken, type ApiError, type OperationResult } from './api-errors.js';
import { resolveSessionRefreshFailure, type AuthStatus } from './auth-session-state.js';
import { apiEndpoint } from './api-base.js';
import { clearCachedAuthUser, getCachedAuthUser, setCachedAuthUser } from './auth-cache.js';

type AuthResult = OperationResult<AuthUser>;

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  error: ApiError | null;
  login: (email: string, password: string) => Promise<AuthResult>;
  loginWithGoogle: (credential: string) => Promise<AuthResult>;
  register: (input: { displayName: string; username: string; email: string; password: string }) => Promise<AuthResult>;
  logout: () => Promise<OperationResult<void>>;
  refreshSession: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<AuthUser, 'displayName' | 'username' | 'birthDate' | 'gender' | 'avatarUrl'>>) => Promise<AuthResult>;
  uploadAvatar: (avatar: Blob) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getCachedAuthUser());
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const userRef = useRef<AuthUser | null>(user);
  useEffect(() => { userRef.current = user; }, [user]);

  const refreshSession = useCallback(async () => {
    try {
      const result = await requestJson<{ user: AuthUser; csrfToken?: string }>(apiEndpoint('/api/auth/me'));
      setCsrfToken(result.csrfToken);
      setCachedAuthUser(result.user);
      setUser(result.user);
      setStatus('authenticated');
      setError(null);
    } catch (cause) {
      const next = mapApiError(cause);
      const resolution = resolveSessionRefreshFailure(userRef.current, next);
      if (resolution.status === 'anonymous') {
        clearCachedAuthUser();
      }
      setUser(resolution.user);
      setError(resolution.error);
      setStatus(resolution.status);
    }
  }, []);

  useEffect(() => { void refreshSession(); }, [refreshSession]);
  useEffect(() => {
    const online = () => { void refreshSession(); };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [refreshSession]);

  const submit = useCallback(async (path: string, body: unknown): Promise<AuthResult> => {
    try {
      const result = await requestJson<{ user: AuthUser; csrfToken?: string }>(apiEndpoint(`/api/auth/${path}`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }, 12_000);
      setCsrfToken(result.csrfToken);
      setCachedAuthUser(result.user);
      setUser(result.user);
      setStatus('authenticated');
      setError(null);
      return { ok: true, data: result.user };
    } catch (cause) {
      const next = mapApiError(cause); setError(next);
      if (next.code === 'network') setStatus('offline');
      return { ok: false, error: next };
    }
  }, []);

  const logout = useCallback(async (): Promise<OperationResult<void>> => {
    try {
      await requestJson<void>(apiEndpoint('/api/auth/logout'), { method: 'POST' });
      setCsrfToken(undefined);
      clearCachedAuthUser();
      setUser(null);
      setStatus('anonymous');
      setError(null);
      return { ok: true, data: undefined };
    } catch (cause) {
      setCsrfToken(undefined);
      clearCachedAuthUser();
      setUser(null);
      setStatus('anonymous');
      const next = mapApiError(cause);
      setError(next);
      return { ok: false, error: next };
    }
  }, []);

  const updateProfile = useCallback(async (patch: Partial<Pick<AuthUser, 'displayName' | 'username' | 'birthDate' | 'gender' | 'avatarUrl'>>): Promise<AuthResult> => {
    try {
      const result = await requestJson<{ user: AuthUser }>(apiEndpoint('/api/auth/profile'), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
      });
      setCachedAuthUser(result.user);
      setUser(result.user);
      setError(null);
      return { ok: true, data: result.user };
    } catch (cause) {
      const next = mapApiError(cause); setError(next); return { ok: false, error: next };
    }
  }, []);

  const uploadAvatar = useCallback(async (avatar: Blob): Promise<AuthResult> => {
    try {
      const result = await requestJson<{ user: AuthUser }>(apiEndpoint('/api/auth/avatar'), {
        method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: avatar
      }, 20_000);
      setCachedAuthUser(result.user);
      setUser(result.user);
      setStatus('authenticated');
      setError(null);
      return { ok: true, data: result.user };
    } catch (cause) {
      const next = mapApiError(cause);
      setError(next);
      if (next.code === 'network' || next.code === 'aborted') setStatus('offline');
      return { ok: false, error: next };
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user, status, isAuthenticated: user !== null && status !== 'anonymous' && status !== 'loading', error,
    login: (email, password) => submit('login', { email, password }),
    loginWithGoogle: (credential) => submit('google', { credential }),
    register: (input) => submit('register', input), logout, refreshSession, updateProfile, uploadAvatar
  }), [error, logout, refreshSession, status, submit, updateProfile, uploadAvatar, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
