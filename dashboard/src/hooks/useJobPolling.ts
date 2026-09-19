import { useState, useEffect, useRef, useCallback } from 'react';
import type { JobStatus, JobPollState, DiagnosisReport } from '../types/dashboard';
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from '../config/tokens';

// ── Mock data simulating a complete diagnosis ────────────────────────────────
const MOCK_REPORT: DiagnosisReport = {
  jobId: 'a3f7c291-84e2-4b19-9d6f-c3b2e1f08a45',
  device_id: 'emulator-5554',
  created_at: '2026-09-18T07:44:00Z',
  completed_at: '2026-09-18T07:44:58Z',
  battery_health_pct: 74,
  severity: 'HIGH',
  root_cause: 'rogue_process',
  confidence: 0.92,
  offending_package: 'com.facebook.services',
  wakelock_offender: true,
  cpu_offender: true,
  crash_count_24h: 412,
  thermal_events: 7,
  diagnosis_summary:
    'The device is experiencing severe battery drain and thermal throttling caused by the com.facebook.services background process. This service has acquired 14 persistent wakelocks and crashed 412 times in the past 24 hours, preventing the CPU from entering low-power states. Battery hardware health remains at 74%, indicating moderate degradation but not yet at replacement threshold. Immediate action is to force-disable the offending package via ADB.',
  recommended_action: 'force_disable_package',
  action_label: 'Force Disable com.facebook.services',
  adb_command: 'adb shell pm disable-user --user 0 com.facebook.services',
  evidence_snippets: [
    '09-18 07:43:11.321  1204  1204 E AndroidRuntime: FATAL EXCEPTION: main\n  Process: com.facebook.services, PID: 1204\n  java.lang.OutOfMemoryError: Failed to allocate a 524288 byte allocation',
    '09-18 07:43:29.105   842   842 W BatteryStatsService: Wakelock "com.facebook.services:wakelock" held for 18340ms (pid 1204)',
    '09-18 07:43:45.877   512   512 W ThermalService: Temperature=88°C exceeds threshold=85°C — CPU throttled to 600MHz',
  ],
  raw_size: 12_582_912, // 12 MB
  chunk_count: 4,
};

// Simulate status transitions: PENDING → PROCESSING → FORMATTING → COMPLETE
const STATUS_SEQUENCE: JobStatus[] = ['PENDING', 'PROCESSING', 'FORMATTING', 'COMPLETE'];

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
  const stepRef    = useRef<number>(0);
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
    stepRef.current  = 0;
    startRef.current = Date.now();

    setState({
      status: 'PENDING',
      report: null,
      elapsedSeconds: 0,
      isPolling: true,
      error: null,
    });

    // Elapsed timer — updates every second
    timerRef.current = setInterval(() => {
      setState(s => ({ ...s, elapsedSeconds: Math.floor((Date.now() - startRef.current) / 1000) }));
    }, 1000);

    // Simulate status advancing every ~3s
    pollRef.current = setInterval(() => {
      stepRef.current += 1;

      if (Date.now() - startRef.current > POLL_TIMEOUT_MS) {
        cleanup();
        setState(s => ({ ...s, isPolling: false, status: 'FAILED', error: 'Polling timed out.' }));
        return;
      }

      const nextStatus = STATUS_SEQUENCE[Math.min(stepRef.current, STATUS_SEQUENCE.length - 1)];

      if (nextStatus === 'COMPLETE') {
        cleanup();
        setState(s => ({
          ...s,
          status: 'COMPLETE',
          isPolling: false,
          report: { ...MOCK_REPORT, jobId },
        }));
      } else {
        setState(s => ({ ...s, status: nextStatus }));
      }
    }, POLL_INTERVAL_MS);
  }, [cleanup]);

  const retry = useCallback(() => {
    if (jobIdRef.current) startPolling(jobIdRef.current);
  }, [startPolling]);

  // Cleanup on unmount
  useEffect(() => () => cleanup(), [cleanup]);

  return { state, startPolling, retry };
}

