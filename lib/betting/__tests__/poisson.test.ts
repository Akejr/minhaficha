import { describe, it, expect } from "vitest";
import { pmf, cdf, sf, scoreGrid, tauDixonColes } from "../poisson";

describe("pmf / cdf / sf", () => {
  it("pmf sums to ~1 over enough k", () => {
    let s = 0;
    for (let k = 0; k <= 30; k++) s += pmf(k, 1.5);
    expect(s).toBeCloseTo(1, 6);
  });

  it("cdf and sf are complementary", () => {
    for (let k = 0; k <= 5; k++) {
      expect(cdf(k, 2.3) + sf(k, 2.3)).toBeCloseTo(1, 6);
    }
  });

  it("known closed-form: P(0; λ) = e^-λ", () => {
    expect(pmf(0, 0.5)).toBeCloseTo(Math.exp(-0.5), 8);
    expect(pmf(0, 2.0)).toBeCloseTo(Math.exp(-2.0), 8);
  });

  it("known closed-form: P(1; λ) = λ·e^-λ", () => {
    expect(pmf(1, 0.5)).toBeCloseTo(0.5 * Math.exp(-0.5), 8);
  });

  it("handles λ = 0 edge case", () => {
    expect(pmf(0, 0)).toBe(1);
    expect(pmf(1, 0)).toBe(0);
  });
});

describe("Dixon-Coles τ", () => {
  it("is identity outside the (0..1, 0..1) corner", () => {
    expect(tauDixonColes(2, 0, 1.5, 1.2, -0.15)).toBe(1);
    expect(tauDixonColes(0, 2, 1.5, 1.2, -0.15)).toBe(1);
    expect(tauDixonColes(3, 4, 1.5, 1.2, -0.15)).toBe(1);
  });

  it("with negative ρ, τ(0,0) and τ(1,1) > 1", () => {
    const rho = -0.15;
    expect(tauDixonColes(0, 0, 1.5, 1.2, rho)).toBeGreaterThan(1);
    expect(tauDixonColes(1, 1, 1.5, 1.2, rho)).toBeGreaterThan(1);
  });

  it("with negative ρ, τ(0,1) and τ(1,0) < 1", () => {
    const rho = -0.15;
    expect(tauDixonColes(0, 1, 1.5, 1.2, rho)).toBeLessThan(1);
    expect(tauDixonColes(1, 0, 1.5, 1.2, rho)).toBeLessThan(1);
  });
});

describe("scoreGrid", () => {
  it("renormalises to exactly 1", () => {
    const grid = scoreGrid(1.7, 1.1, -0.15, 12);
    let total = 0;
    for (const row of grid) for (const p of row) total += p;
    expect(total).toBeCloseTo(1, 9);
  });

  it("ρ = 0 reduces to independent Poisson product", () => {
    const grid = scoreGrid(1.5, 1.2, 0, 10);
    const expected = pmf(2, 1.5) * pmf(1, 1.2);
    expect(grid[2][1]).toBeCloseTo(expected, 4);
  });

  it("ρ < 0 boosts P(0-0) and P(1-1) vs ρ = 0", () => {
    const indep = scoreGrid(1.4, 1.1, 0, 10);
    const dc = scoreGrid(1.4, 1.1, -0.15, 10);
    expect(dc[0][0]).toBeGreaterThan(indep[0][0]);
    expect(dc[1][1]).toBeGreaterThan(indep[1][1]);
  });

  it("ρ < 0 reduces P(1-0) and P(0-1) vs ρ = 0", () => {
    const indep = scoreGrid(1.4, 1.1, 0, 10);
    const dc = scoreGrid(1.4, 1.1, -0.15, 10);
    expect(dc[1][0]).toBeLessThan(indep[1][0]);
    expect(dc[0][1]).toBeLessThan(indep[0][1]);
  });

  it("never produces negative cells (clamped τ)", () => {
    // Extreme ρ that would push τ negative if not clamped.
    const grid = scoreGrid(2.5, 2.5, -0.49, 10);
    for (const row of grid) for (const p of row) expect(p).toBeGreaterThanOrEqual(0);
  });
});
