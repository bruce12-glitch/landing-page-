import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'pan',
      'panNumber',
      'panEncrypted',
      'gstNumber',
      'authorization',
      '["x-admin-key"]',
      '*.pan',
      '*.panNumber',
      '*.gstNumber',
      'body.panNumber',
      'body.pan',
      'body.gstNumber',
      'headers.authorization',
      'headers["x-admin-key"]',
      'req.headers["x-admin-key"]',
    ],
    censor: '[REDACTED_PII]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
