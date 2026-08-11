'use client';

import { ChangeEvent, DragEvent, useState } from 'react';
import Link from 'next/link';
import TrustGauge from '../components/TrustGauge';
import OnboardingTerminal from '../components/OnboardingTerminal';

type Step = 'identity' | 'upload' | 'ocr' | 'reveal';
type DocType = 'GST_CERT' | 'PAN_CARD' | 'BANK_PROOF';
type UploadState = { file?: File; digest?: string; error?: string };
const docs: { type: DocType; label: string }[] = [{ type: 'GST_CERT', label: 'GST Certificate' }, { type: 'PAN_CARD', label: 'PAN Card' }, { type: 'BANK_PROOF', label: 'Bank Proof' }];
const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function checksum(value: string) {
  if (value.length !== 15) return false;
  let sum = 0;
  for (let index = 13; index >= 0; index--) { const product = chars.indexOf(value[index] ?? '') * ([1, 2][index % 2] ?? 1); sum += Math.floor(product / 36) + product % 36; }
  return chars[(36 - sum % 36) % 36] === value[14];
}
function readHeader(file: File) { return new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(new TextDecoder().decode(reader.result as ArrayBuffer)); reader.readAsArrayBuffer(file.slice(0, 5)); }); }
function digest(file: File) { return file.arrayBuffer().then((buffer) => crypto.subtle.digest('SHA-256', buffer)).then((hash) => [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')); }

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('identity'); const [legalName, setLegalName] = useState('');
  const [gst, setGst] = useState(''); const [pan, setPan] = useState(''); const [vendorId, setVendorId] = useState('');
  const [uploads, setUploads] = useState<Record<DocType, UploadState>>({ GST_CERT: {}, PAN_CARD: {}, BANK_PROOF: {} });
  const [terminal, setTerminal] = useState(false); const [error, setError] = useState(''); const [score, setScore] = useState<number | null>(null); const [tier, setTier] = useState('');
  const validGst = checksum(gst); const validPan = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan); const panMatches = validGst && gst.slice(2, 12) === pan;
  const steps: { id: Step; label: string }[] = [{ id: 'identity', label: 'Identity' }, { id: 'upload', label: 'Encrypted Upload' }, { id: 'ocr', label: 'OCR Cross-Check' }, { id: 'reveal', label: 'Trust Score' }];
  const active = steps.findIndex((item) => item.id === step);

  async function validateFile(type: DocType, file?: File) {
    if (!file) return; setUploads((current) => ({ ...current, [type]: {} }));
    const header = await readHeader(file); if (header !== '%PDF-') { setUploads((current) => ({ ...current, [type]: { error: 'Rejected: PDF magic bytes required.' } })); return; }
    if (file.size > 5 * 1024 * 1024) { setUploads((current) => ({ ...current, [type]: { error: 'Rejected: exceeds 5MB limit.' } })); return; }
    const hash = await digest(file); setUploads((current) => ({ ...current, [type]: { file, digest: hash } }));
  }
  function drop(type: DocType, event: DragEvent<HTMLLabelElement>) { event.preventDefault(); void validateFile(type, event.dataTransfer.files[0]); }
  function choose(type: DocType, event: ChangeEvent<HTMLInputElement>) { void validateFile(type, event.target.files?.[0]); }

  async function register() {
    setError(''); const result = await fetch('/api/vendors', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': '' }, body: JSON.stringify({ legalName, gstNumber: gst, panNumber: pan }) });
    const data = await result.json(); if (!result.ok) { setError(data.error ?? 'Identity registration was rejected.'); return; } setVendorId(data.id); setStep('upload');
  }
  async function uploadDocuments() {
    try { for (const doc of docs) { const item = uploads[doc.type]; if (!item.file) return; const form = new FormData(); form.append('type', doc.type); form.append('file', item.file); const result = await fetch(`/api/vendors/${vendorId}/documents`, { method: 'POST', headers: { 'x-admin-key': '' }, body: form }); if (!result.ok) throw new Error(doc.label); } setStep('ocr'); } catch { setError('Ciphertext intake was rejected. Review the document cards and retry.'); setTerminal(false); }
  }
  async function verify() {
    const result = await fetch(`/api/vendors/${vendorId}/documents`, { headers: { 'x-admin-key': '' } }); const data = await result.json();
    await Promise.all((data.documents ?? []).map((doc: { id: string }) => fetch(`/api/vendors/${vendorId}/documents/${doc.id}/verify`, { method: 'POST', headers: { 'x-admin-key': '' } }))); setStep('reveal');
  }
  async function evaluate() { const result = await fetch(`/api/vendors/${vendorId}/trust-score/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': '' }, body: JSON.stringify({ supplyChainVerdict: 'PASS', supplyChainRiskScore: 0, isCosignSigned: true }) }); const data = await result.json(); setScore(data.compositeScore); setTier(data.tier); }
  const ready = docs.every((doc) => Boolean(uploads[doc.type].file));

  return <main className="cp-shell"><header className="cp-topbar"><div className="cp-brand"><span className="mark">V</span><div>VendorChain<div className="sub">Zero-Trust Onboarding</div></div></div><nav><Link href="/dashboard">Dashboard</Link><Link className="active" href="/onboarding">Onboarding</Link></nav></header>
    <h1 className="cp-h1">Tactile Zero-Trust Onboarding</h1><p className="cp-sub">Identity, ciphertext intake, OCR verification, and trust scoring — visible at every stage.</p>
    <div className="cp-step-row">{steps.map((item, index) => <div className={`cp-step ${index === active ? 'active' : ''} ${index < active ? 'done' : ''}`} key={item.id}><span className="num">{index < active ? '✓' : index + 1}</span>{item.label}</div>)}</div>
    {error && <div className="cp-alert cp-alert-error">{error}</div>}
    {step === 'identity' && <section className="cp-card onboarding-card"><h4>Smart identity validation</h4><label className="cp-field">Legal Business Name<input className="cp-input" value={legalName} onChange={(event) => setLegalName(event.target.value)} /></label><label className="cp-field">GSTIN<input className="cp-input" value={gst} maxLength={15} placeholder="27AAPFU0939F1ZV" onChange={(event) => setGst(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} /></label><div className={`identity-badge ${validGst ? 'valid' : 'invalid'}`}>{validGst ? 'Mod-36 checksum valid' : 'Awaiting valid 15-character GSTIN'}</div><label className="cp-field">PAN<input className="cp-input" type="password" value={pan} maxLength={10} placeholder="ABCDE1234F" onChange={(event) => setPan(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} /></label><div className={`identity-badge ${panMatches ? 'valid' : 'invalid'}`}>{panMatches ? 'PAN embedding matches GSTIN' : validPan ? 'PAN does not match GSTIN embedding' : 'Enter a valid PAN format'}</div><button className="cp-btn primary" disabled={!legalName || !validGst || !panMatches} onClick={register}>Seal identity record</button></section>}
    {step === 'upload' && <section className="cp-card onboarding-card"><h4>Document intake: encrypted by design</h4>{terminal ? <OnboardingTerminal onComplete={uploadDocuments} /> : <><p className="onboarding-copy">PDF magic bytes, 5MB meter, and a local SHA-256 digest are verified before encryption.</p><div className="upload-grid">{docs.map((doc) => { const item = uploads[doc.type]; return <label className={`upload-card ${item.file ? 'ready' : ''} ${item.error ? 'rejected' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(doc.type, event)} key={doc.type}><input type="file" accept="application/pdf" onChange={(event) => choose(doc.type, event)} /><strong>{doc.label}</strong><span>{item.file ? item.file.name : 'Drop PDF or browse'}</span><div className="size-meter"><i className={item.file ? 'meter-ready' : ''} /></div><small>{item.file ? `${(item.file.size / 1024 / 1024).toFixed(2)}MB / 5MB` : item.error ?? 'PDF magic byte check pending'}</small>{item.digest && <code>{item.digest.slice(0, 4)}…{item.digest.slice(-4)}</code>}{item.file && <b>Ready for Encryption</b>}</label>; })}</div><button className="cp-btn primary" disabled={!ready} onClick={() => setTerminal(true)}>Encrypt &amp; upload documents</button></>}</section>}
    {step === 'ocr' && <section className="cp-card onboarding-card"><h4>OCR cryptographic cross-check</h4><p className="cp-stage">GSTIN ↔ masked PAN embedding verification ready</p><button className="cp-btn primary" onClick={verify}>Run OCR verification</button></section>}
    {step === 'reveal' && <section className="cp-card onboarding-card score-reveal"><h4>Trust score reveal</h4>{score === null ? <button className="cp-btn primary" onClick={evaluate}>Compute trust score</button> : <><TrustGauge score={score} /><p className="cp-mono">{tier.replace('TIER_', 'Tier ')}</p><Link className="vault-link" href={`/vendors/${vendorId}`}>Open Cryptographic Vault →</Link></>}</section>}
  </main>;
}
