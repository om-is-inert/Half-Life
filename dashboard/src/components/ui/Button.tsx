import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

interface ButtonProps {
  variant?: 'primary' | 'accent' | 'ghost' | 'danger' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  style?: React.CSSProperties;
  'aria-label'?: string;
  'aria-expanded'?: boolean;
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-[var(--color-text-1)] text-[var(--color-bg)] hover:bg-white font-semibold',
  accent:
    'bg-transparent border border-[var(--color-text-1)] text-[var(--color-text-1)] hover:bg-[var(--color-glass)]',
  ghost:
    'bg-transparent border border-[var(--color-glass-border)] text-[var(--color-text-2)] hover:bg-[var(--color-glass)] hover:text-[var(--color-text-1)]',
  danger:
    'bg-[var(--color-text-1)] text-[var(--color-bg)] hover:bg-white',
  secondary:
    'bg-[var(--color-glass)] border border-[var(--color-glass-border)] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]',
};

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-4 text-base',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', isLoading, children, className, disabled, type = 'button', onClick, style, ...aria },
    ref
  ) => (
    <motion.button
      ref={ref}
      type={type}
      onClick={onClick}
      style={style}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', damping: 24, stiffness: 200 }}
      className={cn(
        'relative inline-flex items-center justify-center gap-2 rounded-lg',
        'transition-all duration-150 cursor-pointer select-none',
        'disabled:opacity-35 disabled:cursor-not-allowed disabled:pointer-events-none',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      disabled={disabled || isLoading}
      {...aria}
    >
      {isLoading && (
        <span
          className="w-4 h-4 border-2 rounded-full animate-spin"
          style={{ borderColor: 'rgba(0,0,0,0.25)', borderTopColor: '#000' }}
          aria-hidden
        />
      )}
      {children}
    </motion.button>
  )
);
Button.displayName = 'Button';
