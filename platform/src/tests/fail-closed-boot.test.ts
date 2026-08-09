import { describe, it, expect } from 'vitest';
import { assertQueueHealth } from '../lib/queue/boot-check';

describe('Fail-Closed Queue Boot Guard (F0)', () => {
  it('fails closed and throws in production if REDIS_URL is missing', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalRedisUrl = process.env.REDIS_URL;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.REDIS_URL;

      expect(() => assertQueueHealth()).toThrow(
        /Production boot failed: Redis connection required for BullMQ queue in production/
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.REDIS_URL = originalRedisUrl;
    }
  });

  it('allows in-memory fallback in development / test mode with warning', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalRedisUrl = process.env.REDIS_URL;

    try {
      process.env.NODE_ENV = 'test';
      delete process.env.REDIS_URL;

      expect(() => assertQueueHealth()).not.toThrow();
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.REDIS_URL = originalRedisUrl;
    }
  });
});
