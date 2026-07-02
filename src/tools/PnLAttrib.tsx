/** 每日 PnL 归因 —— 模式A:手动输入 Greeks;模式B:期权自动(gk 算 Greeks + 全重估出 residual)。
 *  输出:SVG 瀑布图(Δ/Γ/Vega/Θ/Carry 正绿负红,Explained/Total/Residual 标注)+ 明细 Row。
 */
import { useMemo, useState } from "react";
import { gk, gkPrice, type CP, type GKInputs } from "../lib/gk";
import { pnlAttribution } from "../lib/pnl";
import { Card, Field, Select, Row, Note, fmt } from "../components/ui";

type Mode = "manual" | "option";

interface Bar { label: string; value: number; from: number; to: number; kind: "flow" | "sum" }

const signed = (x: number, d = 0) => (x >= 0 ? "+" : "") + fmt(x, d);

export default function PnLAttrib() {
  const [mode, setMode] = useState<Mode>("manual");

  // ── 模式A:手动 Greeks(每 1 名义)──
  const [mDelta, setMDelta] = useState(0.41);
  const [mGamma, setMGamma] = useState(1.95);
  const [mVega, setMVega] = useState(1.39);
  const [mThetaDay, setMThetaDay] = useState(-0.00022);
  const [mCarryDay, setMCarryDay] = useState(0);

  // ── 模式B:期权(GK)──
  const [cp, setCp] = useState<CP>("call");
  const [S, setS] = useState(7.2);
  const [K, setK] = useState(7.2);
  const [rdPct, setRdPct] = useState(1.9);
  const [rfPct, setRfPct] = useState(4.3);
  const [sigPct, setSigPct] = useState(5.5);
  const [T, setT] = useState(0.25);

  // ── 市场变动 ──
  const [dS, setDS] = useState(-0.02);
  const [dSigPct, setDSigPct] = useState(0.3);
  const [days, setDays] = useState(1);
  const [notional, setNotional] = useState(1_000_000);

  const res = useMemo(() => {
    const dSigma = dSigPct / 100;
    if (mode === "manual") {
      const bd = pnlAttribution({
        delta: mDelta, gamma: mGamma, vega: mVega, thetaDay: mThetaDay, carryDay: mCarryDay,
        dS, dSigma, days, notional,
      });
      return { bd, greeks: null as ReturnType<typeof gk> | null, beforePrice: NaN, afterPrice: NaN };
    }
    const before: GKInputs = { S, K, rd: rdPct / 100, rf: rfPct / 100, sigma: sigPct / 100, T };
    const after: GKInputs = { ...before, S: S + dS, sigma: before.sigma + dSigma, T: Math.max(T - days / 365, 0) };
    const g = gk(cp, before);
    const bd = pnlAttribution(
      { delta: g.deltaSpot, gamma: g.gamma, vega: g.vega, thetaDay: g.thetaDay, dS, dSigma, days, notional },
      { cp, before, after },
    );
    return { bd, greeks: g, beforePrice: g.price, afterPrice: gkPrice(cp, after) };
  }, [mode, mDelta, mGamma, mVega, mThetaDay, mCarryDay, cp, S, K, rdPct, rfPct, sigPct, T, dS, dSigPct, days, notional]);

  const bars = useMemo<Bar[]>(() => {
    const b = res.bd;
    const flows: [string, number][] = [["Delta", b.delta], ["Gamma", b.gamma], ["Vega", b.vega], ["Theta", b.theta]];
    if (mode === "manual") flows.push(["Carry", b.carry]);
    const out: Bar[] = [];
    let cum = 0;
    for (const [label, value] of flows) { out.push({ label, value, from: cum, to: cum + value, kind: "flow" }); cum += value; }
    out.push({ label: "Explained", value: b.explained, from: 0, to: b.explained, kind: "sum" });
    if (b.total !== undefined && b.residual !== undefined) {
      out.push({ label: "Residual", value: b.residual, from: b.explained, to: b.total, kind: "flow" });
      out.push({ label: "Total", value: b.total, from: 0, to: b.total, kind: "sum" });
    }
    return out;
  }, [res, mode]);

  const valid = bars.every((b) => Number.isFinite(b.from) && Number.isFinite(b.to));

  // ── 瀑布图几何 ──
  const W = 660, H = 280, padL = 66, padR = 10, padT = 22, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const slot = plotW / bars.length;
  const bw = Math.min(slot * 0.62, 64);
  const lo0 = valid ? Math.min(0, ...bars.map((b) => Math.min(b.from, b.to))) : -1;
  const hi0 = valid ? Math.max(0, ...bars.map((b) => Math.max(b.from, b.to))) : 1;
  const span = hi0 - lo0 || 1;
  const lo = lo0 - span * 0.12, hi = hi0 + span * 0.12;
  const y = (v: number) => padT + ((hi - v) / (hi - lo)) * plotH;
  const ticks = Array.from({ length: 5 }, (_, i) => lo + (i * (hi - lo)) / 4);
  const barColor = (b: Bar) =>
    b.kind === "sum"
      ? b.label === "Total" ? "var(--color-gold)" : "var(--color-steel)"
      : b.label === "Residual" ? "var(--color-plum)"
      : b.value >= 0 ? "var(--color-forest)" : "var(--color-crimson)";

  const bd = res.bd;
  const g = res.greeks;

  return (
    <div className="grid gap-4">
      <Card title="模式与输入 Mode & Inputs">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-3">
            <Select<Mode>
              label="归因模式 Mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "manual", label: "A · 手动 Greeks(无重估)" },
                { value: "option", label: "B · 期权自动(GK + 全重估)" },
              ]}
            />
            {mode === "manual" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Delta Δ(每1名义)" value={mDelta} onChange={setMDelta} step="0.01" />
                <Field label="Gamma Γ" value={mGamma} onChange={setMGamma} step="0.1" />
                <Field label="Vega(每 1.00 vol)" value={mVega} onChange={setMVega} step="0.1" />
                <Field label="Theta θ / 日" value={mThetaDay} onChange={setMThetaDay} step="0.0001" />
                <Field label="Carry / 日(可选)" value={mCarryDay} onChange={setMCarryDay} step="0.0001" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Select<CP>
                  label="期权类型 CP" value={cp} onChange={setCp}
                  options={[{ value: "call", label: "Call 看涨" }, { value: "put", label: "Put 看跌" }]}
                />
                <Field label="即期 S" value={S} onChange={setS} step="0.01" />
                <Field label="行权价 K" value={K} onChange={setK} step="0.01" />
                <Field label="本币利率 rd" value={rdPct} onChange={setRdPct} step="0.1" suffix="%" />
                <Field label="外币利率 rf" value={rfPct} onChange={setRfPct} step="0.1" suffix="%" />
                <Field label="波动率 σ" value={sigPct} onChange={setSigPct} step="0.1" suffix="%" />
                <Field label="期限 T" value={T} onChange={setT} step="0.05" suffix="年" min={0.001} />
              </div>
            )}
          </div>
          <div>
            <div className="mb-1 text-xs text-slate2">市场变动 Market Moves</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="即期变动 dS" value={dS} onChange={setDS} step="0.01" />
              <Field label="波动率变动 dσ" value={dSigPct} onChange={setDSigPct} step="0.05" suffix="vol点(%)" />
              <Field label="经过天数 days" value={days} onChange={setDays} step="1" min={0} suffix="天" />
              <Field label="名义 Notional(外币)" value={notional} onChange={setNotional} step="100000" min={0} />
            </div>
            <Note>
              泰勒分解:PnL ≈ Δ·dS + ½Γ·dS² + Vega·dσ + θ·days + Carry·days。
              模式B用重估前的 GK Greeks,并将 after = (S+dS, σ+dσ, T−days/365) 全重估得 Total,差额即 Residual。
            </Note>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="瀑布图 PnL Waterfall(本币)">
          {valid ? (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
              {/* 网格与刻度 */}
              {ticks.map((t, i) => (
                <g key={i}>
                  <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth="0.5" opacity="0.5" />
                  <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--color-slate2)" fontFamily="monospace">
                    {fmt(t, 0)}
                  </text>
                </g>
              ))}
              {/* 零线 */}
              <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--color-slate2)" strokeWidth="1" />
              {/* 连接虚线 */}
              {bars.slice(1).map((b, i) => {
                const lvl = b.kind === "flow" ? b.from : b.to;
                const x1 = padL + i * slot + (slot - bw) / 2 + bw;
                const x2 = padL + (i + 1) * slot + (slot - bw) / 2;
                return <line key={i} x1={x1} y1={y(lvl)} x2={x2} y2={y(lvl)} stroke="var(--color-slate2)" strokeDasharray="3 3" strokeWidth="1" opacity="0.6" />;
              })}
              {/* 柱体 */}
              {bars.map((b, i) => {
                const x = padL + i * slot + (slot - bw) / 2;
                const yTop = y(Math.max(b.from, b.to));
                const h = Math.max(Math.abs(y(b.from) - y(b.to)), 1.5);
                const labelVal = b.kind === "sum" ? fmt(b.to, 0) : signed(b.value, 0);
                const ly = yTop - 5 < padT + 6 ? yTop + h + 11 : yTop - 5;
                return (
                  <g key={b.label}>
                    <rect x={x} y={yTop} width={bw} height={h} rx="2" fill={barColor(b)} opacity={b.kind === "sum" ? 0.9 : 0.85} />
                    <text x={x + bw / 2} y={ly} textAnchor="middle" fontSize="10" fill="var(--color-cloud)" fontFamily="monospace">
                      {labelVal}
                    </text>
                    <text x={x + bw / 2} y={H - padB + 15} textAnchor="middle" fontSize="9.5" fill={b.kind === "sum" || b.label === "Residual" ? "var(--color-gold)" : "var(--color-slate2)"}>
                      {b.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : (
            <Note>输入不完整或无效,请补全上方参数。</Note>
          )}
          <Note>
            正贡献<span className="text-forest">绿</span>、负贡献<span className="text-crimson">红</span>;
            Explained(钢蓝)= 各泰勒项之和{mode === "option" ? ";Total(金)= 全重估真实损益,Residual(紫)= 两者之差" : "(模式A无重估,不产生 Total/Residual)"}。
          </Note>
        </Card>

        <Card title="归因明细 Attribution Detail">
          <Row k="Delta PnL" hint="Δ·dS·N" v={fmt(bd.delta, 2)} tone={bd.delta >= 0 ? "pos" : "neg"} />
          <Row k="Gamma PnL" hint="½Γ·dS²·N" v={fmt(bd.gamma, 2)} tone={bd.gamma >= 0 ? "pos" : "neg"} />
          <Row k="Vega PnL" hint="Vega·dσ·N" v={fmt(bd.vega, 2)} tone={bd.vega >= 0 ? "pos" : "neg"} />
          <Row k="Theta PnL" hint="θ·days·N" v={fmt(bd.theta, 2)} tone={bd.theta >= 0 ? "pos" : "neg"} />
          <Row k="Carry PnL" hint="carry·days·N" v={fmt(bd.carry, 2)} tone={bd.carry >= 0 ? "pos" : "neg"} />
          <Row k="Explained 可解释合计" v={fmt(bd.explained, 2)} tone="gold" />
          {bd.total !== undefined && bd.residual !== undefined && (
            <>
              <Row k="Total 全重估损益" hint="(V_after−V_before)·N" v={fmt(bd.total, 2)} tone="gold" />
              <Row k="Residual 残差" hint="Total−Explained" v={fmt(bd.residual, 2)} tone={Math.abs(bd.residual) > Math.abs(bd.explained) * 0.1 ? "neg" : undefined} />
            </>
          )}
          {g && (
            <>
              <div className="mt-3 mb-1 text-xs text-slate2">重估前 Greeks(GK,每1名义)</div>
              <Row k="期权价 V(before → after)" v={`${fmt(res.beforePrice, 5)} → ${fmt(res.afterPrice, 5)}`} />
              <Row k="Delta(spot)" v={fmt(g.deltaSpot, 4)} />
              <Row k="Gamma" v={fmt(g.gamma, 4)} />
              <Row k="Vega(每 1.00 vol)" v={fmt(g.vega, 4)} />
              <Row k="Theta / 日" v={fmt(g.thetaDay, 6)} />
            </>
          )}
          <Note>
            PnL 归因是台上每天必做的功课:开盘前把昨日损益拆到 Δ/Γ/Vega/θ/Carry 各因子,确认"钱从哪来"。
            Residual 偏大通常说明高阶项(vanna/volga 等)在起作用,或市场参数单日动得太大、一阶二阶泰勒展开失效——此时应检查波动率曲面重标定与仓位事件(临近敲入敲出、大额到期)。
          </Note>
        </Card>
      </div>
    </div>
  );
}
