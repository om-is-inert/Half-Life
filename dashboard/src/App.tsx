import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnalysis } from './hooks/useAnalysis';
import { DeviceConnector } from './components/DeviceConnector';
import { StatusLoader } from './components/dashboard/StatusLoader';
import { MetricCards } from './components/dashboard/MetricCards';
import { CulpritCard } from './components/dashboard/CulpritCard';
import { DiagnosisCard } from './components/dashboard/DiagnosisCard';
import { FixCard } from './components/dashboard/FixCard';
import { EvidenceCard } from './components/dashboard/EvidenceCard';
import { DeviceInfo } from './components/dashboard/DeviceInfo';
import { Navbar } from './components/layout/Navbar';
import { BackgroundOrbs } from './components/layout/BackgroundOrbs';
import { Footer } from './components/layout/Footer';
import Grainient from './components/ui/Grainient';
import { formatDate } from './lib/utils';
import type { DeviceSession } from './types/dashboard';

export default function App() {
  const { state, analyzeWebUsb, analyzePaste, analyzeJobId, reset } = useAnalysis();
  const [connectedDevice, setConnectedDevice] = useState<DeviceSession | null>(null);

  const { status, report, elapsedSeconds } = state;

  // Map new AnalysisStatus to the StatusLoader's expected JobStatus
  const statusForLoader = ((): 'PENDING' | 'PROCESSING' | 'FORMATTING' | 'COMPLETE' | 'FAILED' => {
    if (status === 'IDLE' || status === 'CONNECTING') return 'PENDING';
    if (status === 'READING')    return 'PROCESSING';
    if (status === 'ANALYSING')  return 'FORMATTING';
    if (status === 'COMPLETE')   return 'COMPLETE';
    return 'FAILED';
  })();

  const isHomePage = status === 'IDLE';
  const isWorking  = status === 'READING' || status === 'ANALYSING' || status === 'CONNECTING';
  const isLoading  = isWorking;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleDeviceConnected = async (session: DeviceSession) => {
    setConnectedDevice(session);
    await analyzeWebUsb(session);
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-text-1)] relative">
      <BackgroundOrbs />

      {/* Navbar */}
      <Navbar
        isOnline
        deviceId={connectedDevice?.serial ?? report?.device_id}
        jobId={report?.jobId}
        timestamp={report ? formatDate(report.created_at) : undefined}
      />

      {/* Scrollable body */}
      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col items-center relative">

        {/* Grainient hero on home */}
        {isHomePage && (
          <div
            className="pointer-events-none absolute top-0 left-0 w-full overflow-hidden"
            style={{ width: '100%', height: '600px', position: 'absolute', zIndex: 0 }}
          >
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
          {/* ── Home: Device Connector ─────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {isHomePage && (
              <motion.div
                key="connector"
                className="w-full max-w-lg flex flex-col items-center my-auto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                <DeviceConnector
                  analysisStatus={status}
                  onDeviceConnected={handleDeviceConnected}
                  onPasteSubmit={analyzePaste}
                  onJobId={analyzeJobId}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Status Loader ─────────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {isLoading && (
              <motion.div
                key="loader"
                className="w-full max-w-2xl my-auto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <StatusLoader
                  status={statusForLoader}
                  jobId={connectedDevice?.serial ?? ''}
                  elapsedSeconds={elapsedSeconds}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Error / Failed ─────────────────────────────────────────────── */}
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
                <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text-1)' }}>
                  Analysis Failed
                </h2>
                <p className="text-sm max-w-sm" style={{ color: 'var(--color-text-2)' }}>
                  {state.error ?? 'An unknown error occurred.'}
                </p>
                <button
                  onClick={reset}
                  className="px-5 py-2.5 rounded-lg glass-card text-sm font-semibold transition-all duration-150"
                  style={{ color: 'var(--color-text-1)', border: '1px solid var(--color-glass-border)' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-text-3)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-glass-border)')}
                >
                  ↩ Try Again
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Full Report ───────────────────────────────────────────────── */}
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
                  <FixCard report={report} />
                  <EvidenceCard report={report} />
                </div>

                <DeviceInfo report={report} />

                <div className="flex justify-center pt-4">
                  <button
                    onClick={reset}
                    className="text-xs font-mono transition-colors duration-150"
                    style={{ color: 'var(--color-text-3)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-2)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-3)')}
                  >
                    ↩ Analyse another device
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <Footer className={isHomePage ? 'absolute bottom-0 w-full border-t border-[var(--color-glass-border)]/40' : 'mt-20'} />
      </div>
    </div>
  );
}
