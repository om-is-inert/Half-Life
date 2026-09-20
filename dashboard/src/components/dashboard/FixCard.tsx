import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, Play } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { CodeBlock } from '../ui/CodeBlock';
import type { DiagnosisReport } from '../../types/dashboard';

interface FixCardProps {
  report: DiagnosisReport;
}

export const FixCard: React.FC<FixCardProps> = ({ report }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!report.adb_command) return;
    await navigator.clipboard.writeText(report.adb_command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      className="glass-card p-6 flex flex-col gap-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 200, delay: 0.2 }}
    >
      {/* Heading row */}
      <div className="flex items-center justify-between">
        <h3
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-text-3)' }}
        >
          Recommended Fix
        </h3>
        <Badge
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.66rem',
            color: 'var(--color-text-3)',
            background: 'transparent',
            border: '1px solid var(--color-glass-border)',
          }}
        >
          {report.recommended_action}
        </Badge>
      </div>

      <p
        className="text-sm font-semibold"
        style={{ color: 'var(--color-text-1)' }}
      >
        {report.action_label}
      </p>

      {report.adb_command ? (
        <>
          <p className="text-xs" style={{ color: 'var(--color-text-3)' }}>
            This command must be run manually in your terminal. Please review it carefully before execution.
          </p>
          <CodeBlock code={report.adb_command} />

          <div className="flex gap-2">
            {/* Copy */}
            <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1.5">
              <motion.span
                key={copied ? 'check' : 'copy'}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 20, stiffness: 260 }}
              >
                {copied
                  ? <Check size={13} style={{ color: 'var(--color-text-1)' }} />
                  : <Copy size={13} />
                }
              </motion.span>
              {copied ? 'Copied ✓' : 'Copy'}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm" style={{ color: 'var(--color-text-3)' }}>
          No ADB fix available for this issue.
        </p>
      )}
    </motion.div>
  );
};
