/** 当日小结生成器 —— 发给带教的每日小结(《作战指南》模板),草稿自动存 localStorage */
import { useEffect, useRef, useState } from "react";
import { Card, Note } from "../components/ui";

type Draft = {
  date: string; // YYYY-MM-DD
  done: string;
  observe: string;
  output: string;
  plan: string;
  ask: string;
};

const LS_KEY = "eod-draft";

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function emptyDraft(): Draft {
  return { date: todayStr(), done: "", observe: "", output: "", plan: "", ask: "" };
}

function loadDraft(): Draft {
  const base = emptyDraft();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<Draft>;
    const s = (v: unknown): string => (typeof v === "string" ? v : "");
    return {
      date: s(p.date) || base.date,
      done: s(p.done),
      observe: s(p.observe),
      output: s(p.output),
      plan: s(p.plan),
      ask: s(p.ask),
    };
  } catch {
    return base;
  }
}

function buildText(d: Draft): string {
  const parts = d.date.split("-");
  const md = parts.length === 3 ? `${parts[1]}/${parts[2]}` : d.date;
  const lines: string[] = [`【当日小结·${md}】`];
  const sec = (tag: string, body: string) => {
    const t = body.trim();
    if (t) lines.push(`■ ${tag}:${t}`);
  };
  sec("今日完成", d.done);
  sec("盘面观察", d.observe);
  sec("产出", d.output);
  sec("明日计划", d.plan);
  sec("请教", d.ask);
  return lines.join("\n");
}

function TArea({
  label, value, onChange, rows = 3, placeholder, optional,
}: {
  label: string; value: string; onChange: (v: string) => void;
  rows?: number; placeholder?: string; optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate2">
        {label}
        {optional && <span className="ml-1 opacity-60">(可空)</span>}
      </span>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-md border border-line bg-panel2 px-2 py-1.5 text-sm leading-relaxed text-cloud outline-none placeholder:text-slate2/40 focus:border-gold"
      />
    </label>
  );
}

export default function EODSummary() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    const next = { ...draft, [k]: v };
    setDraft(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* localStorage 不可用时静默降级 */
    }
  };

  const clearAll = () => {
    setDraft(emptyDraft());
    setCopied(false);
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* 同上 */
    }
  };

  const text = buildText(draft);
  const hasBody = text.includes("\n"); // 除标题外至少有一段

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 剪贴板权限被拒时不打断用户,可手动全选预览复制 */
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="填写 · 当日小结">
        <div className="grid gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-slate2">日期(默认今天)</span>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => set("date", e.target.value)}
              className="w-full rounded-md border border-line bg-panel2 px-2 py-1.5 font-mono text-sm text-cloud outline-none focus:border-gold"
            />
          </label>
          <TArea
            label="今日完成"
            value={draft.done}
            onChange={(v) => set("done", v)}
            placeholder="例:跟完早盘 USDCNY 中间价点评;整理掉期点数据表…"
          />
          <TArea
            label="盘面观察 / 学到"
            value={draft.observe}
            onChange={(v) => set("observe", v)}
            placeholder="例:今日中间价偏强 vs 模型 xx pips,午后掉期点走阔,带教解释为…"
          />
          <TArea
            label="数据 / 工具产出"
            value={draft.output}
            onChange={(v) => set("output", v)}
            placeholder="例:更新了远期点监控表;写了 vol 曲面快照脚本 v0.2…"
          />
          <TArea
            label="明日计划"
            value={draft.plan}
            onChange={(v) => set("plan", v)}
            placeholder="例:盯明早中间价定价;继续补 CNH 掉期曲线历史数据…"
          />
          <TArea
            label="待请教问题"
            value={draft.ask}
            onChange={(v) => set("ask", v)}
            optional
            placeholder="例:境内外掉期点倒挂时 desk 的平价套利上限怎么估?"
          />
        </div>
        <Note>
          草稿自动保存在本机(localStorage),关页不丢;"清空"会同时删除草稿。
        </Note>
      </Card>

      <Card title="实时预览 · 发送文本">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={copy}
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors ${
              copied
                ? "border-forest bg-forest/10 text-forest"
                : "border-gold text-gold hover:bg-gold/10"
            }`}
          >
            {copied ? "√ 已复制" : "复制到剪贴板"}
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-md border border-line px-3 py-1.5 text-sm text-slate2 transition-colors hover:border-crimson hover:text-crimson"
          >
            清空
          </button>
          <span className="ml-auto font-mono text-xs text-slate2">{text.length} 字符</span>
        </div>
        <pre className="min-h-[16rem] whitespace-pre-wrap break-words rounded-md border border-line bg-panel2 p-3 font-mono text-sm leading-relaxed text-cloud">
          {text}
        </pre>
        {!hasBody && (
          <p className="mt-2 text-xs text-slate2/70">各栏均为空——空段会自动省略,填写左侧表单后此处实时生成。</p>
        )}
        <Note>
          节奏呼应《作战指南》:小结建议<span className="text-gold">下班前</span>发给带教;
          若当天来不及,最晚<span className="text-gold">次日 8:45 前</span>补发,并顺带附上当日晨会要点,
          让带教看到你已进入盘前状态。
        </Note>
      </Card>
    </div>
  );
}
