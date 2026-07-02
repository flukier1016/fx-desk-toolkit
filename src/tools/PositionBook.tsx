/** 头寸簿 Position Book —— 本地记账 + 全局市场参数实时重估(GK),localStorage 持久化 */
import { useEffect, useMemo, useState } from "react";
import { useMarket } from "../state/market";
import { pairConv } from "../lib/conventions";
import { gk, vanna, type CP } from "../lib/gk";
import { Card, Field, Row, Note, fmt } from "../components/ui";

type Side = "buy" | "sell";

interface Position {
  id: string;
  ts: number;        // 录入时间戳
  side: Side;        // 买(long) / 卖(short)
  cp: CP;
  K: number;
  sigma: number;     // 小数
  notional: number;  // 外币名义
  note: string;
}

const LS_KEY = "fx-book-v1";
const LOT = 1_000_000; // 1 手 = 100 万外币(银行间惯例近似)

function loadBook(): Position[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (p): p is Position =>
        p && typeof p === "object" &&
        typeof p.id === "string" &&
        (p.side === "buy" || p.side === "sell") &&
        (p.cp === "call" || p.cp === "put") &&
        typeof p.K === "number" && typeof p.sigma === "number" && typeof p.notional === "number",
    ).map((p) => ({ ...p, ts: typeof p.ts === "number" ? p.ts : Date.now(), note: typeof p.note === "string" ? p.note : "" }));
  } catch {
    return [];
  }
}

export default function PositionBook() {
  const { mkt } = useMarket();
  const conv = pairConv(mkt.pair);

  const [book, setBook] = useState<Position[]>(loadBook);
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(book)); } catch { /* 满/禁用 */ }
  }, [book]);

  // ---- 表单(工具特有参数留本地;σ/名义默认取全局市场) ----
  const [side, setSide] = useState<Side>("buy");
  const [cp, setCp] = useState<CP>("call");
  const [K, setK] = useState<number>(mkt.S);
  const [sigmaPct, setSigmaPct] = useState<number>(mkt.sigma * 100);
  const [notional, setNotional] = useState<number>(mkt.notional);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedTsv, setCopiedTsv] = useState(false);

  const formOk = Number.isFinite(K) && K > 0 && Number.isFinite(sigmaPct) && sigmaPct > 0 && Number.isFinite(notional) && notional > 0;

  const add = () => {
    if (!formOk) return;
    const p: Position = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      side, cp, K,
      sigma: sigmaPct / 100,
      notional,
      note: note.trim(),
    };
    setBook((b) => [...b, p]);
    setNote("");
  };

  const remove = (id: string) => setBook((b) => b.filter((p) => p.id !== id));

  const clearAll = () => {
    if (book.length === 0) return;
    if (window.confirm(`确认清空全部 ${book.length} 笔头寸?此操作不可撤销。`)) setBook([]);
  };

  const exportJson = () => {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), market: mkt, positions: book }, null, 2);
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); };
    try {
      navigator.clipboard.writeText(payload).then(done).catch(() => {
        window.prompt("剪贴板不可用,手动复制:", payload);
      });
    } catch {
      window.prompt("剪贴板不可用,手动复制:", payload);
    }
  };

  // ---- 实时重估:每行用当前 mkt(S/rd/rf/T)+ 该头寸自己的 σ/K ----
  const mktOk = [mkt.S, mkt.rd, mkt.rf, mkt.T].every(Number.isFinite) && mkt.S > 0 && mkt.T > 0;
  const rows = useMemo(() => {
    return book.map((p) => {
      const ok = mktOk && p.sigma > 0 && p.K > 0;
      const g = ok ? gk(p.cp, { S: mkt.S, K: p.K, rd: mkt.rd, rf: mkt.rf, sigma: p.sigma, T: mkt.T }) : null;
      const sgn = p.side === "buy" ? 1 : -1;
      return {
        p,
        pv: g ? sgn * g.price * p.notional : NaN,           // 现值(本币)
        deltaN: g ? sgn * g.deltaSpot * p.notional : NaN,   // delta×名义(外币)
        vegaN: g ? sgn * g.vegaPct * p.notional : NaN,      // 每 1% vol(本币)
        thetaN: g ? sgn * g.thetaDay * p.notional : NaN,    // 每日历日(本币)
        gammaN: g ? sgn * g.gamma * p.notional : NaN,       // ∂²V/∂S²×名义
        vannaN: ok ? sgn * vanna({ S: mkt.S, K: p.K, rd: mkt.rd, rf: mkt.rf, sigma: p.sigma, T: mkt.T }) * p.notional : NaN, // ∂²V/∂S∂σ×名义
      };
    });
  }, [book, mkt.S, mkt.rd, mkt.rf, mkt.T, mktOk]);

  const sum = useMemo(() => {
    const acc = { pv: 0, delta: 0, vega: 0, theta: 0, gamma: 0, vanna: 0, bad: false };
    for (const r of rows) {
      if (![r.pv, r.deltaN, r.vegaN, r.thetaN, r.gammaN, r.vannaN].every(Number.isFinite)) { acc.bad = true; continue; }
      acc.pv += r.pv; acc.delta += r.deltaN; acc.vega += r.vegaN; acc.theta += r.thetaN;
      acc.gamma += r.gammaN; acc.vanna += r.vannaN;
    }
    return acc;
  }, [rows]);

  // ---- 复制 TSV(表头+每行+汇总行,直接可贴 Excel) ----
  const copyTsv = () => {
    const num = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "NaN");
    const header = ["方向", "CP", "K", "σ%", `名义(${conv.base})`, `现值(${conv.quote})`, `Δ×名义(${conv.base})`, `Vega/1%(${conv.quote})`, `θ/日(${conv.quote})`].join("\t");
    const lines = rows.map(({ p, pv, deltaN, vegaN, thetaN }) =>
      [
        p.side === "buy" ? "买" : "卖",
        p.cp === "call" ? "Call" : "Put",
        num(p.K, conv.spotPrecision),
        num(p.sigma * 100, 2),
        String(p.notional),
        num(pv), num(deltaN), num(vegaN), num(thetaN),
      ].join("\t"),
    );
    const total = ["汇总", "", "", "", "", num(sum.pv), num(sum.delta), num(sum.vega), num(sum.theta)].join("\t");
    const tsv = [header, ...lines, total].join("\n");
    const done = () => { setCopiedTsv(true); window.setTimeout(() => setCopiedTsv(false), 2000); };
    try {
      navigator.clipboard.writeText(tsv).then(done).catch(() => {
        window.prompt("剪贴板不可用,手动复制:", tsv);
      });
    } catch {
      window.prompt("剪贴板不可用,手动复制:", tsv);
    }
  };

  const hedgeLots = Math.abs(sum.delta) / LOT;
  const hedgeDir = sum.delta > 0 ? `卖出 Sell ${conv.base}` : `买入 Buy ${conv.base}`;

  const toggleBtn = <T extends string>(cur: T, set: (v: T) => void, v: T, label: string, activeCls: string) => (
    <button
      key={v} type="button" onClick={() => set(v)}
      className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors ${
        cur === v ? activeCls : "border-line bg-panel2 text-slate2 hover:text-cloud"
      }`}
    >
      {label}
    </button>
  );

  const bigTone = (x: number) => (x > 0 ? "text-forest" : x < 0 ? "text-crimson" : "text-cloud");
  const bigCell = (label: string, unit: string, x: number, d = 0) => (
    <div className="rounded-lg border border-line bg-panel2/60 p-3">
      <div className="text-[11px] text-slate2">{label} <span className="opacity-60">{unit}</span></div>
      <div className={`mt-1 font-mono text-xl font-bold ${bigTone(x)}`}>{fmt(x, d)}</div>
    </div>
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-[minmax(280px,340px)_1fr]">
        {/* ---- 添加头寸 ---- */}
        <Card title="添加头寸 New Position">
          <div className="mb-3 flex gap-2">
            {toggleBtn(side, setSide, "buy" as Side, "买 Long", "border-forest bg-forest/15 text-forest")}
            {toggleBtn(side, setSide, "sell" as Side, "卖 Short", "border-crimson bg-crimson/15 text-crimson")}
          </div>
          <div className="mb-3 flex gap-2">
            {toggleBtn(cp, setCp, "call" as CP, "Call 看涨", "border-gold bg-gold/15 text-gold")}
            {toggleBtn(cp, setCp, "put" as CP, "Put 看跌", "border-gold bg-gold/15 text-gold")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="行权价 K (Strike)" value={K} onChange={setK} step="0.01" min={0} />
            <Field label="成交波动率 σ" value={sigmaPct} onChange={setSigmaPct} step="0.1" suffix="%" min={0} />
            <div className="col-span-2">
              <Field label={`名义本金 Notional (${conv.base})`} value={notional} onChange={setNotional} step="100000" min={0} />
            </div>
            <label className="col-span-2 block">
              <span className="mb-1 block text-xs text-slate2">备注 Note(可选)</span>
              <input
                type="text" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="如:客户 A 询价成交 / 教学示例"
                className="w-full rounded-md border border-line bg-panel2 px-2 py-1.5 text-sm text-cloud outline-none placeholder:text-slate2/50 focus:border-gold"
              />
            </label>
          </div>
          <button
            type="button" onClick={add} disabled={!formOk}
            className="mt-3 w-full rounded-md border border-gold bg-gold/15 px-3 py-2 text-sm font-bold text-gold transition-colors hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + 记入头寸簿 Book it
          </button>
          <Note>
            S / rd / rf / T 一律取顶部 MarketBar 的全局市场参数(当前 {mkt.pair}:S={fmt(mkt.S, conv.spotPrecision)}, T={fmt(mkt.T, 2)}年);
            每笔头寸只锁定自己的 K、成交 σ 与名义。σ 按百分数输入,内部换算小数。
          </Note>
        </Card>

        {/* ---- 组合汇总 ---- */}
        <Card title={`组合汇总 Portfolio (${mkt.pair} · ${book.length} 笔)`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {bigCell("净现值 Net PV", `(${conv.quote})`, sum.pv)}
            {bigCell("净 Delta×名义", `(${conv.base})`, sum.delta)}
            {bigCell("净 Vega / 1% vol", `(${conv.quote})`, sum.vega)}
            {bigCell("净 Theta / 日", `(${conv.quote})`, sum.theta)}
          </div>
          <div className="mt-3">
            <Row
              k="需对冲即期 Hedge"
              hint="使组合 delta 中性"
              v={
                book.length === 0 || !Number.isFinite(sum.delta)
                  ? "—"
                  : Math.abs(sum.delta) < 1
                    ? "已近似 delta 中性"
                    : `${hedgeDir} ${fmt(Math.abs(sum.delta), 0)} ≈ ${fmt(hedgeLots, 2)} 手`
              }
              tone="gold"
            />
            <Row k="即期手数换算" hint={`1 手 = ${LOT.toLocaleString("en-US")} ${conv.base}`} v={Number.isFinite(hedgeLots) && book.length > 0 ? fmt(hedgeLots, 2) : "—"} />
            <Row
              k="净 Gamma×名义"
              hint="∂²V/∂S²×名义:S 每变 1 单位,Δ×名义的变化量"
              v={book.length > 0 && Number.isFinite(sum.gamma) ? fmt(sum.gamma, 0) : "—"}
            />
            <Row
              k="净 Vanna×名义"
              hint="∂²V/∂S∂σ×名义:S 动则 vega 漂移,σ 动则 delta 漂移"
              v={book.length > 0 && Number.isFinite(sum.vanna) ? fmt(sum.vanna, 0) : "—"}
            />
          </div>
          {sum.bad && (
            <p className="mt-2 text-xs text-crimson">部分头寸重估失败(市场参数或头寸参数非法),汇总只含有效行。</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button" onClick={exportJson} disabled={book.length === 0}
              className="rounded-md border border-steel bg-panel2 px-3 py-1.5 text-xs font-semibold text-cloud transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copied ? "已复制 ✓" : "导出 JSON(剪贴板)"}
            </button>
            <button
              type="button" onClick={clearAll} disabled={book.length === 0}
              className="rounded-md border border-crimson/60 bg-panel2 px-3 py-1.5 text-xs font-semibold text-crimson transition-colors hover:bg-crimson/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              全部清空 Clear all
            </button>
          </div>
        </Card>
      </div>

      {/* ---- 头寸表 ---- */}
      <Card title="头寸明细 Positions(按当前市场实时重估)">
        {book.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-slate2">头寸簿是空的。</p>
            <p className="mt-2 text-xs leading-relaxed text-slate2 opacity-80">
              在左上角表单选好 <span className="text-cloud">买/卖 + Call/Put</span>,填 K、成交 σ、名义,点「记入头寸簿」;
              <br />
              记入后每行会随顶部 MarketBar 的 S / rd / rf / T 实时重估 —— 试着改一下即期 S,看全簿 PV 与 delta 联动。
            </p>
          </div>
        ) : (
          <>
          <div className="mb-2 flex justify-end">
            <button
              type="button" onClick={copyTsv}
              className="rounded-md border border-steel bg-panel2 px-3 py-1.5 text-xs font-semibold text-cloud transition-colors hover:border-gold hover:text-gold"
            >
              {copiedTsv ? "✓已复制" : "复制 TSV(可贴 Excel)"}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] text-slate2">
                  <th className="py-2 pr-2 font-normal">方向</th>
                  <th className="py-2 pr-2 font-normal">类型</th>
                  <th className="py-2 pr-2 font-normal">K</th>
                  <th className="py-2 pr-2 font-normal">σ</th>
                  <th className="py-2 pr-2 text-right font-normal">名义 ({conv.base})</th>
                  <th className="py-2 pr-2 text-right font-normal">现值 ({conv.quote})</th>
                  <th className="py-2 pr-2 text-right font-normal">Δ×名义 ({conv.base})</th>
                  <th className="py-2 pr-2 text-right font-normal">Vega/1% ({conv.quote})</th>
                  <th className="py-2 pr-2 text-right font-normal">θ/日 ({conv.quote})</th>
                  <th className="py-2 pr-2 font-normal">备注</th>
                  <th className="py-2 font-normal" />
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map(({ p, pv, deltaN, vegaN, thetaN }) => (
                  <tr key={p.id} className="border-b border-line/50 last:border-0" title={`录入于 ${new Date(p.ts).toLocaleString()}`}>
                    <td className={`py-1.5 pr-2 font-semibold ${p.side === "buy" ? "text-forest" : "text-crimson"}`}>
                      {p.side === "buy" ? "买" : "卖"}
                    </td>
                    <td className="py-1.5 pr-2 text-cloud">{p.cp === "call" ? "Call" : "Put"}</td>
                    <td className="py-1.5 pr-2 text-cloud">{fmt(p.K, conv.spotPrecision)}</td>
                    <td className="py-1.5 pr-2 text-cloud">{fmt(p.sigma * 100, 2)}%</td>
                    <td className="py-1.5 pr-2 text-right text-cloud">{p.notional.toLocaleString("en-US")}</td>
                    <td className={`py-1.5 pr-2 text-right font-semibold ${bigTone(pv)}`}>{fmt(pv, 0)}</td>
                    <td className={`py-1.5 pr-2 text-right ${bigTone(deltaN)}`}>{fmt(deltaN, 0)}</td>
                    <td className={`py-1.5 pr-2 text-right ${bigTone(vegaN)}`}>{fmt(vegaN, 0)}</td>
                    <td className={`py-1.5 pr-2 text-right ${bigTone(thetaN)}`}>{fmt(thetaN, 0)}</td>
                    <td className="max-w-[160px] truncate py-1.5 pr-2 font-sans text-xs text-slate2" title={p.note}>{p.note || "—"}</td>
                    <td className="py-1.5 text-right">
                      <button
                        type="button" onClick={() => remove(p.id)}
                        className="rounded border border-line px-2 py-0.5 font-sans text-[11px] text-slate2 transition-colors hover:border-crimson hover:text-crimson"
                        aria-label="删除该头寸"
                      >
                        删
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        <Note>
          纯本地教学记账(localStorage,key=fx-book-v1),非真实持仓系统。重估口径:现值与各希腊字母均用当前全局市场参数
          (S/rd/rf/T)+ 各头寸成交 σ 计算,卖出(short)取负号;改动顶部 MarketBar 即全簿联动。
          净 Delta×名义为等价即期敞口({conv.base}),对冲即做反向即期;Vega 为 σ 每 ±1% 的本币盈亏,θ 为每日历日时间衰减。
        </Note>
      </Card>
    </div>
  );
}
