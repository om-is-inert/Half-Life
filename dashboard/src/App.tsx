import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { Navbar } from './components/layout/Navbar';
import { BackgroundOrbs } from './components/layout/BackgroundOrbs';
import { Footer } from './components/layout/Footer';
import Grainient from './components/ui/Grainient';
import { formatDate } from './lib/utils';

export default function App() {
  const { state, startPolling, retry } = useJobPolling();
  const [modalOpen, setModalOpen] = useState(false);

  const { status, report, elapsedSeconds, isPolling } = state;

  const handleAdbConfirm = async () => {
    await new Promise(r => setTimeout(r, 1800));
  };

  const isHomePage = !isPolling && status === 'PENDING' && !report;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-text-1)] relative">
      <BackgroundOrbs />

      {/* Persistent top navbar */}
      <Navbar
        isOnline
        deviceId={report?.device_id}
        jobId={report?.jobId}
        timestamp={report ? formatDate(report.created_at) : undefined}
      />

      {/* Scrollable container below navbar */}
      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col items-center relative">
        {/* Background Effects on Home Page */}
        {isHomePage && (
          <div
            className="pointer-events-none absolute top-0 left-0 w-full overflow-hidden"
            style={{ width: '100%', height: '600px', position: 'absolute', zIndex: 0 }}
          >
            {/* Grainient Base Layer */}
            <div className="absolute inset-0">
              <Grainient
                color1="#1c1c1c"
                color2="#3e3e3e"
                color3="#959595"
                timeSpeed={0.9}
                colorBalance={0.1}
                warpStrength={0.95}
                warpFrequency={2.7}
                warpSpeed={1.1}
                warpAmplitude={24}
                blendAngle={0.0}
                blendSoftness={0.4}
                rotationAmount={740}
                noiseScale={1.9}
                grainAmount={0.4}
                grainScale={3}
                grainAnimated={false}
                contrast={1.25}
                gamma={0.55}
                saturation={0.4}
                centerX={0.0}
                centerY={-0.19}
                zoom={0.5}
              />
            </div>
          </div>
        )}

        <main
          className={`w-full flex-1 flex flex-col items-center relative z-10 ${
            isHomePage
              ? 'min-h-[calc(100vh-4rem)] justify-center py-0 px-4 sm:px-6'
              : 'py-8 px-4 sm:px-6 lg:px-8'
          }`}
        >
          {/* Job Lookup Hero - Vertically centered on Home Page */}
          <AnimatePresence mode="wait">
            {isHomePage && (
              <motion.div
                key="lookup"
                className="w-full max-w-xl flex flex-col items-center my-auto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                <JobLookup onSubmit={startPolling} isLoading={false} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status Loader */}
          <AnimatePresence mode="wait">
            {isPolling && (
              <motion.div
                key="loader"
                className="w-full max-w-2xl my-auto"
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
                className="w-full max-w-2xl my-auto flex flex-col items-center gap-5 py-16 text-center"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 200 }}
              >
                <span className="text-5xl">🚨</span>
                <h2
                  className="text-2xl font-bold"
                  style={{ color: 'var(--color-text-1)' }}
                >
                  Diagnosis Failed
                </h2>
                <p
                  className="text-sm max-w-sm"
                  style={{ color: 'var(--color-text-2)' }}
                >
                  {state.error ?? 'An unknown error occurred during processing.'}
                </p>
                <p
                  className="text-xs font-mono"
                  style={{ color: 'var(--color-text-3)' }}
                >
                  Check CloudWatch logs for Lambda errors
                </p>
                <button
                  onClick={retry}
                  className="px-5 py-2.5 rounded-lg glass-card text-sm font-semibold transition-all duration-150"
                  style={{
                    color: 'var(--color-text-1)',
                    border: '1px solid var(--color-glass-border)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-text-3)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-glass-border)')}
                >
                  ↩ Retry
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Full Report */}
          <AnimatePresence>
            {status === 'COMPLETE' && report && (
              <motion.div
                key="report"
                className="w-full max-w-5xl flex flex-col gap-5 pb-10"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 180 }}
              >
                <MetricCards report={report} />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <CulpritCard report={report} />
                  <DiagnosisCard report={report} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <FixCard report={report} onRunFix={() => setModalOpen(true)} />
                  <EvidenceCard report={report} />
                </div>

                <DeviceInfo report={report} />

                <div className="flex justify-center pt-4">
                  <button
                    onClick={() => startPolling(report.jobId)}
                    className="text-xs font-mono transition-colors duration-150"
                    style={{ color: 'var(--color-text-3)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-2)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-3)')}
                  >
                    ↩ Re-run diagnosis
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <Footer className={isHomePage ? 'absolute bottom-0 w-full border-t border-[var(--color-glass-border)]/40' : 'mt-20'} />
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
