/** 波动率微笑:由 ATM / 25ΔRR / 25ΔBF (可选 10Δ) 重建 σ(Δ) 曲线
 *  σ_25c = ATM + BF25 + RR25/2 ; σ_25p = ATM + BF25 − RR25/2 (10Δ 同理)
 *  与《完整版》§13 一致。曲线插值:单调三次 Hermite(Fritsch–Carlson),x 轴=看涨等价 delta。
 */
import { strikeFromDelta, type DeltaConv } from "./gk";

export interface SmileQuotes {
  atm: number; rr25: number; bf25: number;
  rr10?: number; bf10?: number; // 可选
}

export interface SmileNode { xCallDelta: number; label: string; sigma: number; }

export function smileNodes(q: SmileQuotes): SmileNode[] {
  const n: SmileNode[] = [];
  const s25c = q.atm + q.bf25 + q.rr25 / 2;
  const s25p = q.atm + q.bf25 - q.rr25 / 2;
  if (q.rr10 !== undefined && q.bf10 !== undefined) {
    n.push({ xCallDelta: 0.9, label: "10ΔP", sigma: q.atm + q.bf10 - q.rr10 / 2 });
  }
  n.push({ xCallDelta: 0.75, label: "25ΔP", sigma: s25p });
  n.push({ xCallDelta: 0.5, label: "ATM", sigma: q.atm });
  n.push({ xCallDelta: 0.25, label: "25ΔC", sigma: s25c });
  if (q.rr10 !== undefined && q.bf10 !== undefined) {
    n.push({ xCallDelta: 0.1, label: "10ΔC", sigma: q.atm + q.bf10 + q.rr10 / 2 });
  }
  return n.sort((a, b) => a.xCallDelta - b.xCallDelta);
}

/** 单调三次 Hermite 插值(保形,不过冲) */
export function pchip(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  const h: number[] = [], d: number[] = [];
  for (let i = 0; i < n - 1; i++) { h.push(xs[i + 1] - xs[i]); d.push((ys[i + 1] - ys[i]) / h[i]); }
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const h00 = (1 + 2 * t) * (1 - t) * (1 - t), h10 = t * (1 - t) * (1 - t);
    const h01 = t * t * (3 - 2 * t), h11 = t * t * (t - 1);
    return h00 * ys[i] + h10 * h[i] * m[i] + h01 * ys[i + 1] + h11 * h[i] * m[i + 1];
  };
}

export interface SmileStrikeRow { label: string; delta: string; sigma: number; strike: number; }

/** 把五个锚点映射到行权价(用各自 σ 反解 K;ATM 用 DNS 约定) */
export function smileStrikes(
  q: SmileQuotes, S: number, rd: number, rf: number, T: number, conv: DeltaConv = "spot",
): SmileStrikeRow[] {
  const nodes = smileNodes(q);
  return nodes.map((nd) => {
    let K: number;
    if (nd.label === "ATM") {
      const v2 = 0.5 * nd.sigma * nd.sigma * T;
      K = S * Math.exp((rd - rf) * T) * Math.exp(v2); // DNS(pips)
    } else {
      const cp = nd.label.endsWith("C") ? "call" : "put";
      const del = nd.label.startsWith("10") ? 0.10 : 0.25;
      K = strikeFromDelta(cp, del, S, rd, rf, nd.sigma, T, conv);
    }
    return { label: nd.label, delta: nd.label === "ATM" ? "~50Δ" : nd.label, sigma: nd.sigma, strike: K };
  });
}
