/** L1 · 数字期权与触碰期权(GK 测度,闭式解)
 *  cash-or-nothing: 到期 S_T 越过 K 付 1 本币 → e^{-rd T}Φ(±d2)
 *  asset-or-nothing: 付 1 外币(价值 S_T) → S e^{-rf T}Φ(±d1)
 *  one-touch / no-touch(到期支付口径): 用首达概率(反射原理,含漂移),
 *    P_hit = Φ((ln(H/S)−νT)/σ√T · sgn) + (H/S)^{2ν/σ²} Φ(...)  ν = rd−rf−σ²/2
 *  不变量: OT+NT = e^{-rd T}; cashCall+cashPut = e^{-rd T}; S→H 时 OT→df。
 */
import { Phi } from "./norm";
import { d12, type CP } from "./gk";

export interface DigInputs { S: number; K: number; rd: number; rf: number; sigma: number; T: number; }

/** 现金数字(cash-or-nothing, 付 1 本币) */
export function cashDigital(cp: CP, { S, K, rd, rf, sigma, T }: DigInputs): number {
  const [, d2] = d12(S, K, rd, rf, sigma, T);
  return Math.exp(-rd * T) * (cp === "call" ? Phi(d2) : Phi(-d2));
}

/** 资产数字(asset-or-nothing, 付 1 外币) */
export function assetDigital(cp: CP, { S, K, rd, rf, sigma, T }: DigInputs): number {
  const [d1] = d12(S, K, rd, rf, sigma, T);
  return S * Math.exp(-rf * T) * (cp === "call" ? Phi(d1) : Phi(-d1));
}

/** 风险中性下 [0,T] 内触碰水平 H 的概率(连续监控) */
export function hitProbability(S: number, H: number, rd: number, rf: number, sigma: number, T: number): number {
  if (H === S) return 1;
  const nu = rd - rf - 0.5 * sigma * sigma;
  const v = sigma * Math.sqrt(T);
  const lnHS = Math.log(H / S);
  const pow = Math.pow(H / S, (2 * nu) / (sigma * sigma));
  if (H < S) {
    // 下触碰: min ≤ ln(H/S)
    return Phi((lnHS - nu * T) / v) + pow * Phi((lnHS + nu * T) / v);
  }
  // 上触碰: max ≥ ln(H/S)
  return Phi((-lnHS + nu * T) / v) + pow * Phi((-lnHS - nu * T) / v);
}

/** one-touch(触碰过 H 则到期付 1 本币;到期支付口径) */
export function oneTouch(S: number, H: number, rd: number, rf: number, sigma: number, T: number): number {
  return Math.exp(-rd * T) * hitProbability(S, H, rd, rf, sigma, T);
}
/** no-touch(全程未触碰 H 则到期付 1 本币) */
export function noTouch(S: number, H: number, rd: number, rf: number, sigma: number, T: number): number {
  return Math.exp(-rd * T) * (1 - hitProbability(S, H, rd, rf, sigma, T));
}
