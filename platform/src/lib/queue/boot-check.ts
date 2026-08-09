import { logger } from '../logger';

/**
 * Enforces fail-closed queue validation.
 * In production, an accessible Redis instance is strictly required for BullMQ.
 * In test/development, an in-memory queue fallback is permitted with a loud warning.
 */
export function assertQueueHealth(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const redisUrl = process.env.REDIS_URL?.trim();

  if (isProduction && !redisUrl) {
    const errorMsg = 'Production boot failed: Redis connection required for BullMQ queue in production (REDIS_URL missing)';
    logger.fatal(errorMsg);
    throw new Error(errorMsg);
  }

  if (!isProduction && !redisUrl) {
    logger.warn('In-memory queue fallback active — for development/testing ONLY');
  }
}
