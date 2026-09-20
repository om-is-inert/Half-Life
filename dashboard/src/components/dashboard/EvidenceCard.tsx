import React from 'react';
import { motion } from 'framer-motion';
import { CodeBlock } from '../ui/CodeBlock';
import type { DiagnosisReport } from '../../types/dashboard';

interface EvidenceCardProps {
  report: DiagnosisReport;
}

const ACCENT_COLORS = [
  'hsla(0,0%,100%,0.30)',
  'hsla(0,0%,100%,0.18)',
  'hsla(0,0%,100%,0.10)',
];

export const EvidenceCard: React.FC<EvidenceCardProps> = ({ report }) => {
  if (!report.evidence_snippets?.length) return null;

  return (
    <motion.div
      className="glass-card p-12 sm:p-14 lg:p-16 flex flex-col gap-8 h-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 200, delay: 0.25 }}
    >
      <h3
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: '#ffffff' }}
      >
        Evidence from Logs
      </h3>

      <div className="flex flex-col gap-6">
        {report.evidence_snippets.slice(0, 3).map((snippet, i) => (
          <CodeBlock
            key={i}
            code={snippet}
            accentLeft
            accentColor={ACCENT_COLORS[i]}
          />
        ))}
      </div>
    </motion.div>
  );
};
