/** L3 · 全局市场状态:一处改参数,所有工具联动;localStorage 持久化;支持导出/导入 JSON */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { pairConv } from "../lib/conventions";

export interface MarketState {
  pair: string;   // 货币对(取约定注册表)
  S: number;      // 即期
  rd: number;     // 本币利率(小数)
  rf: number;     // 外币利率(小数)
  sigma: number;  // ATM 波动率(小数)
  T: number;      // 期限(年)
  notional: number; // 默认名义(外币)
}

export const DEFAULT_MARKET: MarketState = {
  pair: "USDCNY", S: 7.2, rd: 0.019, rf: 0.043, sigma: 0.055, T: 0.25, notional: 1_000_000,
};

const KEY = "fx-market-v1";

interface Ctx {
  mkt: MarketState;
  setMkt: (patch: Partial<MarketState>) => void;
  reset: () => void;
  exportJson: () => string;
  importJson: (s: string) => boolean;
}

const MarketCtx = createContext<Ctx | null>(null);

export function MarketProvider({ children }: { children: ReactNode }) {
  const [mkt, set] = useState<MarketState>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...DEFAULT_MARKET, ...JSON.parse(raw) };
    } catch { /* 忽略坏数据 */ }
    return DEFAULT_MARKET;
  });
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(mkt)); } catch { /* 满/禁用 */ } }, [mkt]);

  const setMkt = (patch: Partial<MarketState>) => set((m) => {
    const next = { ...m, ...patch };
    // 切换货币对 → 带出该对默认即期(仅当用户没先改 S)
    if (patch.pair && patch.S === undefined) next.S = pairConv(patch.pair).defaultS;
    return next;
  });
  const reset = () => set(DEFAULT_MARKET);
  const exportJson = () => JSON.stringify(mkt, null, 2);
  const importJson = (s: string) => {
    try {
      const d = JSON.parse(s);
      if (typeof d.S !== "number") return false;
      set({ ...DEFAULT_MARKET, ...d });
      return true;
    } catch { return false; }
  };
  return <MarketCtx.Provider value={{ mkt, setMkt, reset, exportJson, importJson }}>{children}</MarketCtx.Provider>;
}

export function useMarket(): Ctx {
  const c = useContext(MarketCtx);
  if (!c) throw new Error("useMarket 必须在 <MarketProvider> 内使用");
  return c;
}
