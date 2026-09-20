import type { JobStatus, SeverityLevel, RootCause, RecommendedAction } from '../types/dashboard';

// ── Status display mapping ──────────────────────────────────────────────────
export const STATUS_LABELS: Record<JobStatus, string> = {
  PENDING:    'Waiting for log to arrive…',
  PROCESSING: 'Cleaning and analysing log…',
  FORMATTING: 'Generating report…',
  COMPLETE:   'Diagnosis ready',
  FAILED:     'Diagnosis failed',
};

export const STATUS_STEPS = [
  { key: 'PENDING',    label: 'Upload' },
  { key: 'PROCESSING', label: 'Processing' },
  { key: 'FORMATTING', label: 'Diagnosing' },
  { key: 'COMPLETE',  label: 'Done' },
] as const;

// ── Severity tokens (grayscale) ──────────────────────────────────────────────
export const SEVERITY_CONFIG: Record<SeverityLevel, {
  color: string;
  bg: string;
  border: string;
  label: string;
}> = {
  LOW:      { color: 'var(--color-success)',  bg: 'var(--color-success-bg)',  border: 'var(--color-success-border)',  label: 'Low' },
  MEDIUM:   { color: 'var(--color-warning)',  bg: 'var(--color-warning-bg)',  border: 'var(--color-warning-border)',  label: 'Medium' },
  HIGH:     { color: 'var(--color-error)',    bg: 'var(--color-error-bg)',    border: 'var(--color-error-border)',    label: 'High' },
  CRITICAL: { color: 'var(--color-critical)', bg: 'var(--color-critical-bg)', border: 'var(--color-critical-border)', label: 'Critical' },
};

// ── Battery health thresholds ───────────────────────────────────────────────
export const BATTERY_THRESHOLDS = {
  HEALTHY:   80,
  DEGRADING: 60,
} as const;

export const getBatteryColor = (pct: number | null): string => {
  if (pct === null) return 'var(--color-text-3)';
  if (pct >= BATTERY_THRESHOLDS.HEALTHY) return 'var(--color-success)';
  if (pct >= BATTERY_THRESHOLDS.DEGRADING) return 'var(--color-warning)';
  return 'var(--color-error)';
};

export const getBatteryLabel = (pct: number | null): string => {
  if (pct === null) return 'Insufficient data';
  if (pct >= BATTERY_THRESHOLDS.HEALTHY) return 'Healthy';
  if (pct >= BATTERY_THRESHOLDS.DEGRADING) return 'Degrading';
  return 'Replace Battery';
};

// ── Root cause labels ────────────────────────────────────────────────────────
export const ROOT_CAUSE_LABELS: Record<RootCause, string> = {
  rogue_process:       'Rogue Process',
  battery_degradation: 'Battery Degradation',
  thermal_throttling:  'Thermal Throttling',
  memory_leak:         'Memory Leak',
  storage_full:        'Storage Full',
  memory_pressure:     'Memory Exhausted',
  app_crash_loop:      'App Crash Loop',
  kernel_panic:        'Kernel Panic',
  normal:              'Normal',
  insufficient_data:   'Insufficient Data',
  unknown:             'Unknown',
};

// ── Recommended action labels ────────────────────────────────────────────────
export const ACTION_LABELS: Record<RecommendedAction, string> = {
  force_disable_package: 'Force Disable Package',
  replace_battery:       'Replace Battery',
  factory_reset:         'Factory Reset',
  clear_cache:           'Clear App Cache',
  update_firmware:       'Update Firmware',
  none:                  'No Action Required',
};

// ── Polling config ───────────────────────────────────────────────────────────
export const POLL_INTERVAL_MS = 3000;
export const POLL_TIMEOUT_MS  = 120_000;
