/** 情景矩阵 Scenario Ladder —— spot × vol 双向冲击重估网格(每格全重估,非泰勒近似)。
 *  v2:接入全局市场状态 useMarket——S/rd/rf/σ/T/名义 全部来自 MarketBar;本地只留 CP/K/指标/档距/档数。
 *  渲染:HTML 表格热力图(行=vol 冲击 从+到−,列=spot 冲击 从−到+),pnl 指标按值上色,基准格金框。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ladder, pick, type Metric } from "../lib/ladder";
import type { CP } from "../lib/gk";
import { useMarket } from "../state/market";
import { pairConv } from "../lib/conventions";
import { Card, Field, Select, Note, fmt, fmtPct } from "../components/ui";

const LS_KEY = "fx-scenario-ladder-v1";

interface Saved {
  cp: CP; metric: Metric;
  spotStepPct: number; spotN: number;
  volStepPts: number; volN: number;
}

const DEFAULTS: Saved = { cp: "call", metric: "pnl", spotStepPct: 0.5, spotN: 9, volStepPts: 1, volN: 5 };

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* 坏数据忽略 */ }
  return DEFAULTS;
}

/** 档数 → 对称奇数网格:half 档向下 + 0 + half 档向上 */
const halfOf = (n: number) => Math.max(1, Math.floor((Number.isFinite(n) ? n : 3) / 2));

const METRIC_OPTS: { value: Metric; label: string }[] = [
  { value: "pnl", label: "PnL(重估×名义)" },
  { value: "price", label: "价格 Price(每1外币)" },
  { value: "deltaSpot", label: "Delta(spot,每1外币)" },
  { value: "gamma", label: "Gamma(每1外币)" },
  { value: "vegaPct", label: "Vega(每1%vol)" },
  { value: "thetaDay", label: "Theta(每日历日)" },
];

const METRIC_DP: Record<Metric, number> = { pnl: 0, price: 5, deltaSpot: 4, gamma: 4, vegaPct: 5, thetaDay: 5 };

/** 正绿负红半透明热力色(仅 pnl 用):forest #5cb87a / crimson #e06c66 */
function heatBg(v: number, maxAbs: number): string | undefined {
  if (!Number.isFinite(v) || maxAbs <= 0 || v === 0) return undefined;
  const a = Math.min(Math.abs(v) / maxAbs, 1) * 0.5 + 0.06;
  return v > 0 ? `rgba(92,184,122,${a.toFixed(3)})` : `rgba(224,108,102,${a.toFixed(3)})`;
}

export default function ScenarioLadder() {
  const { mkt } = useMarket();
  const conv = pairConv(mkt.pair);

  const saved = useMemo(loadSaved, []);
  const [cp, setCp] = useState<CP>(saved.cp);
  const [K, setK] = useState(mkt.S);                      // 行权价默认 ATM=S,本地参数
  const [metric, setMetric] = useState<Metric>(saved.metric);
  const [spotStepPct, setSpotStepPct] = useState(saved.spotStepPct); // spot 档距(%)
  const [spotN, setSpotN] = useState(saved.spotN);        // spot 档数(奇数)
  const [volStepPts, setVolStepPts] = useState(saved.volStepPts);    // vol 档距(vol点,1=1%绝对vol)
  const [volN, setVolN] = useState(saved.volN);           // vol 档数(奇数)

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ cp, metric, spotStepPct, spotN, volStepPts, volN } satisfies Saved));
    } catch { /* 满/禁用时静默 */ }
  }, [cp, metric, spotStepPct, spotN, volStepPts, volN]);

  // ── 校验 ──
  const errs: string[] = [];
  if (!(Number.isFinite(K) && K > 0)) errs.push("行权价 K 必须为正数");
  if (!(Number.isFinite(spotStepPct) && spotStepPct > 0)) errs.push("spot 档距必须为正数(%)");
  if (!(Number.isFinite(volStepPts) && volStepPts > 0)) errs.push("vol 档距必须为正数(vol点)");
  if (!(mkt.S > 0 && mkt.sigma > 0 && mkt.T > 0)) errs.push("市场状态非法:请在顶部 MarketBar 检查 S/σ/T");
  const hs = Math.min(halfOf(spotN), 10);                 // 最多 ±10 档,防超宽
  const hv = Math.min(halfOf(volN), 6);
  if (hs * spotStepPct / 100 >= 1) errs.push("spot 向下冲击 ≥100%,会把即期打成非正数,请缩小档距/档数");
  const ok = errs.length === 0;

  // ── shock 数组:列=spot 从−到+;行=vol 从+到−(ladder 按 volShocks 顺序出行) ──
  const grid = useMemo(() => {
    if (!ok) return null;
    const spotShocks = Array.from({ length: 2 * hs + 1 }, (_, i) => (i - hs) * spotStepPct / 100);
    const volShocks = Array.from({ length: 2 * hv + 1 }, (_, i) => (hv - i) * volStepPts / 100);
    const cells = ladder({
      cp,
      base: { S: mkt.S, K, rd: mkt.rd, rf: mkt.rf, sigma: mkt.sigma, T: mkt.T },
      spotShocks, volShocks,
      notional: mkt.notional,
    });
    let maxAbs = 0;
    for (const row of cells) for (const c of row) {
      const v = pick(c, metric);
      if (Number.isFinite(v)) maxAbs = Math.max(maxAbs, Math.abs(v));
    }
    return { spotShocks, volShocks, cells, maxAbs };
  }, [ok, cp, K, metric, spotStepPct, volStepPts, hs, hv, mkt.S, mkt.rd, mkt.rf, mkt.sigma, mkt.T, mkt.notional]);

  const dp = METRIC_DP[metric];
  const metricLabel = METRIC_OPTS.find((o) => o.value === metric)?.label ?? metric;

  // ── 复制 TSV:含行列表头(首行=冲击后绝对 S,首列=冲击后绝对 σ%),纯数字无千分位,可直接粘 Excel ──
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  const copyTsv = async () => {
    if (!grid) return;
    const header = ["σ\\S", ...grid.spotShocks.map((ds) => (mkt.S * (1 + ds)).toFixed(conv.spotPrecision))].join("\t");
    const rows = grid.cells.map((row, i) => {
      const sigAbs = ((mkt.sigma + grid.volShocks[i]) * 100).toFixed(1) + "%";
      const vals = row.map((cell) => {
        const v = pick(cell, metric);
        return Number.isFinite(v) ? v.toFixed(dp) : "";
      });
      return [sigAbs, ...vals].join("\t");
    });
    try {
      await navigator.clipboard.writeText([header, ...rows].join("\n"));
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch { /* 剪贴板被拒/不可用时静默 */ }
  };

  return (
    <div className="grid gap-4">
      <Card title="参数(市场基准由顶部 MarketBar 统一给定)">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <Select<CP> label="期权类型 CP" value={cp} onChange={setCp}
            options={[{ value: "call", label: "看涨 Call" }, { value: "put", label: "看跌 Put" }]} />
          <div>
            <Field label={`行权价 K(${conv.quote}/${conv.base})`} value={K} onChange={setK} step="0.01" />
            <button
              onClick={() => setK(mkt.S)}
              className="mt-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-steel hover:border-gold hover:text-gold"
            >K = S(ATM)</button>
          </div>
          <Select<Metric> label="网格指标 Metric" value={metric} onChange={setMetric} options={METRIC_OPTS} />
          <Field label="spot 档距" value={spotStepPct} onChange={setSpotStepPct} step="0.1" suffix="%" min={0} />
          <Field label="spot 档数(奇数)" value={spotN} onChange={setSpotN} step="2" min={3} max={21} suffix="档" />
          <Field label="vol 档距" value={volStepPts} onChange={setVolStepPts} step="0.5" suffix="vol点" min={0} />
          <Field label="vol 档数(奇数)" value={volN} onChange={setVolN} step="2" min={3} max={13} suffix="档" />
        </div>
        <div className="mt-2 text-[11px] text-slate2 font-mono">
          基准:{mkt.pair} · S={fmt(mkt.S, conv.spotPrecision)} · σ={fmtPct(mkt.sigma, 1)} · T={fmt(mkt.T, 2)}y ·
          名义={fmt(mkt.notional, 0)} {conv.base} · rd={fmtPct(mkt.rd, 2)} / rf={fmtPct(mkt.rf, 2)}
        </div>
        {errs.length > 0 && (
          <div className="mt-3 rounded-md border border-crimson/60 bg-crimson/10 p-2.5 text-xs leading-relaxed text-crimson">
            {errs.map((e, i) => <div key={i}>· {e}</div>)}
          </div>
        )}
      </Card>

      <Card title={
        <div className="flex items-center justify-between gap-2">
          <span>{`情景矩阵 Scenario Ladder · ${metricLabel}(行=σ 冲击 从+到−,列=S 冲击 从−到+)`}</span>
          <button
            onClick={copyTsv}
            disabled={!grid}
            className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-normal transition-colors ${
              copied
                ? "border-forest text-forest"
                : "border-line text-steel hover:border-gold hover:text-gold disabled:opacity-40 disabled:hover:border-line disabled:hover:text-steel"
            }`}
            title="复制当前矩阵为 TSV(含行列表头),可直接粘贴进 Excel"
          >{copied ? "✓已复制" : "复制 TSV"}</button>
        </div>
      }>
        {grid ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right font-mono text-[11px]">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-panel px-2 py-1 text-left text-slate2 font-normal">σ \ S</th>
                  {grid.spotShocks.map((ds, j) => (
                    <th key={j} className={`px-2 py-1 font-normal ${ds === 0 ? "text-gold" : "text-slate2"}`}>
                      <div>{fmt(mkt.S * (1 + ds), conv.spotPrecision)}</div>
                      <div className="opacity-60">{ds > 0 ? "+" : ""}{(ds * 100).toFixed(1)}%</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.cells.map((row, i) => {
                  const dv = grid.volShocks[i];
                  return (
                    <tr key={i} className="border-t border-line/40">
                      <th className={`sticky left-0 bg-panel px-2 py-1 text-left font-normal ${dv === 0 ? "text-gold" : "text-slate2"}`}>
                        <div>{fmtPct(mkt.sigma + dv, 1)}</div>
                        <div className="opacity-60">{dv > 0 ? "+" : ""}{(dv * 100).toFixed(1)}v</div>
                      </th>
                      {row.map((cell, j) => {
                        const v = pick(cell, metric);
                        const isBase = cell.dS === 0 && cell.dVol === 0;
                        return (
                          <td
                            key={j}
                            className="whitespace-nowrap px-2 py-1 text-cloud"
                            style={{
                              background: metric === "pnl" ? heatBg(v, grid.maxAbs) : undefined,
                              boxShadow: isBase ? "inset 0 0 0 1.5px var(--color-gold)" : undefined,
                            }}
                            title={`dS=${(cell.dS * 100).toFixed(1)}% dσ=${(cell.dVol * 100).toFixed(1)}v → S=${fmt(mkt.S * (1 + cell.dS), conv.spotPrecision)} σ=${fmtPct(mkt.sigma + cell.dVol, 1)}`}
                          >
                            {metric === "pnl" && v > 0 ? "+" : ""}{fmt(v, dp)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-crimson">参数非法,请先修正上方输入。</p>
        )}
        <Note>
          这是台上"压力速查(risk ladder / scenario matrix)"的迷你版:每格用 Garman–Kohlhagen 对 (S×(1+dS), σ+dσ) 全重估,
          PnL = (重估价 − 基准价) × 名义(单位 {conv.quote}),不是泰勒展开近似。
          <b className="text-gold">横看一行</b>:σ 固定、S 在动 → 读的是 Delta 方向与 Gamma 弯曲(数值随 S 非线性变化的快慢);
          <b className="text-gold">竖看一列</b>:S 固定、σ 在动 → 读的是 Vega 方向(long option 上行 σ 加钱,下行减钱)。
          基准格(金框)= 当前 MarketBar 状态,pnl 指标下恒为 0;其余指标为每 1 单位外币名义的值。
          档距/档数与指标选择自动存本机(localStorage)。
        </Note>
      </Card>
    </div>
  );
}
