// =============================================================================
// VendorChain Platform — Prometheus Metrics & Telemetry Engine (Phase 5)
// =============================================================================
// In-memory metrics registry exposing standard Prometheus text exposition
// format (text/plain; version=0.0.4). Tracks the SLIs that matter for SLOs:
//   - vendorchain_vendors_total        (gauge by TrustTier)
//   - vendorchain_verification_duration_seconds (histogram)
//   - vendorchain_l2_commitments_total (counter)
//   - vendorchain_disputes_total       (counter)
// Fully deterministic and side-effect free (no I/O) so it is trivially testable.
// =============================================================================

export type TrustTier =
  | 'TIER_1_CRITICAL'
  | 'TIER_2_STANDARD'
  | 'TIER_3_RESTRICTED'
  | 'TIER_4_SUSPENDED';

type LabelValue = string | number;

const HISTORY_BUCKETS = [0.1, 0.25, 0.5, 1, 2, 5, 10];

interface HistogramBucket {
  labels: Record<string, LabelValue>;
  buckets: number[]; // cumulative counts
  sum: number;
  count: number;
}

class MetricsRegistry {
  private gauges = new Map<string, Map<string, number>>(); // name -> labelKey -> value
  private counters = new Map<string, Map<string, number>>();
  private histograms = new Map<string, HistogramBucket[]>();

  // --- Gauges ---
  setGauge(name: string, labels: Record<string, LabelValue>, value: number): void {
    if (!this.gauges.has(name)) this.gauges.set(name, new Map());
    this.gauges.get(name)!.set(this.labelKey(labels), value);
  }

  incGauge(name: string, labels: Record<string, LabelValue>, delta = 1): void {
    const key = this.labelKey(labels);
    if (!this.gauges.has(name)) this.gauges.set(name, new Map());
    const map = this.gauges.get(name)!;
    map.set(key, (map.get(key) ?? 0) + delta);
  }

  // --- Counters ---
  incCounter(name: string, labels: Record<string, LabelValue>, delta = 1): void {
    const key = this.labelKey(labels);
    if (!this.counters.has(name)) this.counters.set(name, new Map());
    const map = this.counters.get(name)!;
    map.set(key, (map.get(key) ?? 0) + delta);
  }

  // --- Histograms ---
  observeHistogram(name: string, labels: Record<string, LabelValue>, value: number): void {
    if (!this.histograms.has(name)) this.histograms.set(name, []);
    const list = this.histograms.get(name)!;
    const bucket = list.find(
      (b) => this.labelKey(b.labels) === this.labelKey(labels)
    );
    if (!bucket) {
      list.push({
        labels: { ...labels },
        buckets: HISTORY_BUCKETS.map(() => 0),
        sum: 0,
        count: 0,
      });
      // Re-fetch the newly pushed entry
      const fresh = list[list.length - 1]!;
      fresh.count += 1;
      fresh.sum += value;
      for (let i = 0; i < HISTORY_BUCKETS.length; i++) {
        if (value <= HISTORY_BUCKETS[i]!) fresh.buckets[i]! += 1;
      }
      return;
    }
    bucket.count += 1;
    bucket.sum += value;
    for (let i = 0; i < HISTORY_BUCKETS.length; i++) {
      if (value <= HISTORY_BUCKETS[i]!) bucket.buckets[i]! += 1;
    }
  }

  // --- Rendering (Prometheus text exposition format) ---
  render(): string {
    const lines: string[] = [];

    for (const [name, map] of this.gauges) {
      lines.push(`# TYPE ${name} gauge`);
      for (const [key, value] of map) {
        lines.push(`${name}${this.labelSuffix(key)} ${value}`);
      }
    }

    for (const [name, map] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      for (const [key, value] of map) {
        lines.push(`${name}${this.labelSuffix(key)} ${value}`);
      }
    }

    for (const [name, list] of this.histograms) {
      lines.push(`# TYPE ${name} histogram`);
      for (const bucket of list) {
        // Label set WITHOUT the outer braces: `tier="TIER_1_CRITICAL"` (or empty).
        const labelBody = this.labelBody(bucket.labels);
        for (let i = 0; i < HISTORY_BUCKETS.length; i++) {
          const le = HISTORY_BUCKETS[i]!;
          lines.push(`${name}_bucket{${labelBody ? labelBody + ',' : ''}le="${le}"} ${bucket.buckets[i]}`);
        }
        lines.push(`${name}_bucket{${labelBody ? labelBody + ',' : ''}le="+Inf"} ${bucket.count}`);
        lines.push(`${name}_sum${labelBody ? `{${labelBody}}` : ''} ${bucket.sum}`);
        lines.push(`${name}_count${labelBody ? `{${labelBody}}` : ''} ${bucket.count}`);
      }
    }

    return lines.join('\n');
  }

  reset(): void {
    this.gauges.clear();
    this.counters.clear();
    this.histograms.clear();
  }

  private labelKey(labels: Record<string, LabelValue>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  private labelSuffix(key: string): string {
    return key ? `{${key}}` : '';
  }

  /** Comma-joined label body WITHOUT surrounding braces, e.g. `tier="T1"`. */
  private labelBody(labels: Record<string, LabelValue>): string {
    return this.labelKey(labels);
  }
}

export const metrics = new MetricsRegistry();

// Convenience helpers used by the application code.
export function recordVerificationDuration(seconds: number, tier: TrustTier | 'none'): void {
  metrics.observeHistogram('vendorchain_verification_duration_seconds', { tier }, seconds);
}
export function recordVendorTier(tier: TrustTier): void {
  metrics.incGauge('vendorchain_vendors_total', { tier });
}
export function recordL2Commitment(currency: string): void {
  metrics.incCounter('vendorchain_l2_commitments_total', { currency });
}
export function recordDispute(currency: string): void {
  metrics.incCounter('vendorchain_disputes_total', { currency });
}

export { HISTORY_BUCKETS };
