import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, Play } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { CodeBlock } from '../ui/CodeBlock';
import type { DiagnosisReport, AdbRunResult } from '../../types/dashboard';

interface FixCardProps {
  report: DiagnosisReport;
  onRunFix: () => void;
}

export const FixCard: React.FC<FixCardProps> = ({ report, onRunFix }) => {
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<AdbRunResult | null>(null);
  const [isRunning] = useState(false);

  const handleCopy = async () => {
    if (!report.adb_command) return;
    await navigator.clipboard.writeText(report.adb_command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      className="glass-card p-12 sm:p-14 lg:p-16 flex flex-col gap-8 h-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 200, delay: 0.2 }}
    >
      <div className="flex items-center justify-between">
        <h3
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: '#ffffff' }}
        >
          Recommended Fix
        </h3>
        <Badge
          style={{
            background: 'var(--color-glass)',
            border: '1px solid var(--color-glass-border)',
            color: 'var(--color-text-1)',
            fontSize: '0.72rem',
            padding: '6px 14px',
          }}
        >
          ADB Command
        </Badge>
      </div>

      <div className="relative group">
        <CodeBlock code={report.adb_command || '# No fix command available'} />
        <button
          onClick={handleCopy}
          title="Copy command"
          className="absolute top-3.5 right-3.5 p-3 rounded-lg glass-card text-xs transition-colors duration-150 cursor-pointer"
          style={{ color: 'var(--color-text-2)', border: '1px solid var(--color-glass-border)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-1)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-2)')}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>

      <div className="flex items-center gap-4 pt-1">
        <Button
          variant="primary"
          size="md"
          onClick={onRunFix}
          isLoading={isRunning}
          disabled={!report.adb_command}
          className="gap-3 rounded-xl px-8 py-4"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
        >
          <Play size={14} fill="currentColor" />
          Run via ADB
        </Button>
      </div>

      {result && (
        <motion.div
          className="rounded-xl p-6 text-xs"
          style={{
            fontFamily: 'var(--font-mono)',
            background: 'var(--color-glass)',
            border: '1px solid var(--color-glass-border)',
            color: result.success ? 'var(--color-text-1)' : 'var(--color-text-2)',
          }}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
        >
          <p className="font-semibold text-sm">{result.success ? 'Success' : 'Execution Failed'}</p>
          <p className="mt-2 opacity-80 leading-relaxed">{result.output}</p>
        </motion.div>
      )}
    </motion.div>
  );
};
