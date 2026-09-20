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
    <div className="flex flex-col items-center gap-3.5 py-2">
      <svg width="140" height="90" viewBox="0 0 140 90" role="img" aria-label={`Battery health: ${pct ?? 'unknown'}%`}>
        <path
          d={`M ${ARC_CX - ARC_R} ${ARC_CY} A ${ARC_R} ${ARC_R} 0 0 1 ${ARC_CX + ARC_R} ${ARC_CY}`}
          fill="none"
          stroke="hsla(0,0%,100%,0.07)"
          strokeWidth="9"
          strokeLinecap="round"
        />
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
        className="text-[11px] font-semibold tracking-wider uppercase"
        style={{ color }}
      >
        {label}
      </span>
    </div>
  );
}

function SeverityBadge({ report }: { report: DiagnosisReport }) {
  const cfg = SEVERITY_CONFIG[report.severity] || {
    color: 'var(--color-text-2)',
    bg: 'var(--color-glass)',
    border: 'var(--color-glass-border)',
    label: 'Unknown'
  };

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <motion.div
        className="px-6 py-2.5 rounded-full font-bold tracking-widest uppercase flex items-center gap-2.5 text-xs"
        style={{
          color: cfg.color,
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
        }}
        initial={{ scale: 0.85 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      >
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ background: cfg.color }}
        />
        {cfg.label}
      </motion.div>

      <span
        className="text-[11px] text-center max-w-[170px] leading-relaxed"
        style={{ color: 'var(--color-text-2)' }}
      >
        {report.severity === 'CRITICAL' && 'Immediate intervention required'}
        {report.severity === 'HIGH'     && 'Performance degradation detected'}
        {(report.severity === 'MEDIUM' || report.severity === 'LOW') && 'All systems within normal bounds'}
      </span>
    </div>
  );
}

function ConfidenceBar({ confidence }: { confidence?: number }) {
  const safeConfidence = confidence ?? 1.0;
  const pct = Math.round(safeConfidence * 100);

  return (
    <div className="w-full flex flex-col items-start gap-2 py-2">
      <span className="text-3xl font-extrabold" style={{ color: '#ffffff' }}>
        {pct}%
      </span>

      <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-2)] font-mono">
        AI Confidence
      </span>

      <div className="h-1 w-full mt-2" style={{ background: 'var(--color-glass-border)' }}>
        <motion.div
          className="h-full"
          style={{ background: 'var(--color-text-1)' }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.1, ease: 'easeInOut', delay: 0.15 }}
        />
      </div>
    </div>
  );
}

function EventCounters({ report }: { report: DiagnosisReport }) {
  return (
    <div className="flex items-center justify-around w-full gap-6 py-3">
      <div className="flex flex-col items-center gap-2">
        <motion.span
          className="text-4xl font-extrabold"
          style={{ color: '#ffffff' }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {report.crash_count_24h ?? '—'}
        </motion.span>
        <span
          className="text-[10px] uppercase tracking-widest text-center"
          style={{ color: 'var(--color-text-2)' }}
        >
          Crashes / 24h
        </span>
      </div>

      <div className="w-px h-14" style={{ background: 'var(--color-glass-border)' }} />

      <div className="flex flex-col items-center gap-2">
        <motion.span
          className="text-4xl font-extrabold"
          style={{ color: 'var(--color-text-1)' }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {report.thermal_events ?? '—'}
        </motion.span>
        <span
          className="text-[10px] uppercase tracking-widest text-center"
          style={{ color: 'var(--color-text-2)' }}
        >
          Thermal Events
        </span>
      </div>
    </div>
  );
}

export const MetricCards: React.FC<MetricCardsProps> = ({ report }) => {
  const cards = [
    { title: 'Battery Health', content: <BatteryGauge pct={report.battery_health_pct} /> },
    { title: 'Severity',       content: <SeverityBadge report={report} /> },
    { title: 'Confidence',     content: <ConfidenceBar confidence={report.confidence ?? 1.0} /> },
    { title: 'Events',         content: <EventCounters report={report} /> },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 pb-10 border-b border-[var(--color-glass-border)]">
      {cards.map((card, i) => (
        <motion.div
          key={card.title}
          className="flex flex-col items-start gap-6 h-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 200, delay: i * 0.06 }}
        >
          <h3
            className="w-full text-[11px] font-mono font-semibold uppercase tracking-widest text-[var(--color-text-2)]"
          >
            0{i + 1} {card.title}
          </h3>
          <div className="w-full flex-1 flex flex-col justify-end">
            {card.content}
          </div>
        </motion.div>
      ))}
    </div>
  );
};
