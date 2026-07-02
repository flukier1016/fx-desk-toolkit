/** 掉期点与 CIP(抵补利率平价)计算器
 *  卡1:理论远期 —— 由 S / rd / rf / T 与计息约定推 F、掉期点、年化 carry
 *  卡2:市场反推 —— 由市场 F(或市场掉期点)反推 impliedRd / impliedRf / 交叉货币基差
 */
import { useState } from "react";
import {
  forwardRate, swapPoints, impliedRd, impliedRf, impliedBasis, carry,
  type Compounding,
} from "../lib/cip";
import { Card, Field, Select, Row, Note, fmt, fmtPct } from "../components/ui";

type MktMode = "F" | "points";

export default function CipCalc() {
  // ---- 卡1:理论远期输入(利率用百分数,内部换算小数) ----
  const [S, setS] = useState(7.2);
  const [rdPct, setRdPct] = useState(1.9);
  const [rfPct, setRfPct] = useState(4.3);
  const [T, setT] = useState(0.25);
  const [comp, setComp] = useState<Compounding>("simple");
  const [pipFactor, setPipFactor] = useState(10000);

  // ---- 卡2:市场反推输入 ----
  const [mktMode, setMktMode] = useState<MktMode>("F");
  const [mktF, setMktF] = useState(7.155);
  const [mktPts, setMktPts] = useState(-450);

  const rd = rdPct / 100;
  const rf = rfPct / 100;

  // 理论侧
  const F = forwardRate(S, rd, rf, T, comp);
  const pts = swapPoints(S, F, pipFactor);
  const cy = carry(rd, rf); // 年化利差 rd − rf

  // 市场侧:两种输入方式统一成市场 F
  const Fmkt = mktMode === "F" ? mktF : S + mktPts / pipFactor;
  const ptsMkt = swapPoints(S, Fmkt, pipFactor);
  const iRd = impliedRd(S, Fmkt, rf, T, comp);
  const iRf = impliedRf(S, Fmkt, rd, T, comp);
  const basis = impliedBasis(S, Fmkt, rd, rf, T, comp); // 小数,×1e4 = bp

  // ---- 掉期点期限曲线(手写 SVG):t ∈ (0, 1] 年 ----
  const W = 560, H = 200, L = 46, R = 14, TOP = 14, BOT = 26;
  const N = 48;
  const samples: { t: number; p: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const t = ((i / N) * 1) || 1e-9;
    samples.push({ t, p: swapPoints(S, forwardRate(S, rd, rf, t, comp), pipFactor) });
  }
  const pMin = Math.min(0, ...samples.map((s) => s.p));
  const pMax = Math.max(0, ...samples.map((s) => s.p));
  const span = Math.max(pMax - pMin, 1e-6);
  const x = (t: number) => L + (t / 1) * (W - L - R);
  const y = (p: number) => TOP + ((pMax - p) / span) * (H - TOP - BOT);
  const path = samples.map((s, i) => `${i === 0 ? "M" : "L"}${x(s.t).toFixed(1)},${y(s.p).toFixed(1)}`).join(" ");
  const tMark = Math.min(Math.max(T, 1e-9), 1);
  const pMark = swapPoints(S, forwardRate(S, rd, rf, tMark, comp), pipFactor);
  const showMark = T > 0 && T <= 1;

  const toneOf = (v: number): "pos" | "neg" | undefined =>
    !Number.isFinite(v) || v === 0 ? undefined : v > 0 ? "pos" : "neg";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* ---------------- 卡1:理论远期 ---------------- */}
      <Card title="卡1 · 理论远期 Theoretical Forward(CIP)">
        <div className="grid grid-cols-2 gap-3">
          <Field label="即期 S (USDCNY)" value={S} onChange={setS} step="0.001" min={0} />
          <Field label="期限 T" value={T} onChange={setT} step="0.05" min={0} suffix="年" />
          <Field label="本币利率 rd (CNY)" value={rdPct} onChange={setRdPct} step="0.1" suffix="%" />
          <Field label="外币利率 rf (USD)" value={rfPct} onChange={setRfPct} step="0.1" suffix="%" />
          <Select<Compounding>
            label="计息约定 Compounding"
            value={comp}
            onChange={setComp}
            options={[
              { value: "simple", label: "simple · 货币市场单利" },
              { value: "continuous", label: "continuous · 连续复利" },
            ]}
          />
          <Field label="pip 因子" value={pipFactor} onChange={setPipFactor} step="1" min={1} />
        </div>
        <div className="mt-3">
          <Row k="理论远期 F" hint={comp === "simple" ? "S·(1+rd·T)/(1+rf·T)" : "S·e^{(rd−rf)T}"} v={fmt(F, 4)} tone="gold" />
          <Row k="掉期点 Swap Points" hint="(F−S)×pip" v={fmt(pts, 1) + " pips"} tone={toneOf(pts)} />
          <Row k="年化 carry" hint="rd − rf" v={fmtPct(cy, 3)} tone={toneOf(cy)} />
          <Row k="掉期点年化" hint="(F/S−1)/T ≈ 利差" v={T > 0 ? fmtPct((F / S - 1) / T, 3) : "—"} />
        </div>

        {/* 掉期点期限曲线(手写内联 SVG) */}
        <div className="mt-3 rounded-md border border-line/60 bg-panel2/40 p-2">
          <div className="mb-1 text-xs text-slate2">掉期点 vs 期限(0–1 年,当前参数)</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {/* 零轴 */}
            <line x1={L} y1={y(0)} x2={W - R} y2={y(0)} className="stroke-line" strokeDasharray="4 4" />
            <text x={L - 6} y={y(0) + 4} textAnchor="end" className="fill-slate2" fontSize="10">0</text>
            {/* 上下界刻度 */}
            <text x={L - 6} y={y(pMin) + 4} textAnchor="end" className="fill-slate2" fontSize="10">{fmt(pMin, 0)}</text>
            <text x={L - 6} y={y(pMax) + 4} textAnchor="end" className="fill-slate2" fontSize="10">{fmt(pMax, 0)}</text>
            {/* x 轴刻度 */}
            {[0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line x1={x(t)} y1={H - BOT + 2} x2={x(t)} y2={H - BOT + 6} className="stroke-line" />
                <text x={x(t)} y={H - 8} textAnchor="middle" className="fill-slate2" fontSize="10">{t}y</text>
              </g>
            ))}
            <line x1={L} y1={H - BOT + 2} x2={W - R} y2={H - BOT + 2} className="stroke-line" />
            {/* 曲线 */}
            <path d={path} fill="none" className="stroke-gold" strokeWidth="2" />
            {/* 当前 T 标记 */}
            {showMark && (
              <g>
                <line x1={x(tMark)} y1={TOP} x2={x(tMark)} y2={H - BOT + 2} className="stroke-steel" strokeDasharray="3 3" />
                <circle cx={x(tMark)} cy={y(pMark)} r="4" className={pMark >= 0 ? "fill-forest" : "fill-crimson"} />
                <text x={x(tMark) + 6} y={y(pMark) - 6} className="fill-cloud" fontSize="11">
                  {`T=${fmt(tMark, 2)}, ${fmt(pMark, 0)} pips`}
                </text>
              </g>
            )}
          </svg>
        </div>
      </Card>

      {/* ---------------- 卡2:市场反推 ---------------- */}
      <Card title="卡2 · 市场反推 Implied Rates & Basis">
        <div className="grid grid-cols-2 gap-3">
          <Select<MktMode>
            label="市场输入方式"
            value={mktMode}
            onChange={setMktMode}
            options={[
              { value: "F", label: "市场远期 F" },
              { value: "points", label: "市场掉期点 (pips)" },
            ]}
          />
          {mktMode === "F" ? (
            <Field label="市场远期 F" value={mktF} onChange={setMktF} step="0.001" min={0} />
          ) : (
            <Field label="市场掉期点" value={mktPts} onChange={setMktPts} step="10" suffix="pips" />
          )}
        </div>
        <div className="mt-3">
          <Row k="市场远期 F(市场)" v={fmt(Fmkt, 4)} />
          <Row k="市场掉期点" hint="(F市场−S)×pip" v={fmt(ptsMkt, 1) + " pips"} tone={toneOf(ptsMkt)} />
          <Row k="隐含本币利率 implied rd" hint="给定 rf 反推" v={fmtPct(iRd, 3)} tone="gold" />
          <Row k="隐含外币利率 implied rf" hint="给定 rd 反推" v={fmtPct(iRf, 3)} tone="gold" />
          <Row
            k="交叉货币基差 basis"
            hint="implied rd − rd"
            v={Number.isFinite(basis) ? fmt(basis * 1e4, 1) + " bp" : "—"}
            tone={toneOf(basis)}
          />
          <Row
            k="对比:理论 F − 市场 F"
            hint="CIP 偏离(价格维度)"
            v={fmt((F - Fmkt) * pipFactor, 1) + " pips"}
            tone={toneOf(F - Fmkt)}
          />
        </div>
        <Note>
          USDCNY 当下中美利差为负(rd 人民币 ≈ 1.9% &lt; rf 美元 ≈ 4.3%),CIP 之下远期必然
          <span className="text-crimson">贴水</span>——掉期点为负;掉期点年化 (F/S−1)/T ≈ 利差 rd−rf。
          若市场 F 偏离理论 F,反推出的 implied rd 与真实 rd 之差就是
          <span className="text-gold">交叉货币基差</span>(bp),即 CIP 偏离:负基差意味着通过 FX
          swap 借美元比直接货币市场借更贵,常见于美元融资紧张时。
        </Note>
      </Card>
    </div>
  );
}
