/** 考前速练卡 —— 点击翻面 / ←→ 切换 / 空格翻面 / 打乱 */
import { useCallback, useEffect, useState } from "react";
import { Card, Note } from "../components/ui";

type FlashCard = { tag: string; q: string; a: string };

const DECK: FlashCard[] = [
  // ── 五条肌肉记忆 ──
  {
    tag: "肌肉记忆",
    q: "∫₀ᵀ W dW = ?",
    a: "½W_T² − ½T\nItô: d(W²) = 2W dW + dt —— 永远多半个二阶项",
  },
  {
    tag: "肌肉记忆",
    q: "风险中性测度下漂移怎么搬?",
    a: "Girsanov: dW̃ = dW + θ dt\nFX (Q^d 测度): dS/S = (rd − rf) dt + σ dW̃",
  },
  {
    tag: "肌肉记忆",
    q: "FX 期权定价第一步写什么?",
    a: "GK 公式:\nC = S·e^(−rf·T)·Φ(d1) − K·e^(−rd·T)·Φ(d2)",
  },
  {
    tag: "肌肉记忆",
    q: "Smile 报价怎么拆三件套?",
    a: "ATM = 水平 (level)\nRR = 偏斜 (skew)\nBF = 曲率 (convexity)\n任何 smile 题先拆这三块",
  },
  {
    tag: "肌肉记忆",
    q: "障碍期权第一反应?",
    a: "反射原理:\n障碍价 = 香草 − (B/S)^(2λ)·镜像香草\nknock-in + knock-out = 香草",
  },
  // ── GK / Greeks ──
  {
    tag: "GK",
    q: "d1、d2 的定义?",
    a: "d1 = [ln(S/K) + (rd − rf + σ²/2)·T] / (σ√T)\nd2 = d1 − σ√T",
  },
  {
    tag: "GK",
    q: "FX put-call parity?",
    a: "C − P = S·e^(−rf·T) − K·e^(−rd·T)\n    = e^(−rd·T)·(F − K)",
  },
  {
    tag: "GK",
    q: "Δ_spot (call) = ?",
    a: "Δ_spot = e^(−rf·T)·Φ(d1)\nput: −e^(−rf·T)·Φ(−d1)\n对冲持有的是外币存款(生息), 故打折 e^(−rf·T)",
  },
  {
    tag: "GK",
    q: "PA delta (premium-adjusted) 公式?",
    a: "Δ_PA = Δ_spot − V/S\n     = e^(−rf·T)·(K/F)·Φ(d2)  (call)\n权利金以外币支付时使用",
  },
  {
    tag: "GK",
    q: "vega = ?",
    a: "vega = S·e^(−rf·T)·φ(d1)·√T\ncall = put 完全相同; ATM 最大, 随 √T 增长",
  },
  {
    tag: "GK",
    q: "Δ_fwd (forward delta) = ?",
    a: "Δ_fwd = Φ(d1)  (call);  −Φ(−d1)  (put)\n与 Δ_spot 差 e^(−rf·T) 因子; G10 长期限惯例用 fwd delta",
  },
  {
    tag: "Greeks",
    q: "θ 与 Γ 的租金关系?",
    a: "delta 对冲组合: θ ≈ −½·Γ·S²·σ²\n多 gamma 付 theta 房租; 空 gamma 收租但担跳空",
  },
  {
    tag: "Greeks",
    q: "GK 里 ρ_d、ρ_f 的符号直觉 (call)?",
    a: "ρ_d = K·T·e^(−rd·T)·Φ(d2) > 0 (贴现K变便宜)\nρ_f = −S·T·e^(−rf·T)·Φ(d1) < 0 (rf↑ 压低远期)",
  },
  // ── Smile ──
  {
    tag: "Smile",
    q: "DNS (delta 中性跨式) 行权价?",
    a: "K_DNS = F·e^(σ²T/2)\nPA 版: K = F·e^(−σ²T/2);  ATMF: K = F",
  },
  {
    tag: "Smile",
    q: "σ_25C、σ_25P 用 ATM/RR/BF 表示?",
    a: "σ25c = ATM + BF25 + RR25/2\nσ25p = ATM + BF25 − RR25/2\nRR = σ25c − σ25p;  BF = (σ25c + σ25p)/2 − ATM",
  },
  {
    tag: "Smile",
    q: "Γ 和 Vega 在哪最大? 期限怎么变?",
    a: "都在 ATM (K ≈ F) 最大\nΓ ∝ φ(d1)/(S·σ·√T): 越临近到期越尖\nVega ∝ √T: 长期限更大",
  },
  // ── 障碍 / 随机分析 ──
  {
    tag: "障碍",
    q: "BGK 离散观测障碍调整?",
    a: "B_adj = B·e^(±0.5826·σ·√(T/m))\nup 障碍上移 (+), down 障碍下移 (−)\nm = 观测次数, 0.5826 = ζ(1/2)/√(2π) 取负",
  },
  {
    tag: "数字/触碰",
    q: "Cash digital 对称关系: C_dig + P_dig = ?",
    a: "C_dig + P_dig = e^(−rd·T)\n(付 1 本币, 到期 S>K 或 S≤K 必有一边付)\ncash digital call = e^(−rd·T)·Φ(d2) = −∂C_vanilla/∂K",
  },
  {
    tag: "数字/触碰",
    q: "One-touch 与 no-touch 的互补关系?",
    a: "OT + NT = e^(−rd·T)  (到期付 1 本币)\n路径要么碰到 H 要么没碰到, 事件互补\nNT = e^(−rd·T)·(1 − P_hit)",
  },
  {
    tag: "随机分析",
    q: "反射原理公式?",
    a: "P(max_{t≤T} W_t ≥ a) = 2·P(W_T ≥ a)\n              = 2·Φ(−a/√T)   (a > 0)",
  },
  {
    tag: "随机分析",
    q: "Feynman-Kac 三位一体是哪三位?",
    a: "① PDE: ∂V/∂t + ℒV − r·V = 0\n② 风险中性期望: V = E^Q[e^(−rT)·payoff]\n③ 对冲复制组合\n三者等价, 面试可任选一条路走",
  },
  // ── CIP / Carry ──
  {
    tag: "CIP",
    q: "CIP 远期公式 (简单计息)?",
    a: "F = S·(1 + rd·T)/(1 + rf·T)\n连续复利: F = S·e^((rd−rf)·T)",
  },
  {
    tag: "CIP",
    q: "掉期点 (swap points) 怎么算?",
    a: "掉期点 = (F − S) × 10000  (pips)\nUSDCNY 现状 rd < rf ⇒ F < S 贴水, 掉期点为负",
  },
  {
    tag: "CIP",
    q: "carry 是什么?",
    a: "carry ≈ rd − rf = 远期贴/升水的年化\n持有高息货币赚 carry, 吃 spot 贬值风险\nUIP 系统性失效 = carry trade 存在的理由",
  },
  // ── 市场结构 ──
  {
    tag: "市场结构",
    q: "CNY 与 CNH 的区别?",
    a: "CNY 在岸: CFETS 银行间, 中间价 ±2% 波动区间\nCNH 离岸 (香港): 自由浮动, 无区间\n价差 = 资本管制 + 贬值预期的温度计",
  },
  {
    tag: "市场结构",
    q: "人民币中间价何时、谁发布? 机制?",
    a: "每交易日 9:15, 央行授权 CFETS 发布\n机制: 收盘价 + 一篮子货币汇率变化\n(+ 逆周期因子, 处于“工具箱”备用状态)",
  },
  {
    tag: "市场结构",
    q: "在岸 USDCNY 即期做市商是谁?",
    a: "全是银行 (中外资银行均有)\n券商不做 CFETS 即期做市\n中金以场外衍生品一级交易商身份参与",
  },
  {
    tag: "市场结构",
    q: "Interbank 做市三环路?",
    a: "① 客盘 client flow (赚 bid-ask)\n② 内部撮合 internalization (对冲成本最低)\n③ 剩余风险抛 interbank\n做市赚价差, 不赌方向",
  },
  // ── 策略 / 情景 ──
  {
    tag: "策略",
    q: "组合策略 (straddle/RR/butterfly...) 定价的可加性?",
    a: "价格与所有 Greeks 对腿线性可加:\nV = Σ qtyᵢ·Vᵢ,  Δ = Σ qtyᵢ·Δᵢ,  vega = Σ qtyᵢ·vegaᵢ\n每条腿用各自 smile vol σᵢ 定价再相加即可",
  },
  {
    tag: "情景",
    q: "情景矩阵 (risk ladder) 横竖轴各读什么?",
    a: "横轴 = spot 冲击 → 沿行读 delta / gamma\n竖轴 = vol 冲击 → 沿列读 vega\nPnL(dS,dσ) ≈ Δ·dS + ½Γ·dS² + vega·dσ (+交叉项 vanna)",
  },
];

function shuffledIndices(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

const TAG_COLOR: Record<string, string> = {
  肌肉记忆: "text-gold border-gold/40",
  GK: "text-steel border-steel/40",
  Greeks: "text-steel border-steel/40",
  Smile: "text-plum border-plum/40",
  障碍: "text-crimson border-crimson/40",
  "数字/触碰": "text-crimson border-crimson/40",
  随机分析: "text-forest border-forest/40",
  策略: "text-gold border-gold/40",
  情景: "text-steel border-steel/40",
  CIP: "text-forest border-forest/40",
  市场结构: "text-cloud border-line",
};

export default function Flashcards() {
  const n = DECK.length;
  const [order, setOrder] = useState<number[]>(() => DECK.map((_, i) => i));
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));

  const goto = useCallback(
    (step: number) => {
      setFlipped(false);
      setIdx((i) => {
        const ni = (i + step + n) % n;
        setSeen((s) => {
          const s2 = new Set(s);
          s2.add(ni);
          return s2;
        });
        return ni;
      });
    },
    [n],
  );
  const next = useCallback(() => goto(1), [goto]);
  const prev = useCallback(() => goto(-1), [goto]);
  const flip = useCallback(() => setFlipped((f) => !f), []);
  const shuffle = useCallback(() => {
    setOrder(shuffledIndices(n));
    setIdx(0);
    setFlipped(false);
    setSeen(new Set([0]));
  }, [n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === " ") {
        e.preventDefault();
        flip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, flip]);

  const card = DECK[order[idx] ?? 0] ?? DECK[0];
  const tagCls = TAG_COLOR[card.tag] ?? "text-cloud border-line";
  const progress = ((idx + 1) / n) * 100;

  return (
    <div className="grid gap-4">
      <Card title="考前速练卡 Flashcards">
        {/* 进度 */}
        <div className="mb-3 flex items-center justify-between text-xs text-slate2">
          <span>
            第 <span className="font-mono font-semibold text-gold">{idx + 1}</span> / {n} 张
            <span className="ml-2 opacity-60">已翻阅 {seen.size}</span>
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tagCls}`}>{card.tag}</span>
        </div>
        <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-panel2">
          <div className="h-full rounded-full bg-gold transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        {/* 翻面卡片 */}
        <div className="[perspective:1400px]" onClick={flip}>
          <div
            className={`relative min-h-72 w-full cursor-pointer transition-transform duration-500 [transform-style:preserve-3d] ${
              flipped ? "[transform:rotateY(180deg)]" : ""
            }`}
          >
            {/* 正面: 问题 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-line bg-panel2 p-6 [backface-visibility:hidden]">
              <div className="mb-3 text-[11px] tracking-widest text-slate2">问题 · QUESTION</div>
              <div className="text-center text-xl font-bold leading-relaxed text-cloud md:text-2xl">{card.q}</div>
              <div className="mt-5 text-[11px] text-slate2 opacity-70">点击或按空格翻面</div>
            </div>
            {/* 背面: 答案 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-gold/40 bg-panel2 p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]">
              <div className="mb-3 text-[11px] tracking-widest text-gold">答案 · ANSWER</div>
              <pre className="max-w-full overflow-x-auto whitespace-pre-wrap text-center font-mono text-sm leading-relaxed text-gold md:text-base">
                {card.a}
              </pre>
            </div>
          </div>
        </div>

        {/* 控制按钮 */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={prev}
            className="rounded-md border border-line bg-panel2 px-4 py-1.5 text-sm text-cloud transition-colors hover:border-gold hover:text-gold"
          >
            ← 上一张
          </button>
          <button
            onClick={flip}
            className="rounded-md border border-gold/50 bg-panel2 px-4 py-1.5 text-sm text-gold transition-colors hover:bg-gold/10"
          >
            翻面 (空格)
          </button>
          <button
            onClick={next}
            className="rounded-md border border-line bg-panel2 px-4 py-1.5 text-sm text-cloud transition-colors hover:border-gold hover:text-gold"
          >
            下一张 →
          </button>
          <button
            onClick={shuffle}
            className="rounded-md border border-line bg-panel2 px-4 py-1.5 text-sm text-steel transition-colors hover:border-steel"
          >
            打乱 Shuffle
          </button>
        </div>

        <Note>
          键盘: ← 上一张 / → 下一张 / 空格 翻面。卡组 {n} 张, 覆盖五条肌肉记忆 + GK 公式 + Smile 报价 + 障碍 (BGK) +
          数字/触碰 (digital 对称 / OT+NT 互补) + CIP/carry + 随机分析 (反射原理 / Feynman-Kac) + 在岸市场结构 (CNY
          vs CNH / 中间价 / 做市商) + 策略可加性 + 情景矩阵。考前把
          <span className="text-gold"> 肌肉记忆五条</span> 过到条件反射为止。
        </Note>
      </Card>
    </div>
  );
}
