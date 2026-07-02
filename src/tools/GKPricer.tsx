/** GK 定价器 —— Garman–Kohlhagen 欧式外汇期权:价格 + 全套希腊字母 + S 敏感性曲线 */
import { useMemo, useState } from "react";
import { gk, type CP, type GKInputs } from "../lib/gk";
import { Card, Field, Row, Note, fmt } from "../components/ui";

type Metric = "price" | "deltaSpot";

const N_PTS = 60;
const W = 560, H = 260;
const PAD = { l: 52, r: 14, t: 14, b: 30 };

export default function GKPricer() {
  const [cp, setCp] = useState<CP>("call");
  const [S, setS] = useState(7.2);
  const [K, setK] = useState(7.2);
  const [rdPct, setRdPct] = useState(1.9);
  const [rfPct, setRfPct] = useState(4.3);
  const [sigmaPct, setSigmaPct] = useState(5.5);
  const [T, setT] = useState(0.25);
  const [notional, setNotional] = useState(1_000_000);
  const [metric, setMetric] = useState<Metric>("price");

  const inp: GKInputs = useMemo(
    () => ({ S, K, rd: rdPct / 100, rf: rfPct / 100, sigma: sigmaPct / 100, T }),
    [S, K, rdPct, rfPct, sigmaPct, T],
  );
  const ok = [S, K, rdPct, rfPct, sigmaPct, T].every(Number.isFinite) && S > 0 && K > 0 && sigmaPct > 0 && T > 0;
  const g = useMemo(() => (ok ? gk(cp, inp) : null), [ok, cp, inp]);

  // ---- SVG 采样: S ∈ [0.85S, 1.15S], 60 点 ----
  const chart = useMemo(() => {
    if (!ok || !g) return null;
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < N_PTS; i++) {
      const s = S * (0.85 + (0.3 * i) / (N_PTS - 1));
      const r = gk(cp, { ...inp, S: s });
      xs.push(s);
      ys.push(metric === "price" ? r.price : r.deltaSpot);
    }
    const yCur = metric === "price" ? g.price : g.deltaSpot;
    let yMin = Math.min(...ys, yCur), yMax = Math.max(...ys, yCur);
    if (yMax - yMin < 1e-12) { yMax += 1e-6; yMin -= 1e-6; }
    const padY = (yMax - yMin) * 0.06;
    yMin -= padY; yMax += padY;
    const xMin = xs[0], xMax = xs[xs.length - 1];
    const px = (x: number) => PAD.l + ((x - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
    const py = (y: number) => H - PAD.b - ((y - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
    const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(1)},${py(ys[i]).toFixed(1)}`).join(" ");
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => xMin + f * (xMax - xMin));
    const yTicks = [0, 1 / 3, 2 / 3, 1].map((f) => yMin + f * (yMax - yMin));
    return { path, px, py, xTicks, yTicks, cx: px(S), cy: py(yCur), yCur };
  }, [ok, g, cp, inp, S, metric]);

  const cpBtn = (v: CP, label: string) => (
    <button
      key={v} type="button" onClick={() => setCp(v)}
      className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors ${
        cp === v ? "border-gold bg-gold/15 text-gold" : "border-line bg-panel2 text-slate2 hover:text-cloud"
      }`}
    >
      {label}
    </button>
  );
  const mBtn = (v: Metric, label: string) => (
    <button
      key={v} type="button" onClick={() => setMetric(v)}
      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
        metric === v ? "border-gold bg-gold/15 text-gold" : "border-line bg-panel2 text-slate2 hover:text-cloud"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="输入 Inputs">
        <div className="mb-3 flex gap-2">{cpBtn("call", "Call 看涨")}{cpBtn("put", "Put 看跌")}</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="即期 S (Spot)" value={S} onChange={setS} step="0.01" min={0} />
          <Field label="行权价 K (Strike)" value={K} onChange={setK} step="0.01" min={0} />
          <Field label="本币利率 rd" value={rdPct} onChange={setRdPct} step="0.1" suffix="%" />
          <Field label="外币利率 rf" value={rfPct} onChange={setRfPct} step="0.1" suffix="%" />
          <Field label="波动率 σ" value={sigmaPct} onChange={setSigmaPct} step="0.1" suffix="%" min={0} />
          <Field label="期限 T" value={T} onChange={setT} step="0.05" suffix="年" min={0} />
          <div className="col-span-2">
            <Field label="名义本金 Notional (外币)" value={notional} onChange={setNotional} step="100000" min={0} />
          </div>
        </div>
        <Note>直接标价:1 外币 = S 本币(USDCNY: 外币=USD, 本币=CNY)。利率为连续复利,价格以本币计、每 1 单位外币名义。</Note>
      </Card>

      <Card title="价格 Price">
        <Row k="期权价格 price" hint="(本币 / 1外币名义)" v={fmt(g?.price ?? NaN, 6)} tone="gold" />
        <Row k="远期 forward" hint="F = S·e^{(rd−rf)T}" v={fmt(g?.forward ?? NaN, 4)} />
        <Row k="d1" v={fmt(g?.d1 ?? NaN, 4)} />
        <Row k="d2" v={fmt(g?.d2 ?? NaN, 4)} />
        <Row
          k={`名义 ${Number.isFinite(notional) ? notional.toLocaleString("en-US") : "—"} 外币 → 总价`}
          hint="(本币)"
          v={fmt(g && Number.isFinite(notional) ? g.price * notional : NaN, 2)}
          tone="pos"
        />
      </Card>

      <Card title="希腊字母 Greeks">
        <Row k="deltaSpot" hint="e^{−rf T}Φ(±d1), 对冲即期" v={fmt(g?.deltaSpot ?? NaN, 4)} tone="gold" />
        <Row k="deltaFwd" hint="Φ(±d1), 对冲远期" v={fmt(g?.deltaFwd ?? NaN, 4)} />
        <Row k="deltaPA" hint="premium-adjusted, 权利金计入外币" v={fmt(g?.deltaPA ?? NaN, 4)} />
        <p className="mb-1 border-b border-line/50 pb-1.5 text-[11px] leading-relaxed text-slate2 opacity-80">
          区别:spot delta 是对即期的敏感度;forward delta 折到远期(相差 e^{"{rf T}"} 因子);premium-adjusted 在权利金以外币支付时扣掉权利金自带的外币头寸(deltaPA = deltaSpot − price/S)。
        </p>
        <Row k="gamma" hint="∂²V/∂S²" v={fmt(g?.gamma ?? NaN, 4)} />
        <Row k="vega" hint="每 1% vol" v={fmt(g?.vegaPct ?? NaN, 6)} />
        <Row k="theta" hint="每日历日" v={fmt(g?.thetaDay ?? NaN, 6)} tone={g && g.thetaDay < 0 ? "neg" : undefined} />
        <Row k="rhoD" hint="∂V/∂rd" v={fmt(g?.rhoD ?? NaN, 4)} />
        <Row k="rhoF" hint="∂V/∂rf" v={fmt(g?.rhoF ?? NaN, 4)} />
      </Card>

      <Card title="敏感性曲线 (S ± 15%)">
        <div className="mb-2 flex items-center gap-2">
          {mBtn("price", "Price")}
          {mBtn("deltaSpot", "Delta (spot)")}
          {chart && (
            <span className="ml-auto font-mono text-xs text-slate2">
              当前 S={fmt(S, 4)} → {metric === "price" ? fmt(chart.yCur, 6) : fmt(chart.yCur, 4)}
            </span>
          )}
        </div>
        {chart ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${metric} 随 S 变化曲线`}>
            {/* 网格 + 轴标签 */}
            {chart.yTicks.map((y, i) => (
              <g key={`y${i}`}>
                <line x1={PAD.l} x2={W - PAD.r} y1={chart.py(y)} y2={chart.py(y)} className="stroke-line" strokeWidth="1" strokeDasharray="3 4" />
                <text x={PAD.l - 6} y={chart.py(y) + 3.5} textAnchor="end" className="fill-slate2 font-mono" fontSize="10">
                  {metric === "price" ? fmt(y, 4) : fmt(y, 3)}
                </text>
              </g>
            ))}
            {chart.xTicks.map((x, i) => (
              <g key={`x${i}`}>
                <line x1={chart.px(x)} x2={chart.px(x)} y1={PAD.t} y2={H - PAD.b} className="stroke-line" strokeWidth="1" strokeDasharray="3 4" />
                <text x={chart.px(x)} y={H - PAD.b + 16} textAnchor="middle" className="fill-slate2 font-mono" fontSize="10">
                  {fmt(x, 3)}
                </text>
              </g>
            ))}
            {/* 曲线 */}
            <path d={chart.path} fill="none" className="stroke-gold" strokeWidth="2" strokeLinejoin="round" />
            {/* 当前点 */}
            <line x1={chart.cx} x2={chart.cx} y1={PAD.t} y2={H - PAD.b} className="stroke-crimson" strokeWidth="1" strokeDasharray="2 3" />
            <circle cx={chart.cx} cy={chart.cy} r="4.5" className="fill-crimson stroke-ink" strokeWidth="1.5" />
            <text
              x={Math.min(chart.cx + 8, W - PAD.r - 60)} y={Math.max(chart.cy - 8, PAD.t + 10)}
              className="fill-crimson font-mono" fontSize="10"
            >
              S={fmt(S, 3)}
            </text>
          </svg>
        ) : (
          <p className="py-10 text-center text-xs text-slate2">输入无效 —— 需 S, K, σ, T &gt; 0</p>
        )}
        <Note>
          Premium-adjusted delta 用于权利金以外币(=基础货币)支付的货币对惯例(如 USDJPY、USDCNH 的 USD 计价权利金);USDCNY 场内报价常用 spot delta。对冲手数与行权价反推(strike-from-delta)都依赖该约定,以台子惯例为准。
        </Note>
      </Card>
    </div>
  );
}
