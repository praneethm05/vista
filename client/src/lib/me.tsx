import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from './api';
import type { Me } from './types';

const MeContext = createContext<{ me: Me; reload: () => void } | null>(null);

export function MeProvider({ children, fallback, error }: { children: ReactNode; fallback: ReactNode; error: (msg: string, retry: () => void) => ReactNode }) {
  const { data, error: err, loading, reload } = useQuery<Me>('/me');
  if (err) return <>{error(err.message, reload)}</>;
  if (loading && !data) return <>{fallback}</>;
  return <MeContext.Provider value={{ me: data!, reload }}>{children}</MeContext.Provider>;
}

export function useMe() {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error('useMe outside MeProvider');
  return ctx;
}
