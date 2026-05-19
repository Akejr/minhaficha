/**
 * Bivariate Poisson with Dixon-Coles low-score correction.
 *
 * Pure independent Poisson is known to underestimate football's true rate of
 * 0-0 and 1-1 results and overestimate 1-0 / 0-1. Dixon-Coles (1997) introduced
 * a τ(i, j; λH, λA, ρ) correction that nudges only those four cells:
 *
 *   τ(0, 0) = 1 - λH · λA · ρ
 *   τ(0, 1) = 1 + λH · ρ
 *   τ(1, 0) = 1 + λA · ρ
 *   τ(1, 1) = 1 - ρ
 *   τ(i, j) = 1            otherwise
 *
 * Empirically ρ is slightly NEGATIVE for European leagues, in the range
 * [-0.20, -0.05]. Negative ρ pushes mass toward {0-0, 1-1} and away from
 * {1-0, 0-1}, which matches reality.
 *
 * After applying τ the grid no longer integrates to exactly 1, so we
 * renormalize. The renormalisation factor is at most ≈1.02 in practice.
 */

/** Probability mass: P(X = k) for X ~ Poisson(λ). Numerically stable in log-space. */
export function pmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k < 0 || !Number.isFinite(k)) return 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/** Cumulative: P(X ≤ k). */
export function cdf(k: number, lambda: number): number {
  let s = 0;
  for (let i = 0; i <= k; i++) s += pmf(i, lambda);
  return Math.min(s, 1);
}

/** Survival: P(X > k). For "over n.5" call with k = floor(n.5). */
export function sf(k: number, lambda: number): number {
  return Math.max(0, 1 - cdf(k, lambda));
}

/**
 * Dixon-Coles τ correction for the (0,0), (0,1), (1,0), (1,1) cells.
 *
 *   ρ ∈ [-0.5, 0.5]  but realistic football fits sit in [-0.2, -0.05].
 */
export function tauDixonColes(
  i: number,
  j: number,
  lambdaHome: number,
  lambdaAway: number,
  rho: number,
): number {
  if (i === 0 && j === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (i === 0 && j === 1) return 1 + lambdaHome * rho;
  if (i === 1 && j === 0) return 1 + lambdaAway * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

/**
 * Joint score grid with Dixon-Coles correction and renormalisation.
 * grid[i][j] = P(home = i, away = j).
 *
 * `max=10` captures > 99.9999% of the mass for the λs we work with.
 */
export function scoreGrid(
  lambdaHome: number,
  lambdaAway: number,
  rho = -0.15,
  max = 10,
): number[][] {
  const ph = Array.from({ length: max + 1 }, (_, i) => pmf(i, lambdaHome));
  const pa = Array.from({ length: max + 1 }, (_, i) => pmf(i, lambdaAway));

  const grid: number[][] = [];
  let total = 0;
  for (let i = 0; i <= max; i++) {
    const row: number[] = [];
    for (let j = 0; j <= max; j++) {
      const tau = tauDixonColes(i, j, lambdaHome, lambdaAway, rho);
      const cell = ph[i] * pa[j] * tau;
      // tau can in theory drive a cell slightly negative for extreme ρ; clamp.
      const safe = cell < 0 ? 0 : cell;
      row.push(safe);
      total += safe;
    }
    grid.push(row);
  }

  // Renormalise so the grid sums to exactly 1.
  if (total > 0 && Math.abs(total - 1) > 1e-9) {
    for (let i = 0; i <= max; i++) {
      for (let j = 0; j <= max; j++) grid[i][j] /= total;
    }
  }
  return grid;
}

/** Clamp probabilities to a sane range (avoids the model claiming 0 % or 100 %). */
export function clampProb(p: number, min = 0.005, max = 0.995): number {
  if (!Number.isFinite(p)) return min;
  return Math.min(max, Math.max(min, p));
}
