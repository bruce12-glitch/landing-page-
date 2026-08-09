import { z } from 'zod';

export const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export const VendorStatusEnum = z.enum([
  'UNVERIFIED',
  'PENDING',
  'IN_PROGRESS',
  'VERIFIED',
  'FAILED',
  'FLAGGED',
  'BLOCKED',
]);
export type VendorStatus = z.infer<typeof VendorStatusEnum>;

export const DocumentTypeEnum = z.enum(['GST_CERT', 'PAN_CARD', 'BANK_PROOF']);
export type DocumentType = z.infer<typeof DocumentTypeEnum>;

export const DocumentStatusEnum = z.enum(['STORED', 'PENDING', 'VERIFIED', 'REJECTED']);
export type DocumentStatus = z.infer<typeof DocumentStatusEnum>;

export const CreateVendorSchema = z
  .object({
    legalName: z
      .string({ required_error: 'Legal business name is required' })
      .trim()
      .min(2, 'Legal business name must be at least 2 characters')
      .max(200, 'Legal business name cannot exceed 200 characters'),
    gstNumber: z
      .string({ required_error: 'GST number is required' })
      .trim()
      .toUpperCase()
      .regex(
        GST_REGEX,
        'Invalid GST format. Expected 15-character alphanumeric format: 2 digits state code, 10-char PAN, entity code, Z, checksum'
      ),
    panNumber: z
      .string({ required_error: 'PAN number is required' })
      .trim()
      .toUpperCase()
      .regex(
        PAN_REGEX,
        'Invalid PAN format. Expected 10-character alphanumeric format: 5 letters, 4 digits, 1 letter'
      ),
  })
  .refine(
    (data) => data.gstNumber.slice(2, 12) === data.panNumber,
    {
      message:
        'PAN does not match the embedded PAN inside the GST number (characters 3-12 of GSTIN must equal PAN)',
      path: ['panNumber'],
    }
  );

export type CreateVendorInput = z.infer<typeof CreateVendorSchema>;

export const UploadDocumentMetadataSchema = z.object({
  type: DocumentTypeEnum,
});

export type UploadDocumentMetadata = z.infer<typeof UploadDocumentMetadataSchema>;
