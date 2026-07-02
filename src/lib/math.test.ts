import { describe, it, expect } from "vitest";
import { Phi, PhiInv } from "./norm";
import { gk, gkPrice, strikeFromDelta, atmStrike, type GKInputs } from "./gk";
import { smileNodes, pchip } from "./smile";
import { knockIn, knockOut, bgkAdjustedBarrier } from "./barrier";
import { forwardRate, impliedRd, impliedRf, impliedBasis, swapPoints } from "./cip";
import { pnlAttribution } from "./pnl";

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe("正态分布", () => {
  it("Φ 关键值", () => {
    near(Phi(0), 0.5, 1e-14);
    near(Phi(1.959963984540054), 0.975, 1e-12);
    near(Phi(-1.959963984540054), 0.025, 1e-12);
    near(Phi(1) + Phi(-1), 1, 1e-14);
  });
  it("Φ⁻¹∘Φ 往返", () => {
    for (const x of [-3.5, -2, -0.7, 0, 0.3, 1.1, 2.8]) near(PhiInv(Phi(x)), x, 1e-9);
  });
});

describe("Garman–Kohlhagen", () => {
  const base: GKInputs = { S: 100, K: 100, rd: 0.05, rf: 0.02, sigma: 0.1, T: 1 };

  it("rf=0 退化为 Black–Scholes 经典值: S=K=100,r=5%,σ=20%,T=1 → C≈10.4506", () => {
    const c = gkPrice("call", { S: 100, K: 100, rd: 0.05, rf: 0, sigma: 0.2, T: 1 });
    near(c, 10.450583572185565, 1e-9);
  });

  it("Put–Call Parity: C−P = S e^{-rf T} − K e^{-rd T}", () => {
    const c = gkPrice("call", base), p = gkPrice("put", base);
    near(c - p, base.S * Math.exp(-base.rf) - base.K * Math.exp(-base.rd), 1e-12);
  });

  it("PA delta 恒等式: Δ_pa = Δ_spot − V/S", () => {
    for (const cp of ["call", "put"] as const) {
      const r = gk(cp, base);
      near(r.deltaPA, r.deltaSpot - r.price / base.S, 1e-12);
    }
  });

  it("数值希腊字母对拍(有限差分)", () => {
    const h = 1e-4;
    const r = gk("call", base);
    const up = gkPrice("call", { ...base, S: base.S + h });
    const dn = gkPrice("call", { ...base, S: base.S - h });
    near(r.deltaSpot, (up - dn) / (2 * h), 1e-6);
    near(r.gamma, (up - 2 * r.price + dn) / (h * h), 1e-4);
    const vu = gkPrice("call", { ...base, sigma: base.sigma + h });
    const vd = gkPrice("call", { ...base, sigma: base.sigma - h });
    near(r.vega, (vu - vd) / (2 * h), 1e-5);
    const tEps = 1e-5;
    const tShift = gkPrice("call", { ...base, T: base.T - tEps });
    near(r.thetaYear, (tShift - r.price) / tEps, 1e-4);
  });

  it("delta→strike→delta 往返(spot / forward)", () => {
    for (const conv of ["spot", "forward"] as const) {
      for (const cp of ["call", "put"] as const) {
        const K = strikeFromDelta(cp, 0.25, base.S, base.rd, base.rf, base.sigma, base.T, conv);
        const r = gk(cp, { ...base, K });
        const d = conv === "spot" ? Math.abs(r.deltaSpot) : Math.abs(r.deltaFwd);
        near(d, 0.25, 1e-9);
      }
    }
  });

  it("delta→strike→delta 往返(premium-adjusted)", () => {
    for (const cp of ["call", "put"] as const) {
      const K = strikeFromDelta(cp, 0.25, base.S, base.rd, base.rf, base.sigma, base.T, "pa-spot");
      const r = gk(cp, { ...base, K });
      near(Math.abs(r.deltaPA), 0.25, 1e-7);
    }
  });

  it("ATM 约定: DNS(pips) 处跨式 spot-delta 之和=0; DNS(pa) 处 pa-delta 之和=0", () => {
    const Kdns = atmStrike("dns", base.S, base.rd, base.rf, base.sigma, base.T);
    const rc = gk("call", { ...base, K: Kdns }), rp = gk("put", { ...base, K: Kdns });
    near(rc.deltaSpot + rp.deltaSpot, 0, 1e-12);
    const Kpa = atmStrike("dns-pa", base.S, base.rd, base.rf, base.sigma, base.T);
    const rc2 = gk("call", { ...base, K: Kpa }), rp2 = gk("put", { ...base, K: Kpa });
    near(rc2.deltaPA + rp2.deltaPA, 0, 1e-12);
  });
});

describe("微笑曲线", () => {
  it("重建恒等式: σ25c−σ25p=RR, 平均−ATM=BF", () => {
    const q = { atm: 0.09, rr25: -0.01, bf25: 0.0035 };
    const nodes = smileNodes(q);
    const c = nodes.find(n => n.label === "25ΔC")!.sigma;
    const p = nodes.find(n => n.label === "25ΔP")!.sigma;
    near(c - p, q.rr25, 1e-14);
    near((c + p) / 2 - q.atm, q.bf25, 1e-14);
  });
  it("pchip 过点且单调段保形", () => {
    const f = pchip([0, 1, 2, 3], [1, 2, 4, 8]);
    near(f(0), 1, 1e-14); near(f(2), 4, 1e-14);
    expect(f(1.5)).toBeGreaterThan(2); expect(f(1.5)).toBeLessThan(4);
  });
});

describe("障碍期权", () => {
  const c = { S: 100, K: 100, B: 90, rd: 0.05, rf: 0.02, sigma: 0.2, T: 1 };
  it("in–out 平价: KI + KO = 香草", () => {
    for (const cp of ["call", "put"] as const) {
      const v = gkPrice(cp, c);
      near(knockIn(cp, "down", c) + knockOut(cp, "down", c), v, 1e-9);
      const cu = { ...c, B: 115 };
      near(knockIn(cp, "up", cu) + knockOut(cp, "up", cu), gkPrice(cp, cu), 1e-9);
    }
  });
  it("边界: S→B 时敲出→0", () => {
    const v = knockOut("call", "down", { ...c, S: 90.0000001 });
    expect(v).toBeLessThan(1e-4);
  });
  it("障碍远去: B→0 时 down-and-out call → 香草", () => {
    near(knockOut("call", "down", { ...c, B: 1e-6 }), gkPrice("call", c), 1e-6);
  });
  it("BGK: 观察次数→∞ 时修正障碍→原障碍;down 障碍向下移", () => {
    const adj = bgkAdjustedBarrier(90, 100, 0.2, 1, 1e10);
    near(adj, 90, 1e-3);
    expect(bgkAdjustedBarrier(90, 100, 0.2, 1, 252)).toBeLessThan(90);
    expect(bgkAdjustedBarrier(115, 100, 0.2, 1, 252)).toBeGreaterThan(115);
  });
  it("已触碰退化: down 且 S≤B 时 KO=0, KI=香草", () => {
    const t = { ...c, S: 85 };
    near(knockOut("call", "down", t), 0, 1e-14);
    near(knockIn("call", "down", t), gkPrice("call", t), 1e-12);
  });
});

describe("CIP / 掉期点", () => {
  it("远期往返: impliedRd/impliedRf 反解", () => {
    for (const comp of ["simple", "continuous"] as const) {
      const F = forwardRate(7.2, 0.019, 0.043, 0.5, comp);
      near(impliedRd(7.2, F, 0.043, 0.5, comp), 0.019, 1e-12);
      near(impliedRf(7.2, F, 0.019, 0.5, comp), 0.043, 1e-12);
      near(impliedBasis(7.2, F, 0.019, 0.043, 0.5, comp), 0, 1e-12);
    }
  });
  it("中美利差为负 → 远期贴水为负点(USDCNY 掉期点为负)", () => {
    const F = forwardRate(7.2, 0.019, 0.043, 1, "simple");
    expect(F).toBeLessThan(7.2);
    expect(swapPoints(7.2, F)).toBeLessThan(0);
  });
});

describe("PnL 归因", () => {
  it("小扰动下 residual 很小", () => {
    const base: GKInputs = { S: 7.2, K: 7.25, rd: 0.019, rf: 0.043, sigma: 0.055, T: 0.25 };
    const g = gk("call", base);
    const dS = 0.002, dSig = 0.001, days = 1;
    const after: GKInputs = { ...base, S: base.S + dS, sigma: base.sigma + dSig, T: base.T - days / 365 };
    const out = pnlAttribution(
      { delta: g.deltaSpot, gamma: g.gamma, vega: g.vega, thetaDay: g.thetaDay, dS, dSigma: dSig, days, notional: 1e6 },
      { cp: "call", before: base, after },
    );
    expect(Math.abs(out.residual!)).toBeLessThan(Math.abs(out.total!) * 0.02 + 1);
  });
});
