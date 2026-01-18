import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getLabelDrafted,
  getLabelRespond,
  validateGmailLabels,
} from './gmail-labels';

describe('gmail-labels', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars before each test
    delete process.env.GMAIL_LABEL_DRAFTED;
    delete process.env.GMAIL_LABEL_RESPOND;
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

  describe('getLabelRespond', () => {
    it('returns the label ID when GMAIL_LABEL_RESPOND is set', () => {
      process.env.GMAIL_LABEL_RESPOND = 'Label_139';
      expect(getLabelRespond()).toBe('Label_139');
    });

    it('throws when GMAIL_LABEL_RESPOND is not set', () => {
      expect(() => getLabelRespond()).toThrow(
        'GMAIL_LABEL_RESPOND environment variable is required'
      );
    });

    it('throws when GMAIL_LABEL_RESPOND is empty string', () => {
      process.env.GMAIL_LABEL_RESPOND = '';
      expect(() => getLabelRespond()).toThrow(
        'GMAIL_LABEL_RESPOND environment variable is required'
      );
    });
  });

  describe('validateGmailLabels', () => {
    it('succeeds when all required labels are set', () => {
      process.env.GMAIL_LABEL_DRAFTED = 'Label_215';
      process.env.GMAIL_LABEL_RESPOND = 'Label_139';
      expect(() => validateGmailLabels()).not.toThrow();
    });

    it('throws when GMAIL_LABEL_DRAFTED is missing', () => {
      process.env.GMAIL_LABEL_RESPOND = 'Label_139';
      expect(() => validateGmailLabels()).toThrow(
        'GMAIL_LABEL_DRAFTED environment variable is required'
      );
    });

    it('throws when GMAIL_LABEL_RESPOND is missing', () => {
      process.env.GMAIL_LABEL_DRAFTED = 'Label_215';
      expect(() => validateGmailLabels()).toThrow(
        'GMAIL_LABEL_RESPOND environment variable is required'
      );
    });

    it('throws when both labels are missing', () => {
      expect(() => validateGmailLabels()).toThrow(
        'GMAIL_LABEL_DRAFTED environment variable is required'
      );
    });
  });
});
