import React from 'react';
import { cn } from '../../lib/utils';

interface CodeBlockProps {
  code: string;
  className?: string;
  accentLeft?: boolean;
  accentColor?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  className,
  accentLeft = false,
  accentColor = 'var(--color-text-3)',
}) => (
  <pre
    className={cn(
      'font-mono text-[0.82rem] leading-relaxed p-4 sm:p-5 rounded-xl overflow-x-auto',
      accentLeft && 'border-l-2',
      className,
    )}
    style={{
      background: 'hsla(0,0%,0%,0.55)',
      color: 'var(--color-text-1)',
      border: '1px solid var(--color-glass-border)',
      ...(accentLeft ? { borderLeftColor: accentColor, borderLeftWidth: '2px' } : {}),
    }}
  >
    <code>{code}</code>
  </pre>
);
