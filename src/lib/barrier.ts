/** 障碍期权(连续监控闭式解, 反射/镜像法)+ BGK 离散监控修正
 *  与《完整版》§14 一致:敲出 = 香草 − (B/S)^{2λ−2}·镜像香草 ; in–out 平价 ; BGK 平移。
 *  实现采用 Reiner–Rubinstein 标准分解(A/B/C/D 块),支持 8 种(上下 × 敲入/敲出 × call/put),无 rebate。
 */
import { Phi } from "./norm";
import { gkPrice, type CP } from "./gk";

export type InOut = "out" | "in";
export type UpDown = "down" | "up";

interface Ctx { S: number; K: number; B: number; rd: number; rf: number; sigma: number; T: number; }

function blocks({ S, K, B, rd, rf, sigma, T }: Ctx, cp: CP, eta: 1 | -1) {
  // eta: down=+1, up=−1 ; phiSign: call=+1, put=−1
  const phiS: 1 | -1 = cp === "call" ? 1 : -1;
  const v = sigma * Math.sqrt(T);
  const mu = (rd - rf) / (sigma * sigma) - 0.5;
  const lam = mu + 1; // = (rd−rf+σ²/2)/σ² ,即手册的 λ
  const df = Math.exp(-rd * T), ff = Math.exp(-rf * T);
  const x1 = Math.log(S / K) / v + lam * v;
  const x2 = Math.log(S / B) / v + lam * v;
  const y1 = Math.log((B * B) / (S * K)) / v + lam * v;
  const y2 = Math.log(B / S) / v + lam * v;
  const pow1 = Math.pow(B / S, 2 * mu);      // = (B/S)^{2λ−2}
  const pow2 = Math.pow(B / S, 2 * mu + 2);  // = (B/S)^{2λ}
  const A = phiS * (S * ff * Phi(phiS * x1) - K * df * Phi(phiS * x1 - phiS * v));
  const Bb = phiS * (S * ff * Phi(phiS * x2) - K * df * Phi(phiS * x2 - phiS * v));
  const C = phiS * (S * ff * pow2 * Phi(eta * y1) - K * df * pow1 * Phi(eta * y1 - eta * v));
  const D = phiS * (S * ff * pow2 * Phi(eta * y2) - K * df * pow1 * Phi(eta * y2 - eta * v));
  return { A, B: Bb, C, D };
}

/** 敲入期权(无 rebate) —— Reiner–Rubinstein */
export function knockIn(cp: CP, ud: UpDown, c: Ctx): number {
  const { S, K, B } = c;
  if ((ud === "down" && S <= B) || (ud === "up" && S >= B)) return gkPrice(cp, c); // 已触碰=香草
  const eta: 1 | -1 = ud === "down" ? 1 : -1;
  const { A, B: Bb, C, D } = blocks(c, cp, eta);
  if (cp === "call") {
    if (ud === "down") return K > B ? C : A - Bb + D;
    return K > B ? A : Bb - C + D; // up-and-in call
  } else {
    if (ud === "up") return K > B ? A - Bb + D : C;
    return K > B ? Bb - C + D : A; // down-and-in put
  }
}

/** 敲出期权 = 香草 − 敲入(in–out 平价, 无 rebate) */
export function knockOut(cp: CP, ud: UpDown, c: Ctx): number {
  const { S, B } = c;
  if ((ud === "down" && S <= B) || (ud === "up" && S >= B)) return 0; // 已敲出
  return Math.max(gkPrice(cp, c) - knockIn(cp, ud, c), 0);
}

/** BGK 离散监控修正:把 B 沿"远离现价"方向平移 exp(±0.5826·σ√Δt) */
export function bgkAdjustedBarrier(B: number, S: number, sigma: number, T: number, mObs: number): number {
  const beta = 0.5826;
  const dt = T / Math.max(mObs, 1);
  const shift = Math.exp(beta * sigma * Math.sqrt(dt));
  return B < S ? B / shift : B * shift;
}

export function barrierPrice(
  cp: CP, ud: UpDown, io: InOut, c: Ctx,
  discreteObs?: number, // 传入观察次数则做 BGK 修正
): number {
  const B = discreteObs && discreteObs > 0
    ? bgkAdjustedBarrier(c.B, c.S, c.sigma, c.T, discreteObs)
    : c.B;
  const cc = { ...c, B };
  return io === "in" ? knockIn(cp, ud, cc) : knockOut(cp, ud, cc);
}
