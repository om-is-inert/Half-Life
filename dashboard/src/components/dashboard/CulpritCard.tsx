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
      className="glass-card p-6 flex flex-col gap-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 200, delay: 0.1 }}
    >
      <h3
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: 'var(--color-text-3)' }}
      >
        Identified Culprit
      </h3>

      {hasCulprit ? (
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: 'var(--color-glass)',
              border: '1px solid var(--color-glass-border)',
            }}
          >
            <Package size={16} style={{ color: 'var(--color-text-2)' }} />
          </div>

          {/* Info */}
          <div className="flex flex-col gap-2.5 min-w-0">
            <span
              className="text-sm font-semibold truncate"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-1)' }}
            >
              {offending_package ?? 'None detected'}
            </span>

            <div className="flex flex-wrap gap-1.5">
              {wakelock_offender && (
                <Badge
                  style={{
                    color: 'var(--color-text-2)',
                    background: 'var(--color-glass)',
                    border: '1px solid var(--color-glass-border)',
                    fontSize: '0.68rem',
                  }}
                >
                  Wakelock
                </Badge>
              )}
              {cpu_offender && (
                <Badge
                  style={{
                    color: 'var(--color-text-2)',
                    background: 'var(--color-glass)',
                    border: '1px solid var(--color-glass-border)',
                    fontSize: '0.68rem',
                  }}
                >
                  CPU Hog
                </Badge>
              )}
              {crash_count_24h !== null && (
                <Badge
                  style={{
                    color: 'var(--color-text-3)',
                    background: 'transparent',
                    border: '1px solid var(--color-glass-border)',
                    fontSize: '0.68rem',
                  }}
                >
                  {crash_count_24h} crashes
                </Badge>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-4" style={{ color: 'var(--color-text-3)' }}>
          <span className="text-2xl opacity-40">📦</span>
          <p className="text-sm">No culprit detected</p>
        </div>
      )}
    </motion.div>
  );
};
