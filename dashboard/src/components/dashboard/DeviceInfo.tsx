import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Copy, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import type { DiagnosisReport } from '../../types/dashboard';
import { formatDate } from '../../lib/utils';

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
  ];

  return (
    <motion.div
      className="glass-card overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 200, delay: 0.3 }}
    >
      {/* Toggle header */}
      <button
        className="w-full flex items-center justify-between p-6 text-left cursor-pointer transition-colors duration-150"
        onClick={() => setIsOpen(v => !v)}
        aria-expanded={isOpen}
        style={{ background: 'transparent' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-glass-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-text-3)' }}
        >
          Device Info
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 200 }}
        >
          <ChevronDown size={15} style={{ color: 'var(--color-text-3)' }} />
        </motion.div>
      </button>

      {/* Drawer */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 220 }}
            className="overflow-hidden"
          >
            <div
              className="px-6 pb-6 flex flex-col gap-4"
              style={{ borderTop: '1px solid var(--color-glass-border)' }}
            >
              <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {rows.map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-1">
                    <span
                      className="text-[10px] uppercase tracking-widest"
                      style={{ color: 'var(--color-text-3)' }}
                    >
                      {label}
                    </span>
                    <span
                      className="text-xs truncate"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-2)' }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyJobId}
                className="self-start gap-1.5"
              >
                {copied
                  ? <Check size={12} style={{ color: 'var(--color-text-1)' }} />
                  : <Copy size={12} />
                }
                {copied ? 'Copied ✓' : 'Copy Job ID'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
