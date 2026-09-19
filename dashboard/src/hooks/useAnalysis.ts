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
import { collectDiagnostics } from '../lib/webadb';

// ── Config ─────────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL ?? 'https://REPLACE_ME.execute-api.us-east-1.amazonaws.com/prod';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS  = 60_000;

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

  // ── Flow 3: Job ID polling (returning users) ──────────────────────────────────
  const analyzeJobId = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setState({ ...INITIAL_STATE, status: 'ANALYSING', stepLabel: `Fetching job ${jobId}…`, elapsedSeconds: 0 });
    startTimer();
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    const doPoll = async () => {
      try {
        const resp = await fetch(`${API_BASE}/report/${encodeURIComponent(jobId)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        if (data.status === 'COMPLETE') {
          clearInterval(pollRef.current!);
          if (timerRef.current) clearInterval(timerRef.current);
          setState(s => ({ ...s, status: 'COMPLETE', stepLabel: STEP_LABELS['COMPLETE'], report: data.report }));
        } else if (data.status === 'FAILED') {
          clearInterval(pollRef.current!);
          setError(data.error ?? 'Job failed on server');
        } else if (Date.now() > deadline) {
          clearInterval(pollRef.current!);
          setError('Timed out waiting for job to complete.');
        }
      } catch (e: unknown) {
        // Network blip — keep polling
        console.warn('Poll error:', e);
      }
    };

    doPoll();
    pollRef.current = setInterval(doPoll, POLL_INTERVAL_MS);
  }, [startTimer, setError]);

  const reset = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    setState(INITIAL_STATE);
  }, []);

  // Cleanup
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  return {
    state,
    analyzeWebUsb,
    analyzePaste,
    analyzeJobId,
    reset,
  };
}
