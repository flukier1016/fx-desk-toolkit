/** 每日 PnL 归因(泰勒分解) —— 与《完整版》图解精要"风险与PnL归因"一致
 *  PnL ≈ Δ·dS + ½Γ·dS² + vega·dσ + θ·days + carry·days ;若给出期权全重估,余项=residual
 */
import { gkPrice, type CP, type GKInputs } from "./gk";

export interface PnLInputs {
  delta: number;        // 每 1 名义
  gamma: number;
  vega: number;         // per 1.00 vol
  thetaDay: number;     // per calendar day
  carryDay?: number;    // per day, 可选
  dS: number;           // 即期变动(绝对)
  dSigma: number;       // 波动率变动(绝对, 如 0.005 = 0.5vol)
  days: number;
  notional: number;     // 名义(外币单位)
}

export interface PnLBreakdown {
  delta: number; gamma: number; vega: number; theta: number; carry: number;
  explained: number; residual?: number; total?: number;
}

export function pnlAttribution(p: PnLInputs, fullReprice?: { cp: CP; before: GKInputs; after: GKInputs }): PnLBreakdown {
  const N = p.notional;
  const d = p.delta * p.dS * N;
  const g = 0.5 * p.gamma * p.dS * p.dS * N;
  const v = p.vega * p.dSigma * N;
  const t = p.thetaDay * p.days * N;
  const c = (p.carryDay ?? 0) * p.days * N;
  const explained = d + g + v + t + c;
  const out: PnLBreakdown = { delta: d, gamma: g, vega: v, theta: t, carry: c, explained };
  if (fullReprice) {
    const before = gkPrice(fullReprice.cp, fullReprice.before);
    const after = gkPrice(fullReprice.cp, fullReprice.after);
    out.total = (after - before) * N;
    out.residual = out.total - explained;
  }
  return out;
}
