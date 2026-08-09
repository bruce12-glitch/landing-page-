import { describe, it, expect } from 'vitest';
import { encryptDocument, decryptDocument, computeSha256 } from '../lib/crypto/envelope';
import { encryptPan, decryptPan, maskPan } from '../lib/crypto/pan-encryption';
import { inspectMagicBytes } from '../lib/crypto/magic-bytes';

const TEST_KEK = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('AES-256-GCM Envelope Encryption (Document Intake)', () => {
  it('encrypts and decrypts document with DEK wrapped by KEK', () => {
    const rawData = Buffer.from('%PDF-1.7 sample GST certificate document content for zero-trust verification');
    const encrypted = encryptDocument(rawData, TEST_KEK);

    expect(encrypted.ciphertext).not.toEqual(rawData);
    expect(encrypted.ciphertext.includes(Buffer.from('sample GST certificate'))).toBe(false);
    expect(encrypted.sha256).toBe(computeSha256(rawData));
    expect(encrypted.dekWrapped).toContain(':');
    expect(encrypted.iv).toHaveLength(24); // 12 bytes hex
    expect(encrypted.authTag).toHaveLength(32); // 16 bytes hex

    // Decrypt and verify integrity
    const decrypted = decryptDocument(
      encrypted.ciphertext,
      encrypted.dekWrapped,
      encrypted.iv,
      encrypted.authTag,
      TEST_KEK
    );

    expect(decrypted.toString('utf-8')).toBe(rawData.toString('utf-8'));
  });

  it('fails decryption if ciphertext or authTag is tampered with', () => {
    const rawData = Buffer.from('%PDF-1.7 confidential bank statement');
    const encrypted = encryptDocument(rawData, TEST_KEK);

    // Tamper with ciphertext byte
    const tampered = Buffer.from(encrypted.ciphertext);
    tampered[0] = tampered[0]! ^ 0xff;

    expect(() => {
      decryptDocument(
        tampered,
        encrypted.dekWrapped,
        encrypted.iv,
        encrypted.authTag,
        TEST_KEK
      );
    }).toThrow();
  });
});

describe('PAN Encryption & Masking at Rest', () => {
  it('encrypts PAN so plaintext never appears in payload', () => {
    const pan = 'ABCDE1234F';
    const encrypted = encryptPan(pan, TEST_KEK);

    expect(encrypted.includes(pan)).toBe(false);
    expect(encrypted.split(':')).toHaveLength(3);

    const decrypted = decryptPan(encrypted, TEST_KEK);
    expect(decrypted).toBe(pan);
  });

  it('masks PAN with first 2 and last 2 characters only', () => {
    expect(maskPan('ABCDE1234F')).toBe('AB******4F');
    expect(maskPan('AAAPA9876K')).toBe('AA******6K');
    expect(maskPan('invalid')).toBe('**********');
  });
});

describe('Magic Byte Document Verification', () => {
  it('accepts authentic PDF magic bytes (%PDF-)', () => {
    const pdfBuf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]);
    const res = inspectMagicBytes(pdfBuf);
    expect(res.valid).toBe(true);
    expect(res.mimeType).toBe('application/pdf');
    expect(res.extension).toBe('pdf');
  });

  it('accepts authentic PNG magic bytes', () => {
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const res = inspectMagicBytes(pngBuf);
    expect(res.valid).toBe(true);
    expect(res.mimeType).toBe('image/png');
    expect(res.extension).toBe('png');
  });

  it('accepts authentic JPEG magic bytes', () => {
    const jpgBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const res = inspectMagicBytes(jpgBuf);
    expect(res.valid).toBe(true);
    expect(res.mimeType).toBe('image/jpeg');
    expect(res.extension).toBe('jpg');
  });

  it('rejects executable files disguised as PDF (.exe renamed as .pdf)', () => {
    const exeBuf = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const res = inspectMagicBytes(exeBuf);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Executable binary disguised as document');
  });

  it('rejects text files or random binaries', () => {
    const textBuf = Buffer.from('Plain text file content claiming to be a PDF');
    const res = inspectMagicBytes(textBuf);
    expect(res.valid).toBe(false);
    expect(res.mimeType).toBeNull();
  });
});
