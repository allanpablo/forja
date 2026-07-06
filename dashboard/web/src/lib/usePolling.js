import { useEffect, useRef, useState, useCallback } from 'react';
import { subscribe as subscribeEvents } from './useEvents.js';

/**
 * Hook genérico de polling + realtime.
 *  - fetcher: () => Promise<T>
 *  - intervalMs: default 30000 (NFR spec; usado como fallback)
 *  - refetchOnEvents: array de tipos de evento que disparam refetch imediato
 * Devolve { data, error, loading, refetch }.
 */
export function usePolling(fetcher, intervalMs = 30000, refetchOnEvents = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const tick = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer;
    (async () => {
      await tick();
      if (cancelled) return;
      timer = setInterval(() => { if (!document.hidden) tick(); }, intervalMs);
    })();
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [tick, intervalMs]);

  useEffect(() => {
    if (!refetchOnEvents.length) return undefined;
    return subscribeEvents(refetchOnEvents, () => {
      // pequeno debounce — várias mutações em sequência viram 1 refetch
      tick();
    });
  }, [tick, refetchOnEvents.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, loading, refetch: tick };
}
