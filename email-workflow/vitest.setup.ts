import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock server-only module to allow server component imports in tests
vi.mock('server-only', () => ({}));

// Mock scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn();
