import crypto from 'node:crypto';

export interface EncryptedDocumentPayload {
  ciphertext: Buffer;
  dekWrapped: string;
  iv: string;
  authTag: string;
  sha256: string;
}

function parseKek(kekHex: string): Buffer {
  const cleanHex = kekHex.trim();
  if (cleanHex.length !== 64) {
    throw new Error('KEK_MASTER_KEY must be exactly 32 bytes (64 hex characters)');
  }
  return Buffer.from(cleanHex, 'hex');
}

/**
 * Computes SHA-256 hash of a buffer.
 */
export function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Encrypts a document buffer using AES-256-GCM Envelope Encryption.
 * 1. Generates a fresh random 256-bit Document Encryption Key (DEK).
 * 2. Encrypts the document data with DEK and a 12-byte IV.
 * 3. Wraps (encrypts) the DEK using the Key Encryption Key (KEK) via AES-256-GCM.
 * 4. Computes SHA-256 of the original plaintext for integrity audit.
 */
export function encryptDocument(
  plaintext: Buffer,
  kekHex: string
): EncryptedDocumentPayload {
  const kek = parseKek(kekHex);
  const sha256 = computeSha256(plaintext);

  // 1. Generate unique 32-byte DEK & 12-byte IV for the document
  const dek = crypto.randomBytes(32);
  const docIv = crypto.randomBytes(12);

  // 2. Encrypt document with DEK
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, docIv);
  const docCiphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const docAuthTag = cipher.getAuthTag();

  // 3. Wrap DEK with Master KEK using AES-256-GCM
  const kekIv = crypto.randomBytes(12);
  const kekCipher = crypto.createCipheriv('aes-256-gcm', kek, kekIv);
  const wrappedDekCiphertext = Buffer.concat([kekCipher.update(dek), kekCipher.final()]);
  const kekAuthTag = kekCipher.getAuthTag();

  // Format dekWrapped as: kekIv:kekAuthTag:wrappedCiphertext
  const dekWrapped = `${kekIv.toString('hex')}:${kekAuthTag.toString('hex')}:${wrappedDekCiphertext.toString('hex')}`;

  return {
    ciphertext: docCiphertext,
    dekWrapped,
    iv: docIv.toString('hex'),
    authTag: docAuthTag.toString('hex'),
    sha256,
  };
}

/**
 * Decrypts a document buffer using AES-256-GCM Envelope Encryption.
 * 1. Unwraps the DEK using the Master KEK.
 * 2. Decrypts the document ciphertext using the unwrapped DEK and verifies integrity tag.
 */
export function decryptDocument(
  ciphertext: Buffer,
  dekWrapped: string,
  docIvHex: string,
  docAuthTagHex: string,
  kekHex: string
): Buffer {
  const kek = parseKek(kekHex);

  // 1. Unwrap DEK
  const parts = dekWrapped.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid wrapped DEK structure');
  }

  const kekIv = Buffer.from(parts[0]!, 'hex');
  const kekAuthTag = Buffer.from(parts[1]!, 'hex');
  const wrappedCiphertext = Buffer.from(parts[2]!, 'hex');

  const kekDecipher = crypto.createDecipheriv('aes-256-gcm', kek, kekIv);
  kekDecipher.setAuthTag(kekAuthTag);
  const dek = Buffer.concat([kekDecipher.update(wrappedCiphertext), kekDecipher.final()]);

  // 2. Decrypt document
  const docIv = Buffer.from(docIvHex, 'hex');
  const docAuthTag = Buffer.from(docAuthTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, docIv);
  decipher.setAuthTag(docAuthTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
