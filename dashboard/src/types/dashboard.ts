// All TypeScript interfaces for the Half-Life dashboard

export type JobStatus = 'PENDING' | 'PROCESSING' | 'FORMATTING' | 'COMPLETE' | 'FAILED';

export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RootCause =
  | 'rogue_process'
  | 'battery_degradation'
  | 'thermal_throttling'
  | 'memory_leak'
  | 'kernel_panic'
  | 'unknown';

export type RecommendedAction =
  | 'force_disable_package'
  | 'replace_battery'
  | 'factory_reset'
  | 'clear_cache'
  | 'update_firmware'
  | 'none';

export interface DiagnosisReport {
  jobId: string;
  device_id: string;
  created_at: string;       // ISO 8601
  completed_at: string;     // ISO 8601

  // Core metrics
  battery_health_pct: number | null;
  severity: SeverityLevel;
  root_cause: RootCause;
  confidence: number;       // 0.0–1.0

  // Culprit
  offending_package: string | null;
  wakelock_offender: boolean | null;
  cpu_offender: boolean | null;

  // Event counters
  crash_count_24h: number | null;
  thermal_events: number | null;

  // AI output
  diagnosis_summary: string;
  recommended_action: RecommendedAction;
  action_label: string;
  adb_command: string | null;
  evidence_snippets: string[];

  // Raw metadata
  raw_size: number;         // bytes
  chunk_count: number;
  error?: string;
}

export interface JobPollState {
  status: JobStatus;
  report: DiagnosisReport | null;
  elapsedSeconds: number;
  isPolling: boolean;
  error: string | null;
}

export interface AdbRunResult {
  stdout: string;
  stderr: string;
  success: boolean;
  output?: string;
}

