import { useState, useEffect, useRef } from 'react';
import type { LLMProvider } from '../lib/llm/provider';

export type HealthStatus = 'ok' | 'error' | 'checking';

export function useProviderHealth(provider: LLMProvider): HealthStatus {
  const [status, setStatus] = useState<HealthStatus>('checking');
  const providerRef = useRef(provider);
  providerRef.current = provider;

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      setStatus('checking');
      const ok = await providerRef.current.healthCheck();
      if (!cancelled) setStatus(ok ? 'ok' : 'error');
    };

    check();
    const id = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [provider]);

  return status;
}
