import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { currentMonth } from '@/domain/format';
import type { Month, User } from '@/domain/types';
import { api, useDataVersion } from '@/services/api';

const SESSION_KEY = 'mksal:session';

interface SessionCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  month: Month;
  setMonth: (m: Month) => void;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<Month>(currentMonth());
  const version = useDataVersion();

  // Restaura e revalida a sessão (usuário pode ter sido desativado/alterado).
  useEffect(() => {
    const id = sessionStorage.getItem(SESSION_KEY);
    if (!id) return setLoading(false);
    api.getUser(id).then((u) => {
      setUser(u);
      if (!u) sessionStorage.removeItem(SESSION_KEY);
      setLoading(false);
    });
  }, [version]);

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.login(email, password);
    sessionStorage.setItem(SESSION_KEY, u.id);
    setUser(u);
    window.location.hash = '#/';
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
    window.location.hash = '#/';
  }, []);

  return <Ctx.Provider value={{ user, loading, login, logout, month, setMonth }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession fora do SessionProvider');
  return c;
}

/** Usuário autenticado (garantido pelas rotas protegidas). */
export function useUser(): User {
  const { user } = useSession();
  if (!user) throw new Error('Usuário não autenticado');
  return user;
}

/**
 * Executa uma consulta assíncrona e a refaz quando os dados mudam ou as dependências mudam.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; error: string | null } {
  const version = useDataVersion();
  const [state, setState] = useState<{ data: T | undefined; error: string | null }>({ data: undefined, error: null });
  useEffect(() => {
    let alive = true;
    fn()
      .then((data) => alive && setState({ data, error: null }))
      .catch((e: Error) => alive && setState({ data: undefined, error: e.message }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return state;
}

export function useHashPath() {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => setPath(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}

export const navigate = (path: string) => (window.location.hash = `#${path}`);
