/**
 * DeviceConnector.tsx — Hero component for the Half-Life home page
 *
 * Entry points:
 *   1. "Connect Android Phone" — WebUSB flow (primary)
 *   2. "Paste Log Output"      — fallback tab for non-Chromium users
 *   3. "Enter Job ID"          — returning users
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Usb, ClipboardPaste, Hash, AlertTriangle, Loader2, Smartphone } from 'lucide-react';
import { isWebUsbSupported, connectDevice } from '../lib/webadb';
import type { DeviceSession, AnalysisStatus } from '../types/dashboard';

type Tab = 'usb' | 'paste' | 'jobid';

interface DeviceConnectorProps {
  analysisStatus: AnalysisStatus;
  onDeviceConnected: (session: DeviceSession) => void;
  onPasteSubmit: (battery: string, batterystats: string, cpu: string, thermal: string) => void;
  onJobId: (jobId: string) => void;
}

// ── Tab button ────────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void;
  icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all duration-150"
      style={{
        background: active ? 'var(--color-glass)' : 'transparent',
        border: active ? '1px solid var(--color-glass-border)' : '1px solid transparent',
        color: active ? 'var(--color-text-1)' : 'var(--color-text-3)',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ── USB Tab ───────────────────────────────────────────────────────────────────
function UsbTab({ onConnected, isWorking }: {
  onConnected: (s: DeviceSession) => void;
  isWorking: boolean;
}) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = isWebUsbSupported();

  const handleConnect = async () => {
    setError(null);
    setConnecting(true);
    try {
      const session = await connectDevice();
      onConnected(session);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 py-2">
      {/* Browser warning */}
      {!supported && (
        <div
          className="w-full flex items-start gap-3 p-3 rounded-lg text-xs"
          style={{
            background: 'hsla(38, 92%, 50%, 0.1)',
            border: '1px solid hsla(38, 92%, 50%, 0.25)',
            color: 'var(--color-warning)',
          }}
        >
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>WebUSB requires Chrome or Edge. Firefox and Safari are not supported.</span>
        </div>
      )}

      {/* Device icon */}
      <motion.div
        className="w-20 h-20 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}
        animate={connecting ? { scale: [1, 1.04, 1] } : {}}
        transition={{ repeat: Infinity, duration: 1.4 }}
      >
        <Smartphone size={36} style={{ color: 'var(--color-text-2)' }} />
      </motion.div>

      {/* Instructions */}
      <ul className="text-xs space-y-1.5" style={{ color: 'var(--color-text-3)' }}>
        <li>① Enable USB Debugging on your Android phone</li>
        <li>② Connect via USB cable to this computer</li>
        <li>③ Click Connect — approve the browser prompt</li>
        <li>④ Tap "Allow" on your phone when asked</li>
      </ul>

      {/* Error */}
      {error && (
        <p className="text-xs text-center" style={{ color: 'var(--color-error)' }}>{error}</p>
      )}

      {/* Connect button */}
      <button
        onClick={handleConnect}
        disabled={connecting || isWorking || !supported}
        className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary) 0%, hsl(230, 100%, 65%) 100%)',
          color: '#fff',
          boxShadow: '0 4px 20px var(--color-primary-glow)',
        }}
        onMouseEnter={e => !connecting && (e.currentTarget.style.transform = 'translateY(-1px)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'none')}
      >
        {connecting || isWorking
          ? <Loader2 size={16} className="animate-spin" />
          : <Usb size={16} />
        }
        {connecting ? 'Connecting…' : isWorking ? 'Analysing…' : 'Connect Android Phone'}
      </button>
    </div>
  );
}

// ── Paste Tab ─────────────────────────────────────────────────────────────────
function PasteTab({ onSubmit, isWorking }: {
  onSubmit: (battery: string, batterystats: string, cpu: string, thermal: string) => void;
  isWorking: boolean;
}) {
  const [battery, setBattery] = useState('');
  const [batterystats, setBatterystats] = useState('');
  const [cpu, setCpu] = useState('');
  const [thermal, setThermal] = useState('');

  const canSubmit = battery.trim().length > 10;

  const areaStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    background: 'hsla(220,20%,5%,0.8)',
    border: '1px solid var(--color-glass-border)',
    borderRadius: '8px',
    color: 'var(--color-text-2)',
    padding: '10px 12px',
    resize: 'vertical',
    outline: 'none',
    width: '100%',
  };

  return (
    <div className="flex flex-col gap-3 py-1">
      <p className="text-xs" style={{ color: 'var(--color-text-3)' }}>
        Run these commands and paste each output below:
      </p>
      <code
        className="block text-xs p-3 rounded-lg"
        style={{ background: 'hsla(220,20%,5%,0.9)', color: 'hsl(142,71%,60%)', fontFamily: 'var(--font-mono)' }}
      >
        adb shell dumpsys battery<br/>
        adb shell dumpsys batterystats<br/>
        adb shell dumpsys cpuinfo<br/>
        adb shell dumpsys thermal_service
      </code>

      {[
        { label: '1. dumpsys battery', val: battery, set: setBattery, required: true },
        { label: '2. dumpsys batterystats', val: batterystats, set: setBatterystats, required: false },
        { label: '3. dumpsys cpuinfo', val: cpu, set: setCpu, required: false },
        { label: '4. dumpsys thermal_service', val: thermal, set: setThermal, required: false },
      ].map(({ label, val, set, required }) => (
        <div key={label} className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-3)' }}>
            {label}{required && ' *'}
          </label>
          <textarea
            rows={3}
            placeholder={`Paste ${label} output here…`}
            value={val}
            onChange={e => set(e.target.value)}
            style={areaStyle}
          />
        </div>
      ))}

      <button
        onClick={() => onSubmit(battery, batterystats, cpu, thermal)}
        disabled={!canSubmit || isWorking}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary) 0%, hsl(230,100%,65%) 100%)',
          color: '#fff',
        }}
      >
        {isWorking ? <Loader2 size={15} className="animate-spin" /> : <ClipboardPaste size={15} />}
        {isWorking ? 'Analysing…' : 'Analyse Pasted Log'}
      </button>
    </div>
  );
}

// ── Job ID Tab ─────────────────────────────────────────────────────────────────
function JobIdTab({ onSubmit, isWorking }: {
  onSubmit: (jobId: string) => void;
  isWorking: boolean;
}) {
  const [jobId, setJobId] = useState('');

  return (
    <div className="flex flex-col gap-4 py-2">
      <p className="text-xs" style={{ color: 'var(--color-text-3)' }}>
        Enter a Job ID from a previous analysis to retrieve the stored report.
      </p>
      <input
        type="text"
        placeholder="e.g. a3f7c291-84bc-4e2d-9f01-b2d84c3e7a12"
        value={jobId}
        onChange={e => setJobId(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && jobId.trim() && onSubmit(jobId.trim())}
        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-150"
        style={{
          fontFamily: 'var(--font-mono)',
          background: 'hsla(220,20%,8%,0.8)',
          border: '1px solid var(--color-glass-border)',
          color: 'var(--color-text-1)',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-glass-border)')}
      />
      <button
        onClick={() => jobId.trim() && onSubmit(jobId.trim())}
        disabled={!jobId.trim() || isWorking}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary) 0%, hsl(230,100%,65%) 100%)',
          color: '#fff',
        }}
      >
        {isWorking ? <Loader2 size={15} className="animate-spin" /> : <Hash size={15} />}
        {isWorking ? 'Fetching…' : 'Fetch Report'}
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export const DeviceConnector: React.FC<DeviceConnectorProps> = ({
  analysisStatus,
  onDeviceConnected,
  onPasteSubmit,
  onJobId,
}) => {
  const [tab, setTab] = useState<Tab>('usb');
  const isWorking = analysisStatus === 'READING' || analysisStatus === 'ANALYSING' || analysisStatus === 'CONNECTING';

  return (
    <div className="w-full max-w-lg flex flex-col gap-6">
      {/* Hero text */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
          style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}
        >
          ⚡
        </div>
        <div className="flex items-center gap-2">
          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, var(--color-text-1) 0%, var(--color-primary) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Android Hardware Triage
          </h1>
          <span
            className="px-2 py-0.5 rounded text-[10px] font-bold tracking-widest"
            style={{ background: 'var(--color-glass)', color: 'var(--color-warning)', border: '1px solid var(--color-warning)' }}
          >
            EXPERIMENTAL
          </span>
        </div>
        <p className="text-sm max-w-sm" style={{ color: 'var(--color-text-2)' }}>
          Instant battery and hardware health analysis — directly from your browser.
        </p>
      </div>

      {/* Card */}
      <div
        className="glass-card p-6 flex flex-col gap-5"
      >
        {/* Tabs */}
        <div className="flex gap-1.5">
          <TabBtn active={tab === 'usb'}    onClick={() => setTab('usb')}    icon={<Usb size={12} />}            label="Connect USB" />
          <TabBtn active={tab === 'paste'}  onClick={() => setTab('paste')}  icon={<ClipboardPaste size={12} />} label="Paste Log" />
          <TabBtn active={tab === 'jobid'}  onClick={() => setTab('jobid')}  icon={<Hash size={12} />}           label="Job ID" />
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {tab === 'usb' && (
              <UsbTab onConnected={onDeviceConnected} isWorking={isWorking} />
            )}
            {tab === 'paste' && (
              <PasteTab onSubmit={onPasteSubmit} isWorking={isWorking} />
            )}
            {tab === 'jobid' && (
              <JobIdTab onSubmit={onJobId} isWorking={isWorking} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      
      {/* Privacy Disclaimer */}
      <p className="text-[10px] text-center max-w-sm mx-auto mt-2" style={{ color: 'var(--color-text-3)' }}>
        🔒 <b>Privacy Disclaimer:</b> We only collect anonymized battery, CPU, and thermal metrics to perform this diagnosis. No personal data (photos, messages, contacts) is ever extracted or stored.
      </p>
    </div>
  );
};
