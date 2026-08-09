const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Validates the 15th checksum character of an Indian GSTIN using
 * the official Luhn Mod-36 algorithm.
 *
 * A GSTIN is 15 alphanumeric characters:
 * - Chars 1-2: State Code (digits)
 * - Chars 3-12: PAN of the entity (5 letters, 4 digits, 1 letter)
 * - Char 13: Entity number of the same PAN holder in the state (alphanumeric)
 * - Char 14: Default character 'Z'
 * - Char 15: Checksum digit (alphanumeric calculated via Luhn mod-36)
 */
export function validateGstChecksum(gstNumber: string): {
  valid: boolean;
  expectedChar: string | null;
  actualChar: string | null;
} {
  const clean = gstNumber.trim().toUpperCase();
  if (clean.length !== 15) {
    return { valid: false, expectedChar: null, actualChar: null };
  }

  const actualChar = clean.charAt(14);
  const factor = [1, 2];
  let sum = 0;

  for (let i = 13; i >= 0; i--) {
    const char = clean.charAt(i);
    const code = CHARS.indexOf(char);
    if (code === -1) {
      return { valid: false, expectedChar: null, actualChar };
    }

    const weight = factor[i % 2]!;
    const product = code * weight;
    const quotient = Math.floor(product / 36);
    const remainder = product % 36;

    sum += quotient + remainder;
  }

  const remainder = sum % 36;
  let checkCode = (36 - remainder) % 36;
  const expectedChar = CHARS.charAt(checkCode);

  return {
    valid: actualChar === expectedChar,
    expectedChar,
    actualChar,
  };
}

/**
 * Computes the official 15th checksum character for a 14-character GSTIN prefix.
 */
export function computeGstChecksumChar(gst14: string): string {
  const clean = gst14.trim().toUpperCase().slice(0, 14);
  if (clean.length !== 14) {
    throw new Error('Prefix must be exactly 14 characters to compute GST checksum');
  }

  const factor = [1, 2];
  let sum = 0;

  for (let i = 13; i >= 0; i--) {
    const char = clean.charAt(i);
    const code = CHARS.indexOf(char);
    if (code === -1) {
      throw new Error(`Invalid character '${char}' in GSTIN prefix`);
    }

    const weight = factor[i % 2]!;
    const product = code * weight;
    const quotient = Math.floor(product / 36);
    const remainder = product % 36;

    sum += quotient + remainder;
  }

  const remainder = sum % 36;
  const checkCode = (36 - remainder) % 36;
  return CHARS.charAt(checkCode);
}
