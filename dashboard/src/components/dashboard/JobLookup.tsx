import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import GlassSurface from '../ui/GlassSurface';

interface JobLookupProps {
  onSubmit: (jobId: string) => void;
  isLoading: boolean;
}

export const JobLookup: React.FC<JobLookupProps> = ({ onSubmit, isLoading }) => {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [btnHover, setBtnHover] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <motion.section
      className="flex flex-col items-center text-center gap-7"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 180 }}
    >
      {/* Hero heading */}
      <div className="flex flex-col gap-3">
        <h1
          className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight"
          style={{ color: 'var(--color-text-1)' }}
        >
          Stop Guessing.
          <br />
          <span
            style={{
              color: '#ffffff',
            }}
          >
            Start Diagnosing.
          </span>
        </h1>
        <p
          className="max-w-sm text-sm mx-auto"
          style={{ color: '#ebebeb', lineHeight: '1.7' }}
        >
          Paste a Job ID to retrieve the AI diagnosis for battery health, thermal events, and crash analysis.
        </p>
      </div>

      {/* Input + Button form with GlassSurface effects */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm flex flex-col gap-3.5"
      >
        {/* Input wrapped in GlassSurface */}
        <GlassSurface
          width="100%"
          height={54}
          borderRadius={14}
          displace={2.8}
          distortionScale={-150}
          redOffset={5}
          greenOffset={15}
          blueOffset={25}
          brightness={60}
          opacity={0.8}
          mixBlendMode="screen"
          className="w-full transition-all duration-200"
          style={{
            border: focused
              ? '1px solid hsla(0,0%,100%,0.6)'
              : '1px solid hsla(0,0%,100%,0.16)',
            boxShadow: focused
              ? '0 0 0 2px hsla(0,0%,100%,0.08), 0 0 20px hsla(0,0%,100%,0.08)'
              : 'none',
          }}
        >
          <div className="relative w-full h-full flex items-center justify-center">
            <input
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="paste job id"
              spellCheck={false}
              autoComplete="off"
              className="w-full h-full bg-transparent outline-none text-center px-4"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                letterSpacing: '0.02em',
                color: 'var(--color-text-1)',
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
          </div>
        </GlassSurface>

        {/* Diagnose Device CTA Button with GlassSurface */}
        <motion.button
          type="submit"
          disabled={isLoading || !value.trim()}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', damping: 24, stiffness: 200 }}
          className="w-full rounded-xl disabled:opacity-40 disabled:cursor-not-allowed outline-none"
        >
          <GlassSurface
            width="100%"
            height={52}
            borderRadius={14}
            displace={2.8}
            distortionScale={-150}
            redOffset={5}
            greenOffset={15}
            blueOffset={25}
            brightness={60}
            opacity={0.8}
            mixBlendMode="screen"
            className="w-full font-semibold transition-all duration-200 cursor-pointer"
            style={{
              border: btnHover
                ? '1px solid hsla(0,0%,100%,0.55)'
                : '1px solid hsla(0,0%,100%,0.22)',
              boxShadow: btnHover
                ? '0 0 20px hsla(0,0%,100%,0.10)'
                : 'none',
              color: 'var(--color-text-1)',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.9rem',
            }}
            onMouseEnter={() => setBtnHover(true)}
            onMouseLeave={() => setBtnHover(false)}
          >
            <div className="flex items-center justify-center gap-2 w-full h-full">
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Diagnosing…</span>
                </>
              ) : (
                <span>Diagnose Device</span>
              )}
            </div>
          </GlassSurface>
        </motion.button>

        <div className="w-full pt-2">
          <select
            className="w-full bg-transparent border border-[var(--color-glass-border)] text-[11px] text-[var(--color-text-2)] px-3 py-2 outline-none cursor-pointer uppercase tracking-widest"
            style={{ fontFamily: 'var(--font-mono)' }}
            onChange={(e) => {
              if (e.target.value) {
                setValue(e.target.value);
              }
            }}
            value=""
          >
            <option value="" disabled>Select a Demo Job ID...</option>
            <option value="83cd22b6-5f6d-457e-af9c-f101a156281a">Normal Device</option>
            <option value="04ed16c3-ff80-44dc-aabb-491861ee654c">Rogue App Drain</option>
            <option value="50ff14e3-8212-4191-897b-a171ace1fbef">Thermal Overheating</option>
            <option value="33f17ecb-2801-44ea-ae7c-771846fc01f3">Degraded Battery</option>
          </select>
        </div>
      </form>

      <div
        className="flex flex-col items-center gap-2 mt-4 text-sm"
        style={{ color: 'var(--color-text-2)' }}
      >
        <p className="font-semibold" style={{ color: 'var(--color-text-1)' }}>How to get a Job ID:</p>
        <div className="flex flex-col items-start gap-1.5 text-left">
          <p>1. Connect your Android device via USB.</p>
          <p>2. Open your terminal in the project directory.</p>
          <p>3. Run <code className="px-1.5 py-0.5 rounded bg-[hsla(0,0%,0%,0.5)] font-mono text-xs text-white border border-[var(--color-glass-border)]">python main.py</code></p>
        </div>
      </div>
    </motion.section>
  );
};
