import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { CodeBlock } from '../ui/CodeBlock';

interface FixModalProps {
  isOpen: boolean;
  onClose: () => void;
  adbCommand: string;
  onConfirm: () => Promise<void>;
}

export const FixModal: React.FC<FixModalProps> = ({ isOpen, onClose, adbCommand, onConfirm }) => {
  const [isRunning, setIsRunning] = useState(false);

  const handleConfirm = async () => {
    setIsRunning(true);
    try {
      await onConfirm();
    } finally {
      setIsRunning(false);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-6 p-2 sm:p-3">
        {/* Warning heading */}
        <div className="flex items-center gap-3.5">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}
          >
            <AlertTriangle size={18} style={{ color: 'var(--color-text-2)' }} />
          </div>
          <div>
            <h2
              className="text-base font-bold"
              style={{ color: 'var(--color-text-1)' }}
            >
              Run ADB Command?
            </h2>
            <p
              className="text-xs mt-0.5"
              style={{ color: 'var(--color-text-3)' }}
            >
              This will execute directly on the connected device.
            </p>
          </div>
        </div>

        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
          The following ADB command will be sent via the Half-Life API. Ensure your device is
          connected and USB debugging is enabled before proceeding.
        </p>

        <CodeBlock code={adbCommand} />

        <div className="flex gap-3.5 justify-end pt-2">
          <Button variant="secondary" size="md" onClick={onClose} disabled={isRunning} className="px-6 py-3">
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            isLoading={isRunning}
            onClick={handleConfirm}
            className="px-7 py-3"
          >
            {isRunning ? 'Running…' : 'Yes, Run It'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
