import { useState, useEffect } from 'react';

export type OllamaStatus = 'idle' | 'checking' | 'ok' | 'error';

export function useOllamaModels(baseUrl: string): { models: string[]; status: OllamaStatus } {
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<OllamaStatus>('idle');

  useEffect(() => {
    const url = baseUrl.trim();
    if (!url) {
      setStatus('idle');
      setModels([]);
      return;
    }

    setStatus('checking');
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${url}/api/tags`);
        if (!res.ok) throw new Error();
        const data = await res.json() as { models?: { name: string }[] };
        const names = (data.models ?? []).map((m) => m.name).filter(Boolean);
        if (!cancelled) {
          setModels(names);
          setStatus('ok');
        }
      } catch {
        if (!cancelled) {
          setModels([]);
          setStatus('error');
        }
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [baseUrl]);

  return { models, status };
}
