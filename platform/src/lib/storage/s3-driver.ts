import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { StorageDriver } from './types';

export class S3StorageDriver implements StorageDriver {
  public readonly name = 'S3StorageDriver';
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || 'vendorchain-encrypted-documents';
    this.client = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minio_admin',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minio_password_sec_local',
      },
    });
  }

  public async write(key: string, data: Buffer): Promise<string> {
    const cleanKey = pathCleanKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
        Body: data,
        ContentType: 'application/octet-stream',
      })
    );
    return `s3://${this.bucket}/${cleanKey}`;
  }

  public async read(key: string): Promise<Buffer> {
    const cleanKey = pathCleanKey(key);
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      })
    );

    if (!response.Body) {
      throw new Error(`S3 object '${cleanKey}' returned empty body`);
    }

    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  public async exists(key: string): Promise<boolean> {
    const cleanKey = pathCleanKey(key);
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: cleanKey,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  public async delete(key: string): Promise<void> {
    const cleanKey = pathCleanKey(key);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: cleanKey,
        })
      );
    } catch {
      // Ignored
    }
  }
}

function pathCleanKey(key: string): string {
  if (key.startsWith('s3://')) {
    const withoutPrefix = key.slice(5);
    const slashIdx = withoutPrefix.indexOf('/');
    return slashIdx !== -1 ? withoutPrefix.slice(slashIdx + 1) : withoutPrefix;
  }
  return key.split('/').pop() || key;
}
