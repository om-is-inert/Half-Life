// All TypeScript interfaces for the Half-Life dashboard

// ── Connection method ──────────────────────────────────────────────────────────
export type ConnectionMethod = 'webusb' | 'paste' | 'job_id';

// ── Analysis states (richer than old job polling) ─────────────────────────────
export type AnalysisStatus =
  | 'IDLE'
  | 'CONNECTING'
  | 'READING'
  | 'ANALYSING'
  | 'COMPLETE'
  | 'FAILED';

// Keep for backwards-compat with existing status-loader component
export type JobStatus = 'PENDING' | 'PROCESSING' | 'FORMATTING' | 'COMPLETE' | 'FAILED';

export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

export type RootCause =
  | 'rogue_process'
  | 'battery_degradation'
  | 'thermal_throttling'
  | 'memory_leak'
  | 'kernel_panic'
  | 'insufficient_data'
  | 'normal'
  | 'unknown';

export type RecommendedAction =
  | 'force_stop_package'
  | 'disable_package'
  | 'replace_battery'
  | 'factory_reset'
  | 'clear_cache'
  | 'update_firmware'
  | 'none';

// ── Ranked offender entries (deterministic, not LLM-guessed) ─────────────────
export interface WakelockEntry {
  package: string;
  duration_ms: number;
  duration_label: string;   // e.g. "14h 22m"
}

export interface CpuEntry {
  package: string;
  total_pct: number;
  user_pct: number;
  kernel_pct: number;
}

// ── Main diagnosis report ──────────────────────────────────────────────────────
export interface DiagnosisReport {
  jobId: string;
  device_id: string;
  created_at: string;       // ISO 8601
  completed_at: string;     // ISO 8601
  connection_method: ConnectionMethod;

  // Battery health (exact arithmetic, not LLM estimate)
  battery_health_pct: number | null;
  design_capacity_mah: number | null;
  estimated_capacity_mah: number | null;
  battery_level_pct: number | null;       // current charge level
  battery_temp_celsius: number | null;
  battery_voltage_mv: number | null;

  // Severity & root cause (rule-based thresholds)
  severity: SeverityLevel;
  root_cause: RootCause;

  // Top offenders (ranked lists)
  wakelock_top5: WakelockEntry[];
  cpu_top5: CpuEntry[];

  // Legacy boolean aliases (used by existing CulpritCard)
  offending_package: string | null;
  wakelock_offender: boolean | null;
  cpu_offender: boolean | null;

  // Event counters
  crash_count_24h: number | null;
  thermal_events: number;

  // Diagnosis (template-generated, deterministic — no LLM)
  diagnosis_summary: string;
  recommended_action: RecommendedAction;
  action_label: string;
  adb_command: string | null;

  // Evidence (verbatim log lines, not hallucinated)
  evidence_snippets: string[];

  // Payload metadata
  payload_size: number;     // bytes sent to Lambda
  error?: string;
}

// ── Analysis state (drives UI flow) ──────────────────────────────────────────
export interface AnalysisState {
  status: AnalysisStatus;
  stepLabel: string;
  report: DiagnosisReport | null;
  elapsedSeconds: number;
  error: string | null;
}

// ── WebUSB device session ─────────────────────────────────────────────────────
export interface DeviceSession {
  serial: string;
  model: string;
  manufacturer: string;
}

// ── Raw diagnostics payload sent to Lambda ────────────────────────────────────
export interface DiagnosticsPayload {
  device_id: string;
  battery_raw: string;
  batterystats_raw: string;
  cpuinfo_raw: string;
  thermal_raw: string;
  connection_method: ConnectionMethod;
  collection_status?: {
    battery: string;
    batterystats: string;
    cpuinfo: string;
    thermal: string;
  };
}

export interface AdbRunResult {
  stdout: string;
  stderr: string;
  success: boolean;
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
}

