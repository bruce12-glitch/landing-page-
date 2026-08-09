import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageDriver } from './types';

export class LocalStorageDriver implements StorageDriver {
  public readonly name = 'LocalStorageDriver';
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = path.resolve(baseDir || process.env.STORAGE_DIR || './storage/encrypted_docs');
  }

  public async write(key: string, data: Buffer): Promise<string> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const fullPath = path.join(this.baseDir, path.basename(key));
    await fs.writeFile(fullPath, data);
    return fullPath;
  }

  public async read(key: string): Promise<Buffer> {
    const fullPath = path.isAbsolute(key) ? key : path.join(this.baseDir, path.basename(key));
    return await fs.readFile(fullPath);
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const fullPath = path.isAbsolute(key) ? key : path.join(this.baseDir, path.basename(key));
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  public async delete(key: string): Promise<void> {
    try {
      const fullPath = path.isAbsolute(key) ? key : path.join(this.baseDir, path.basename(key));
      await fs.unlink(fullPath);
    } catch {
      // Ignored if not present
    }
  }
}
