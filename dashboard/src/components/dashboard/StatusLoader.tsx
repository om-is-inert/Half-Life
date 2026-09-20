import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import type { JobStatus } from '../../types/dashboard';
import { STATUS_LABELS, STATUS_STEPS } from '../../config/tokens';

interface StatusLoaderProps {
  status: JobStatus;
  jobId: string;
  elapsedSeconds: number;
}

const STEP_ORDER: JobStatus[] = ['PENDING', 'PROCESSING', 'FORMATTING', 'COMPLETE'];

export const StatusLoader: React.FC<StatusLoaderProps> = ({ status, jobId, elapsedSeconds }) => {
  const currentStep = STEP_ORDER.indexOf(status);

  return (
    <motion.div
      className="flex flex-col items-center justify-center text-center gap-10 w-full"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', damping: 28, stiffness: 180 }}
    >
      {/* Dual-ring spinner */}
      <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
        <div
          className="absolute inset-0 rounded-full border"
          style={{ borderColor: 'var(--color-glass-border)' }}
        />
        <div
          className="absolute inset-0 rounded-full border-2 animate-spin"
          style={{
            borderColor: 'transparent',
            borderTopColor: '#ffffff',
            animationDuration: '0.9s',
          }}
        />
        <div
          className="absolute inset-2 rounded-full border animate-spin"
          style={{
            borderColor: 'transparent',
            borderTopColor: 'var(--color-text-2)',
            animationDuration: '1.5s',
            animationDirection: 'reverse',
          }}
        />
      </div>

      {/* Status text */}
      <div className="text-center flex flex-col items-center justify-center gap-2">
        <p
          className="text-xl font-bold tracking-tight"
          style={{ color: '#ffffff' }}
        >
          {STATUS_LABELS[status]}
        </p>
        {jobId && (
          <div
            className="inline-flex items-center justify-center px-3 py-1 rounded-md text-xs font-mono"
            style={{
              background: 'hsla(0, 0%, 0%, 0.4)',
              border: '1px solid var(--color-glass-border)',
              color: 'var(--color-text-2)',
            }}
          >
            <code>{jobId}</code>
          </div>
        )}
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-3)', fontFamily: 'var(--font-mono)' }}>
          {elapsedSeconds}s elapsed
        </p>
      </div>

      {/* Step progress */}
      <div className="flex items-center justify-center gap-0 w-full max-w-lg mx-auto">
        {STATUS_STEPS.map((step, i) => {
          const stepIdx   = STEP_ORDER.indexOf(step.key as JobStatus);
          const isDone    = stepIdx < currentStep;
          const isActive  = stepIdx === currentStep;

          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center justify-center text-center gap-2.5">
                {/* Step dot */}
                <motion.div
                  className="w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold"
                  style={{
                    background: isDone
                      ? '#ffffff'
                      : isActive
                      ? 'var(--color-glass)'
                      : 'transparent',
                    borderColor: isDone
                      ? '#ffffff'
                      : isActive
                      ? '#ffffff'
                      : 'var(--color-glass-border)',
                    color: isDone
                      ? 'var(--color-bg)'
                      : isActive
                      ? '#ffffff'
                      : 'var(--color-text-3)',
                  }}
                  animate={isActive ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  {isDone ? <Check size={14} strokeWidth={3} /> : i + 1}
                </motion.div>
                {/* Label */}
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider text-center"
                  style={{
                    color: isDone
                      ? '#ffffff'
                      : isActive
                      ? '#ffffff'
                      : 'var(--color-text-3)',
                  }}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector */}
              {i < STATUS_STEPS.length - 1 && (
                <div
                  className="h-px w-8 sm:w-12 mb-7 mx-1.5 transition-all duration-700 shrink-0"
                  style={{
                    background: isDone
                      ? '#ffffff'
                      : 'var(--color-glass-border)',
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </motion.div>
  );
};
