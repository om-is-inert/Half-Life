import React from 'react';
import { motion } from 'framer-motion';
import type { JobStatus } from '../../types/dashboard';
import { STATUS_LABELS, STATUS_STEPS } from '../../config/tokens';
import { cn } from '../../lib/utils';

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
      className="flex flex-col items-center gap-10 py-16"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', damping: 28, stiffness: 180 }}
    >
      {/* Dual-ring spinner — monochrome */}
      <div className="relative w-14 h-14">
        <div
          className="absolute inset-0 rounded-full border"
          style={{ borderColor: 'var(--color-glass-border)' }}
        />
        <div
          className="absolute inset-0 rounded-full border-2 animate-spin"
          style={{
            borderColor: 'transparent',
            borderTopColor: 'var(--color-text-1)',
            animationDuration: '0.9s',
          }}
        />
        <div
          className="absolute inset-2 rounded-full border animate-spin"
          style={{
            borderColor: 'transparent',
            borderTopColor: 'var(--color-text-3)',
            animationDuration: '1.5s',
            animationDirection: 'reverse',
          }}
        />
      </div>

      {/* Status text */}
      <div className="text-center flex flex-col gap-1.5">
        <p
          className="text-lg font-semibold"
          style={{ color: 'var(--color-text-1)' }}
        >
          {STATUS_LABELS[status]}
        </p>
        {jobId && (
          <p
            className="truncate max-w-xs mx-auto"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-text-3)' }}
          >
            {jobId}
          </p>
        )}
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-3)' }}>
          {elapsedSeconds}s elapsed
        </p>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-0">
        {STATUS_STEPS.map((step, i) => {
          const stepIdx   = STEP_ORDER.indexOf(step.key as JobStatus);
          const isDone    = stepIdx < currentStep;
          const isActive  = stepIdx === currentStep;
          const isPending = stepIdx > currentStep;

          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center gap-2">
                {/* Step dot */}
                <motion.div
                  className="w-7 h-7 rounded-full border flex items-center justify-center text-[11px] font-bold"
                  style={{
                    background: isDone
                      ? 'var(--color-text-1)'
                      : isActive
                      ? 'var(--color-glass)'
                      : 'transparent',
                    borderColor: isDone
                      ? 'var(--color-text-1)'
                      : isActive
                      ? 'var(--color-text-2)'
                      : 'var(--color-glass-border)',
                    color: isDone
                      ? 'var(--color-bg)'
                      : isActive
                      ? 'var(--color-text-1)'
                      : 'var(--color-text-3)',
                  }}
                  animate={isActive ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  {isDone ? '✓' : i + 1}
                </motion.div>
                {/* Label */}
                <span
                  className="text-[10px] font-medium uppercase tracking-wide"
                  style={{
                    color: isDone
                      ? 'var(--color-text-2)'
                      : isActive
                      ? 'var(--color-text-1)'
                      : 'var(--color-text-3)',
                  }}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector */}
              {i < STATUS_STEPS.length - 1 && (
                <div
                  className="h-px w-10 mb-6 mx-1 transition-all duration-700"
                  style={{
                    background: isDone
                      ? 'var(--color-text-3)'
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
