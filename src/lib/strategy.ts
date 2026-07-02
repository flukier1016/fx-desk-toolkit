/** L2 · 多腿期权策略引擎:组合定价、净希腊字母、到期损益曲线
 *  预设(straddle/strangle/RR/butterfly/seagull)按 delta 或 DNS 出行权价。
 *  不变量:组合价格/希腊字母 = Σ qty_i × 单腿。
 */
import { gk, strikeFromDelta, atmStrike, type CP, type GKResult } from "./gk";

export interface Leg { cp: CP; K: number; qty: number; sigma: number; label?: string; }
export interface Mkt { S: number; rd: number; rf: number; T: number; }

export interface StrategyResult {
  legs: { leg: Leg; r: GKResult }[];
  price: number;           // 净权利金(本币/1外币名义,买正卖负)
  deltaSpot: number; gamma: number; vegaPct: number; thetaDay: number;
}

export function priceStrategy(legs: Leg[], m: Mkt): StrategyResult {
  const rows = legs.map((leg) => ({ leg, r: gk(leg.cp, { S: m.S, K: leg.K, rd: m.rd, rf: m.rf, sigma: leg.sigma, T: m.T }) }));
  const sum = (f: (x: { leg: Leg; r: GKResult }) => number) => rows.reduce((a, x) => a + x.leg.qty * f(x), 0);
  return {
    legs: rows,
    price: sum((x) => x.r.price),
    deltaSpot: sum((x) => x.r.deltaSpot),
    gamma: sum((x) => x.r.gamma),
    vegaPct: sum((x) => x.r.vegaPct),
    thetaDay: sum((x) => x.r.thetaDay),
  };
}

/** 到期损益(含权利金): pnl(S_T) = Σ qty·intrinsic − 净权利金(终值口径不折现,教学近似) */
export function payoffCurve(legs: Leg[], m: Mkt, nPts = 121, width = 0.15): { S: number; pnl: number }[] {
  const prem = priceStrategy(legs, m).price;
  const out: { S: number; pnl: number }[] = [];
  for (let i = 0; i < nPts; i++) {
    const ST = m.S * (1 - width + (2 * width * i) / (nPts - 1));
    const intrinsic = legs.reduce((a, l) => a + l.qty * Math.max(l.cp === "call" ? ST - l.K : l.K - ST, 0), 0);
    out.push({ S: ST, pnl: intrinsic - prem });
  }
  return out;
}

export type PresetId = "straddle" | "strangle25" | "rr25" | "butterfly25" | "seagull";

/** 预设策略:用统一 σ(教学口径)按 delta/DNS 出腿;实盘各腿应取各自 smile σ */
export function preset(id: PresetId, m: Mkt, sigma: number): Leg[] {
  const Kdns = atmStrike("dns", m.S, m.rd, m.rf, sigma, m.T);
  const K25c = strikeFromDelta("call", 0.25, m.S, m.rd, m.rf, sigma, m.T, "spot");
  const K25p = strikeFromDelta("put", 0.25, m.S, m.rd, m.rf, sigma, m.T, "spot");
  switch (id) {
    case "straddle":
      return [
        { cp: "call", K: Kdns, qty: 1, sigma, label: "买 Call @DNS" },
        { cp: "put", K: Kdns, qty: 1, sigma, label: "买 Put @DNS" },
      ];
    case "strangle25":
      return [
        { cp: "call", K: K25c, qty: 1, sigma, label: "买 25ΔC" },
        { cp: "put", K: K25p, qty: 1, sigma, label: "买 25ΔP" },
      ];
    case "rr25":
      return [
        { cp: "call", K: K25c, qty: 1, sigma, label: "买 25ΔC" },
        { cp: "put", K: K25p, qty: -1, sigma, label: "卖 25ΔP" },
      ];
    case "butterfly25":
      return [
        { cp: "call", K: K25c, qty: 1, sigma, label: "买 25ΔC" },
        { cp: "put", K: K25p, qty: 1, sigma, label: "买 25ΔP" },
        { cp: "call", K: Kdns, qty: -1, sigma, label: "卖 Call @DNS" },
        { cp: "put", K: Kdns, qty: -1, sigma, label: "卖 Put @DNS" },
      ];
    case "seagull": // 买 call spread + 卖 put:客户成本减免型
      return [
        { cp: "call", K: Kdns, qty: 1, sigma, label: "买 Call @DNS" },
        { cp: "call", K: K25c, qty: -1, sigma, label: "卖 25ΔC" },
        { cp: "put", K: K25p, qty: -1, sigma, label: "卖 25ΔP" },
      ];
  }
}
