import { useState, useEffect, useRef, useCallback } from 'react';
import type { JobStatus, JobPollState } from '../types/dashboard';
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from '../config/tokens';
import { DEMO_MOCKS } from '../config/demo_mocks';

export function useJobPolling() {
  const [state, setState] = useState<JobPollState>({
    status: 'PENDING',
    report: null,
    elapsedSeconds: 0,
    isPolling: false,
    error: null,
  });

  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef   = useRef<number>(0);
  const jobIdRef   = useRef<string>('');

  const cleanup = useCallback(() => {
    if (pollRef.current)  clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    pollRef.current  = null;
    timerRef.current = null;
  }, []);

  const startPolling = useCallback((jobId: string) => {
    cleanup();
    jobIdRef.current = jobId;
    startRef.current = Date.now();

    setState({
      status: 'PENDING',
      report: null,
      elapsedSeconds: 0,
      isPolling: true,
      error: null,
    });

    // Elapsed timer
    timerRef.current = setInterval(() => {
      setState(s => ({ ...s, elapsedSeconds: Math.floor((Date.now() - startRef.current) / 1000) }));
    }, 1000);

    // Actual network polling
    pollRef.current = setInterval(async () => {
      if (Date.now() - startRef.current > POLL_TIMEOUT_MS) {
        cleanup();
        setState(s => ({ ...s, isPolling: false, status: 'FAILED', error: 'Polling timed out.' }));
        return;
      }

      try {
        let data: any;
        
        if (DEMO_MOCKS[jobId]) {
          data = { status: 'COMPLETE', report: DEMO_MOCKS[jobId] };
        } else {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/report/${jobId}`);
          if (!res.ok) {
            if (res.status === 404) {
              cleanup();
              setState(s => ({ ...s, isPolling: false, status: 'FAILED', error: 'Job not found.' }));
            }
            return;
          }
          data = await res.json();
        }

        if (data.status === 'COMPLETE') {
          cleanup();
          setState(s => ({
            ...s,
            status: 'COMPLETE',
            isPolling: false,
            report: data.report,
          }));
        } else if (data.status === 'FAILED') {
          cleanup();
          setState(s => ({
            ...s,
            status: 'FAILED',
            isPolling: false,
            error: data.error || 'Diagnosis failed',
          }));
        } else {
          setState(s => ({ ...s, status: data.status as JobStatus }));
        }
      } catch (err) {
        console.error('Polling error', err);
      }
    }, POLL_INTERVAL_MS);
  }, [cleanup]);

  const retry = useCallback(() => {
    if (jobIdRef.current) startPolling(jobIdRef.current);
  }, [startPolling]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { state, startPolling, retry };
}
