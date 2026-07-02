/** Garman–Kohlhagen 外汇期权定价与希腊字母
 *  约定:S=即期(1外币=S本币, 直接标价), rd=本币连续复利, rf=外币连续复利, σ=年化波动率, T=年
 *  价格以本币计价、每 1 单位外币名义。
 *  公式与《随机分析与FX定价·完整版》§10–11 逐条对齐。
 */
import { Phi, phi, PhiInv } from "./norm";

export type CP = "call" | "put";

export interface GKInputs { S: number; K: number; rd: number; rf: number; sigma: number; T: number; }

export interface GKResult {
  price: number; forward: number; d1: number; d2: number;
  deltaSpot: number;      // e^{-rf T}Φ(±d1)
  deltaFwd: number;       // Φ(±d1)
  deltaPA: number;        // premium-adjusted spot delta = ±(K/S)e^{-rd T}Φ(±d2)
  gamma: number;          // ∂²V/∂S²
  vega: number;           // ∂V/∂σ (per 1.00 vol)
  vegaPct: number;        // per 1% vol
  thetaYear: number;      // 日历 θ, per year
  thetaDay: number;       // per calendar day (/365)
  rhoD: number; rhoF: number;
}

export function fwd(S: number, rd: number, rf: number, T: number): number {
  return S * Math.exp((rd - rf) * T);
}

export function d12(S: number, K: number, rd: number, rf: number, sigma: number, T: number): [number, number] {
  const v = sigma * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (rd - rf + 0.5 * sigma * sigma) * T) / v;
  return [d1, d1 - v];
}

export function gkPrice(cp: CP, { S, K, rd, rf, sigma, T }: GKInputs): number {
  if (T <= 0 || sigma <= 0) { // 到期支付/退化
    const F = fwd(S, rd, rf, Math.max(T, 0));
    const intr = cp === "call" ? Math.max(F - K, 0) : Math.max(K - F, 0);
    return Math.exp(-rd * Math.max(T, 0)) * intr;
  }
  const [d1, d2] = d12(S, K, rd, rf, sigma, T);
  const df = Math.exp(-rd * T), ff = Math.exp(-rf * T);
  return cp === "call"
    ? S * ff * Phi(d1) - K * df * Phi(d2)
    : K * df * Phi(-d2) - S * ff * Phi(-d1);
}

export function gk(cp: CP, inp: GKInputs): GKResult {
  const { S, K, rd, rf, sigma, T } = inp;
  const [d1, d2] = d12(S, K, rd, rf, sigma, T);
  const sqT = Math.sqrt(T);
  const df = Math.exp(-rd * T), ff = Math.exp(-rf * T);
  const price = gkPrice(cp, inp);
  const sign = cp === "call" ? 1 : -1;
  const Nd1 = cp === "call" ? Phi(d1) : -Phi(-d1);
  const Nd2 = cp === "call" ? Phi(d2) : -Phi(-d2);
  const deltaSpot = ff * Nd1;
  const deltaFwd = Nd1;
  const deltaPA = (K / S) * df * Nd2; // = deltaSpot − price/S (恒等式,测试校验)
  const gamma = (ff * phi(d1)) / (S * sigma * sqT);
  const vega = S * ff * phi(d1) * sqT;
  const thetaYear =
    -(S * ff * phi(d1) * sigma) / (2 * sqT) +
    sign * (rf * S * ff * Phi(sign * d1) - rd * K * df * Phi(sign * d2));
  const rhoD = sign * T * K * df * Phi(sign * d2);
  const rhoF = -sign * T * S * ff * Phi(sign * d1);
  return {
    price, forward: fwd(S, rd, rf, T), d1, d2,
    deltaSpot, deltaFwd, deltaPA, gamma, vega, vegaPct: vega / 100,
    thetaYear, thetaDay: thetaYear / 365, rhoD, rhoF,
  };
}

/** Delta 约定 */
export type DeltaConv = "spot" | "forward" | "pa-spot" | "pa-forward";

/** 由 delta 反解行权价 K。delta 输入用绝对值(0~1), cp 指明方向。 */
export function strikeFromDelta(
  cp: CP, delta: number, S: number, rd: number, rf: number, sigma: number, T: number,
  conv: DeltaConv,
): number {
  const F = fwd(S, rd, rf, T);
  const v = sigma * Math.sqrt(T);
  const ff = Math.exp(-rf * T);
  const sign = cp === "call" ? 1 : -1;
  if (conv === "spot" || conv === "forward") {
    const dAdj = conv === "spot" ? delta / ff : delta;
    if (dAdj <= 0 || dAdj >= 1) return NaN;
    const d1 = sign * PhiInv(dAdj);
    return F * Math.exp(-d1 * v + 0.5 * v * v);
  }
  // premium-adjusted: |Δ_pa| = (K/S)e^{-rd T}Φ(±d2) —— K 出现在两侧,数值求根(单调区间内二分)
  const df = Math.exp(-rd * T);
  const f = (K: number) => {
    const d2 = (Math.log(F / K) - 0.5 * v * v) / v;
    return (K / S) * df * Phi(sign * d2) - delta;
  };
  // call 的 pa-delta 非单调:限制在 K ≥ K_max(delta峰值) 的右支(市场惯例)
  let lo = F * Math.exp(-5 * v), hi = F * Math.exp(5 * v);
  if (cp === "call") {
    // 找峰值再取右支
    let a = lo, b = hi;
    for (let i = 0; i < 200; i++) {
      const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;
      if (f(m1) + delta < f(m2) + delta) a = m1; else b = m2; // 最大化 (K/S)dfΦ(d2)
    }
    lo = (a + b) / 2;
  }
  let a = lo, b = hi, fa = f(a);
  if (fa < 0 && cp === "call") return NaN; // delta 超过可达峰值
  for (let i = 0; i < 200; i++) {
    const m = 0.5 * (a + b), fm = f(m);
    if ((fa > 0) === (fm > 0)) { a = m; fa = fm; } else { b = m; }
  }
  return 0.5 * (a + b);
}

/** ATM 约定对应的行权价 */
export function atmStrike(kind: "atmf" | "dns" | "dns-pa", S: number, rd: number, rf: number, sigma: number, T: number): number {
  const F = fwd(S, rd, rf, T);
  const v2 = 0.5 * sigma * sigma * T;
  if (kind === "atmf") return F;
  if (kind === "dns") return F * Math.exp(v2);   // 零 delta 跨式(pips)
  return F * Math.exp(-v2);                       // 零 delta 跨式(premium-adjusted)
}
