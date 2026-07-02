/** 策略构建器 Strategy Builder —— 多腿期权组合:预设载入、腿编辑、净希腊字母、到期损益图
 *  市场参数(S/rd/rf/σ/T/名义)取全局 MarketBar;本地只管腿(K/qty/σ per leg)。
 *  v3:可选「各腿取微笑 σ(SABR)」——ATM/RR25/BF25 三点校准 SABR(同 SmileBuilder 口径),
 *      每条腿 σ 自动 = sabrVol(F, K_leg, T, params),行权价改动即联动;关闭恢复手动腿 σ。
 */
import { useEffect, useMemo, useState } from "react";
import { useMarket } from "../state/market";
import { pairConv } from "../lib/conventions";
import { priceStrategy, payoffCurve, preset, type Leg, type PresetId } from "../lib/strategy";
import { fwd, type CP, type DeltaConv } from "../lib/gk";
import { sabrVol, calibrateSabr } from "../lib/sabr";
import { smileStrikes, type SmileQuotes } from "../lib/smile";
import { Card, Field, Row, Note, fmt } from "../components/ui";

interface LegRow { id: number; cp: CP; K: number; qty: number; sigmaPct: number; label?: string; }

const LS_KEY = "fx-strategy-legs-v1";
let uidCounter = 1;
const uid = () => uidCounter++;

const PRESETS: { id: PresetId; label: string }[] = [
  { id: "straddle", label: "跨式 Straddle" },
  { id: "strangle25", label: "25Δ 宽跨 Strangle" },
  { id: "rr25", label: "25Δ 风险逆转 RR" },
  { id: "butterfly25", label: "25Δ 蝶式 Fly" },
  { id: "seagull", label: "海鸥 Seagull" },
];

const W = 860, H = 330;
const PAD = { l: 58, r: 16, t: 20, b: 34 };

const inputCls =
  "w-full rounded-md border border-line bg-panel2 px-2 py-1 font-mono text-xs text-cloud outline-none focus:border-gold";

function loadLegs(): LegRow[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    if (!arr.every((x) => (x.cp === "call" || x.cp === "put") && typeof x.K === "number" && typeof x.qty === "number" && typeof x.sigmaPct === "number")) return null;
    return arr.map((x) => ({ id: uid(), cp: x.cp as CP, K: x.K, qty: x.qty, sigmaPct: x.sigmaPct, label: typeof x.label === "string" ? x.label : undefined }));
  } catch { return null; }
}

export default function StrategyBuilder() {
  const { mkt } = useMarket();
  const conv = pairConv(mkt.pair);
  const prec = conv.spotPrecision;
  const roundK = (k: number) => Number(k.toFixed(prec));

  const [legs, setLegs] = useState<LegRow[]>(() => {
    const saved = loadLegs();
    if (saved) return saved;
    return preset("straddle", { S: mkt.S, rd: mkt.rd, rf: mkt.rf, T: mkt.T }, mkt.sigma).map((l) => ({
      id: uid(), cp: l.cp, K: Number(l.K.toFixed(pairConv(mkt.pair).spotPrecision)), qty: l.qty, sigmaPct: l.sigma * 100, label: l.label,
    }));
  });
  const [active, setActive] = useState<PresetId | null>(null);

  // ---- 微笑 σ(SABR)开关:ATM/RR25/BF25 → 锚点 K(同 SmileBuilder 各自 σ 反解)→ 校准 SABR ----
  const [useSmile, setUseSmile] = useState(false);
  const [atmPct, setAtmPct] = useState(() => mkt.sigma * 100);
  const [rr25Pct, setRr25Pct] = useState(0.8);
  const [bf25Pct, setBf25Pct] = useState(0.3);

  const smile = useMemo(() => {
    if (!useSmile) return null;
    const raw = [atmPct, rr25Pct, bf25Pct, mkt.S, mkt.rd, mkt.rf, mkt.T];
    if (raw.some((v) => !Number.isFinite(v)) || mkt.S <= 0 || mkt.T <= 0 || atmPct <= 0) return null;
    const q: SmileQuotes = { atm: atmPct / 100, rr25: rr25Pct / 100, bf25: bf25Pct / 100 };
    const dConv: DeltaConv = conv.premiumAdjusted ? "pa-spot" : "spot";
    const rows = smileStrikes(q, mkt.S, mkt.rd, mkt.rf, mkt.T, dConv); // ATM=DNS,翼用各自 σ 反解 K
    const atmR = rows.find((r) => r.label === "ATM");
    const pR = rows.find((r) => r.label === "25ΔP");
    const cR = rows.find((r) => r.label === "25ΔC");
    if (!atmR || !pR || !cR) return null;
    const F = fwd(mkt.S, mkt.rd, mkt.rf, mkt.T);
    const { params, rmse } = calibrateSabr({
      F, T: mkt.T,
      Katm: atmR.strike, sigAtm: atmR.sigma,
      Kp: pR.strike, sigP: pR.sigma,
      Kc: cR.strike, sigC: cR.sigma,
    });
    return { F, params, rmse };
  }, [useSmile, atmPct, rr25Pct, bf25Pct, mkt.S, mkt.rd, mkt.rf, mkt.T, conv.premiumAdjusted]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(legs.map(({ cp, K, qty, sigmaPct, label }) => ({ cp, K, qty, sigmaPct, label }))));
    } catch { /* 满/禁用 */ }
  }, [legs]);

  const loadPreset = (id: PresetId) => {
    // 微笑开启:用微笑 ATM σ 反推行权价,再按各腿 K 取微笑 σ 重算;关闭:统一市场 ATM σ(教学口径)
    const baseSigma = smile ? atmPct / 100 : mkt.sigma;
    const ls = preset(id, { S: mkt.S, rd: mkt.rd, rf: mkt.rf, T: mkt.T }, baseSigma);
    setLegs(ls.map((l) => {
      const K = roundK(l.K);
      const sig = smile ? sabrVol(smile.F, K, mkt.T, smile.params) : l.sigma;
      return { id: uid(), cp: l.cp, K, qty: l.qty, sigmaPct: (Number.isFinite(sig) ? sig : l.sigma) * 100, label: l.label };
    }));
    setActive(id);
  };
  const upd = (id: number, patch: Partial<LegRow>, dropLabel = true) => {
    setActive(null);
    setLegs((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch, ...(dropLabel ? { label: undefined } : {}) } : l)));
  };
  const del = (id: number) => { setActive(null); setLegs((ls) => ls.filter((l) => l.id !== id)); };
  const addLeg = () => {
    setActive(null);
    setLegs((ls) => [...ls, { id: uid(), cp: "call", K: roundK(mkt.S), qty: 1, sigmaPct: mkt.sigma * 100 }]);
  };

  // ---- 引擎腿 + 组合定价(微笑开启:σ 自动 = sabrVol(F, K_leg, T),随 K 联动)----
  const engineLegs: Leg[] = useMemo(
    () => legs.map((l) => ({
      cp: l.cp, K: l.K, qty: l.qty,
      sigma: smile && l.K > 0 ? sabrVol(smile.F, l.K, mkt.T, smile.params) : l.sigmaPct / 100,
      label: l.label,
    })),
    [legs, smile, mkt.T],
  );
  const sigmaOk = useSmile
    ? smile !== null && engineLegs.every((l) => Number.isFinite(l.sigma) && l.sigma > 0)
    : legs.every((l) => Number.isFinite(l.sigmaPct) && l.sigmaPct > 0);
  const ok =
    legs.length > 0 && mkt.S > 0 && mkt.T > 0 && sigmaOk &&
    legs.every((l) => Number.isFinite(l.K) && l.K > 0 && Number.isFinite(l.qty));
  const res = useMemo(
    () => (ok ? priceStrategy(engineLegs, { S: mkt.S, rd: mkt.rd, rf: mkt.rf, T: mkt.T }) : null),
    [ok, engineLegs, mkt.S, mkt.rd, mkt.rf, mkt.T],
  );

  // ---- 到期损益图几何 ----
  const chart = useMemo(() => {
    if (!ok || !res) return null;
    const width = Math.min(0.5, Math.max(0.15, ...engineLegs.map((l) => Math.abs(l.K / mkt.S - 1) + 0.06)));
    const pts = payoffCurve(engineLegs, { S: mkt.S, rd: mkt.rd, rf: mkt.rf, T: mkt.T }, 161, width);
    const xMin = pts[0].S, xMax = pts[pts.length - 1].S;
    let yMin = Math.min(0, ...pts.map((p) => p.pnl));
    let yMax = Math.max(0, ...pts.map((p) => p.pnl));
    if (yMax - yMin < 1e-12) { yMax += 1e-6; yMin -= 1e-6; }
    const padY = (yMax - yMin) * 0.08;
    yMin -= padY; yMax += padY;
    const px = (x: number) => PAD.l + ((x - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
    const py = (y: number) => H - PAD.b - ((y - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.S).toFixed(1)},${py(p.pnl).toFixed(1)}`).join(" ");
    const zeroY = py(0);
    // 闭合区域(曲线 → 零线),配合上下两个 clip 分别染盈利/亏损色
    const area =
      path +
      ` L${px(xMax).toFixed(1)},${zeroY.toFixed(1)} L${px(xMin).toFixed(1)},${zeroY.toFixed(1)} Z`;
    const strikes = [...new Set(engineLegs.map((l) => roundK(l.K)))].filter((k) => k >= xMin && k <= xMax);
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => xMin + f * (xMax - xMin));
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * (yMax - yMin));
    return { px, py, path, area, zeroY, strikes, xTicks, yTicks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, res, engineLegs, mkt.S, mkt.rd, mkt.rf, mkt.T, prec]);

  const toneOf = (x: number): "pos" | "neg" => (x >= 0 ? "pos" : "neg");
  const num = (v: number) => (Number.isFinite(v) ? v : "");

  // ---- 腿明细 TSV 复制 ----
  const [copied, setCopied] = useState(false);
  const copyTsv = () => {
    if (!res) return;
    const header = ["标签", "CP", "K", "qty", "σ(%)", "单腿价", "qty×价"].join("\t");
    const lines = res.legs.map((x) =>
      [
        x.leg.label ?? `${x.leg.qty >= 0 ? "买" : "卖"} ${x.leg.cp === "call" ? "Call" : "Put"} @${fmt(x.leg.K, prec)}`,
        x.leg.cp,
        x.leg.K.toFixed(prec),
        String(x.leg.qty),
        (x.leg.sigma * 100).toFixed(4),
        x.r.price.toFixed(6),
        (x.leg.qty * x.r.price).toFixed(6),
      ].join("\t"),
    );
    navigator.clipboard.writeText([header, ...lines].join("\n")).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => { /* 剪贴板不可用 */ },
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* ---- 腿编辑 ---- */}
      <Card title="策略腿 Legs" className="lg:col-span-2">
        <div className="mb-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id} type="button" onClick={() => loadPreset(p.id)}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                active === p.id ? "border-gold bg-gold/15 text-gold" : "border-line bg-panel2 text-slate2 hover:text-cloud"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-slate2">
          <input
            type="checkbox" checked={useSmile} onChange={(e) => setUseSmile(e.target.checked)}
            className="accent-gold"
          />
          各腿取微笑 σ(SABR)—— ATM/RR/BF 三点校准,腿 σ 自动 = sabrVol(F, K<sub>腿</sub>, T)
        </label>
        {useSmile && (
          <div className="mb-3 rounded-md border border-line/60 bg-panel2/40 p-2.5">
            <div className="grid grid-cols-3 gap-3">
              <Field label="ATM σ" value={atmPct} onChange={setAtmPct} step="0.1" suffix="%" min={0.01} />
              <Field label="25Δ RR" value={rr25Pct} onChange={setRr25Pct} step="0.05" suffix="%" />
              <Field label="25Δ BF" value={bf25Pct} onChange={setBf25Pct} step="0.05" suffix="%" />
            </div>
            <p className="mt-2 font-mono text-[11px] text-slate2">
              {smile
                ? `SABR(β=1): α=${smile.params.alpha.toFixed(4)}  ρ=${smile.params.rho.toFixed(3)}  ν=${smile.params.nu.toFixed(3)} · 校准RMSE=${(smile.rmse * 1e4).toFixed(2)}bp · F=${fmt(smile.F, prec)}`
                : "微笑输入无效:ATM σ 需为正,RR/BF 需为有效数字(且顶部 S、T > 0)"}
            </p>
          </div>
        )}

        <div className="grid grid-cols-[1fr_1.2fr_1fr_1fr_auto] items-center gap-2 border-b border-line/60 pb-1 text-[11px] text-slate2">
          <span>类型 CP</span><span>行权价 K</span><span>数量 qty(+买 −卖)</span><span>σ(%){useSmile ? " · 微笑自动" : ""}</span><span />
        </div>
        {legs.map((l, i) => (
          <div key={l.id} className="grid grid-cols-[1fr_1.2fr_1fr_1fr_auto] items-center gap-2 py-1.5">
            <select
              value={l.cp} onChange={(e) => upd(l.id, { cp: e.target.value as CP })}
              className="w-full rounded-md border border-line bg-panel2 px-1.5 py-1 text-xs text-cloud outline-none focus:border-gold"
            >
              <option value="call">Call 看涨</option>
              <option value="put">Put 看跌</option>
            </select>
            <input type="number" step={1 / 10 ** prec} min={0} value={num(l.K)} className={inputCls}
              onChange={(e) => upd(l.id, { K: parseFloat(e.target.value) })} aria-label="行权价 K" />
            <input type="number" step="1" value={num(l.qty)} className={inputCls}
              onChange={(e) => upd(l.id, { qty: parseFloat(e.target.value) })} aria-label="数量 qty" />
            {useSmile ? (
              <div
                className="w-full rounded-md border border-line/60 bg-panel2/50 px-2 py-1 font-mono text-xs text-gold"
                title="微笑自动 σ = sabrVol(F, K, T)——只读,随行权价 K 联动;关闭开关恢复手动"
                aria-label="波动率 %(微笑自动,只读)"
              >
                {Number.isFinite(engineLegs[i]?.sigma ?? NaN) ? ((engineLegs[i]!.sigma) * 100).toFixed(2) : "—"}
              </div>
            ) : (
              <input type="number" step="0.1" min={0} value={num(l.sigmaPct)} className={inputCls}
                onChange={(e) => upd(l.id, { sigmaPct: parseFloat(e.target.value) }, false)} aria-label="波动率 %" />
            )}
            <button
              type="button" onClick={() => del(l.id)} title="删除该腿"
              className="rounded-md border border-line bg-panel2 px-2 py-1 text-xs text-slate2 transition-colors hover:border-crimson hover:text-crimson"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button" onClick={addLeg}
          className="mt-2 rounded-md border border-line bg-panel2 px-3 py-1.5 text-xs font-semibold text-slate2 transition-colors hover:border-gold hover:text-gold"
        >
          + 添加腿(默认 ATM Call,σ=市场 ATM)
        </button>
        <Note>
          S={fmt(mkt.S, prec)}、rd/rf/T/σ(ATM)与名义由顶部 MarketBar 统一设置;此处只编辑各腿 K / 数量 / 腿 σ。qty 为正=买入(付权利金),为负=卖出(收权利金)。
          开启「各腿取微笑 σ(SABR)」后为<b>市场一致</b>定价口径:σ 列变为只读自动值,每条腿 σ = sabrVol(F, K<sub>腿</sub>, T),改 K 即联动重算;关闭恢复手动腿 σ。
        </Note>
      </Card>

      {/* ---- 组合汇总 ---- */}
      <Card title="组合汇总 Net">
        <Row k="净权利金 net premium" hint="(本币/1外币,正=支付 负=收取)" v={fmt(res?.price ?? NaN, 6)} tone="gold" />
        <Row
          k={`× 名义 ${mkt.notional.toLocaleString("en-US")} ${conv.base}`} hint={`→ ${conv.quote}`}
          v={fmt(res ? res.price * mkt.notional : NaN, 2)} tone="gold"
        />
        <Row k="净 Delta (spot)" hint="Σ qty·Δ" v={fmt(res?.deltaSpot ?? NaN, 4)} tone={res ? toneOf(res.deltaSpot) : undefined} />
        <Row k="净 Gamma" hint="∂²V/∂S²" v={fmt(res?.gamma ?? NaN, 4)} tone={res ? toneOf(res.gamma) : undefined} />
        <Row k="净 Vega" hint="每 1% vol" v={fmt(res?.vegaPct ?? NaN, 6)} tone={res ? toneOf(res.vegaPct) : undefined} />
        <Row k="净 Theta" hint="每日历日" v={fmt(res?.thetaDay ?? NaN, 6)} tone={res ? toneOf(res.thetaDay) : undefined} />
        <Note>
          买波动率(跨式/宽跨)= 正 gamma/vega、负 theta:付时间价值等波动;卖结构相反,赚 theta 但 gamma/vega 空头。RR 的 delta 大、vega 小,是方向+偏度工具。
        </Note>
      </Card>

      {/* ---- 到期损益图 ---- */}
      <Card title="到期损益 Payoff at Expiry(含权利金,本币 / 1 外币名义)" className="lg:col-span-3">
        {chart && res ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="组合到期损益曲线">
            <defs>
              <clipPath id="sbClipPos"><rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={Math.max(0, chart.zeroY - PAD.t)} /></clipPath>
              <clipPath id="sbClipNeg"><rect x={PAD.l} y={chart.zeroY} width={W - PAD.l - PAD.r} height={Math.max(0, H - PAD.b - chart.zeroY)} /></clipPath>
            </defs>
            {/* 网格与轴 */}
            {chart.yTicks.map((y, i) => (
              <g key={`y${i}`}>
                <line x1={PAD.l} x2={W - PAD.r} y1={chart.py(y)} y2={chart.py(y)} className="stroke-line" strokeWidth="1" strokeDasharray="3 4" />
                <text x={PAD.l - 6} y={chart.py(y) + 3.5} textAnchor="end" className="fill-slate2 font-mono" fontSize="10">{fmt(y, 4)}</text>
              </g>
            ))}
            {chart.xTicks.map((x, i) => (
              <g key={`x${i}`}>
                <line x1={chart.px(x)} x2={chart.px(x)} y1={PAD.t} y2={H - PAD.b} className="stroke-line" strokeWidth="1" strokeDasharray="3 4" />
                <text x={chart.px(x)} y={H - PAD.b + 16} textAnchor="middle" className="fill-slate2 font-mono" fontSize="10">{fmt(x, prec)}</text>
              </g>
            ))}
            {/* 盈利/亏损区域上色 */}
            <path d={chart.area} className="fill-forest" fillOpacity="0.18" clipPath="url(#sbClipPos)" />
            <path d={chart.area} className="fill-crimson" fillOpacity="0.18" clipPath="url(#sbClipNeg)" />
            {/* 零线 */}
            <line x1={PAD.l} x2={W - PAD.r} y1={chart.zeroY} y2={chart.zeroY} className="stroke-cloud" strokeWidth="1" strokeDasharray="5 4" opacity="0.7" />
            <text x={W - PAD.r - 4} y={chart.zeroY - 5} textAnchor="end" className="fill-slate2 font-mono" fontSize="10">PnL = 0</text>
            {/* 各腿行权价竖线 */}
            {chart.strikes.map((k, i) => (
              <g key={`k${i}`}>
                <line x1={chart.px(k)} x2={chart.px(k)} y1={PAD.t} y2={H - PAD.b} className="stroke-steel" strokeWidth="1" strokeDasharray="2 3" />
                <text x={chart.px(k) + 3} y={PAD.t + 10 + (i % 2) * 11} className="fill-steel font-mono" fontSize="9.5">K={fmt(k, prec)}</text>
              </g>
            ))}
            {/* 当前即期 */}
            <line x1={chart.px(mkt.S)} x2={chart.px(mkt.S)} y1={PAD.t} y2={H - PAD.b} className="stroke-gold" strokeWidth="1.2" strokeDasharray="4 3" />
            <text x={chart.px(mkt.S) + 3} y={H - PAD.b - 6} className="fill-gold font-mono" fontSize="10">S={fmt(mkt.S, prec)}</text>
            {/* 损益曲线 */}
            <path d={chart.path} fill="none" className="stroke-gold" strokeWidth="2.2" strokeLinejoin="round" />
            <text x={PAD.l} y={12} className="fill-slate2 font-mono" fontSize="10">横轴 S_T,纵轴到期 PnL(终值口径,权利金不折现)</text>
          </svg>
        ) : (
          <p className="py-12 text-center text-xs text-slate2">
            腿参数无效 —— 需至少 1 条腿且各腿 K &gt; 0、σ &gt; 0(顶部 S、T &gt; 0){useSmile ? ";微笑开启时另需 ATM/RR/BF 三点输入有效" : ""}
          </p>
        )}
      </Card>

      {/* ---- 腿明细 ---- */}
      <Card title="腿明细 Leg Detail" className="lg:col-span-3">
        {res && (
          <div className="mb-2 flex justify-end">
            <button
              type="button" onClick={copyTsv}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                copied ? "border-forest text-forest" : "border-line bg-panel2 text-slate2 hover:border-gold hover:text-gold"
              }`}
            >
              {copied ? "✓ 已复制" : "复制 TSV"}
            </button>
          </div>
        )}
        {res ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-slate2">
                  <th className="py-1.5 pr-3 font-normal">标签 label</th>
                  <th className="py-1.5 pr-3 font-normal">K</th>
                  <th className="py-1.5 pr-3 font-normal">qty</th>
                  <th className="py-1.5 pr-3 font-normal">σ</th>
                  <th className="py-1.5 pr-3 font-normal">单腿价(本币/1外币)</th>
                  <th className="py-1.5 font-normal">qty × 价</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {res.legs.map((x, i) => (
                  <tr key={i} className="border-b border-line/40 last:border-0">
                    <td className="py-1.5 pr-3 font-sans text-cloud">
                      {x.leg.label ?? `${x.leg.qty >= 0 ? "买" : "卖"} ${x.leg.cp === "call" ? "Call" : "Put"} @${fmt(x.leg.K, prec)}`}
                    </td>
                    <td className="py-1.5 pr-3 text-cloud">{fmt(x.leg.K, prec)}</td>
                    <td className={`py-1.5 pr-3 ${x.leg.qty >= 0 ? "text-forest" : "text-crimson"}`}>{x.leg.qty >= 0 ? `+${x.leg.qty}` : x.leg.qty}</td>
                    <td className="py-1.5 pr-3 text-cloud">{(x.leg.sigma * 100).toFixed(2)}%</td>
                    <td className="py-1.5 pr-3 text-cloud">{fmt(x.r.price, 6)}</td>
                    <td className={`py-1.5 ${x.leg.qty * x.r.price >= 0 ? "text-forest" : "text-crimson"}`}>{fmt(x.leg.qty * x.r.price, 6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-slate2">无有效腿</p>
        )}
        <Note>
          {useSmile ? (
            <>已开启<b>微笑 σ(SABR)</b>,为<b>市场一致</b>定价口径:预设按钮亦按各自 K 取微笑 σ 重算,每条腿 σ 各不相同(25ΔP、ATM、25ΔC)——RR/BF 对偏度与曲率的定价已进入每条腿。</>
          ) : (
            <>预设按<b>统一 σ</b>(市场 ATM 波动率)反推 25Δ/DNS 行权价并定价,为教学口径;实盘每条腿应取 smile 上各自的 σ(25ΔP、25ΔC、ATM 各不相同——RR/BF 报价正是对偏度与曲率定价),可开启上方「各腿取微笑 σ(SABR)」开关切到市场一致口径。</>
          )}
          <span className="text-crimson"> 风险提示:卖出期权(qty&lt;0)收取的权利金有限,而名义风险不对称——大幅穿越行权价时亏损可远超所收权利金(海鸥/RR 中的空腿同理),务必按名义放大后评估最坏情形并预留保证金。</span>
        </Note>
      </Card>
    </div>
  );
}
