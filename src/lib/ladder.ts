/** L2 · 情景矩阵引擎:即期 × 波动率 双向冲击网格(每格重估)
 *  不变量:中心格 = 基准值;单调性可抽查。
 */
import { gk, type CP, type GKInputs, type GKResult } from "./gk";

export type Metric = "price" | "deltaSpot" | "gamma" | "vegaPct" | "thetaDay" | "pnl";

export interface LadderSpec {
  cp: CP; base: GKInputs;
  spotShocks: number[];   // 相对冲击,如 [-0.02,...,0.02]
  volShocks: number[];    // 绝对vol冲击,如 [-0.02,...,0.02]
  notional: number;
}

export interface LadderCell { dS: number; dVol: number; r: GKResult; pnl: number; }

export function ladder(spec: LadderSpec): LadderCell[][] {
  const base = gk(spec.cp, spec.base);
  return spec.volShocks.map((dv) =>
    spec.spotShocks.map((ds) => {
      const r = gk(spec.cp, {
        ...spec.base,
        S: spec.base.S * (1 + ds),
        sigma: Math.max(spec.base.sigma + dv, 1e-6),
      });
      return { dS: ds, dVol: dv, r, pnl: (r.price - base.price) * spec.notional };
    }),
  );
}

export function pick(cell: LadderCell, m: Metric): number {
  if (m === "pnl") return cell.pnl;
  return cell.r[m];
}

export const defaultSpotShocks = [-0.02, -0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.015, 0.02];
export const defaultVolShocks = [-0.02, -0.01, 0, 0.01, 0.02];
