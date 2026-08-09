import crypto from 'node:crypto';

function parseKek(kekHex: string): Buffer {
  const cleanHex = kekHex.trim();
  if (cleanHex.length !== 64) {
    throw new Error('KEK_MASTER_KEY must be exactly 32 bytes (64 hex characters)');
  }
  return Buffer.from(cleanHex, 'hex');
}

/**
 * Encrypts a Permanent Account Number (PAN) using AES-256-GCM.
 * Stored at rest as: `ivHex:authTagHex:ciphertextHex`
 * Plaintext PAN is NEVER stored in the database.
 */
export function encryptPan(pan: string, kekHex: string): string {
  const kek = parseKek(kekHex);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);

  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(pan.trim().toUpperCase(), 'utf-8')),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts an encrypted PAN payload with AES-256-GCM.
 */
export function decryptPan(encryptedPayload: string, kekHex: string): string {
  const kek = parseKek(kekHex);
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted PAN payload structure');
  }

  const iv = Buffer.from(parts[0]!, 'hex');
  const authTag = Buffer.from(parts[1]!, 'hex');
  const ciphertext = Buffer.from(parts[2]!, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf-8');
}

/**
 * Masks a PAN number for secure API responses: first 2 + '******' + last 2 chars.
 * E.g., 'ABCDE1234F' -> 'AB******4F'
 */
export function maskPan(pan: string): string {
  const cleanPan = pan.trim().toUpperCase();
  if (cleanPan.length !== 10) {
    return '**********';
  }
  return `${cleanPan.slice(0, 2)}******${cleanPan.slice(8, 10)}`;
}
