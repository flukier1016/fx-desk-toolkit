/** 全局市场参数条:所有工具共享的 S/rd/rf/σ/T/名义 在这里统一编辑 */
import { useRef, useState } from "react";
import { useMarket } from "../state/market";
import { PAIRS, TENORS, pairConv } from "../lib/conventions";

function Num({ label, value, onChange, step = "any", w = "w-24", suffix }: {
  label: string; value: number; onChange: (v: number) => void; step?: string; w?: string; suffix?: string;
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-[10px] text-slate2">{label}</span>
      <input type="number" value={Number.isFinite(value) ? value : ""} step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`${w} rounded border border-line bg-panel2 px-1.5 py-1 font-mono text-xs text-cloud outline-none focus:border-gold`} />
      {suffix && <span className="text-[10px] text-slate2">{suffix}</span>}
    </label>
  );
}

export default function MarketBar() {
  const { mkt, setMkt, reset, exportJson, importJson } = useMarket();
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const conv = pairConv(mkt.pair);
  return (
    <div className="border-b border-line bg-panel/80 px-4 py-2">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-gold">全局市场</span>
        <label className="flex items-center gap-1">
          <span className="text-[10px] text-slate2">货币对</span>
          <select value={mkt.pair} onChange={(e) => setMkt({ pair: e.target.value })}
            className="rounded border border-line bg-panel2 px-1.5 py-1 text-xs text-cloud outline-none focus:border-gold">
            {PAIRS.map((p) => <option key={p.symbol} value={p.symbol}>{p.symbol}</option>)}
          </select>
        </label>
        <Num label="S" value={mkt.S} onChange={(v) => setMkt({ S: v })} />
        <Num label="rd" value={+(mkt.rd * 100).toFixed(6)} onChange={(v) => setMkt({ rd: v / 100 })} w="w-16" suffix="%" />
        <Num label="rf" value={+(mkt.rf * 100).toFixed(6)} onChange={(v) => setMkt({ rf: v / 100 })} w="w-16" suffix="%" />
        <Num label="σ" value={+(mkt.sigma * 100).toFixed(6)} onChange={(v) => setMkt({ sigma: v / 100 })} w="w-16" suffix="%" />
        <Num label="T" value={mkt.T} onChange={(v) => setMkt({ T: v })} w="w-20" suffix="年" />
        <label className="flex items-center gap-1">
          <span className="text-[10px] text-slate2">期限</span>
          <select value="" onChange={(e) => { const d = TENORS.find(t => t.label === e.target.value); if (d) setMkt({ T: +(d.days / 365).toFixed(6) }); }}
            className="rounded border border-line bg-panel2 px-1 py-1 text-xs text-slate2 outline-none">
            <option value="">速选</option>
            {TENORS.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
          </select>
        </label>
        <Num label="名义" value={mkt.notional} onChange={(v) => setMkt({ notional: v })} w="w-28" step="100000" suffix={conv.base} />
        <span className="hidden text-[10px] text-slate2 lg:inline">pip×{conv.pipFactor} · {conv.deltaConvNote}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => { navigator.clipboard?.writeText(exportJson()); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="rounded border border-line px-2 py-0.5 text-[10px] text-slate2 hover:border-gold hover:text-gold">{copied ? "✓ 已复制" : "导出"}</button>
          <button onClick={() => fileRef.current?.click()}
            className="rounded border border-line px-2 py-0.5 text-[10px] text-slate2 hover:border-gold hover:text-gold">导入</button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; f.text().then((s) => { if (!importJson(s)) alert("JSON 格式不对"); }); e.target.value = ""; }} />
          <button onClick={reset} className="rounded border border-line px-2 py-0.5 text-[10px] text-slate2 hover:border-crimson hover:text-crimson">重置</button>
        </div>
      </div>
    </div>
  );
}
