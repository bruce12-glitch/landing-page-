import type { StorageDriver } from './types';
import { LocalStorageDriver } from './local-driver';
import { S3StorageDriver } from './s3-driver';

export function getStorageDriver(): StorageDriver {
  const driverType = (process.env.STORAGE_DRIVER || 'local').toLowerCase();

  if (driverType === 's3') {
    return new S3StorageDriver();
  }

  return new LocalStorageDriver();
}
