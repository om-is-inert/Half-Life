import React from 'react';
import { motion } from 'framer-motion';
import { Package } from 'lucide-react';
import { Badge } from '../ui/Badge';
import type { DiagnosisReport } from '../../types/dashboard';

interface CulpritCardProps {
  report: DiagnosisReport;
}

export const CulpritCard: React.FC<CulpritCardProps> = ({ report }) => {
  const { offending_package, wakelock_offender, cpu_offender, crash_count_24h } = report;
  const hasCulprit = offending_package || wakelock_offender || cpu_offender;

  return (
    <motion.div
      className="glass-card p-12 sm:p-14 lg:p-16 flex flex-col gap-8 h-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 200, delay: 0.1 }}
    >
      <h3
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: '#ffffff' }}
      >
        Identified Culprit
      </h3>

      {hasCulprit ? (
        <div className="flex items-start gap-6 py-2">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: 'var(--color-glass)',
              border: '1px solid var(--color-glass-border)',
            }}
          >
            <Package size={22} style={{ color: 'var(--color-text-1)' }} />
          </div>

          <div className="flex flex-col gap-4 min-w-0">
            <span
              className="text-base font-semibold truncate"
              style={{ fontFamily: 'var(--font-mono)', color: '#ffffff' }}
            >
              {offending_package ?? 'None detected'}
            </span>

            <div className="flex flex-wrap gap-3">
              {wakelock_offender && (
                <Badge
                  style={{
                    color: 'var(--color-text-1)',
                    background: 'var(--color-glass)',
                    border: '1px solid var(--color-glass-border)',
                    fontSize: '0.72rem',
                    padding: '6px 14px',
                  }}
                >
                  ⚡ Wakelock Drain
                </Badge>
              )}
              {cpu_offender && (
                <Badge
                  style={{
                    color: 'var(--color-text-1)',
                    background: 'var(--color-glass)',
                    border: '1px solid var(--color-glass-border)',
                    fontSize: '0.72rem',
                    padding: '6px 14px',
                  }}
                >
                  🔥 High CPU
                </Badge>
              )}
              {(crash_count_24h ?? 0) > 0 && (
                <Badge
                  style={{
                    color: 'var(--color-text-1)',
                    background: 'var(--color-glass)',
                    border: '1px solid var(--color-glass-border)',
                    fontSize: '0.72rem',
                    padding: '6px 14px',
                  }}
                >
                  💥 Recurring Crash
                </Badge>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 py-3">
          <span className="text-2xl">✅</span>
          <span className="text-base leading-relaxed" style={{ color: 'var(--color-text-1)' }}>
            No dominant package offender found. System resources appear balanced.
          </span>
        </div>
      )}
    </motion.div>
  );
};
