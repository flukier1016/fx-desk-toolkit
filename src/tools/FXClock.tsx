/** 24 小时外汇时钟 —— 纯本地时间,无网络。北京时间大钟 + 全球 session 时间带 + 关键时点倒计时 */
import { useEffect, useState } from "react";
import { Card, Note, Row } from "../components/ui";
import { useMarket } from "../state/market";

/* ── 数据定义(北京时间,夏令时口径) ── */
type Seg = { a: number; b: number };
type Session = {
  name: string; en: string; hours: string; color: string;
  segs: Seg[]; open: number; close: number;
};

const SESSIONS: Session[] = [
  { name: "悉尼", en: "SYD", hours: "5-14", color: "var(--color-plum)", segs: [{ a: 5, b: 14 }], open: 5, close: 14 },
  { name: "东京", en: "TYO", hours: "8-15", color: "var(--color-forest)", segs: [{ a: 8, b: 15 }], open: 8, close: 15 },
  { name: "伦敦", en: "LDN", hours: "15-24", color: "var(--color-steel)", segs: [{ a: 15, b: 24 }], open: 15, close: 24 },
  // 纽约跨午夜:分两段画
  { name: "纽约", en: "NYC", hours: "21-次日5", color: "var(--color-gold)", segs: [{ a: 21, b: 24 }, { a: 0, b: 5 }], open: 21, close: 5 },
];

const inSession = (s: Session, h: number) => s.segs.some((g) => h >= g.a && h < g.b);
const countAt = (h: number) => SESSIONS.reduce((n, s) => n + (inSession(s, h) ? 1 : 0), 0);

/** 所有 session 边界点,用于切分重叠区 */
const BP = Array.from(new Set(SESSIONS.flatMap((s) => s.segs.flatMap((g) => [g.a, g.b])))).sort((x, y) => x - y);

/** 某 session 内、有 ≥2 个 session 同时活跃的子区间(重叠区,画更亮) */
function overlapSegs(s: Session): Seg[] {
  const out: Seg[] = [];
  for (const g of s.segs) {
    const pts = [g.a, ...BP.filter((p) => p > g.a && p < g.b), g.b];
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1];
      if (countAt((a + b) / 2) >= 2) {
        const last = out[out.length - 1];
        if (last && last.b === a) last.b = b;
        else out.push({ a, b });
      }
    }
  }
  return out;
}
const OVERLAYS = SESSIONS.map(overlapSegs);

/* ── 关键时点(北京时间) ── */
const MARKERS: { h: number; label: string; gold?: boolean; row: 0 | 1 }[] = [
  { h: 9.25, label: "9:15 中间价", gold: true, row: 0 },
  { h: 9.5, label: "9:30 在岸开盘", row: 1 },
  { h: 16.5, label: "16:30 日盘收", row: 0 },
  { h: 20.5, label: "20:30 美国数据", row: 1 },
  { h: 23.5, label: "23:30 夜盘收", row: 0 },
];
const EVENTS = [
  { min: 9 * 60 + 15, time: "09:15", label: "中间价公布" },
  { min: 9 * 60 + 30, time: "09:30", label: "在岸日盘开盘" },
  { min: 16 * 60 + 30, time: "16:30", label: "在岸日盘收盘" },
  { min: 20 * 60 + 30, time: "20:30", label: "美国数据常见时点(夏令时)" },
  { min: 23 * 60 + 30, time: "23:30", label: "在岸夜盘收盘" },
];

const CITIES = [
  { name: "悉尼", tz: "Australia/Sydney" },
  { name: "东京", tz: "Asia/Tokyo" },
  { name: "伦敦", tz: "Europe/London" },
  { name: "纽约", tz: "America/New_York" },
];
const TZ_FMT = new Map(CITIES.map((c) => [
  c.tz,
  new Intl.DateTimeFormat("en-GB", { timeZone: c.tz, hour: "2-digit", minute: "2-digit", hour12: false }),
]));

const p2 = (n: number) => String(n).padStart(2, "0");
const fmtDur = (sec: number) =>
  `${p2(Math.floor(sec / 3600))}:${p2(Math.floor((sec % 3600) / 60))}:${p2(Math.floor(sec % 60))}`;
const fmtHM = (hFloat: number) => {
  const t = Math.round(hFloat * 60);
  return `${Math.floor(t / 60)}h${p2(t % 60)}m`;
};

/* ── SVG 几何 ── */
const PL = 70, PW = 870; // 左留白 / 绘图宽
const X = (h: number) => PL + (h / 24) * PW;

export default function FXClock() {
  const { mkt } = useMarket();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id); // 卸载时清理
  }, []);

  // 北京时间 = UTC+8(中国无夏令时,直接位移后取 UTC 分量)
  const bj = new Date(now.getTime() + 8 * 3600_000);
  const H = bj.getUTCHours(), M = bj.getUTCMinutes(), S = bj.getUTCSeconds();
  const hFrac = H + M / 60 + S / 3600;
  const secOfDay = H * 3600 + M * 60 + S;
  const dateStr = `${bj.getUTCFullYear()}-${p2(bj.getUTCMonth() + 1)}-${p2(bj.getUTCDate())} 星期${"日一二三四五六"[bj.getUTCDay()]}`;

  // 下一个关键时点倒计时
  const withRemain = EVENTS.map((e) => ({
    ...e,
    remain: ((e.min * 60 - secOfDay) % 86400 + 86400) % 86400 || 86400,
  })).sort((a, b) => a.remain - b.remain);
  const next = withRemain[0];

  const activeCount = countAt(hFrac);
  const nowX = X(hFrac);

  return (
    <div className="grid gap-4">
      {/* ── 大数字时钟 ── */}
      <Card>
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-gold">
              {mkt.pair}
            </span>
            <span className="text-xs tracking-widest text-slate2">北京时间 BEIJING · UTC+8</span>
          </div>
          <div className="mt-1 font-mono text-5xl font-bold tabular-nums tracking-wider text-gold md:text-6xl">
            {p2(H)}:{p2(M)}:{p2(S)}
          </div>
          <div className="mt-1 text-sm text-slate2">{dateStr}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {CITIES.map((c) => (
            <div key={c.tz} className="rounded-md border border-line/60 bg-panel2/50 px-2 py-1.5 text-center">
              <div className="text-[10px] text-slate2">{c.name}当地</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-cloud">{TZ_FMT.get(c.tz)!.format(now)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 24h 时间带 ── */}
      <Card title="24 小时 Session 时间带(横轴=北京时间 · 夏令时口径)">
        <svg viewBox="0 0 960 248" className="w-full" role="img" aria-label="24小时外汇session时间带">
          {/* 3h 网格 + 底轴刻度 */}
          {Array.from({ length: 9 }, (_, i) => i * 3).map((hh) => (
            <g key={hh}>
              <line x1={X(hh)} y1={32} x2={X(hh)} y2={208} stroke="var(--color-line)" strokeWidth={1} opacity={0.35} />
              <line x1={X(hh)} y1={208} x2={X(hh)} y2={213} stroke="var(--color-slate2)" strokeWidth={1} />
              <text x={X(hh)} y={225} textAnchor="middle" fontSize={9} fill="var(--color-slate2)">{hh}</text>
            </g>
          ))}
          <line x1={PL} y1={208} x2={PL + PW} y2={208} stroke="var(--color-line)" strokeWidth={1} />

          {/* 四个 session 条(重叠区叠加更亮一层) */}
          {SESSIONS.map((s, i) => {
            const y = 40 + i * 40;
            return (
              <g key={s.en}>
                <text x={62} y={y + 11} textAnchor="end" fontSize={11} fill="var(--color-cloud)">{s.name}</text>
                <text x={62} y={y + 22} textAnchor="end" fontSize={9} fill="var(--color-slate2)">{s.hours}</text>
                {s.segs.map((g, j) => (
                  <rect key={j} x={X(g.a)} y={y} width={X(g.b) - X(g.a)} height={24} rx={4} fill={s.color} opacity={0.38} />
                ))}
                {OVERLAYS[i].map((g, j) => (
                  <rect key={`o${j}`} x={X(g.a)} y={y} width={X(g.b) - X(g.a)} height={24} rx={4} fill={s.color} opacity={0.5} />
                ))}
              </g>
            );
          })}

          {/* 关键时点竖线 + 标签(双行错开) */}
          {MARKERS.map((m) => (
            <g key={m.label}>
              <line
                x1={X(m.h)} y1={32} x2={X(m.h)} y2={208}
                stroke={m.gold ? "var(--color-gold)" : "var(--color-slate2)"}
                strokeWidth={m.gold ? 1.5 : 1} strokeDasharray={m.gold ? undefined : "3 3"}
              />
              <text
                x={Math.min(X(m.h), 898)} y={m.row === 0 ? 12 : 26} textAnchor="middle"
                fontSize={10} fill={m.gold ? "var(--color-gold)" : "var(--color-cloud)"}
                fontWeight={m.gold ? 700 : 400}
              >{m.label}</text>
            </g>
          ))}

          {/* 红色"现在"竖线,随时间移动 */}
          <polygon points={`${nowX - 5},24 ${nowX + 5},24 ${nowX},32`} fill="var(--color-crimson)" />
          <line x1={nowX} y1={32} x2={nowX} y2={213} stroke="var(--color-crimson)" strokeWidth={2} />
          <text
            x={Math.max(PL + 32, Math.min(nowX, 900))} y={241} textAnchor="middle"
            fontSize={11} fontWeight={700} fill="var(--color-crimson)"
          >现在 {p2(H)}:{p2(M)}</text>
        </svg>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* ── 下一个关键时点 ── */}
        <Card title="下一个关键时点 · 倒计时">
          <div className="py-2 text-center">
            <div className="text-xs text-slate2">{next.time} · {next.label}</div>
            <div className="mt-1 font-mono text-4xl font-bold tabular-nums text-gold">{fmtDur(next.remain)}</div>
          </div>
          <div className="mt-2">
            {withRemain.map((e, i) => (
              <Row
                key={e.time} k={`${e.time} ${e.label}`}
                v={fmtDur(e.remain)} tone={i === 0 ? "gold" : undefined}
              />
            ))}
          </div>
        </Card>

        {/* ── 当前活跃 session ── */}
        <Card title="当前活跃 Session">
          <Row
            k="同时活跃数" v={`${activeCount} 个`}
            tone={activeCount >= 2 ? "gold" : undefined}
            hint={activeCount >= 2 ? "(重叠时段,流动性更好)" : undefined}
          />
          {SESSIONS.map((s) => {
            const on = inSession(s, hFrac);
            const until = on ? (s.close - hFrac + 24) % 24 : (s.open - hFrac + 24) % 24;
            return (
              <Row
                key={s.en}
                k={
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color, opacity: on ? 1 : 0.3 }} />
                    {s.name} {s.en} <span className="opacity-60">{s.hours}</span>
                  </span>
                }
                v={on ? `进行中 · ${fmtHM(until)}后收` : `${fmtHM(until)}后开`}
                tone={on ? "pos" : undefined}
              />
            );
          })}
        </Card>
      </div>

      <Note>
        时段为<b>夏令时口径</b>(3月中旬–11月初):伦敦≈北京 15-24、纽约≈21-次日 5。11 月切换回冬令时后,伦敦/纽约时段按北京时间各<b>推后 1 小时</b>(伦敦 16-次日 1、纽约 22-次日 6),次年 3 月再切回;悉尼为南半球,方向相反。9:15 中间价、9:30/16:30/23:30 在岸盘口为固定北京时间,不受影响。以交易台实际日历为准。
      </Note>
    </div>
  );
}
