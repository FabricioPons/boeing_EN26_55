export function computeStats(samples) {
  const n = samples.length;
  if (n === 0) return { n: 0, last: null, avg: null, min: null, max: null, p50: null, p95: null };

  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    n,
    last: samples[n - 1],
    avg: sum / n,
    min: sorted[0],
    max: sorted[n - 1],
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  };
}

function percentile(sorted, p) {
  const n = sorted.length;
  if (n === 0) return null;
  if (n === 1) return sorted[0];
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
