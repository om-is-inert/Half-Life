import React from 'react';
import { Zap } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';

interface NavbarProps {
  deviceId?: string;
  jobId?: string;
  timestamp?: string;
  isOnline: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ deviceId, jobId, timestamp, isOnline }) => (
  <header
    className={cn(
      'w-full h-16 shrink-0 z-50',
      'border-b border-[var(--color-glass-border)]',
    )}
    style={{ background: 'var(--color-bg)' }}
  >
    <div className="w-full max-w-5xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
      {/* Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ border: '1px solid var(--color-glass-border)', background: 'var(--color-glass)' }}
        >
          <Zap size={13} style={{ color: 'var(--color-text-1)' }} />
        </div>
        <span
          className="text-sm font-bold tracking-tight"
          style={{ color: 'var(--color-text-1)', fontFamily: 'var(--font-sans)' }}
        >
          Half<span style={{ color: 'var(--color-text-3)' }}>Life</span>
        </span>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-2.5 overflow-hidden">
        {/* API status */}
        <Badge
          dot
          dotColor={isOnline ? 'var(--color-success)' : 'var(--color-error)'}
          className="hidden sm:inline-flex"
          style={{
            color: 'var(--color-text-3)',
            background: 'var(--color-glass)',
            border: '1px solid var(--color-glass-border)',
            fontSize: '0.7rem',
          }}
        >
          {isOnline ? 'Online' : 'Offline'}
        </Badge>

        {/* Device chip */}
        {deviceId && (
          <Badge
            className="hidden md:inline-flex"
            style={{
              color: 'var(--color-text-3)',
              background: 'var(--color-glass)',
              border: '1px solid var(--color-glass-border)',
              fontSize: '0.7rem',
            }}
          >
            {deviceId}
          </Badge>
        )}

        {/* Job ID — monospace */}
        {jobId && (
          <span
            className="hidden lg:block truncate max-w-[180px]"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-3)' }}
          >
            {jobId}
          </span>
        )}

        {/* Timestamp */}
        {timestamp && (
          <span
            className="hidden xl:block"
            style={{ fontSize: '0.7rem', color: 'var(--color-text-3)' }}
          >
            {timestamp}
          </span>
        )}
      </div>
    </div>
  </header>
);
