import { useAuth } from '@clerk/clerk-react';
import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/** fetch wrapper that attaches the Clerk session token and unwraps our { error } shape. */
export function useApi() {
  const { getToken } = useAuth();
  return useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const token = await getToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    let res: Response;
    try {
      res = await fetch(`/api${path}`, { ...init, headers });
    } catch {
      throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Something went wrong.', body?.error?.fields);
    }
    const type = res.headers.get('content-type') ?? '';
    return (type.includes('json') ? res.json() : res.blob()) as Promise<T>;
  }, [getToken]);
}

/** Load data on mount with loading / error / reload. */
export function useQuery<T>(path: string | null) {
  const api = useApi();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setLoading(true);
    api<T>(path)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e as ApiError); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, path, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
