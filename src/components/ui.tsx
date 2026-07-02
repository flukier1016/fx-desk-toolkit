/** 共享 UI 原子 —— 所有工具页统一使用,保证观感一致 */
import type { ReactNode } from "react";

export function Card({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-panel p-4 ${className}`}>
      {title && <div className="mb-3 text-sm font-bold tracking-wide text-gold">{title}</div>}
      {children}
    </div>
  );
}

export function Field({
  label, value, onChange, step = "any", suffix, min, max,
}: {
  label: string; value: number; onChange: (v: number) => void;
  step?: string; suffix?: string; min?: number; max?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate2">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number" value={Number.isFinite(value) ? value : ""} step={step} min={min} max={max}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full rounded-md border border-line bg-panel2 px-2 py-1.5 font-mono text-sm text-cloud outline-none focus:border-gold"
        />
        {suffix && <span className="shrink-0 text-xs text-slate2">{suffix}</span>}
      </div>
    </label>
  );
}

export function Select<T extends string>({
  label, value, onChange, options,
}: {
  label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate2">{label}</span>
      <select
        value={value} onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-md border border-line bg-panel2 px-2 py-1.5 text-sm text-cloud outline-none focus:border-gold"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Row({ k, v, hint, tone }: { k: ReactNode; v: ReactNode; hint?: string; tone?: "pos" | "neg" | "gold" }) {
  const c = tone === "pos" ? "text-forest" : tone === "neg" ? "text-crimson" : tone === "gold" ? "text-gold" : "text-cloud";
  return (
    <div className="flex items-baseline justify-between border-b border-line/50 py-1.5 last:border-0">
      <span className="text-xs text-slate2">{k}{hint && <span className="ml-1 opacity-60">{hint}</span>}</span>
      <span className={`font-mono text-sm font-semibold ${c}`}>{v}</span>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-md border border-line/60 bg-panel2/50 p-2.5 text-xs leading-relaxed text-slate2">{children}</p>;
}

export const fmt = (x: number, d = 4) =>
  !Number.isFinite(x) ? "—" : x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtPct = (x: number, d = 3) => (!Number.isFinite(x) ? "—" : (x * 100).toFixed(d) + "%");
