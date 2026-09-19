import React from 'react';
import { motion } from 'framer-motion';
import type { DiagnosisReport } from '../../types/dashboard';

interface DiagnosisCardProps {
  report: DiagnosisReport;
}

export const DiagnosisCard: React.FC<DiagnosisCardProps> = ({ report }) => (
  <motion.div
    className="glass-card p-6 flex flex-col gap-5"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ type: 'spring', damping: 28, stiffness: 200, delay: 0.15 }}
  >
    <h3
      className="text-[10px] font-semibold uppercase tracking-widest"
      style={{ color: 'var(--color-text-3)' }}
    >
      AI Diagnosis
    </h3>

    <p
      className="text-sm leading-relaxed flex-1"
      style={{ color: 'var(--color-text-2)' }}
    >
      {report.diagnosis_summary}
    </p>

    <p
      className="text-[10px]"
      style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-3)' }}
    >
      {report.diagnosis_summary.length} chars ·{' '}
      {report.diagnosis_summary.split(/[.!?]+/).filter(Boolean).length} sentences
    </p>
  </motion.div>
);
