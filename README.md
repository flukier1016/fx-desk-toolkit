# FX 交易台工具箱 · fx-desk-toolkit

> 中金 FICC 外汇实习随身工具 — **纯本地计算,数据不出浏览器**;单文件构建可拷任意机器双击用。
> 架构、正确性方法论与扩展/迁移配方见 **[ARCHITECTURE.md](ARCHITECTURE.md)**。

## 🧰 十三个工具(四组)

| 组 | 工具 | 干什么 |
|----|------|--------|
| 定价 | **GK 定价器** | Garman–Kohlhagen 期权价 + 全套希腊字母(spot/forward/PA delta) |
| 定价 | **Delta⇄行权价** | 四种 delta 约定互算 K;ATMF / DNS(pips) / DNS(pa) 一键 |
| 定价 | **数字·触碰** ★ | 现金/资产数字、one-touch/no-touch(含对称性自检行) |
| 定价 | **障碍期权** | 8 种敲入敲出闭式解 + BGK 修正 + in–out 平价自检 |
| 定价 | **组合策略** ★ | 多腿构建(跨式/宽跨/RR/蝶式/海鸥预设),净希腊字母 + 到期损益图 |
| 市场 | **微笑曲线** | ATM·25ΔRR·25ΔBF(可加 10Δ)重建 σ(Δ) + 行权价表 |
| 市场 | **掉期点·CIP** | 理论远期两口径;市场价反推隐含利率与交叉货币基差 |
| 市场 | **外汇时钟** | 北京时间 session 带 + 9:15 中间价等关键时点倒计时 |
| 风险 | **情景矩阵** ★ | 即期×波动率双向冲击热力网格(逐格重估) |
| 风险 | **PnL 归因** | Δ/Γ/vega/θ/carry 瀑布;期权模式全重估出 residual |
| 风险 | **头寸簿** ★ | 本地记账 + 全局参数实时重估,净 delta/vega/theta 汇总 |
| 日常 | **考前速练** | 30 张翻面卡(速查卡/考前 28 题精华) |
| 日常 | **当日小结** | 发带教的小结生成器,自动带行情快照,一键复制 |

★ = v2 新增。**全局市场参数条**:S/rd/rf/σ/T/名义/货币对在顶部一处编辑,所有工具联动(localStorage 持久化,可导出/导入 JSON);货币对切换自动带出 pip 因子与 delta 惯例(约定注册表)。

## ✅ 正确性:不变量方法论

- 引擎(L0–L2 纯 TS,零依赖零 DOM)配 **32 个 vitest 不变量断言**:恒等式(parity、Δ_pa≡Δ_spot−V/S、KI+KO=香草、数字 C+P=e^{−rdT}、OT+NT 互补、策略=Σ腿)、极限(障碍远去→香草、BGK 收敛)、往返(delta↔K、CIP 反解)、交叉对拍(数值希腊字母、BS 经典值 10.4506)。
- 右上角 **“✓ 引擎自检”**:同源 12 项不变量在你的浏览器里实时跑,全绿=这份文件算得对。
- 方法论详见 [ARCHITECTURE.md §2](ARCHITECTURE.md)。

## 🚀 使用

```bash
npm install
npm run dev      # 开发(Alt+←→ 切换工具;右上角切深/浅主题)
npm test         # 32 个数值不变量
npm run build    # → dist/index.html 单文件自包含
```

**台子上用**:把 `dist/index.html` 一个文件拷走,任何浏览器双击即用——无网络、无安装、无数据外发。

## 🔧 扩展与迁移(30 分钟配方)

- **加工具**:lib 纯函数 → 配不变量 → (可选)挂自检 → 写 `tools/*.tsx` → `App.tsx` 注册一行 → README 登记。
- **加货币对/改惯例**:只改 `src/lib/conventions.ts` 一行。
- **换品牌色/主题**:只改 `src/index.css` 的 `@theme` 令牌。
- **搬去 Python/Node/Excel/真后端**:引擎零依赖可直接搬,验收 = 把测试断言翻过去跑绿。详见 [ARCHITECTURE.md §6](ARCHITECTURE.md)。

## 🧱 技术

Vite · React 19 · TypeScript · Tailwind 4 · 手写 SVG(零图表库)· vite-plugin-singlefile · vitest

## ⚠️ 边界

教育与自查用途,非投资建议,以台子系统与市场惯例为准;已知取舍(常数波动率、到期支付口径、固定夏令时口径)见 ARCHITECTURE.md §7。
