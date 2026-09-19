import React from 'react';
import { motion } from 'framer-motion';
import type { DiagnosisReport } from '../../types/dashboard';
import {
  getBatteryColor,
  getBatteryLabel,
  SEVERITY_CONFIG,
} from '../../config/tokens';

interface MetricCardsProps {
  report: DiagnosisReport;
}

// ── Battery Arc Gauge ─────────────────────────────────────────────────────────
const ARC_R            = 54;
const ARC_CX           = 70;
const ARC_CY           = 70;
const ARC_CIRCUMFERENCE = Math.PI * ARC_R;

function BatteryGauge({ pct }: { pct: number | null }) {
  const color      = getBatteryColor(pct);
  const label      = getBatteryLabel(pct);
  const dashOffset = pct === null
    ? ARC_CIRCUMFERENCE
    : ARC_CIRCUMFERENCE * (1 - pct / 100);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="140" height="90" viewBox="0 0 140 90" role="img" aria-label={`Battery health: ${pct ?? 'unknown'}%`}>
        {/* Track */}
        <path
          d={`M ${ARC_CX - ARC_R} ${ARC_CY} A ${ARC_R} ${ARC_R} 0 0 1 ${ARC_CX + ARC_R} ${ARC_CY}`}
          fill="none"
          stroke="hsla(0,0%,100%,0.07)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {/* Fill arc */}
        <path
          d={`M ${ARC_CX - ARC_R} ${ARC_CY} A ${ARC_R} ${ARC_R} 0 0 1 ${ARC_CX + ARC_R} ${ARC_CY}`}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={ARC_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 1.2s ease-in-out, stroke 0.4s ease' }}
        />
        {/* Value */}
        <text
          x={ARC_CX}
          y={ARC_CY - 6}
          textAnchor="middle"
          fontSize="22"
          fontWeight="800"
          fontFamily="Inter, sans-serif"
          fill={color}
        >
          {pct !== null ? `${pct}%` : '—'}
        </text>
      </svg>
      <span
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Severity Badge ────────────────────────────────────────────────────────────
function SeverityBadge({ report }: { report: DiagnosisReport }) {
  const cfg = SEVERITY_CONFIG[report.severity];
  return (
    <div className="flex flex-col items-center gap-3">
      <motion.div
        className="px-6 py-2 rounded-full text-xl font-extrabold border tracking-wide"
        style={{
          color: cfg.color,
          background: cfg.bg,
          borderColor: cfg.border,
        }}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 220, delay: 0.1 }}
      >
        {cfg.label.toUpperCase()}
      </motion.div>
      <span
        className="text-[10px] uppercase tracking-widest text-center"
        style={{ color: 'var(--color-text-3)' }}
      >
        {report.root_cause.replace(/_/g, ' ')}
      </span>
    </div>
  );
}

// ── Confidence Bar ────────────────────────────────────────────────────────────
function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  return (
    <div className="w-full flex flex-col gap-3">
      <div className="flex justify-between items-baseline">
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-text-3)' }}
        >
          AI Confidence
        </span>
        <span
          className="text-2xl font-extrabold"
          style={{ color: 'var(--color-text-1)' }}
        >
          {pct}%
        </span>
      </div>
      {/* Track */}
      <div
        className="h-1.5 w-full rounded-full overflow-hidden"
        style={{ background: 'hsla(0,0%,100%,0.07)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'var(--color-text-1)' }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.1, ease: 'easeInOut', delay: 0.15 }}
        />
      </div>
    </div>
  );
}

// ── Event Counters ────────────────────────────────────────────────────────────
function EventCounters({ report }: { report: DiagnosisReport }) {
  return (
    <div className="flex items-center justify-around w-full gap-4">
      <div className="flex flex-col items-center gap-1.5">
        <motion.span
          className="text-4xl font-extrabold"
          style={{ color: 'var(--color-text-1)' }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {report.crash_count_24h ?? '—'}
        </motion.span>
        <span
          className="text-[10px] uppercase tracking-widest"
          style={{ color: 'var(--color-text-3)' }}
        >
          Crashes / 24h
        </span>
      </div>

      <div className="w-px h-10" style={{ background: 'var(--color-glass-border)' }} />

      <div className="flex flex-col items-center gap-1.5">
        <motion.span
          className="text-4xl font-extrabold"
          style={{ color: 'var(--color-text-2)' }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {report.thermal_events ?? '—'}
        </motion.span>
        <span
          className="text-[10px] uppercase tracking-widest"
          style={{ color: 'var(--color-text-3)' }}
        >
          Thermal Events
        </span>
      </div>
    </div>
  );
}

// ── MetricCards orchestrator ──────────────────────────────────────────────────
export const MetricCards: React.FC<MetricCardsProps> = ({ report }) => {
  const cards = [
    { title: 'Battery Health', content: <BatteryGauge pct={report.battery_health_pct} /> },
    { title: 'Severity',       content: <SeverityBadge report={report} /> },
    { title: 'Confidence',     content: <ConfidenceBar confidence={report.confidence} /> },
    { title: 'Events',         content: <EventCounters report={report} /> },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.title}
          className="glass-card p-6 flex flex-col items-center gap-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 200, delay: i * 0.06 }}
        >
          <h3
            className="w-full text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-text-3)' }}
          >
            {card.title}
          </h3>
          {card.content}
        </motion.div>
      ))}
    </div>
  );
};
