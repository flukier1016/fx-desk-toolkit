/** 引擎自检面板:一键跑全部不变量,全绿=引擎可信(方法论见 ARCHITECTURE.md) */
import { useState } from "react";
import { runSelfTests, type CheckResult } from "../lib/selftest";

export default function SelfTestPanel({ onClose }: { onClose: () => void }) {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const passed = results?.filter((r) => r.pass).length ?? 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-panel p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-gold">引擎自检 · Engine Self-Test</div>
            <div className="mt-0.5 text-[11px] text-slate2">与 vitest 同源的核心不变量,在你这台浏览器上实时验证</div>
          </div>
          <button onClick={onClose} className="rounded border border-line px-2 py-1 text-xs text-slate2 hover:text-cloud">关闭</button>
        </div>
        {!results ? (
          <button onClick={() => setResults(runSelfTests())}
            className="w-full rounded-lg bg-gold py-2 text-sm font-bold text-ink hover:opacity-90">运行 12 项不变量检查</button>
        ) : (
          <>
            <div className={`mb-2 rounded-md px-3 py-2 text-sm font-bold ${passed === results.length ? "bg-forest/15 text-forest" : "bg-crimson/15 text-crimson"}`}>
              {passed === results.length ? `✓ 全部通过 ${passed}/${results.length} — 引擎可信` : `✗ ${results.length - passed} 项未过,请勿使用计算结果`}
            </div>
            <ul className="space-y-1">
              {results.map((r) => (
                <li key={r.name} className="flex items-baseline justify-between border-b border-line/40 py-1 text-xs">
                  <span className={r.pass ? "text-cloud" : "text-crimson"}>{r.pass ? "✓" : "✗"} {r.name}</span>
                  <span className="font-mono text-[10px] text-slate2">{r.detail}</span>
                </li>
              ))}
            </ul>
            <button onClick={() => setResults(runSelfTests())}
              className="mt-3 w-full rounded-lg border border-line py-1.5 text-xs text-slate2 hover:border-gold hover:text-gold">再跑一次</button>
          </>
        )}
      </div>
    </div>
  );
}
