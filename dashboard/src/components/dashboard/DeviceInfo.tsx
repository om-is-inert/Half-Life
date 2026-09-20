import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Copy, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import type { DiagnosisReport } from '../../types/dashboard';
import { bytesToMB, formatDate } from '../../lib/utils';

interface DeviceInfoProps {
  report: DiagnosisReport;
}

export const DeviceInfo: React.FC<DeviceInfoProps> = ({ report }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyJobId = async () => {
    await navigator.clipboard.writeText(report.jobId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const rows: [string, string][] = [
    ['Device Serial', report.device_id],
    ['Job ID',        report.jobId],
    ['Completed At',  formatDate(report.completed_at)],
    ['Raw Log Size',  bytesToMB(report.raw_size)],
    ['Chunk Count',   String(report.chunk_count)],
  ];

  return (
    <motion.div
      className="glass-card overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 200, delay: 0.3 }}
    >
      <button
        className="w-full flex items-center justify-between p-12 sm:p-14 lg:p-16 text-left cursor-pointer transition-colors duration-150"
        onClick={() => setIsOpen(v => !v)}
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: '#ffffff' }}
        >
          Device &amp; Diagnostics Metadata
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ color: 'var(--color-text-2)' }}
        >
          <ChevronDown size={18} />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div
              className="px-12 sm:px-14 lg:px-16 pb-12 sm:pb-14 lg:pb-16 pt-6 border-t flex flex-col gap-6"
              style={{ borderColor: 'var(--color-glass-border)' }}
            >
              {rows.map(([label, val]) => (
                <div key={label} className="flex justify-between items-center text-xs py-3.5 border-b border-[var(--color-glass-border)]/30 last:border-b-0">
                  <span style={{ color: 'var(--color-text-2)' }}>{label}</span>
                  <div className="flex items-center gap-3">
                    <span style={{ fontFamily: 'var(--font-mono)', color: '#ffffff' }}>
                      {val}
                    </span>
                    {label === 'Job ID' && (
                      <button
                        onClick={handleCopyJobId}
                        title="Copy Job ID"
                        className="p-2 rounded-lg text-xs transition-colors duration-150 cursor-pointer"
                        style={{ color: 'var(--color-text-2)', background: 'var(--color-glass)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-1)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-2)')}
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <div className="pt-4">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => window.print()}
                  className="rounded-xl px-8 py-4"
                  style={{ fontSize: '0.8rem' }}
                >
                  Print Report
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
