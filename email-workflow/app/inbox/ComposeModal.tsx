'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { ComposeForm } from './ComposeForm';
import { Button } from '@/components/ui/button';

export function ComposeModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose}>
      <div
        className="fixed inset-4 md:inset-20 bg-card rounded-lg overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          onClick={onClose}
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4"
          aria-label="Close compose modal"
        >
          <X className="size-5" />
        </Button>

        <ComposeForm onClose={onClose} />
      </div>
    </div>
  );
}
