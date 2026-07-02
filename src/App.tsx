import { useEffect, useState, lazy, Suspense } from "react";
import { MarketProvider } from "./state/market";
import MarketBar from "./components/MarketBar";
import SelfTestPanel from "./components/SelfTestPanel";

const tools = [
  { id: "gk", name: "GK 定价器", en: "Pricer & Greeks", grp: "定价", C: lazy(() => import("./tools/GKPricer")) },
  { id: "delta", name: "Delta⇄行权价", en: "Delta ⇄ Strike", grp: "定价", C: lazy(() => import("./tools/DeltaStrike")) },
  { id: "digital", name: "数字·触碰", en: "Digital & Touch", grp: "定价", C: lazy(() => import("./tools/DigitalTouch")) },
  { id: "barrier", name: "障碍期权", en: "Barrier + BGK", grp: "定价", C: lazy(() => import("./tools/BarrierPricer")) },
  { id: "strategy", name: "组合策略", en: "Strategy Builder", grp: "定价", C: lazy(() => import("./tools/StrategyBuilder")) },
  { id: "smile", name: "微笑曲线", en: "ATM·RR·BF → Smile", grp: "市场", C: lazy(() => import("./tools/SmileBuilder")) },
  { id: "cip", name: "掉期点·CIP", en: "Swap Points", grp: "市场", C: lazy(() => import("./tools/CipCalc")) },
  { id: "clock", name: "外汇时钟", en: "FX Clock", grp: "市场", C: lazy(() => import("./tools/FXClock")) },
  { id: "ladder", name: "情景矩阵", en: "Scenario Ladder", grp: "风险", C: lazy(() => import("./tools/ScenarioLadder")) },
  { id: "pnl", name: "PnL 归因", en: "Attribution", grp: "风险", C: lazy(() => import("./tools/PnLAttrib")) },
  { id: "book", name: "头寸簿", en: "Position Book", grp: "风险", C: lazy(() => import("./tools/PositionBook")) },
  { id: "quiz", name: "考前速练", en: "Flashcards", grp: "日常", C: lazy(() => import("./tools/Flashcards")) },
  { id: "summary", name: "当日小结", en: "EOD Summary", grp: "日常", C: lazy(() => import("./tools/EODSummary")) },
] as const;

type ToolId = (typeof tools)[number]["id"];
const groups = ["定价", "市场", "风险", "日常"] as const;

export default function App() {
  const [cur, setCur] = useState<ToolId>(() => (localStorage.getItem("fx-cur-tool") as ToolId) || "gk");
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("fx-theme") as "dark" | "light") || "dark");
  const [showTest, setShowTest] = useState(false);
  const active = tools.find((t) => t.id === cur) ?? tools[0];

  useEffect(() => { localStorage.setItem("fx-cur-tool", cur); }, [cur]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("fx-theme", theme);
  }, [theme]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const i = tools.findIndex((t) => t.id === cur);
      if (e.key === "ArrowRight") setCur(tools[(i + 1) % tools.length].id);
      if (e.key === "ArrowLeft") setCur(tools[(i - 1 + tools.length) % tools.length].id);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [cur]);

  return (
    <MarketProvider>
      <div className="flex h-full flex-col">
        <header className="border-b border-line bg-panel px-4 py-2.5">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div>
              <span className="text-base font-bold text-gold">FX 交易台工具箱</span>
              <span className="ml-2 hidden text-xs text-slate2 md:inline">FICC · 外汇 · 纯本地计算,数据不出浏览器</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowTest(true)}
                className="rounded border border-forest/50 px-2 py-1 text-[11px] text-forest hover:bg-forest/10">✓ 引擎自检</button>
              <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="rounded border border-line px-2 py-1 text-[11px] text-slate2 hover:text-cloud">{theme === "dark" ? "☀ 浅色" : "☾ 深色"}</button>
            </div>
          </div>
        </header>
        <MarketBar />
        <nav className="border-b border-line bg-panel/60 px-4">
          <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto py-2">
            {groups.map((g) => (
              <div key={g} className="flex shrink-0 items-center gap-1">
                <span className="pl-1 pr-0.5 text-[10px] text-slate2/70">{g}</span>
                {tools.filter((t) => t.grp === g).map((t) => (
                  <button key={t.id} onClick={() => setCur(t.id)}
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-[13px] transition ${
                      cur === t.id ? "bg-gold font-semibold text-ink" : "text-slate2 hover:bg-panel2 hover:text-cloud"
                    }`}>{t.name}</button>
                ))}
                <span className="mx-0.5 h-4 w-px bg-line last:hidden" />
              </div>
            ))}
          </div>
        </nav>
        <main className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex items-baseline justify-between text-xs text-slate2">
            <span>{active.name} <span className="opacity-60">· {active.en}</span></span>
            <span className="hidden opacity-50 sm:inline">Alt+←→ 切换工具</span>
          </div>
          <Suspense fallback={<div className="p-8 text-center text-slate2">加载中…</div>}>
            <active.C />
          </Suspense>
        </main>
        <footer className="border-t border-line px-4 py-2 text-center text-[10px] text-slate2">
          教育与自查用途 · 公式对齐《随机分析与FX定价·完整版》 · 结果非投资建议、以台子系统为准 · 架构与扩展方法见 ARCHITECTURE.md
        </footer>
        {showTest && <SelfTestPanel onClose={() => setShowTest(false)} />}
      </div>
    </MarketProvider>
  );
}
