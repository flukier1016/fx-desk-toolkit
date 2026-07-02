/** 微笑曲线构建器 —— ATM / 25ΔRR / 25ΔBF (可选 10Δ) → σ(Δ) 曲线 + 锚点行权价
 *  x 轴 = 看涨等价 Δ (call-equivalent delta):左 = Call 翼(高 K),右 = Put 翼(低 K)
 *  S/rd/rf/T 取自全局市场状态(顶部 MarketBar 编辑);ATM σ 本地可调,可一键写回全局。
 */
import { useMemo, useState } from "react";
import { smileNodes, smileStrikes, pchip, type SmileQuotes } from "../lib/smile";
import type { DeltaConv } from "../lib/gk";
import { useMarket } from "../state/market";
import { pairConv } from "../lib/conventions";
import { Card, Field, Select, Row, Note, fmt, fmtPct } from "../components/ui";

const CONV_OPTS: { value: DeltaConv; label: string }[] = [
  { value: "spot", label: "Spot Δ" },
  { value: "forward", label: "Forward Δ" },
  { value: "pa-spot", label: "PA Spot Δ" },
  { value: "pa-forward", label: "PA Forward Δ" },
];

// ── 图表几何常量 ──
const W = 680, H = 330;
const PAD_L = 54, PAD_R = 18, PAD_T = 20, PAD_B = 48;
const PLOT_W = W - PAD_L - PAD_R, PLOT_H = H - PAD_T - PAD_B;
const X_LO = 0.08, X_HI = 0.92;

const X_TICKS: { x: number; label: string }[] = [
  { x: 0.1, label: "10ΔC" },
  { x: 0.25, label: "25ΔC" },
  { x: 0.5, label: "ATM(~50Δ)" },
  { x: 0.75, label: "25ΔP" },
  { x: 0.9, label: "10ΔP" },
];

export default function SmileBuilder() {
  const { mkt, setMkt } = useMarket();
  const conv0 = pairConv(mkt.pair);

  // 报价(百分数输入,内部换算小数);ATM σ 初值取全局
  const [atmPct, setAtmPct] = useState(() => mkt.sigma * 100);
  const [rr25Pct, setRr25Pct] = useState(1.2);
  const [bf25Pct, setBf25Pct] = useState(0.35);
  const [use10, setUse10] = useState(false);
  const [rr10Pct, setRr10Pct] = useState(2.1);
  const [bf10Pct, setBf10Pct] = useState(1.2);
  // 工具特有:Δ 约定(初值随货币对惯例)
  const [conv, setConv] = useState<DeltaConv>(() => (conv0.premiumAdjusted ? "pa-spot" : "spot"));

  const { S, rd, rf, T } = mkt;
  const atmOk = Number.isFinite(atmPct) && atmPct > 0;

  const model = useMemo(() => {
    const raw = [atmPct, rr25Pct, bf25Pct, S, rd, rf, T, ...(use10 ? [rr10Pct, bf10Pct] : [])];
    if (raw.some((v) => !Number.isFinite(v)) || S <= 0 || T <= 0 || atmPct <= 0) return null;

    const q: SmileQuotes = {
      atm: atmPct / 100, rr25: rr25Pct / 100, bf25: bf25Pct / 100,
      ...(use10 ? { rr10: rr10Pct / 100, bf10: bf10Pct / 100 } : {}),
    };
    const nodes = smileNodes(q);
    const f = pchip(nodes.map((n) => n.xCallDelta), nodes.map((n) => n.sigma));

    // 采样 x ∈ [0.08, 0.92]
    const pts: { x: number; s: number }[] = [];
    for (let x = X_LO; x <= X_HI + 1e-9; x += 0.005) pts.push({ x, s: f(x) });

    const sigAll = [...pts.map((p) => p.s), ...nodes.map((n) => n.sigma)];
    let yLo = Math.min(...sigAll), yHi = Math.max(...sigAll);
    const pad = Math.max((yHi - yLo) * 0.15, 0.0015);
    yLo -= pad; yHi += pad;

    const px = (x: number) => PAD_L + ((x - X_LO) / (X_HI - X_LO)) * PLOT_W;
    const py = (s: number) => PAD_T + (1 - (s - yLo) / (yHi - yLo)) * PLOT_H;

    const path = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x).toFixed(2)},${py(p.s).toFixed(2)}`)
      .join(" ");

    const yTicks: number[] = [];
    for (let i = 0; i <= 4; i++) yTicks.push(yLo + ((yHi - yLo) * i) / 4);

    const rows = smileStrikes(q, S, rd, rf, T, conv);
    return { nodes, path, px, py, yTicks, rows };
  }, [atmPct, rr25Pct, bf25Pct, use10, rr10Pct, bf10Pct, S, rd, rf, T, conv]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="微笑报价 Smile Quotes">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Field label="ATM σ" value={atmPct} onChange={setAtmPct} step="0.1" suffix="%" min={0.01} />
              <button
                type="button"
                disabled={!atmOk}
                onClick={() => setMkt({ sigma: atmPct / 100 })}
                title="将此 ATM σ 写回全局市场状态(所有工具联动)"
                className="mt-1.5 rounded-md border border-line bg-panel2 px-2 py-0.5 text-[11px] text-slate2 transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
              >
                写回全局 σ
              </button>
            </div>
            <Field label="25Δ RR" value={rr25Pct} onChange={setRr25Pct} step="0.05" suffix="%" />
            <Field label="25Δ BF" value={bf25Pct} onChange={setBf25Pct} step="0.05" suffix="%" />
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate2">
            <input
              type="checkbox" checked={use10} onChange={(e) => setUse10(e.target.checked)}
              className="accent-gold"
            />
            加入 10Δ 翼报价(10ΔRR / 10ΔBF)
          </label>
          {use10 && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="10Δ RR" value={rr10Pct} onChange={setRr10Pct} step="0.05" suffix="%" />
              <Field label="10Δ BF" value={bf10Pct} onChange={setBf10Pct} step="0.05" suffix="%" />
            </div>
          )}
        </Card>
        <Card title="全局市场参数 Market(顶部 MarketBar 编辑)">
          <Row k="货币对 Pair" v={mkt.pair} hint={`(${conv0.deltaConvNote})`} tone="gold" />
          <Row k="即期 S" v={fmt(S, conv0.spotPrecision)} />
          <Row k="本币利率 rd" v={fmtPct(rd, 2)} />
          <Row k="外币利率 rf" v={fmtPct(rf, 2)} />
          <Row k="期限 T" v={`${fmt(T, 3)} 年`} />
          <div className="mt-3">
            <Select label="Δ 约定(反解 K 用)" value={conv} onChange={setConv} options={CONV_OPTS} />
          </div>
        </Card>
      </div>

      <Card title="微笑曲线 σ(Δ) — 单调 PCHIP 插值">
        {model ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="波动率微笑曲线">
            {/* 网格:横 */}
            {model.yTicks.map((s, i) => (
              <g key={`gy${i}`}>
                <line
                  x1={PAD_L} x2={W - PAD_R} y1={model.py(s)} y2={model.py(s)}
                  stroke="var(--color-line)" strokeWidth={0.6} opacity={0.45}
                />
                <text
                  x={PAD_L - 6} y={model.py(s) + 3} textAnchor="end"
                  fontSize={10} fill="var(--color-slate2)" fontFamily="var(--font-mono)"
                >
                  {(s * 100).toFixed(2)}
                </text>
              </g>
            ))}
            {/* 网格:纵 + x 轴刻度 */}
            {X_TICKS.map((t) => (
              <g key={t.label}>
                <line
                  x1={model.px(t.x)} x2={model.px(t.x)} y1={PAD_T} y2={H - PAD_B}
                  stroke="var(--color-line)" strokeWidth={0.6} opacity={0.35}
                  strokeDasharray={t.x === 0.5 ? "4 3" : undefined}
                />
                <text
                  x={model.px(t.x)} y={H - PAD_B + 14} textAnchor="middle"
                  fontSize={10} fill="var(--color-slate2)" fontFamily="var(--font-mono)"
                >
                  {t.label}
                </text>
              </g>
            ))}
            {/* 轴 */}
            <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} stroke="var(--color-line)" strokeWidth={1} />
            <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={H - PAD_B} stroke="var(--color-line)" strokeWidth={1} />
            {/* 轴标题与方向标注 */}
            <text x={PAD_L - 40} y={PAD_T - 6} fontSize={10} fill="var(--color-slate2)">σ (%)</text>
            <text x={PAD_L} y={H - 8} fontSize={10} fill="var(--color-steel)">← Call 翼(OTM 看涨 · 高行权价 K↑)</text>
            <text x={W - PAD_R} y={H - 8} textAnchor="end" fontSize={10} fill="var(--color-steel)">
              (低行权价 K↓ · OTM 看跌)Put 翼 →
            </text>
            <text x={PAD_L + PLOT_W / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--color-slate2)">
              x = 看涨等价 Δ
            </text>
            {/* 曲线 */}
            <path d={model.path} fill="none" stroke="var(--color-steel)" strokeWidth={2} />
            {/* 锚点 */}
            {model.nodes.map((n) => {
              const cx = model.px(n.xCallDelta), cy = model.py(n.sigma);
              const above = cy > PAD_T + 20;
              return (
                <g key={n.label}>
                  <circle cx={cx} cy={cy} r={4} fill="var(--color-gold)" stroke="var(--color-ink)" strokeWidth={1.2} />
                  <text
                    x={cx} y={above ? cy - 9 : cy + 17} textAnchor="middle"
                    fontSize={10} fill="var(--color-gold)" fontFamily="var(--font-mono)"
                  >
                    {n.label} {(n.sigma * 100).toFixed(2)}%
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          <p className="py-8 text-center text-sm text-slate2">输入无效:请检查全局 S、T(顶部 MarketBar)与 ATM σ 为正且各报价为有效数字。</p>
        )}
      </Card>

      <Card title="锚点行权价 Anchor Strikes">
        {model ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-slate2">
                <th className="py-1.5 font-normal">锚点</th>
                <th className="py-1.5 font-normal">Δ</th>
                <th className="py-1.5 text-right font-normal">σ</th>
                <th className="py-1.5 text-right font-normal">行权价 K</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {model.rows.map((r) => (
                <tr key={r.label} className="border-b border-line/50 last:border-0">
                  <td className={`py-1.5 ${r.label === "ATM" ? "text-gold" : "text-cloud"}`}>{r.label}</td>
                  <td className="py-1.5 text-slate2">{r.delta}</td>
                  <td className="py-1.5 text-right text-cloud">{fmtPct(r.sigma, 3)}</td>
                  <td className="py-1.5 text-right text-cloud">{fmt(r.strike, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="py-4 text-center text-sm text-slate2">—</p>
        )}
        <Note>
          σ(25ΔC) = ATM + BF + RR/2,σ(25ΔP) = ATM + BF − RR/2;RR = σ(call) − σ(put),RR 为负 = put 更贵(看跌翼抬升)。
          RR 符号方向以货币对与市场惯例为准:USDCNY 中担忧人民币贬值 = 买 USD call(即买 USDCNY 看涨),
          需求推高看涨翼,通常 call 贵、RR &gt; 0。BF 衡量两翼相对 ATM 的凸性(尾部风险溢价)。
          ATM 锚点按 DNS(pips)约定取 K = F·exp(σ²T/2);翼锚点按所选 Δ 约定用各自 σ 反解 K。
          S/rd/rf/T 来自全局市场状态;本地 ATM σ 可微调后点「写回全局 σ」同步给其他工具。
        </Note>
      </Card>
    </div>
  );
}
