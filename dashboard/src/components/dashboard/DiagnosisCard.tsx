import React from 'react';
import { motion } from 'framer-motion';
import type { DiagnosisReport } from '../../types/dashboard';

interface DiagnosisCardProps {
  report: DiagnosisReport;
}

export const DiagnosisCard: React.FC<DiagnosisCardProps> = ({ report }) => (
  <motion.div
    className="glass-card p-12 sm:p-14 lg:p-16 flex flex-col gap-8 h-full"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ type: 'spring', damping: 28, stiffness: 200, delay: 0.15 }}
  >
    <h3
      className="text-[10px] font-semibold uppercase tracking-widest"
      style={{ color: '#ffffff' }}
    >
      AI Diagnosis
    </h3>

    <p
      className="text-base leading-relaxed flex-1 py-1.5"
      style={{ color: 'var(--color-text-1)', lineHeight: '1.9' }}
    >
      {report.diagnosis_summary || 'No diagnosis available.'}
    </p>

    <p
      className="text-[11px] pt-4 border-t border-[var(--color-glass-border)]/40"
      style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-2)' }}
    >
      {(report.diagnosis_summary || '').length} chars &middot;{' '}
      {(report.diagnosis_summary || '').split(/[.!?]+/).filter(Boolean).length} sentences
    </p>
  </motion.div>
);
