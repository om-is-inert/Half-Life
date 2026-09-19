import React from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  dot?: boolean;
  dotColor?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, className, style, dot, dotColor }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide',
      className,
    )}
    style={style}
  >
    {dot && (
      <span
        className="w-1.5 h-1.5 rounded-full animate-pulse-opacity"
        style={{ backgroundColor: dotColor ?? 'var(--color-success)' }}
        aria-hidden
      />
    )}
    {children}
  </span>
);

