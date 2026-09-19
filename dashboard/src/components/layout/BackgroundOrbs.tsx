import React from 'react';

export const BackgroundOrbs: React.FC = () => (
  <div
    className="fixed inset-0 pointer-events-none overflow-hidden z-0"
    aria-hidden
  >
    {/* Dot-grid texture overlay */}
    <div className="absolute inset-0 dot-grid opacity-25" />

    {/* Subtle corner vignette */}
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(ellipse 90% 70% at 50% 0%, transparent 60%, hsl(0,0%,4%) 100%)',
      }}
    />
  </div>
);
