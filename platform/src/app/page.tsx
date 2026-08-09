export default function PlatformRoot() {
  return (
    <main style={{ padding: '40px', fontFamily: 'monospace', background: '#050507', color: '#F8FAFC', minHeight: '100vh' }}>
      <h1>VendorChain Platform API — Slice 1</h1>
      <p>Secure Foundation: Vendor Registration + Encrypted Document Intake</p>
      <ul>
        <li>Status: <strong>OPERATIONAL</strong></li>
        <li>Health: <code>/api/health</code></li>
        <li>Registration: <code>/api/vendors</code></li>
        <li>Intake: <code>/api/vendors/:id/documents</code></li>
      </ul>
    </main>
  );
}
