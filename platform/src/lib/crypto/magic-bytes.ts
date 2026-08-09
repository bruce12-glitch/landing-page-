export type AllowedMimeType = 'application/pdf' | 'image/png' | 'image/jpeg';

export interface MagicByteResult {
  valid: boolean;
  mimeType: AllowedMimeType | null;
  extension: string | null;
  error?: string;
}

/**
 * Inspects raw file bytes to determine file type by magic byte signatures.
 * Never trusts file extensions or client-supplied MIME headers.
 */
export function inspectMagicBytes(buffer: Buffer): MagicByteResult {
  if (!buffer || buffer.length < 4) {
    return {
      valid: false,
      mimeType: null,
      extension: null,
      error: 'File payload is empty or too short for cryptographic magic byte validation',
    };
  }

  // 1. PDF signature: '%PDF-' (0x25 0x50 0x44 0x46 0x2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return {
      valid: true,
      mimeType: 'application/pdf',
      extension: 'pdf',
    };
  }

  // 2. PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      valid: true,
      mimeType: 'image/png',
      extension: 'png',
    };
  }

  // 3. JPEG/JPG signature: 0xFF 0xD8 0xFF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return {
      valid: true,
      mimeType: 'image/jpeg',
      extension: 'jpg',
    };
  }

  // DOS/Windows executable check: 'MZ' (0x4D 0x5A) -> Explicit rejection flag
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return {
      valid: false,
      mimeType: null,
      extension: null,
      error: 'Dangerous file type detected: Executable binary disguised as document',
    };
  }

  // ELF executable check: 0x7F 'ELF' (0x7F 0x45 0x4C 0x46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return {
      valid: false,
      mimeType: null,
      extension: null,
      error: 'Dangerous file type detected: ELF executable binary',
    };
  }

  return {
    valid: false,
    mimeType: null,
    extension: null,
    error: 'Unrecognized file format: Only valid PDF, PNG, and JPEG files are permitted',
  };
}
