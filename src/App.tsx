import { useState, lazy, Suspense } from "react";

const tools = [
  { id: "gk", name: "GK 定价器", en: "Pricer & Greeks", C: lazy(() => import("./tools/GKPricer")) },
  { id: "delta", name: "Delta⇄行权价", en: "Delta ⇄ Strike", C: lazy(() => import("./tools/DeltaStrike")) },
  { id: "smile", name: "微笑曲线", en: "ATM·RR·BF → Smile", C: lazy(() => import("./tools/SmileBuilder")) },
  { id: "cip", name: "掉期点·CIP", en: "Swap Points", C: lazy(() => import("./tools/CipCalc")) },
  { id: "barrier", name: "障碍期权", en: "Barrier + BGK", C: lazy(() => import("./tools/BarrierPricer")) },
  { id: "pnl", name: "PnL 归因", en: "Attribution", C: lazy(() => import("./tools/PnLAttrib")) },
  { id: "clock", name: "外汇时钟", en: "FX Clock", C: lazy(() => import("./tools/FXClock")) },
  { id: "quiz", name: "考前速练", en: "Flashcards", C: lazy(() => import("./tools/Flashcards")) },
  { id: "summary", name: "当日小结", en: "EOD Summary", C: lazy(() => import("./tools/EODSummary")) },
] as const;

type ToolId = (typeof tools)[number]["id"];

export default function App() {
  const [cur, setCur] = useState<ToolId>("gk");
  const active = tools.find((t) => t.id === cur)!;
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line bg-panel px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <span className="text-base font-bold text-gold">FX 交易台工具箱</span>
            <span className="ml-2 text-xs text-slate2">FICC · 外汇 · 实习随身工具 — 纯本地计算,数据不出浏览器</span>
          </div>
          <span className="hidden font-mono text-[10px] text-slate2 sm:block">offline-first · single-file build</span>
        </div>
      </header>
      <nav className="border-b border-line bg-panel/60 px-4">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto py-2">
          {tools.map((t) => (
            <button
              key={t.id} onClick={() => setCur(t.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition ${
                cur === t.id ? "bg-gold font-semibold text-ink" : "text-slate2 hover:bg-panel2 hover:text-cloud"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </nav>
      <main className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto p-4">
        <div className="mb-3 text-xs text-slate2">
          {active.name} <span className="opacity-60">· {active.en}</span>
        </div>
        <Suspense fallback={<div className="p-8 text-center text-slate2">加载中…</div>}>
          <active.C />
        </Suspense>
      </main>
      <footer className="border-t border-line px-4 py-2 text-center text-[10px] text-slate2">
        教育与自查用途 · 公式对齐《随机分析与FX定价·完整版》 · 结果非投资建议、以台子系统为准
      </footer>
    </div>
  );
}
