/**
 * parser.ts — Client-side pre-parser for Android diagnostics
 *
 * Trims raw dumpsys output (~100KB) down to the ~20 key fields
 * before sending the compact JSON payload to Lambda (~2-5 KB).
 *
 * All parsing is deterministic regex/string matching — no LLM involved.
 */

import type { DiagnosticsPayload } from '../types/dashboard';

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractInt(pattern: RegExp, text: string): number | null {
  const m = text.match(pattern);
  return m ? parseInt(m[1], 10) : null;
}

function extractFloat(pattern: RegExp, text: string): number | null {
  const m = text.match(pattern);
  return m ? parseFloat(m[1]) : null;
}

// ── Battery basic info ────────────────────────────────────────────────────────
export interface BatteryBasic {
  level: number | null;
  voltage_mv: number | null;
  temperature_celsius: number | null;
  health_code: number | null;   // 2=good, 3=overheat, 4=dead, 5=overvoltage
  health_label: string;
}

const HEALTH_LABELS: Record<number, string> = {
  1: 'Unknown', 2: 'Good', 3: 'Overheat',
  4: 'Dead', 5: 'Over Voltage', 6: 'Failure', 7: 'Cold',
};

export function parseBatteryBasic(raw: string): BatteryBasic {
  const health_code = extractInt(/^\s*health:\s*(\d+)/m, raw);
  return {
    level:               extractInt(/^\s*level:\s*(\d+)/m, raw),
    voltage_mv:          extractInt(/^\s*voltage:\s*(\d+)/m, raw),
    // Temperature is in tenths of a degree C
    temperature_celsius: (() => {
      const t = extractInt(/^\s*temperature:\s*(\d+)/m, raw);
      return t !== null ? t / 10 : null;
    })(),
    health_code,
    health_label: health_code !== null ? (HEALTH_LABELS[health_code] ?? 'Unknown') : 'Unknown',
  };
}

// ── Battery capacity (wear estimation) ────────────────────────────────────────
export interface BatteryCapacity {
  estimated_mah: number | null;
  design_mah: number | null;
  wear_pct: number | null;
}

export function parseCapacity(batterystats: string): BatteryCapacity {
  const estimated = extractInt(/Estimated battery capacity:\s+(\d+)\s*mAh/i, batterystats);
  const design    = extractInt(/Design battery capacity:\s+(\d+)\s*mAh/i,    batterystats);
  const wear_pct  = (estimated !== null && design !== null && design > 0)
    ? Math.round((estimated / design) * 100)
    : null;
  return { estimated_mah: estimated, design_mah: design, wear_pct };
}

// ── Wakelock top-5 ────────────────────────────────────────────────────────────
export interface ParsedWakelock {
  package: string;
  duration_ms: number;
  duration_label: string;
}

function msToLabel(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function parseWakelocks(batterystats: string): ParsedWakelock[] {
  const results: ParsedWakelock[] = [];
  // Match lines like: "  Wakelock com.foo.bar: 14h 32m 3s realtime"
  // or the detailed wakelock table lines
  const pattern = /Wakelock\s+([\w./:]+):\s+(\d+)d?\s*(\d+)h?\s*(\d+)m?\s*(\d+)s?.*?realtime/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(batterystats)) !== null) {
    const pkg = m[1];
    const days = parseInt(m[2] || '0', 10);
    const hours = parseInt(m[3] || '0', 10);
    const mins = parseInt(m[4] || '0', 10);
    const secs = parseInt(m[5] || '0', 10);
    const duration_ms = ((days * 24 + hours) * 3600 + mins * 60 + secs) * 1000;
    if (duration_ms > 0 && !pkg.includes('TOTAL')) {
      results.push({ package: pkg, duration_ms, duration_label: msToLabel(duration_ms) });
    }
  }
  return results
    .sort((a, b) => b.duration_ms - a.duration_ms)
    .slice(0, 5);
}

// ── CPU top-5 ─────────────────────────────────────────────────────────────────
export interface ParsedCpu {
  package: string;
  total_pct: number;
  user_pct: number;
  kernel_pct: number;
}

export function parseCpu(cpuinfo: string): ParsedCpu[] {
  const results: ParsedCpu[] = [];
  // Lines like: "  38% com.facebook.katana: 29% user + 9% kernel"
  const pattern = /^\s*(\d+)%\s+([\w./: ]+?):\s*(\d+)%\s+user\s+\+\s+(\d+)%\s+kernel/gm;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(cpuinfo)) !== null) {
    const pkg = m[2].trim();
    if (pkg === 'TOTAL' || pkg.length === 0) continue;
    results.push({
      package:    pkg,
      total_pct:  parseInt(m[1], 10),
      user_pct:   parseInt(m[3], 10),
      kernel_pct: parseInt(m[4], 10),
    });
  }
  return results
    .sort((a, b) => b.total_pct - a.total_pct)
    .slice(0, 5);
}

// ── Thermal events ────────────────────────────────────────────────────────────
export function parseThermalEvents(thermal: string): number {
  // Count throttling-related lines
  const matches = thermal.match(
    /throttl|critical temperature|emergency shutdown|IsThrottling:\s*true/gi,
  );
  return matches ? matches.length : 0;
}

// ── Full pre-parse summary (what gets logged for debugging) ───────────────────
export interface ParseSummary {
  battery: BatteryBasic;
  capacity: BatteryCapacity;
  wakelocks: ParsedWakelock[];
  cpu: ParsedCpu[];
  thermal_events: number;
  payload_size: number;
}

export function preparse(payload: DiagnosticsPayload): ParseSummary {
  const battery = parseBatteryBasic(payload.battery_raw);
  const capacity = parseCapacity(payload.batterystats_raw);
  const wakelocks = parseWakelocks(payload.batterystats_raw);
  const cpu = parseCpu(payload.cpuinfo_raw);
  const thermal_events = parseThermalEvents(payload.thermal_raw);

  const payloadStr = JSON.stringify(payload);
  return {
    battery,
    capacity,
    wakelocks,
    cpu,
    thermal_events,
    payload_size: new TextEncoder().encode(payloadStr).length,
  };
}
