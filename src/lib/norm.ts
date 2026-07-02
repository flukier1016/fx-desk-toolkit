/** 标准正态分布工具 —— 高精度实现
 *  Φ: West (2005) 双精度累积正态；Φ⁻¹: Acklam 有理逼近 + 一步 Halley 精修
 */

/** 标准正态密度 φ(x) */
export function phi(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.SQRT2 / Math.sqrt(Math.PI);
}

/** 标准正态 CDF Φ(x) —— West(2005) 算法,绝对误差 < 1e-14 */
export function Phi(x: number): number {
  const z = Math.abs(x);
  let c: number;
  if (z <= 37) {
    const e = Math.exp(-0.5 * z * z);
    if (z < 7.07106781186547) {
      let num = 3.52624965998911e-2;
      num = num * z + 0.700383064443688;
      num = num * z + 6.37396220353165;
      num = num * z + 33.912866078383;
      num = num * z + 112.079291497871;
      num = num * z + 221.213596169931;
      num = num * z + 220.206867912376;
      let den = 8.83883476483184e-2;
      den = den * z + 1.75566716318264;
      den = den * z + 16.064177579207;
      den = den * z + 86.7807322029461;
      den = den * z + 296.564248779674;
      den = den * z + 637.333633378831;
      den = den * z + 793.826512519948;
      den = den * z + 440.413735824752;
      c = (e * num) / den;
    } else {
      const b = z + 0.65;
      const f = z + 1 / (b + 2 / (b + 3 / (b + 4 / (b + 0.13333333333333333))));
      c = e / (f * 2.506628274631);
    }
  } else {
    c = 0;
  }
  return x <= 0 ? c : 1 - c;
}

/** 逆累积正态 Φ⁻¹(p) —— Acklam 逼近 + Halley 修正,相对误差 ~1e-15 */
export function PhiInv(p: number): number {
  if (p <= 0 || p >= 1) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return NaN;
  }
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
             1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
             6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
             -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
             3.754408661907416];
  const pl = 0.02425;
  let x: number;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pl) {
    const q = p - 0.5, r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
         ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // 一步 Halley 精修
  const e = Phi(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp(0.5 * x * x);
  x = x - u / (1 + 0.5 * x * u);
  return x;
}
