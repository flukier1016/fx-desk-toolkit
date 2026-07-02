/** Delta ⇄ 行权价换算器
 *  模式A: delta(绝对值)+约定 → 行权价 K(含 ATMF / DNS 快捷键)
 *  模式B: 行权价 K → 四种 delta 约定对照表
 */
import { useMemo, useState } from "react";
import {
  gk, fwd, strikeFromDelta, atmStrike,
  type CP, type DeltaConv,
} from "../lib/gk";
import { Card, Field, Select, Row, Note, fmt, fmtPct } from "../components/ui";

type Mode = "d2k" | "k2d";
type AtmKind = "atmf" | "dns" | "dns-pa";

const CONV_OPTIONS: { value: DeltaConv; label: string }[] = [
  { value: "spot", label: "即期 Spot Δ" },
  { value: "forward", label: "远期 Forward Δ" },
  { value: "pa-spot", label: "PA 即期 Δ (premium-adjusted)" },
  { value: "pa-forward", label: "PA 远期 Δ (premium-adjusted)" },
];

const ATM_BTNS: { kind: AtmKind; label: string; hint: string }[] = [
  { kind: "atmf", label: "ATMF", hint: "K = F" },
  { kind: "dns", label: "DNS (pips)", hint: "K = F·e^{+σ²T/2}" },
  { kind: "dns-pa", label: "DNS (pa)", hint: "K = F·e^{−σ²T/2}" },
];

export default function DeltaStrike() {
  const [mode, setMode] = useState<Mode>("d2k");
  // 市场参数 —— 利率/波动率以百分数输入
  const [S, setS] = useState(7.2);
  const [rdPct, setRdPct] = useState(1.9);
  const [rfPct, setRfPct] = useState(4.3);
  const [volPct, setVolPct] = useState(5.5);
  const [T, setT] = useState(0.25);
  // 模式A
  const [cp, setCp] = useState<CP>("call");
  const [conv, setConv] = useState<DeltaConv>("spot");
  const [deltaAbs, setDeltaAbs] = useState(0.25);
  const [atmKind, setAtmKind] = useState<AtmKind>("atmf");
  // 模式B
  const [K, setK] = useState(7.29);

  const rd = rdPct / 100, rf = rfPct / 100, sigma = volPct / 100;
  const F = fwd(S, rd, rf, T);

  // 模式A: delta → K
  // 注: 库中 pa 分支按 pa-spot 方程 (K/S)e^{-rd T}Φ(±d2)=Δ 求根;
  // pa-forward 约定先换算等价 pa-spot delta: Δ_pa-spot = Δ_pa-fwd · e^{-rf T}
  const solvedK = useMemo(() => {
    if (!(deltaAbs > 0 && deltaAbs < 1)) return NaN;
    return conv === "pa-forward"
      ? strikeFromDelta(cp, deltaAbs * Math.exp(-rf * T), S, rd, rf, sigma, T, "pa-spot")
      : strikeFromDelta(cp, deltaAbs, S, rd, rf, sigma, T, conv);
  }, [cp, conv, deltaAbs, S, rd, rf, sigma, T]);

  // 回验: 用求出的 K 重算该约定下的 delta,应与输入一致
  const checkDelta = useMemo(() => {
    if (!Number.isFinite(solvedK)) return NaN;
    const r = gk(cp, { S, K: solvedK, rd, rf, sigma, T });
    if (conv === "spot") return r.deltaSpot;
    if (conv === "forward") return r.deltaFwd;
    if (conv === "pa-spot") return r.deltaPA;
    return r.deltaPA * Math.exp(rf * T); // pa-forward = pa-spot · e^{rf T}
  }, [solvedK, cp, conv, S, rd, rf, sigma, T]);

  const atmK = atmStrike(atmKind, S, rd, rf, sigma, T);
  const atmBtn = ATM_BTNS.find((b) => b.kind === atmKind) ?? ATM_BTNS[0];

  // 模式B: K → 四种约定 delta
  const g = useMemo(() => gk(cp, { S, K, rd, rf, sigma, T }), [cp, S, K, rd, rf, sigma, T]);
  const deltaPAFwd = g.deltaPA * Math.exp(rf * T);

  const toneOf = (x: number): "pos" | "neg" | undefined =>
    !Number.isFinite(x) ? undefined : x >= 0 ? "pos" : "neg";

  return (
    <div className="grid gap-4">
      {/* 模式切换 */}
      <div className="flex gap-2">
        {([
          { m: "d2k" as Mode, label: "模式A · Delta → 行权价" },
          { m: "k2d" as Mode, label: "模式B · 行权价 → Delta" },
        ]).map(({ m, label }) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
              mode === m
                ? "border-gold bg-gold/10 text-gold"
                : "border-line bg-panel2 text-slate2 hover:text-cloud"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 市场参数(两种模式共用) */}
        <Card title="市场参数 Market Inputs">
          <div className="grid grid-cols-2 gap-3">
            <Field label="即期 S (USDCNY)" value={S} onChange={setS} step="0.01" min={0.0001} />
            <Field label="到期 T" value={T} onChange={setT} step="0.05" min={0.001} suffix="年" />
            <Field label="本币利率 rd (CNY)" value={rdPct} onChange={setRdPct} step="0.1" suffix="%" />
            <Field label="外币利率 rf (USD)" value={rfPct} onChange={setRfPct} step="0.1" suffix="%" />
            <Field label="波动率 σ" value={volPct} onChange={setVolPct} step="0.1" min={0.01} suffix="%" />
            <Select
              label="期权方向 CP"
              value={cp}
              onChange={setCp}
              options={[
                { value: "call", label: "Call (买 USD / 卖 CNY)" },
                { value: "put", label: "Put (卖 USD / 买 CNY)" },
              ]}
            />
          </div>
          <div className="mt-3">
            <Row k="远期 F" hint="= S·e^{(rd−rf)T}" v={fmt(F)} tone="gold" />
            <Row k="远期点 Swap Points" hint="×10⁴ pips" v={fmt((F - S) * 10000, 1)} tone={toneOf(F - S)} />
          </div>
        </Card>

        {mode === "d2k" ? (
          /* 模式A: delta → K */
          <Card title="模式A · Delta → 行权价 K">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Delta 绝对值 |Δ|" value={deltaAbs} onChange={setDeltaAbs}
                step="0.05" min={0.01} max={0.99} suffix="(如 0.25)"
              />
              <Select label="Delta 约定 Convention" value={conv} onChange={setConv} options={CONV_OPTIONS} />
            </div>
            <div className="mt-3">
              <Row
                k={`行权价 K (${deltaAbs && Number.isFinite(deltaAbs) ? Math.round(deltaAbs * 100) : "—"}Δ ${cp === "call" ? "Call" : "Put"})`}
                v={fmt(solvedK)}
                tone="gold"
              />
              <Row k="K / F (远期在值程度)" v={fmt(solvedK / F)} />
              <Row
                k="回验 Δ" hint="用 K 反算,应=输入(带符号)"
                v={fmtPct(checkDelta, 3)}
                tone={toneOf(checkDelta)}
              />
              {!Number.isFinite(solvedK) && (
                <Row k="求解状态" v="无解:pa call 的 Δ 超出峰值可达范围" tone="neg" />
              )}
            </div>

            <div className="mt-4">
              <span className="mb-1.5 block text-xs text-slate2">ATM 快捷键(直接给出 ATM 行权价)</span>
              <div className="grid grid-cols-3 gap-2">
                {ATM_BTNS.map(({ kind, label }) => (
                  <button
                    key={kind}
                    onClick={() => setAtmKind(kind)}
                    className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                      atmKind === kind
                        ? "border-gold bg-gold/10 text-gold"
                        : "border-line bg-panel2 text-slate2 hover:text-cloud"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Row k={`ATM 行权价 · ${atmBtn.label}`} hint={atmBtn.hint} v={fmt(atmK)} tone="gold" />
            </div>

            <Note>
              提醒:报价单上的 25Δ / 10Δ 是<b>波动率曲面的坐标</b>,不是某个固定行权价——同一个
              "25Δ" 在 spot / forward / premium-adjusted 四种约定下对应<b>不同的 K</b>,
              询价时必须先对齐 delta 约定(USDCNY 等新兴市场对惯用 premium-adjusted)。
              另注:pa call 的 Δ 对 K 非单调,本工具按市场惯例取右支(较高 K)。
            </Note>
          </Card>
        ) : (
          /* 模式B: K → delta */
          <Card title="模式B · 行权价 K → Delta 对照">
            <div className="grid grid-cols-2 gap-3">
              <Field label="行权价 K" value={K} onChange={setK} step="0.01" min={0.0001} />
            </div>
            <div className="mt-3">
              <Row k="即期 Spot Δ" hint="e^{−rf T}·Φ(±d1)" v={fmtPct(g.deltaSpot, 3)} tone={toneOf(g.deltaSpot)} />
              <Row k="远期 Forward Δ" hint="Φ(±d1)" v={fmtPct(g.deltaFwd, 3)} tone={toneOf(g.deltaFwd)} />
              <Row k="PA 即期 Δ" hint="±(K/S)e^{−rd T}Φ(±d2)" v={fmtPct(g.deltaPA, 3)} tone={toneOf(g.deltaPA)} />
              <Row k="PA 远期 Δ" hint="±(K/F)Φ(±d2)" v={fmtPct(deltaPAFwd, 3)} tone={toneOf(deltaPAFwd)} />
            </div>
            <div className="mt-3">
              <Row k="期权价 (CNY / 1 USD 名义)" v={fmt(g.price)} tone="gold" />
              <Row k="d1 / d2" v={`${fmt(g.d1)} / ${fmt(g.d2)}`} />
              <Row k="K / F" v={fmt(K / F)} />
            </div>
            <Note>
              提醒:25Δ / 10Δ 只是<b>曲面坐标</b>——同一个 K 在四种约定下 delta 各不相同
              (上表即对照)。PA 约定把权利金(以外币支付)从对冲头寸中扣掉,故
              |Δ_pa| ≤ |Δ|,且 pa call delta 对 K 非单调;报价沟通前务必先说清用哪一列。
            </Note>
          </Card>
        )}
      </div>
    </div>
  );
}
