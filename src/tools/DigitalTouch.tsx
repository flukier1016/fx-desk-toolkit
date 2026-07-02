/** 数字·触碰期权定价 —— 卡1 数字期权(到期看一眼);卡2 触碰期权(全程盯路径);
 *  自检:cash C+P = e^{-rdT},OT+NT = e^{-rdT};SVG:one-touch 价随障碍 H 变化曲线。
 *  市场参数(S/rd/rf/σ/T/名义)全部来自全局 MarketBar,工具内只留 K 与 H。
 */
import { useState } from "react";
import { useMarket } from "../state/market";
import { pairConv } from "../lib/conventions";
import { cashDigital, assetDigital, oneTouch, noTouch, hitProbability } from "../lib/digital";
import type { CP } from "../lib/gk";
import { Card, Field, Select, Row, Note, fmt, fmtPct } from "../components/ui";

export default function DigitalTouch() {
  const { mkt } = useMarket();
  const conv = pairConv(mkt.pair);
  const { S, rd, rf, sigma, T, notional } = mkt;
  const rnd = (x: number) => Number(x.toFixed(conv.spotPrecision));
  const step = String(1 / conv.pipFactor);

  // ── 本地参数:仅 K(数字行权价)与 H(触碰障碍)──
  const [cp, setCp] = useState<CP>("call");
  const [K, setK] = useState(() => rnd(mkt.S * 1.007));
  const [H, setH] = useState(() => rnd(mkt.S * 0.985));
  // 切换货币对 → 价格量纲变了,K/H 跟随新即期重置(渲染期调整,React 推荐写法)
  const [pairSeen, setPairSeen] = useState(mkt.pair);
  if (pairSeen !== mkt.pair) {
    setPairSeen(mkt.pair);
    setK(Number((mkt.S * 1.007).toFixed(pairConv(mkt.pair).spotPrecision)));
    setH(Number((mkt.S * 0.985).toFixed(pairConv(mkt.pair).spotPrecision)));
  }

  // ── 参数校验 ──
  const errs: string[] = [];
  if (!(Number.isFinite(S) && S > 0)) errs.push("即期 S 非法(顶部 MarketBar 修改)");
  if (!(Number.isFinite(sigma) && sigma > 0)) errs.push("波动率 σ 必须为正(顶部 MarketBar 修改)");
  if (!(Number.isFinite(T) && T > 0)) errs.push("期限 T 必须为正(顶部 MarketBar 修改)");
  if (!(Number.isFinite(K) && K > 0)) errs.push("数字行权价 K 必须为正数");
  if (!(Number.isFinite(H) && H > 0)) errs.push("触碰障碍 H 必须为正数");
  const ok = errs.length === 0;

  const df = Math.exp(-rd * T);
  const dig = { S, K, rd, rf, sigma, T };

  // ── 卡1:数字期权(European digital,到期只看 S_T)──
  const cashC = cashDigital("call", dig);
  const cashP = cashDigital("put", dig);
  const cash = cp === "call" ? cashC : cashP;
  const asset = assetDigital(cp, dig);
  const assetC = assetDigital("call", dig);
  const assetP = assetDigital("put", dig);
  const probITM = df > 0 ? cash / df : NaN; // 风险中性行权概率 Φ(±d2)

  // ── 卡2:触碰期权(path-dependent,全程连续监控)──
  const pHit = hitProbability(S, H, rd, rf, sigma, T);
  const ot = oneTouch(S, H, rd, rf, sigma, T);
  const nt = noTouch(S, H, rd, rf, sigma, T);
  const touchDir = H < S ? "下触碰 Down-touch(即期跌破 H 即触发)"
    : H > S ? "上触碰 Up-touch(即期升破 H 即触发)"
    : "H = S:起始即触碰(P_hit = 100%)";

  // ── SVG:one-touch 价随 H 变化(H ∈ S±5%,60 点)──
  const N = 60;
  const hLo = S * 0.95, hHi = S * 1.05;
  const Hs = Array.from({ length: N }, (_, i) => hLo + ((hHi - hLo) * i) / (N - 1));
  const ys = Hs.map((h) => oneTouch(S, h, rd, rf, sigma, T));
  const PX0 = 52, PX1 = 616, PY0 = 18, PY1 = 192;
  const X = (h: number) => PX0 + ((h - hLo) / (hHi - hLo)) * (PX1 - PX0);
  const Y = (v: number) => PY1 - (Math.max(v, 0) / (df * 1.06)) * (PY1 - PY0);
  const path = Hs.map((h, i) => `${i === 0 ? "M" : "L"}${X(h).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join(" ");
  const hInRange = ok && H >= hLo && H <= hHi;
  const mono = "ui-monospace, Menlo, monospace";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="卡1 · 数字期权 Digital(到期看一眼)">
        <div className="grid grid-cols-2 gap-3">
          <Select<CP> label="方向 CP" value={cp} onChange={setCp}
            options={[{ value: "call", label: "看涨 Call(S_T > K 付)" }, { value: "put", label: "看跌 Put(S_T < K 付)" }]} />
          <Field label={`数字行权价 K(默认 S×1.007)`} value={K} onChange={setK} step={step} />
        </div>
        {ok ? (
          <div className="mt-3">
            <Row k="现金数字 Cash-or-nothing" hint={`到期付 1 ${conv.quote}(本币)`} v={`${fmt(cash, 4)} ${conv.quote}`} />
            <Row k="资产数字 Asset-or-nothing" hint={`到期付 1 ${conv.base}(外币)`} v={`${fmt(asset, 4)} ${conv.quote}`} />
            <Row k="风险中性行权概率" hint={cp === "call" ? "Φ(d₂) = Cash/df" : "Φ(−d₂)"} v={fmtPct(probITM, 2)} />
            <Row k="自检:CashC + CashP = e^{−rd·T}" hint="现金数字对称性" tone="gold"
              v={`${fmt(cashC, 4)} + ${fmt(cashP, 4)} = ${fmt(cashC + cashP, 4)} ≈ ${fmt(df, 4)}`} />
            <Row k="自检:AssetC + AssetP = S·e^{−rf·T}" hint="资产数字对称性" tone="gold"
              v={`${fmt(assetC + assetP, 4)} ≈ ${fmt(S * Math.exp(-rf * T), 4)}`} />
            <Row k={`名义换算 · 现金数字付 ${fmt(notional, 0)} ${conv.quote}`} hint="现值 = Cash × 名义"
              v={`${fmt(cash * notional, 0)} ${conv.quote}`} tone="pos" />
            <Row k={`名义换算 · 资产数字付 ${fmt(notional, 0)} ${conv.base}`} hint="现值 = Asset × 名义"
              v={`${fmt(asset * notional, 0)} ${conv.quote}`} tone="pos" />
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-crimson/60 bg-crimson/10 p-2.5 text-xs leading-relaxed text-crimson">
            {errs.map((e, i) => <div key={i}>· {e}</div>)}
          </div>
        )}
      </Card>

      <Card title="卡2 · 触碰期权 One-touch / No-touch(全程盯路径)">
        <div className="grid grid-cols-2 gap-3">
          <Field label={`触碰障碍 H(默认 S×0.985)`} value={H} onChange={setH} step={step} />
          <div className="flex items-end pb-1">
            <span className={`text-xs ${H === S ? "text-crimson" : H < S ? "text-steel" : "text-plum"}`}>{ok ? touchDir : "—"}</span>
          </div>
        </div>
        {ok ? (
          <div className="mt-3">
            <Row k="触碰概率 P_hit" hint="[0,T] 内连续监控·风险中性测度" v={fmtPct(pHit, 2)}
              tone={pHit > 0.5 ? "neg" : undefined} />
            <Row k="One-touch OT" hint={`触碰过 H → 到期付 1 ${conv.quote}`} v={`${fmt(ot, 4)} ${conv.quote}`} />
            <Row k="No-touch NT" hint={`全程未触碰 → 到期付 1 ${conv.quote}`} v={`${fmt(nt, 4)} ${conv.quote}`} />
            <Row k="自检:OT + NT = e^{−rd·T}" hint="互补性(两张合约拼成必付 1)" tone="gold"
              v={`${fmt(ot, 4)} + ${fmt(nt, 4)} = ${fmt(ot + nt, 4)} ≈ ${fmt(df, 4)}`} />
            <Row k={`名义换算 · OT 付 ${fmt(notional, 0)} ${conv.quote}`} hint="现值 = OT × 名义"
              v={`${fmt(ot * notional, 0)} ${conv.quote}`} tone="pos" />
          </div>
        ) : (
          <p className="mt-3 text-xs text-crimson">参数非法,请先修正。</p>
        )}
      </Card>

      {ok && (
        <Card title={`One-touch 价 vs 障碍 H(H ∈ S±5%,${N} 点·到期支付口径)`} className="lg:col-span-2">
          <svg viewBox="0 0 640 224" className="w-full">
            {/* 横向网格 + Y 轴刻度(0 → df) */}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <line x1={PX0} x2={PX1} y1={Y(f * df)} y2={Y(f * df)} stroke="var(--color-line)" strokeWidth={0.7} strokeDasharray={f === 0 ? undefined : "3 4"} />
                <text x={PX0 - 6} y={Y(f * df) + 3} textAnchor="end" fontSize={9} fill="var(--color-slate2)" fontFamily={mono}>
                  {fmt(f * df, 3)}
                </text>
              </g>
            ))}
            {/* X 轴刻度 */}
            {[hLo, S, hHi].map((h, i) => (
              <text key={i} x={X(h)} y={PY1 + 14} textAnchor="middle" fontSize={9} fill="var(--color-slate2)" fontFamily={mono}>
                {fmt(h, conv.spotPrecision)}
              </text>
            ))}
            <text x={(PX0 + PX1) / 2} y={220} textAnchor="middle" fontSize={9} fill="var(--color-slate2)">障碍 H →</text>
            {/* S 竖线:H→S 时 OT→df(必触碰) */}
            <line x1={X(S)} x2={X(S)} y1={PY0} y2={PY1} stroke="var(--color-slate2)" strokeWidth={1} strokeDasharray="4 3" />
            <text x={X(S)} y={PY0 - 6} textAnchor="middle" fontSize={9} fill="var(--color-slate2)" fontFamily={mono}>S 即期(OT→df)</text>
            {/* one-touch 曲线 */}
            <path d={path} fill="none" stroke="var(--color-steel)" strokeWidth={2} />
            {/* 当前 H 标记 */}
            {hInRange ? (
              <g>
                <line x1={X(H)} x2={X(H)} y1={PY0} y2={PY1} stroke="var(--color-gold)" strokeWidth={1.2} strokeDasharray="2 3" />
                <circle cx={X(H)} cy={Y(ot)} r={4} fill="var(--color-gold)" />
                <text x={Math.min(Math.max(X(H), PX0 + 46), PX1 - 46)} y={Y(ot) - 10} textAnchor="middle" fontSize={10} fill="var(--color-gold)" fontFamily={mono}>
                  H={fmt(H, conv.spotPrecision)} · OT={fmt(ot, 4)}
                </text>
              </g>
            ) : (
              <text x={PX1 - 4} y={PY0 + 4} textAnchor="end" fontSize={9} fill="var(--color-crimson)">当前 H 超出 S±5% 视窗</text>
            )}
          </svg>
        </Card>
      )}

      <div className="lg:col-span-2">
        <Note>
          <span className="text-gold">口径提醒:</span>本工具触碰类均为<span className="text-cloud">到期支付口径(pay-at-expiry)</span>—— OT = e^{"{−rd·T}"}·P_hit,触碰后仍要等到期才收钱;若是<span className="text-cloud">触碰即付(pay-at-hit)</span>,赔付在首达时刻 τ 贴现 E[e^{"{−rd·τ}"}·1(τ≤T)],折现期更短,价格略高于本页数值,报价前务必与对手确认条款。
          <span className="text-gold">对冲要点:</span>数字期权 = 无限窄的看涨价差极限,<span className="text-cloud">Digital = −∂C/∂K</span>,复制时对 K 求导会带出 <span className="text-cloud">−vega·(∂σ/∂K)</span> 一项 —— 行权价附近的 <span className="text-cloud">skew 斜率主导</span>数字期权的市场价,只用单一波动率的 GK 公式会系统性错价;临近到期且 S 贴着 K 时,数字的 delta/gamma 像 Dirac 尖峰一样<span className="text-crimson">爆炸</span>,现货对冲追不动,台子惯例是用行权价错开的 call spread 超复制(over-hedge)而非硬扛裸数字。触碰期权同理:P_hit 来自反射原理(含漂移 ν = rd−rf−σ²/2),障碍越贴近现价 OT 越贵、上限为 df。
        </Note>
      </div>
    </div>
  );
}
