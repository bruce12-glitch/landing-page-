import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'VendorChain Platform — Control Plane',
  description: 'Zero-Trust B2B Vendor Verification — Enterprise Procurement & Trust Dashboard',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#050507' }}>{children}</body>
    </html>
  );
}
