/** v3 测试:SABR、vanna/volga、隐含波动率、随机参数扫描(全参数空间不变量) */
import { describe, it, expect } from "vitest";
import { sabrVol, calibrateSabr, solveAlpha } from "./sabr";
import { gk, gkPrice, vanna, volga, impliedVol, strikeFromDelta, atmStrike, fwd, type GKInputs } from "./gk";
import { knockIn, knockOut } from "./barrier";
import { cashDigital, oneTouch, noTouch } from "./digital";

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe("SABR (β=1)", () => {
  const F = 7.1569, T = 0.25;
  it("ν→0 退化: σ(F,K) ≡ α(平坦)", () => {
    const p = { alpha: 0.055, beta: 1, rho: 0, nu: 1e-10 };
    for (const K of [6.8, 7.0, 7.1569, 7.4, 7.8]) near(sabrVol(F, K, T, p), 0.055, 1e-6);
  });
  it("solveAlpha: ATM 方程精确复现", () => {
    const a = solveAlpha(0.055, -0.3, 1.2, T);
    const atm = sabrVol(F, F, T, { alpha: a, beta: 1, rho: -0.3, nu: 1.2 });
    near(atm, 0.055, 1e-8);
  });
  it("三点校准: 锚点复现 < 0.01 vol pt,且 ρ 与 RR 同号", () => {
    // USDCNY 式报价: atm=5.5%, RR=+0.8%(call贵), BF=0.30%
    const atm = 0.055, rr = 0.008, bf = 0.003;
    const sigC = atm + bf + rr / 2, sigP = atm + bf - rr / 2;
    const S = 7.2, rd = 0.019, rf = 0.043;
    const Katm = atmStrike("dns", S, rd, rf, atm, T);
    const Kc = strikeFromDelta("call", 0.25, S, rd, rf, sigC, T, "spot");
    const Kp = strikeFromDelta("put", 0.25, S, rd, rf, sigP, T, "spot");
    const { params, rmse } = calibrateSabr({ F: fwd(S, rd, rf, T), T, Katm, sigAtm: atm, Kp, sigP, Kc, sigC });
    expect(rmse).toBeLessThan(1e-4); // < 0.01 vol point
    near(sabrVol(fwd(S, rd, rf, T), Kc, T, params), sigC, 2e-4);
    near(sabrVol(fwd(S, rd, rf, T), Kp, T, params), sigP, 2e-4);
    expect(params.rho).toBeGreaterThan(0); // call 贵 → 正偏 → ρ>0
    expect(params.nu).toBeGreaterThan(0);
  });
});

describe("vanna / volga", () => {
  const b: GKInputs = { S: 7.2, K: 7.3, rd: 0.019, rf: 0.043, sigma: 0.055, T: 0.25 };
  it("vanna 对拍: ∂Δspot/∂σ 有限差分", () => {
    const h = 1e-5;
    const up = gk("call", { ...b, sigma: b.sigma + h }).deltaSpot;
    const dn = gk("call", { ...b, sigma: b.sigma - h }).deltaSpot;
    near(vanna(b), (up - dn) / (2 * h), 1e-4);
  });
  it("volga 对拍: ∂vega/∂σ 有限差分", () => {
    const h = 1e-5;
    const up = gk("call", { ...b, sigma: b.sigma + h }).vega;
    const dn = gk("call", { ...b, sigma: b.sigma - h }).vega;
    near(volga(b), (up - dn) / (2 * h), 1e-3);
  });
});

describe("隐含波动率", () => {
  it("往返: σ→price→σ(call/put, ITM/OTM)", () => {
    for (const cp of ["call", "put"] as const) {
      for (const K of [6.9, 7.2, 7.5]) {
        for (const sig of [0.03, 0.055, 0.2]) {
          const price = gkPrice(cp, { S: 7.2, K, rd: 0.019, rf: 0.043, sigma: sig, T: 0.25 });
          near(impliedVol(cp, price, 7.2, K, 0.019, 0.043, 0.25), sig, 1e-7);
        }
      }
    }
  });
  it("越界: 价格低于内在值或高于上界 → NaN", () => {
    expect(Number.isNaN(impliedVol("call", -0.01, 7.2, 7.2, 0.019, 0.043, 0.25))).toBe(true);
    expect(Number.isNaN(impliedVol("call", 7.2, 7.2, 7.2, 0.019, 0.043, 0.25))).toBe(true);
  });
});

describe("随机参数扫描(200 组,种子 LCG,可复现)", () => {
  // 线性同余伪随机(避免不可复现):x_{n+1} = (a x + c) mod m
  let seed = 20260706;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const draw = (): GKInputs => {
    const S = Math.exp(Math.log(0.5) + rnd() * (Math.log(200) - Math.log(0.5)));
    return {
      S, K: S * Math.exp(-0.5 + rnd()),
      rd: -0.01 + rnd() * 0.11, rf: -0.01 + rnd() * 0.11,
      sigma: 0.01 + rnd() * 0.79, T: 0.02 + rnd() * 2.98,
    };
  };
  it("恒等式在整个参数空间成立", () => {
    for (let n = 0; n < 200; n++) {
      const b = draw();
      const scale = Math.max(b.S, b.K);
      // parity
      near(gkPrice("call", b) - gkPrice("put", b), b.S * Math.exp(-b.rf * b.T) - b.K * Math.exp(-b.rd * b.T), 1e-9 * scale);
      // PA 恒等式
      const r = gk("call", b);
      near(r.deltaPA, r.deltaSpot - r.price / b.S, 1e-10 * Math.max(1, scale / b.S));
      // 数字对称
      near(cashDigital("call", b) + cashDigital("put", b), Math.exp(-b.rd * b.T), 1e-12);
      // 障碍 in-out 平价(障碍取 S 下方 8%)
      const c = { ...b, B: b.S * 0.92 };
      near(knockIn("call", "down", c) + knockOut("call", "down", c), gkPrice("call", b), 1e-8 * scale);
      // 触碰互补
      near(oneTouch(b.S, b.S * 0.95, b.rd, b.rf, b.sigma, b.T) + noTouch(b.S, b.S * 0.95, b.rd, b.rf, b.sigma, b.T), Math.exp(-b.rd * b.T), 1e-12);
      // 隐含波动率:价格空间往返(σ 在 vega→0 处不可辨识,价格才是良态不变量)
      const price = gkPrice("call", b);
      if (price > 1e-8 * scale) {
        const iv = impliedVol("call", price, b.S, b.K, b.rd, b.rf, b.T);
        near(gkPrice("call", { ...b, sigma: iv }), price, 1e-8 * scale);
      }
    }
  });
});
