/** 新引擎模块的不变量测试:数字/触碰、策略、情景矩阵、约定、自检器 */
import { describe, it, expect } from "vitest";
import { cashDigital, assetDigital, oneTouch, noTouch, hitProbability } from "./digital";
import { gkPrice, gk, type GKInputs } from "./gk";
import { priceStrategy, payoffCurve, preset } from "./strategy";
import { ladder, defaultSpotShocks, defaultVolShocks } from "./ladder";
import { pairConv, yearFrac } from "./conventions";
import { runSelfTests } from "./selftest";

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol);
const b: GKInputs = { S: 7.2, K: 7.25, rd: 0.019, rf: 0.043, sigma: 0.055, T: 0.25 };

describe("数字期权", () => {
  it("现金数字对称: C+P = e^{-rd T}", () => {
    near(cashDigital("call", b) + cashDigital("put", b), Math.exp(-b.rd * b.T), 1e-12);
  });
  it("资产数字对称: C+P = S e^{-rf T}", () => {
    near(assetDigital("call", b) + assetDigital("put", b), b.S * Math.exp(-b.rf * b.T), 1e-12);
  });
  it("复制关系: 香草call = 资产数字call − K·现金数字call", () => {
    near(gkPrice("call", b), assetDigital("call", b) - b.K * cashDigital("call", b), 1e-12);
  });
});

describe("触碰期权", () => {
  it("互补: OT+NT = e^{-rd T}(上下障碍都成立)", () => {
    for (const H of [7.0, 7.4]) {
      near(oneTouch(b.S, H, b.rd, b.rf, b.sigma, b.T) + noTouch(b.S, H, b.rd, b.rf, b.sigma, b.T), Math.exp(-b.rd * b.T), 1e-12);
    }
  });
  it("边界: S=H → 触碰概率=1;障碍极远 → 概率→0", () => {
    near(hitProbability(7.2, 7.2, b.rd, b.rf, b.sigma, b.T), 1, 1e-12);
    expect(hitProbability(7.2, 3.0, b.rd, b.rf, b.sigma, b.T)).toBeLessThan(1e-10);
    expect(hitProbability(7.2, 20.0, b.rd, b.rf, b.sigma, b.T)).toBeLessThan(1e-10);
  });
  it("单调: 障碍越近触碰概率越大", () => {
    const p1 = hitProbability(7.2, 7.1, b.rd, b.rf, b.sigma, b.T);
    const p2 = hitProbability(7.2, 7.0, b.rd, b.rf, b.sigma, b.T);
    expect(p1).toBeGreaterThan(p2);
  });
});

describe("策略引擎", () => {
  const m = { S: b.S, rd: b.rd, rf: b.rf, T: b.T };
  it("可加性: 组合 = Σ qty×单腿(价格与各希腊字母)", () => {
    const legs = [
      { cp: "call" as const, K: 7.25, qty: 2, sigma: 0.055 },
      { cp: "put" as const, K: 7.15, qty: -1, sigma: 0.06 },
    ];
    const s = priceStrategy(legs, m);
    const c = gk("call", { ...b, K: 7.25 });
    const p = gk("put", { ...b, K: 7.15, sigma: 0.06 });
    near(s.price, 2 * c.price - p.price, 1e-12);
    near(s.deltaSpot, 2 * c.deltaSpot - p.deltaSpot, 1e-12);
    near(s.vegaPct, 2 * c.vegaPct - p.vegaPct, 1e-12);
  });
  it("RR 预设: 两腿 |Δ|≈0.25", () => {
    const legs = preset("rr25", m, 0.055);
    for (const l of legs) {
      const r = gk(l.cp, { ...b, K: l.K });
      near(Math.abs(r.deltaSpot), 0.25, 1e-6);
    }
  });
  it("到期损益曲线: 跨式在两端为正、行权价处最低(等于−权利金)", () => {
    const legs = preset("straddle", m, 0.055);
    const curve = payoffCurve(legs, m, 101, 0.1);
    const mid = curve.reduce((a, c) => (Math.abs(c.S - legs[0].K) < Math.abs(a.S - legs[0].K) ? c : a));
    const prem = priceStrategy(legs, m).price;
    near(mid.pnl, -prem, prem * 0.05 + 1e-4);
    expect(curve[0].pnl).toBeGreaterThan(mid.pnl);
    expect(curve[curve.length - 1].pnl).toBeGreaterThan(mid.pnl);
  });
});

describe("情景矩阵", () => {
  it("中心格 = 基准(PnL=0);spot上移看涨PnL为正", () => {
    const g = ladder({ cp: "call", base: b, spotShocks: defaultSpotShocks, volShocks: defaultVolShocks, notional: 1e6 });
    const midRow = g[Math.floor(g.length / 2)];
    const mid = midRow[Math.floor(midRow.length / 2)];
    near(mid.pnl, 0, 1e-9);
    expect(midRow[midRow.length - 1].pnl).toBeGreaterThan(0);
    expect(midRow[0].pnl).toBeLessThan(0);
  });
});

describe("约定注册表", () => {
  it("USDJPY pip=100 且 PA;未知对回退 CUSTOM", () => {
    expect(pairConv("USDJPY").pipFactor).toBe(100);
    expect(pairConv("USDJPY").premiumAdjusted).toBe(true);
    expect(pairConv("XXXYYY").symbol).toBe("CUSTOM");
  });
  it("计息基准", () => {
    near(yearFrac(91, "ACT/365"), 91 / 365, 1e-15);
    near(yearFrac(90, "ACT/360"), 0.25, 1e-15);
  });
});

describe("浏览器自检器(同源不变量)", () => {
  it("15 项全部通过", () => {
    const r = runSelfTests();
    expect(r.length).toBe(15);
    for (const c of r) expect(c.pass, c.name).toBe(true);
  });
});
