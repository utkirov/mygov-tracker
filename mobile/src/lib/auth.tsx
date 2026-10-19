import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getToken, login as apiLogin, logout as apiLogout } from './api';
import { registerForPush, unregisterPush } from './push';

interface AuthState {
  ready: boolean;
  signedIn: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Called when the server answers 401 (session revoked elsewhere). */
  expire: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    getToken().then((token) => {
      setSignedIn(!!token);
      setReady(true);
      if (token) registerForPush().catch(() => {});
    });
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    await apiLogin(username, password);
    setSignedIn(true);
    registerForPush().catch(() => {});
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush();
    await apiLogout();
    setSignedIn(false);
  }, []);

  const expire = useCallback(() => setSignedIn(false), []);

  const value = useMemo(() => ({ ready, signedIn, signIn, signOut, expire }), [ready, signedIn, signIn, signOut, expire]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
