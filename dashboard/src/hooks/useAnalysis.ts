/**
 * useAnalysis.ts — Unified analysis hook for Half-Life
 *
 * Drives the entire diagnosis flow:
 *   1. WebUSB connect → collect diagnostics → POST /analyze → render
 *   2. Paste mode    → receive raw text → POST /analyze → render
 *   3. Job ID mode   → poll GET /report/{jobId} → render (returning users)
 *
 * Replaces the old useJobPolling.ts mock.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  AnalysisState,
  AnalysisStatus,
  DiagnosisReport,
  DiagnosticsPayload,
  DeviceSession,
  ConnectionMethod,
} from '../types/dashboard';
import { collectDiagnostics, disconnectDevice } from '../lib/webadb';

// ── Config ─────────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL;
if (!API_BASE) {
  console.warn('VITE_API_URL is missing. API requests will fail.');
}

// ── Step labels for each analysis status ──────────────────────────────────────
const STEP_LABELS: Record<AnalysisStatus, string> = {
  IDLE:       'Ready',
  CONNECTING: '🔌 Authenticating with device…',
  READING:    '📋 Reading battery & CPU stats…',
  ANALYSING:  '⚡ Running deterministic analysis…',
  COMPLETE:   '✅ Diagnosis complete',
  FAILED:     '❌ Analysis failed',
};

const INITIAL_STATE: AnalysisState = {
  status:         'IDLE',
  stepLabel:      STEP_LABELS['IDLE'],
  report:         null,
  elapsedSeconds: 0,
  error:          null,
};

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>(INITIAL_STATE);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef  = useRef<number>(0);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const setStatus = useCallback((status: AnalysisStatus) => {
    setState(s => ({ ...s, status, stepLabel: STEP_LABELS[status] }));
  }, []);

  const setError = useCallback((msg: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setState(s => ({ ...s, status: 'FAILED', stepLabel: STEP_LABELS['FAILED'], error: msg }));
  }, []);

  const startTimer = useCallback(() => {
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setState(s => ({ ...s, elapsedSeconds: Math.floor((Date.now() - startRef.current) / 1000) }));
    }, 1000);
  }, []);

  // ── POST payload to Lambda /analyze ─────────────────────────────────────────
  const postAnalyze = useCallback(async (payload: DiagnosticsPayload): Promise<DiagnosisReport> => {
    const resp = await fetch(`${API_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      if (resp.status === 413) {
        throw new Error('Log payload exceeds processing limits (5MB max). Please reduce output size.');
      }
      if (resp.status === 504) {
        throw new Error('Analysis timed out. The server took too long to respond.');
      }
      const err = await resp.text().catch(() => resp.statusText);
      throw new Error(`Lambda error ${resp.status}: ${err}`);
    }
    const data = await resp.json();
    return data as DiagnosisReport;
  }, []);

  // ── Flow 1: WebUSB connect → collect → analyse ───────────────────────────────
  const analyzeWebUsb = useCallback(async (session: DeviceSession) => {
    setState({ ...INITIAL_STATE, status: 'READING', stepLabel: STEP_LABELS['READING'], elapsedSeconds: 0 });
    startTimer();

    try {
      const payload = await collectDiagnostics(session);
      setStatus('ANALYSING');
      const report = await postAnalyze(payload);
      if (timerRef.current) clearInterval(timerRef.current);
      setState(s => ({ ...s, status: 'COMPLETE', stepLabel: STEP_LABELS['COMPLETE'], report }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [startTimer, setStatus, setError, postAnalyze]);

  // ── Flow 2: Paste mode → analyse ─────────────────────────────────────────────
  const analyzePaste = useCallback(async (
    batteryRaw: string,
    batterystatsRaw: string,
    cpuinfoRaw: string,
    thermalRaw: string,
  ) => {
    setState({ ...INITIAL_STATE, status: 'ANALYSING', stepLabel: STEP_LABELS['ANALYSING'], elapsedSeconds: 0 });
    startTimer();

    const payload: DiagnosticsPayload = {
      device_id: 'paste-input',
      battery_raw:       batteryRaw,
      batterystats_raw:  batterystatsRaw,
      cpuinfo_raw:       cpuinfoRaw,
      thermal_raw:       thermalRaw,
      connection_method: 'paste',
    };

    try {
      const report = await postAnalyze(payload);
      if (timerRef.current) clearInterval(timerRef.current);
      setState(s => ({ ...s, status: 'COMPLETE', stepLabel: STEP_LABELS['COMPLETE'], report }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [startTimer, setStatus, setError, postAnalyze]);

  // ── Flow 3: Job ID lookup (returning users) ──────────────────────────────────
  const analyzeJobId = useCallback(async (jobId: string) => {
    setState({ ...INITIAL_STATE, status: 'ANALYSING', stepLabel: `Fetching job ${jobId}…`, elapsedSeconds: 0 });
    startTimer();
    
    if (!API_BASE) {
      setError('System configuration error: VITE_API_URL is missing.');
      return;
    }

    let retries = 3;
    while (retries > 0) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        
        const resp = await fetch(`${API_BASE}/report/${encodeURIComponent(jobId)}`, {
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!resp.ok) {
          if (resp.status === 404) {
            setError('Diagnosis not found or expired (7 days).');
            return;
          }
          throw new Error(`HTTP ${resp.status}`);
        }
        
        const data = await resp.json();
        if (data.status === 'COMPLETE') {
          if (timerRef.current) clearInterval(timerRef.current);
          if (data.report && data.report.severity) {
             setState(s => ({ ...s, status: 'COMPLETE', stepLabel: STEP_LABELS['COMPLETE'], report: data.report }));
          } else {
             setError('Invalid response from server.');
          }
          return;
        } else if (data.status === 'FAILED') {
          setError(data.error ?? 'Job failed on server');
          return;
        } else {
          // If PROCESSING, wait a bit and retry
          await new Promise(r => setTimeout(r, 2000));
          retries--;
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') {
           // timeout
        }
        retries--;
        if (retries === 0) {
          setError(`Failed to fetch report: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    setError('Failed to fetch job after multiple attempts.');
  }, [startTimer, setError]);

  const reset = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    disconnectDevice();
    setState(INITIAL_STATE);
  }, []);

  // Cleanup
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    disconnectDevice();
  }, []);

  return {
    state,
    analyzeWebUsb,
    analyzePaste,
    analyzeJobId,
    reset,
  };
}
