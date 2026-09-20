import Beams from './components/Beams';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { useJobPolling } from './hooks/useJobPolling';
import { JobLookup } from './components/dashboard/JobLookup';
import { StatusLoader } from './components/dashboard/StatusLoader';
import { MetricCards } from './components/dashboard/MetricCards';
import { CulpritCard } from './components/dashboard/CulpritCard';
import { DiagnosisCard } from './components/dashboard/DiagnosisCard';
import { FixCard } from './components/dashboard/FixCard';
import { FixModal } from './components/dashboard/FixModal';
import { EvidenceCard } from './components/dashboard/EvidenceCard';
import { DeviceInfo } from './components/dashboard/DeviceInfo';
import { Footer } from './components/layout/Footer';
import { formatDate } from './lib/utils';

export default function App() {
  const { state, startPolling, retry } = useJobPolling();
  const [modalOpen, setModalOpen] = useState(false);

  const { status, report, elapsedSeconds, isPolling } = state;

  const handleAdbConfirm = async () => {
    await new Promise(r => setTimeout(r, 1800));
  };

  const isHomePage = !isPolling && status === 'PENDING' && !report;
  const isCenteredLayout = isHomePage || isPolling || status === 'FAILED';

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-text-1)] relative">
      {/* Background Beams */}
      <div
        className="fixed inset-0 w-full h-full pointer-events-none overflow-hidden z-0 opacity-20"
        style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0, zIndex: 0 }}
        aria-hidden
      >
        <Beams
          beamWidth={2}
          beamHeight={15}
          beamNumber={12}
          lightColor="#ffffff"
          speed={2}
          noiseIntensity={1.75}
          scale={0.2}
          rotation={0}
        />
      </div>

      {/* Home Page Logo */}
      <AnimatePresence>
        {isHomePage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-8 left-8 sm:top-12 sm:left-12 z-50 pointer-events-none flex items-center gap-3"
          >
            <img src="/logo.png" alt="HalfLife Logo" className="w-8 h-8 sm:w-10 sm:h-10 object-contain opacity-90" />
            <span className="font-bold text-lg tracking-wide" style={{ color: 'var(--color-text-1)' }}>Half Life</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main container */}
      <div
        className={`w-full flex flex-col items-center relative ${
          isCenteredLayout
            ? 'h-full flex-1 justify-center overflow-y-auto overflow-x-hidden'
            : 'flex-1 overflow-y-auto overflow-x-hidden'
        }`}
      >
        <main
          className={`w-full flex flex-col items-center relative z-10 ${
            isCenteredLayout
              ? 'h-full flex-1 justify-center py-0 px-4 sm:px-6'
              : 'py-14 sm:py-20 px-6 sm:px-10 lg:px-12'
          }`}
        >
          {/* Job Lookup Hero */}
          <AnimatePresence mode="wait">
            {isHomePage && (
              <motion.div
                key="lookup"
                className="w-full max-w-xl flex flex-col items-center justify-center my-auto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                <JobLookup onSubmit={startPolling} isLoading={false} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status Loader - Center aligned vertically and horizontally */}
          <AnimatePresence mode="wait">
            {isPolling && (
              <motion.div
                key="loader"
                className="w-full max-w-2xl flex flex-col items-center justify-center my-auto py-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <StatusLoader
                  status={status}
                  jobId={state.report?.jobId ?? ''}
                  elapsedSeconds={elapsedSeconds}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error / Failed State */}
          <AnimatePresence mode="wait">
            {status === 'FAILED' && (
              <motion.div
                key="error"
                className="w-full max-w-2xl my-auto flex flex-col items-center justify-center gap-7 py-16 px-8 sm:px-12 text-center"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 200 }}
              >
                <AlertCircle size={48} className="text-[var(--color-text-2)]" />
                <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text-1)' }}>
                  Diagnosis Failed
                </h2>
                <p className="text-sm max-w-sm" style={{ color: 'var(--color-text-2)' }}>
                  {state.error ?? 'An unknown error occurred during processing.'}
                </p>
                <p className="text-xs font-mono" style={{ color: 'var(--color-text-3)' }}>
                  Check CloudWatch logs for Lambda errors
                </p>
                <div className="flex gap-4 mt-2">
                  <button
                    onClick={retry}
                    className="px-6 py-3 border border-[var(--color-glass-border)] text-[var(--color-text-1)] text-sm font-semibold transition-all duration-150 hover:border-[var(--color-text-3)]"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-3 border border-[var(--color-glass-border)] text-[var(--color-text-1)] text-sm font-semibold transition-all duration-150 hover:border-[var(--color-text-3)]"
                  >
                    Home
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Full Diagnosis Report */}
          <AnimatePresence>
            {status === 'COMPLETE' && report && (
              <motion.div
                key="report"
                className="w-full max-w-5xl flex flex-col gap-10 pb-20 pt-4"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 180 }}
              >
                {/* Metric Cards Row */}
                <MetricCards report={report} />

                {/* Second Row: Culprit + AI Diagnosis */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <CulpritCard report={report} />
                  <DiagnosisCard report={report} />
                </div>

                {/* Third Row: Fix + Evidence */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <FixCard report={report} onRunFix={() => setModalOpen(true)} />
                  <EvidenceCard report={report} />
                </div>

                {/* Fourth Row: Device & Diagnostic Metadata */}
                <DeviceInfo report={report} />

                {/* CTA Buttons */}
                <div className="flex justify-center gap-4 pt-8">
                  <button
                    onClick={() => startPolling(report.jobId)}
                    className="text-xs font-mono transition-colors duration-150 py-3 px-6 border border-[var(--color-glass-border)] text-[var(--color-text-3)] hover:text-[var(--color-text-1)] uppercase tracking-widest"
                  >
                    Re-run diagnosis
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="text-xs font-mono transition-colors duration-150 py-3 px-6 border border-[var(--color-glass-border)] text-[var(--color-text-3)] hover:text-[var(--color-text-1)] uppercase tracking-widest"
                  >
                    Return to home
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <Footer className={isCenteredLayout ? 'absolute bottom-0 w-full border-t border-[var(--color-glass-border)]/40' : 'mt-16'} />
      </div>

      {/* ADB Confirmation Modal */}
      <FixModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        adbCommand={report?.adb_command ?? ''}
        onConfirm={handleAdbConfirm}
      />
    </div>
  );
}
