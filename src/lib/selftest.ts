/** 引擎自检器 —— 把不变量测试搬进浏览器实时跑(与 vitest 同源的核心恒等式)
 *  方法论:每个模型必须带"恒等式/极限/往返"三类不变量;自检面板一键全绿才可信。
 */
import { Phi, PhiInv } from "./norm";
import { gk, gkPrice, strikeFromDelta, atmStrike, type GKInputs } from "./gk";
import { smileNodes } from "./smile";
import { knockIn, knockOut } from "./barrier";
import { cashDigital, oneTouch, noTouch } from "./digital";
import { forwardRate, impliedRd } from "./cip";
import { priceStrategy } from "./strategy";

export interface CheckResult { name: string; pass: boolean; detail: string; }

const ok = (name: string, err: number, tol: number): CheckResult => ({
  name, pass: Math.abs(err) < tol, detail: `|误差| ${Math.abs(err).toExponential(2)} < ${tol}`,
});

export function runSelfTests(): CheckResult[] {
  const out: CheckResult[] = [];
  const b: GKInputs = { S: 7.2, K: 7.25, rd: 0.019, rf: 0.043, sigma: 0.055, T: 0.25 };

  // 1. 正态往返
  out.push(ok("Φ⁻¹∘Φ 往返(x=1.234)", PhiInv(Phi(1.234)) - 1.234, 1e-8));
  // 2. BS 经典基准
  out.push(ok("BS 基准 C(100,100,5%,20%,1y)=10.4506", gkPrice("call", { S: 100, K: 100, rd: 0.05, rf: 0, sigma: 0.2, T: 1 }) - 10.450583572185565, 1e-9));
  // 3. put-call parity
  out.push(ok("Put–Call Parity", gkPrice("call", b) - gkPrice("put", b) - (b.S * Math.exp(-b.rf * b.T) - b.K * Math.exp(-b.rd * b.T)), 1e-12));
  // 4. PA delta 恒等式
  { const r = gk("call", b); out.push(ok("PA delta ≡ Δspot − V/S", r.deltaPA - (r.deltaSpot - r.price / b.S), 1e-12)); }
  // 5. delta→K→delta 往返
  { const K = strikeFromDelta("call", 0.25, b.S, b.rd, b.rf, b.sigma, b.T, "spot");
    out.push(ok("25Δ→K→Δ 往返", Math.abs(gk("call", { ...b, K }).deltaSpot) - 0.25, 1e-8)); }
  // 6. DNS 跨式零 delta
  { const K = atmStrike("dns", b.S, b.rd, b.rf, b.sigma, b.T);
    out.push(ok("DNS 跨式 Δ 之和=0", gk("call", { ...b, K }).deltaSpot + gk("put", { ...b, K }).deltaSpot, 1e-12)); }
  // 7. smile 重建恒等式
  { const n = smileNodes({ atm: 0.055, rr25: 0.008, bf25: 0.003 });
    const c = n.find(x => x.label === "25ΔC")!.sigma, p = n.find(x => x.label === "25ΔP")!.sigma;
    out.push(ok("σ25c−σ25p=RR", c - p - 0.008, 1e-14)); }
  // 8. 障碍 in–out 平价
  { const c = { S: 7.2, K: 7.25, B: 7.0, rd: 0.019, rf: 0.043, sigma: 0.055, T: 0.25 };
    out.push(ok("KI+KO=香草", knockIn("call", "down", c) + knockOut("call", "down", c) - gkPrice("call", c), 1e-9)); }
  // 9. 数字对称: cashCall+cashPut = df
  out.push(ok("数字 C+P = e^{-rd T}", cashDigital("call", b) + cashDigital("put", b) - Math.exp(-b.rd * b.T), 1e-12));
  // 10. 触碰互补: OT+NT = df
  out.push(ok("OT+NT = e^{-rd T}", oneTouch(7.2, 7.0, b.rd, b.rf, b.sigma, b.T) + noTouch(7.2, 7.0, b.rd, b.rf, b.sigma, b.T) - Math.exp(-b.rd * b.T), 1e-12));
  // 11. CIP 反解往返
  { const F = forwardRate(7.2, 0.019, 0.043, 0.5, "simple");
    out.push(ok("CIP: F 反推 rd 往返", impliedRd(7.2, F, 0.043, 0.5, "simple") - 0.019, 1e-12)); }
  // 12. 策略可加性: straddle = call + put
  { const legs = [
      { cp: "call" as const, K: 7.25, qty: 1, sigma: 0.055 },
      { cp: "put" as const, K: 7.25, qty: 1, sigma: 0.055 },
    ];
    const s = priceStrategy(legs, { S: 7.2, rd: 0.019, rf: 0.043, T: 0.25 });
    out.push(ok("策略=Σ腿(跨式)", s.price - (gkPrice("call", b) + gkPrice("put", b)), 1e-12)); }
  return out;
}
