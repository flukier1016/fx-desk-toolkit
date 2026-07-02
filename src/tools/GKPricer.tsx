/** GK 定价器 —— Garman–Kohlhagen 欧式外汇期权:价格 + 全套希腊字母 + S 敏感性曲线
 *  v2:市场参数(S/rd/rf/σ/T/名义)统一取自全局 MarketBar(useMarket),本工具只留 K 与 Call/Put。
 */
import { useMemo, useState } from "react";
import { gk, fwd, vanna, volga, impliedVol, type CP, type GKInputs } from "../lib/gk";
import { useMarket } from "../state/market";
import { pairConv } from "../lib/conventions";
import { Card, Field, Row, Note, fmt, fmtPct } from "../components/ui";

type Metric = "price" | "deltaSpot";

const N_PTS = 60;
const W = 560, H = 260;
const PAD = { l: 52, r: 14, t: 14, b: 30 };

export default function GKPricer() {
  const { mkt, setMkt } = useMarket();
  const conv = pairConv(mkt.pair);
  const { S, rd, rf, sigma, T, notional } = mkt;

  const [cp, setCp] = useState<CP>("call");
  const [K, setK] = useState<number>(() => S); // 初值取当前市场即期
  const [metric, setMetric] = useState<Metric>("price");

  const F = fwd(S, rd, rf, T);

  const inp: GKInputs = useMemo(
    () => ({ S, K, rd, rf, sigma, T }),
    [S, K, rd, rf, sigma, T],
  );
  const ok = [S, K, rd, rf, sigma, T].every(Number.isFinite) && S > 0 && K > 0 && sigma > 0 && T > 0;
  const g = useMemo(() => (ok ? gk(cp, inp) : null), [ok, cp, inp]);

  // ---- 隐含波动率反推 ----
  const [ivPrice, setIvPrice] = useState<number>(NaN);
  const [ivWrote, setIvWrote] = useState(false);
  const iv = useMemo(() => {
    if (!Number.isFinite(ivPrice) || !(S > 0 && K > 0 && T > 0) || ![rd, rf].every(Number.isFinite)) return NaN;
    return impliedVol(cp, ivPrice, S, K, rd, rf, T);
  }, [ivPrice, cp, S, K, rd, rf, T]);
  const ivOk = Number.isFinite(iv);
  const writeBackSigma = () => {
    if (!ivOk) return;
    setMkt({ sigma: Number(iv.toFixed(6)) });
    setIvWrote(true);
    window.setTimeout(() => setIvWrote(false), 2000);
  };

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
  const kBtn = (label: string, v: number, title: string) => (
    <button
      key={label} type="button" title={title}
      onClick={() => setK(Number(v.toFixed(conv.spotPrecision + 2)))}
      className="rounded-md border border-line bg-panel2 px-2 py-1 font-mono text-xs text-slate2 transition-colors hover:border-gold hover:text-gold"
    >
      {label}
    </button>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* 顶部:当前货币对 + delta 惯例提示 */}
      <p className="md:col-span-2 -mb-1 text-[11px] leading-relaxed text-slate2">
        <span className="font-mono font-semibold text-gold">{mkt.pair}</span>
        <span className="mx-1.5 opacity-60">|</span>
        Delta 惯例: {conv.deltaConvNote}
        <span className="mx-1.5 opacity-60">|</span>
        S/rd/rf/σ/T/名义 由顶部 MarketBar 统一编辑
      </p>

      <Card title="输入 Inputs">
        <div className="mb-3 flex gap-2">{cpBtn("call", "Call 看涨")}{cpBtn("put", "Put 看跌")}</div>
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label="行权价 K (Strike)" value={K} onChange={setK} step="0.01" min={0} />
          <div className="flex items-center gap-2 pb-1">
            {kBtn("=S", S, `设 K = 即期 ${fmt(S, conv.spotPrecision)}`)}
            {kBtn("=F", F, `设 K = 远期 ${fmt(F, conv.spotPrecision)}`)}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1 rounded-md border border-line/60 bg-panel2/50 px-3 py-2 font-mono text-[11px] text-slate2">
          <span>S {fmt(S, conv.spotPrecision)}</span>
          <span>rd {fmtPct(rd, 2)}</span>
          <span>rf {fmtPct(rf, 2)}</span>
          <span>σ {fmtPct(sigma, 2)}</span>
          <span>T {fmt(T, 3)}y</span>
          <span>F {fmt(F, conv.spotPrecision)}</span>
        </div>
        <Note>
          直接标价:1 {conv.base} = S {conv.quote}(外币={conv.base}, 本币={conv.quote})。利率为连续复利,价格以本币计、每 1 单位外币名义。市场参数在顶部 MarketBar 修改。
        </Note>
      </Card>

      <Card title="价格 Price">
        <Row k="期权价格 price" hint={`(${conv.quote} / 1${conv.base}名义)`} v={fmt(g?.price ?? NaN, 6)} tone="gold" />
        <Row k="远期 forward" hint="F = S·e^{(rd−rf)T}" v={fmt(g?.forward ?? NaN, conv.spotPrecision)} />
        <Row k="d1" v={fmt(g?.d1 ?? NaN, 4)} />
        <Row k="d2" v={fmt(g?.d2 ?? NaN, 4)} />
        <Row
          k={`名义 ${Number.isFinite(notional) ? notional.toLocaleString("en-US") : "—"} ${conv.base} → 总价`}
          hint={`(${conv.quote})`}
          v={fmt(g && Number.isFinite(notional) ? g.price * notional : NaN, 2)}
          tone="pos"
        />
      </Card>

      <Card title="希腊字母 Greeks">
        <Row k="deltaSpot" hint="e^{−rf T}Φ(±d1), 对冲即期" v={fmt(g?.deltaSpot ?? NaN, 4)} tone="gold" />
        <Row k="deltaFwd" hint="Φ(±d1), 对冲远期" v={fmt(g?.deltaFwd ?? NaN, 4)} />
        <Row k="deltaPA" hint="premium-adjusted, 权利金计入外币" v={fmt(g?.deltaPA ?? NaN, 4)} />
        <p className="mb-1 border-b border-line/50 pb-1.5 text-[11px] leading-relaxed text-slate2 opacity-80">
          区别:spot delta 是对即期的敏感度;forward delta 折到远期(相差 e^{"{rf T}"} 因子);premium-adjusted 在权利金以外币支付时扣掉权利金自带的外币头寸(deltaPA = deltaSpot − price/S)。当前 {mkt.pair} 惯例:{conv.premiumAdjusted ? "PA delta" : "spot delta"}。
        </p>
        <Row k="gamma" hint="∂²V/∂S²" v={fmt(g?.gamma ?? NaN, 4)} />
        <Row k="vega" hint="每 1% vol" v={fmt(g?.vegaPct ?? NaN, 6)} />
        <Row k="vanna" hint="∂Δ/∂σ = ∂²V/∂S∂σ, RR 对冲的敏感度语言" v={fmt(ok ? vanna(inp) : NaN, 4)} />
        <Row k="volga" hint="∂vega/∂σ = ∂²V/∂σ², BF 对冲的敏感度语言" v={fmt(ok ? volga(inp) : NaN, 4)} />
        <Row k="theta" hint="每日历日" v={fmt(g?.thetaDay ?? NaN, 6)} tone={g && g.thetaDay < 0 ? "neg" : undefined} />
        <Row k="rhoD" hint="∂V/∂rd" v={fmt(g?.rhoD ?? NaN, 4)} />
        <Row k="rhoF" hint="∂V/∂rf" v={fmt(g?.rhoF ?? NaN, 4)} />
      </Card>

      <Card title="隐含波动率反推 Implied Vol">
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field
            label={`市场期权价 (${conv.quote} / 1${conv.base}名义)`}
            value={ivPrice} onChange={setIvPrice} step="0.0001" min={0}
          />
          <button
            type="button"
            disabled={!g}
            title={g ? `填入当前理论价 ${fmt(g.price, 6)}` : "输入无效"}
            onClick={() => g && setIvPrice(Number(g.price.toFixed(6)))}
            className="mb-0.5 rounded-md border border-line bg-panel2 px-2 py-1.5 text-xs text-slate2 transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
          >
            用当前理论价填入
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-line/60 bg-panel2/50 px-3 py-2">
          <span className="text-xs text-slate2">
            反推 σ<span className="ml-1 opacity-60">(使 GK 理论价 = 市场价)</span>
          </span>
          {!Number.isFinite(ivPrice) ? (
            <span className="font-mono text-sm text-slate2">—</span>
          ) : ivOk ? (
            <span className="font-mono text-sm font-semibold text-gold">{fmtPct(iv, 2)}</span>
          ) : (
            <span className="text-xs font-semibold text-crimson">价格越界(低于内在值或超上界)</span>
          )}
          <button
            type="button"
            disabled={!ivOk}
            onClick={writeBackSigma}
            className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              ivWrote ? "border-forest bg-forest/15 text-forest" : "border-line bg-panel2 text-slate2 hover:border-gold hover:text-gold"
            }`}
          >
            {ivWrote ? "✓已写回" : "写回全局 σ"}
          </button>
        </div>
        <Note>
          由市场成交价反推隐含波动率(与全局 σ 无关,只用 S/rd/rf/T 与本卡 K、Call/Put)。反推值 ≠ 全局 σ 即市场 smile/skew 的体现;“写回全局 σ”后 MarketBar 与所有工具同步采用。无解上界:价格不得低于贴现内在值、不得超过 e^{"{−rf T}"}S(call)或 e^{"{−rd T}"}K(put)。
        </Note>
      </Card>

      <Card title="敏感性曲线 (S ± 15%)">
        <div className="mb-2 flex items-center gap-2">
          {mBtn("price", "Price")}
          {mBtn("deltaSpot", "Delta (spot)")}
          {chart && (
            <span className="ml-auto font-mono text-xs text-slate2">
              当前 S={fmt(S, conv.spotPrecision)} → {metric === "price" ? fmt(chart.yCur, 6) : fmt(chart.yCur, 4)}
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
          <p className="py-10 text-center text-xs text-slate2">输入无效 —— 需 S, K, σ, T &gt; 0(市场参数在 MarketBar 修改)</p>
        )}
        <Note>
          Premium-adjusted delta 用于权利金以外币(=基础货币)支付的货币对惯例(如 USDJPY、USDCNH 的 USD 计价权利金);USDCNY 场内报价常用 spot delta。对冲手数与行权价反推(strike-from-delta)都依赖该约定,以台子惯例为准。
        </Note>
      </Card>
    </div>
  );
}
