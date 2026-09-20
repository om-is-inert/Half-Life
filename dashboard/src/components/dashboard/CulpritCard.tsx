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
      className="pb-10 lg:pr-10 border-b lg:border-b-0 lg:border-r border-[var(--color-glass-border)] flex flex-col gap-8 h-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 200, delay: 0.1 }}
    >
      <h3
        className="w-full text-[11px] font-mono font-semibold uppercase tracking-widest text-[var(--color-text-2)]"
      >
        05 IDENTIFIED CULPRIT
      </h3>

      {hasCulprit ? (
        <div className="flex items-start gap-6 py-2">
          <div
            className="w-14 h-14 rounded-none flex items-center justify-center shrink-0 border border-[var(--color-glass-border)]"
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

            <div className="flex flex-wrap gap-2 mt-1 text-xs font-mono text-[var(--color-text-2)]">
              {wakelock_offender && <span className="border border-[var(--color-glass-border)] px-2 py-1">Wakelock</span>}
              {cpu_offender && <span className="border border-[var(--color-glass-border)] px-2 py-1">High CPU</span>}
              {(crash_count_24h ?? 0) > 0 && <span className="border border-[var(--color-glass-border)] px-2 py-1">Crash</span>}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 py-3">
          <span className="text-base leading-relaxed" style={{ color: 'var(--color-text-1)' }}>
            No dominant package offender found. System resources appear balanced.
          </span>
        </div>
      )}
    </motion.div>
  );
};
