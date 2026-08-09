export interface StorageDriver {
  readonly name: string;
  write(key: string, data: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}
