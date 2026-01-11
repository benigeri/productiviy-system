'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { ComposeModal } from './ComposeModal';

export function ComposeFAB() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 z-40 size-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition flex items-center justify-center"
        aria-label="Compose new email"
      >
        <Pencil className="size-6" />
      </button>

      <ComposeModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
