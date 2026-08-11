// SbomViewer — interactive table viewer for CycloneDX packages with CVSS tags.
// Server component (pure) so it is trivially renderable in tests.
import * as React from 'react';
import type { Severity } from '@/lib/supply-chain/cve-scanner';

export interface SbomComponent {
  name: string;
  version: string;
  purl?: string;
  severity?: Severity;
  cvssScore?: number;
}

const SEVERITY_COLORS: Record<Severity, string> = {
  CRITICAL: '#F87171',
  HIGH: '#FB923C',
  MEDIUM: '#FBBF24',
  LOW: '#60A5FA',
};

interface SbomViewerProps {
  components: SbomComponent[];
  title?: string;
}

export default function SbomViewer({ components, title = 'CycloneDX SBOM' }: SbomViewerProps) {
  return (
    <div className="cp-card" data-testid="sbom-viewer">
      <h4>{title}</h4>
      {components.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>No SBOM components ingested for this artifact.</p>
      ) : (
        <table className="cp-table">
          <thead>
            <tr>
              <th>Package</th>
              <th>Version</th>
              <th>Severity</th>
              <th>CVSS</th>
            </tr>
          </thead>
          <tbody>
            {components.map((c, i) => {
              const sev = c.severity;
              return (
                <tr key={i} data-package={c.name}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    {c.purl ? <div className="cp-hash" style={{ color: 'var(--muted)', fontSize: 10.5 }}>{c.purl}</div> : null}
                  </td>
                  <td className="cp-mono">{c.version}</td>
                  <td>
                    {sev ? (
                      <span
                        className="cp-badge"
                        style={{
                          color: SEVERITY_COLORS[sev],
                          background: `${SEVERITY_COLORS[sev]}1f`,
                          borderColor: `${SEVERITY_COLORS[sev]}44`,
                        }}
                        data-severity={sev}
                      >
                        {sev}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                  <td className="cp-mono">{c.cvssScore != null ? c.cvssScore.toFixed(1) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export { SEVERITY_COLORS };
