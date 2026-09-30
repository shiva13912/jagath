import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { api } from '../lib/api';

export type Role = 'admin' | 'member';
export interface Me {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  show_on_public_site: boolean;
  email_public: boolean;
  phone_public: boolean;
}

interface AuthState {
  user: Me | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const session = (await api.get<{ user: Me | null }>('/auth/session')).data.user;
      if (!session) return null;
      return (await api.get<{ user: Me }>('/auth/me')).data.user;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const value = useMemo<AuthState>(
    () => ({
      user: me.data ?? null,
      loading: me.isLoading,
      isAdmin: me.data?.role === 'admin',
      login: async (email, password) => {
        await api.post('/auth/login', { email, password });
        qc.clear();
        await me.refetch();
      },
      logout: async () => {
        await api.post('/auth/logout');
        qc.clear();
        qc.setQueryData(['me'], null);
      },
      refresh: () => me.refetch(),
    }),
    [me.data, me.isLoading, qc], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
