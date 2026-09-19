import React from 'react';

interface FooterProps {
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({ className = '' }) => (
  <footer className={`py-6 border-t border-[var(--color-glass-border)] text-center ${className}`}>
    <p className="text-xs text-[var(--color-text-3)]">
      <span className="font-semibold text-[var(--color-text-2)]">HalfLife</span>
      &nbsp;·&nbsp;v0.1.0&nbsp;·&nbsp;AI-Powered Android Hardware Triage
    </p>
  </footer>
);
