declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    text: string;
    version: string;
  }

  function PDFParse(
    dataBuffer: Buffer,
    options?: {
      pagerender?: (pageData: unknown) => string | Promise<string>;
      max?: number;
      version?: string;
    }
  ): Promise<PDFData>;

  export default PDFParse;
}
