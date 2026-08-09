import type { ReactNode } from 'react';

export const metadata = {
  title: 'VendorChain Platform API',
  description: 'Zero-Trust B2B Vendor Verification Core',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#050507' }}>{children}</body>
    </html>
  );
}
