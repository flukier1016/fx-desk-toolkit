/** L2 · 货币对约定注册表 + 计息基准
 *  方法论:所有"市场惯例"集中在这一张表,工具从这里取,不各自硬编码。
 *  加一个货币对 = 在 PAIRS 加一行,全部工具自动生效。
 */

export interface PairConvention {
  symbol: string;        // 如 "USDCNY"
  base: string;          // 外币(左)
  quote: string;         // 本币(右)
  pipFactor: number;     // 掉期点/点值放大倍数
  spotPrecision: number; // 即期报价小数位
  defaultS: number;      // 默认即期(仅作输入初值,非行情)
  deltaConvNote: string; // 该对市场常用 delta 惯例(提示用)
  premiumAdjusted: boolean; // 权利金货币=外币 → 常用 PA delta
}

export const PAIRS: PairConvention[] = [
  { symbol: "USDCNY", base: "USD", quote: "CNY", pipFactor: 10000, spotPrecision: 4, defaultS: 7.2,   deltaConvNote: "境内常用 spot delta;以台子为准", premiumAdjusted: false },
  { symbol: "USDCNH", base: "USD", quote: "CNH", pipFactor: 10000, spotPrecision: 4, defaultS: 7.21,  deltaConvNote: "离岸池;惯例随对手方", premiumAdjusted: false },
  { symbol: "EURUSD", base: "EUR", quote: "USD", pipFactor: 10000, spotPrecision: 4, defaultS: 1.08,  deltaConvNote: "spot delta(非 PA)", premiumAdjusted: false },
  { symbol: "USDJPY", base: "USD", quote: "JPY", pipFactor: 100,   spotPrecision: 2, defaultS: 155,   deltaConvNote: "权利金常为 USD → PA delta", premiumAdjusted: true },
  { symbol: "GBPUSD", base: "GBP", quote: "USD", pipFactor: 10000, spotPrecision: 4, defaultS: 1.27,  deltaConvNote: "spot delta", premiumAdjusted: false },
  { symbol: "AUDUSD", base: "AUD", quote: "USD", pipFactor: 10000, spotPrecision: 4, defaultS: 0.66,  deltaConvNote: "spot delta", premiumAdjusted: false },
  { symbol: "USDHKD", base: "USD", quote: "HKD", pipFactor: 10000, spotPrecision: 4, defaultS: 7.8,   deltaConvNote: "联系汇率区间", premiumAdjusted: false },
  { symbol: "CUSTOM", base: "FOR", quote: "DOM", pipFactor: 10000, spotPrecision: 4, defaultS: 1.0,   deltaConvNote: "自定义", premiumAdjusted: false },
];

export function pairConv(symbol: string): PairConvention {
  return PAIRS.find((p) => p.symbol === symbol) ?? PAIRS[PAIRS.length - 1];
}

/** 计息基准:天数 → 年化因子 */
export type DayBasis = "ACT/365" | "ACT/360";
export function yearFrac(days: number, basis: DayBasis = "ACT/365"): number {
  return days / (basis === "ACT/365" ? 365 : 360);
}
/** 常用期限速查(交易日/日历日近似) */
export const TENORS: { label: string; days: number }[] = [
  { label: "1W", days: 7 }, { label: "2W", days: 14 }, { label: "1M", days: 30 },
  { label: "2M", days: 61 }, { label: "3M", days: 91 }, { label: "6M", days: 182 },
  { label: "9M", days: 273 }, { label: "1Y", days: 365 },
];
