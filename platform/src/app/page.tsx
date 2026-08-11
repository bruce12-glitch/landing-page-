import Link from 'next/link';

export default function PlatformRoot() {
  return (
    <main style={{ padding: '40px', fontFamily: 'monospace', background: '#050507', color: '#F8FAFC', minHeight: '100vh' }}>
      <h1>VendorChain Platform — Control Plane</h1>
      <p>Zero-Trust B2B Vendor Verification · Enterprise Procurement &amp; Trust Dashboard</p>
      <ul>
        <li><strong>Control Plane:</strong> <Link href="/dashboard" style={{ color: '#00E5FF' }}>/dashboard</Link></li>
        <li><strong>Onboarding:</strong> <Link href="/onboarding" style={{ color: '#00E5FF' }}>/onboarding</Link></li>
        <li><strong>Health:</strong> <code>/api/health</code></li>
        <li><strong>Registration:</strong> <code>/api/vendors</code></li>
      </ul>
    </main>
  );
}
