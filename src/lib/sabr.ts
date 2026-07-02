/** L2 · SABR(Hagan 2002 对数正态近似)+ 三点精确校准
 *  与《随机分析与FX定价·完整版》§13 一致。FX 惯例 β=1(对数正态骨架)。
 *  σ(F,K) = α·(z/x(z))·[1 + (ρνα/4 + (2−3ρ²)ν²/24)·T],  z=(ν/α)ln(F/K)
 *  校准:给定 (K_atm,σ_atm),(K_25p,σ_25p),(K_25c,σ_25c) → 解 (α,ρ,ν):
 *    内层:α 由 ATM 方程精确解(单调,二分);外层:(ρ,ν) 网格 + 逐级缩放细化。
 *  不变量:ν→0 → σ≡α;校准后三锚点复现(<1e-6);ρ 与 RR 同号(β=1,typical)。
 */

export interface SabrParams { alpha: number; beta: number; rho: number; nu: number; }

/** Hagan 对数正态隐含波动率(一般 β;z→0 用级数极限) */
export function sabrVol(F: number, K: number, T: number, p: SabrParams): number {
  const { alpha, beta, rho, nu } = p;
  if (alpha <= 0) return NaN;
  const lnFK = Math.log(F / K);
  const omb = 1 - beta;
  const FKmid = Math.pow(F * K, omb / 2);
  const z = (nu / alpha) * FKmid * lnFK;
  let zOverX: number;
  if (Math.abs(z) < 1e-7) {
    zOverX = 1 - (rho * z) / 2 + ((3 * rho * rho - 2) * z * z) / 12; // 级数
  } else {
    const x = Math.log((Math.sqrt(1 - 2 * rho * z + z * z) + z - rho) / (1 - rho));
    zOverX = z / x;
  }
  const denom = FKmid * (1 + (omb * omb * lnFK * lnFK) / 24 + (Math.pow(omb, 4) * Math.pow(lnFK, 4)) / 1920);
  const corr = 1 + ((omb * omb * alpha * alpha) / (24 * Math.pow(F * K, omb)) +
                    (rho * beta * nu * alpha) / (4 * FKmid) +
                    ((2 - 3 * rho * rho) * nu * nu) / 24) * T;
  return (alpha / denom) * zOverX * corr;
}

/** β=1 的 ATM 波动率: σ_atm(α) = α·[1 + (ρνα/4 + (2−3ρ²)ν²/24)T] */
function atmVolBeta1(alpha: number, rho: number, nu: number, T: number): number {
  return alpha * (1 + (rho * nu * alpha / 4 + ((2 - 3 * rho * rho) * nu * nu) / 24) * T);
}

/** 给定 (ρ,ν) 精确解 α 使 ATM 复现(单调区间二分) */
export function solveAlpha(sigmaAtm: number, rho: number, nu: number, T: number): number {
  let lo = 1e-6, hi = Math.max(sigmaAtm * 3, 1);
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    if (atmVolBeta1(mid, rho, nu, T) < sigmaAtm) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export interface CalibInput {
  F: number; T: number;
  Katm: number; sigAtm: number;
  Kp: number; sigP: number;   // 25ΔP 锚点
  Kc: number; sigC: number;   // 25ΔC 锚点
}

export interface CalibResult { params: SabrParams; rmse: number; }

/** 三点校准(β=1):外层 (ρ,ν) 网格逐级细化,内层 α 精确解 ATM */
export function calibrateSabr(inp: CalibInput): CalibResult {
  const { F, T, sigAtm, Kp, sigP, Kc, sigC } = inp;
  const err = (rho: number, nu: number): number => {
    const alpha = solveAlpha(sigAtm, rho, nu, T);
    const p: SabrParams = { alpha, beta: 1, rho, nu };
    const e1 = sabrVol(F, Kp, T, p) - sigP;
    const e2 = sabrVol(F, Kc, T, p) - sigC;
    return e1 * e1 + e2 * e2;
  };
  let cr = 0, cn = 1.0, rW = 0.98, nW = 3.0; // 中心与半宽
  let best = { rho: 0, nu: 0.5, e: Infinity };
  for (let level = 0; level < 6; level++) {
    const N = 24;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const rho = Math.max(-0.999, Math.min(0.999, cr - rW + (2 * rW * i) / N));
        const nu = Math.max(1e-4, cn - nW + (2 * nW * j) / N);
        const e = err(rho, nu);
        if (e < best.e) best = { rho, nu, e };
      }
    }
    cr = best.rho; cn = best.nu; rW /= 6; nW /= 6;
  }
  const alpha = solveAlpha(sigAtm, best.rho, best.nu, T);
  return { params: { alpha, beta: 1, rho: best.rho, nu: best.nu }, rmse: Math.sqrt(best.e / 2) };
}
