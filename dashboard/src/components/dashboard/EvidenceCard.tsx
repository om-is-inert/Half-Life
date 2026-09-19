import React from 'react';
import { motion } from 'framer-motion';
import { CodeBlock } from '../ui/CodeBlock';
import type { DiagnosisReport } from '../../types/dashboard';

interface EvidenceCardProps {
  report: DiagnosisReport;
}

// Monochrome accent steps: bright → mid → dim
const ACCENT_COLORS = [
  'hsla(0,0%,100%,0.30)',
  'hsla(0,0%,100%,0.18)',
  'hsla(0,0%,100%,0.10)',
];

export const EvidenceCard: React.FC<EvidenceCardProps> = ({ report }) => {
  if (!report.evidence_snippets?.length) return null;

  return (
    <motion.div
      className="glass-card p-6 flex flex-col gap-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 200, delay: 0.25 }}
    >
      <h3
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: 'var(--color-text-3)' }}
      >
        Evidence from Logs
      </h3>

      <div className="flex flex-col gap-3">
        {report.evidence_snippets.slice(0, 3).map((snippet, i) => (
          <CodeBlock
            key={i}
            code={snippet}
            accentLeft
            accentColor={ACCENT_COLORS[i]}
            className="text-[0.76rem]"
          />
        ))}
      </div>
    </motion.div>
  );
};
