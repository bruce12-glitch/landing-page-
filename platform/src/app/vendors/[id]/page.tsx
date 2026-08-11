import Link from 'next/link';
import { db } from '@/lib/db/client';
import RaiseDisputeModal from '../../components/RaiseDisputeModal';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Vendor Cryptographic Vault — VendorChain' };

export default async function VendorProfilePage({ params }: { params: { id: string } }) {
  const vendor = await db.findVendorById(params.id);
  if (!vendor) return <main className="cp-shell"><h1 className="cp-h1">Vendor Not Found</h1><Link className="vault-link" href="/dashboard">← Dashboard</Link></main>;
  const [snapshot, documents, transactions] = await Promise.all([db.findLatestTrustSnapshotByVendorId(vendor.id), db.findDocumentsByVendorId(vendor.id), db.findTransactionsByVendorId(vendor.id, 100, 0)]);
  const pan = vendor.gstNumber.slice(2, 12); const maskedGst = `${vendor.gstNumber.slice(0, 6)}****${vendor.gstNumber.slice(-3)}`; const maskedPan = `${pan.slice(0, 5)}****${pan.slice(-1)}`;
  return <main className="cp-shell"><header className="cp-topbar"><div className="cp-brand"><span className="mark">V</span><div>VendorChain<div className="sub">Deep Vendor Profile Vault</div></div></div><nav><Link href="/dashboard">Dashboard</Link><Link href="/onboarding">Onboarding</Link></nav></header><RaiseDisputeModal vendor={{ id: vendor.id, name: vendor.legalName, gst: maskedGst, pan: maskedPan, status: vendor.status, verifiedDate: vendor.updatedAt.toISOString().slice(0, 10), score: snapshot?.compositeScore ?? 0, tier: snapshot?.tier ?? 'TIER_4_SUSPENDED', supply: snapshot?.supplyChainScore ?? 0 }} documents={documents.map((doc) => ({ id: doc.id, type: doc.type, sha: doc.sha256, status: doc.status }))} transactions={transactions.map((tx) => ({ id: tx.id, invoice: tx.invoiceRef, hash: tx.stateHash, block: tx.l2BlockNumber, status: tx.status, reason: tx.disputeReason }))} /></main>;
}
