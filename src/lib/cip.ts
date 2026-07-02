/** 掉期点与抵补利率平价(CIP) —— 与《掉期点·中美利差·CIP专题》一致
 *  两种计息约定:连续复利 F = S·e^{(rd−rf)T} ;货币市场(单利) F = S·(1+rd·τd)/(1+rf·τf)
 *  掉期点 points = (F − S) × pipFactor ;隐含利差/基差由市场 F 反推。
 */

export type Compounding = "continuous" | "simple";

export function forwardRate(
  S: number, rd: number, rf: number, T: number, comp: Compounding = "simple",
): number {
  if (comp === "continuous") return S * Math.exp((rd - rf) * T);
  return (S * (1 + rd * T)) / (1 + rf * T);
}

export function swapPoints(S: number, F: number, pipFactor = 10000): number {
  return (F - S) * pipFactor;
}

/** 由市场远期反推隐含本币利率(给定 rf) */
export function impliedRd(S: number, F: number, rf: number, T: number, comp: Compounding = "simple"): number {
  if (comp === "continuous") return rf + Math.log(F / S) / T;
  return ((F / S) * (1 + rf * T) - 1) / T;
}

/** 由市场远期反推隐含外币利率(给定 rd) */
export function impliedRf(S: number, F: number, rd: number, T: number, comp: Compounding = "simple"): number {
  if (comp === "continuous") return rd - Math.log(F / S) / T;
  return ((S / F) * (1 + rd * T) - 1) / T;
}

/** 交叉货币基差:市场F隐含的 rd − 理论 rd(用无基差利率算) */
export function impliedBasis(
  S: number, Fmkt: number, rd: number, rf: number, T: number, comp: Compounding = "simple",
): number {
  return impliedRd(S, Fmkt, rf, T, comp) - rd;
}

/** 年化 carry(正=做多外币吃正 carry 的方向标注由 UI 解释) */
export function carry(rd: number, rf: number): number {
  return rd - rf;
}
