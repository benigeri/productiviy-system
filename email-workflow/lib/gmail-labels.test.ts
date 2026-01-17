import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getLabelDrafted,
  getLabelToRespondPaul,
  validateGmailLabels,
} from './gmail-labels';

describe('gmail-labels', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars before each test
    delete process.env.GMAIL_LABEL_DRAFTED;
    delete process.env.GMAIL_LABEL_TO_RESPOND_PAUL;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('getLabelDrafted', () => {
    it('returns the label ID when GMAIL_LABEL_DRAFTED is set', () => {
      process.env.GMAIL_LABEL_DRAFTED = 'Label_215';
      expect(getLabelDrafted()).toBe('Label_215');
    });

    it('throws when GMAIL_LABEL_DRAFTED is not set', () => {
      expect(() => getLabelDrafted()).toThrow(
        'GMAIL_LABEL_DRAFTED environment variable is required'
      );
    });

    it('throws when GMAIL_LABEL_DRAFTED is empty string', () => {
      process.env.GMAIL_LABEL_DRAFTED = '';
      expect(() => getLabelDrafted()).toThrow(
        'GMAIL_LABEL_DRAFTED environment variable is required'
      );
    });
  });

  describe('getLabelToRespondPaul', () => {
    it('returns the label ID when GMAIL_LABEL_TO_RESPOND_PAUL is set', () => {
      process.env.GMAIL_LABEL_TO_RESPOND_PAUL = 'Label_139';
      expect(getLabelToRespondPaul()).toBe('Label_139');
    });

    it('throws when GMAIL_LABEL_TO_RESPOND_PAUL is not set', () => {
      expect(() => getLabelToRespondPaul()).toThrow(
        'GMAIL_LABEL_TO_RESPOND_PAUL environment variable is required'
      );
    });

    it('throws when GMAIL_LABEL_TO_RESPOND_PAUL is empty string', () => {
      process.env.GMAIL_LABEL_TO_RESPOND_PAUL = '';
      expect(() => getLabelToRespondPaul()).toThrow(
        'GMAIL_LABEL_TO_RESPOND_PAUL environment variable is required'
      );
    });
  });

  describe('validateGmailLabels', () => {
    it('succeeds when all required labels are set', () => {
      process.env.GMAIL_LABEL_DRAFTED = 'Label_215';
      process.env.GMAIL_LABEL_TO_RESPOND_PAUL = 'Label_139';
      expect(() => validateGmailLabels()).not.toThrow();
    });

    it('throws when GMAIL_LABEL_DRAFTED is missing', () => {
      process.env.GMAIL_LABEL_TO_RESPOND_PAUL = 'Label_139';
      expect(() => validateGmailLabels()).toThrow(
        'GMAIL_LABEL_DRAFTED environment variable is required'
      );
    });

    it('throws when GMAIL_LABEL_TO_RESPOND_PAUL is missing', () => {
      process.env.GMAIL_LABEL_DRAFTED = 'Label_215';
      expect(() => validateGmailLabels()).toThrow(
        'GMAIL_LABEL_TO_RESPOND_PAUL environment variable is required'
      );
    });

    it('throws when both labels are missing', () => {
      expect(() => validateGmailLabels()).toThrow(
        'GMAIL_LABEL_DRAFTED environment variable is required'
      );
    });
  });
});
