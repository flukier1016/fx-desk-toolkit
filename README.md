# FX 交易台工具箱 · fx-desk-toolkit

> 中金 FICC 外汇交易实习随身工具 — **纯本地计算,数据不出浏览器**,单文件构建可拷到任何机器双击使用。

## 🧰 九个工具

| 工具 | 干什么 |
|------|--------|
| **GK 定价器** | Garman–Kohlhagen 期权定价 + 全套希腊字母(spot/forward/PA delta、Γ、vega、θ、ρ) |
| **Delta⇄行权价** | 四种 delta 约定互换行权价;ATMF / DNS(pips) / DNS(pa) 一键 |
| **微笑曲线** | ATM · 25ΔRR · 25ΔBF(可加 10Δ)重建 σ(Δ) 曲线 + 对应行权价表 |
| **掉期点·CIP** | 理论远期/掉期点(单利·连续两口径);市场价反推隐含利率与交叉货币基差 |
| **障碍期权** | 8 种敲入/敲出闭式解(反射原理)+ BGK 离散监控修正 + in–out 平价自检 |
| **PnL 归因** | Δ/Γ/vega/θ/carry 瀑布分解;期权模式自动全重估出 residual |
| **外汇时钟** | 24h 北京时间时段带:悉尼/东京/伦敦/纽约 + 9:15 中间价、9:30/16:30/23:30 关键时点倒计时 |
| **考前速练** | 速查卡/考前 28 题主题的翻面卡片,键盘操作 |
| **当日小结** | 发带教的每日小结生成器,实时预览 + 一键复制,草稿本地保存 |

定价公式与《随机分析与FX定价·完整版》逐条对齐,核心库有 **19 个数值测试**把关
(BS 经典基准值、put–call parity、PA delta 恒等式、数值希腊字母对拍、delta↔strike 往返、
in–out 平价、BGK 收敛、CIP 反解往返、PnL 残差)。

## 🚀 使用

```bash
npm install
npm run dev        # 开发
npm run test       # 数值测试(vitest)
npm run build      # 构建 → dist/index.html 单文件,自包含
```

**台子上用**:`npm run build` 后把 `dist/index.html` 一个文件拷走(U 盘/网盘),任何浏览器双击即用——无网络、无安装、无数据外发。

## 🧱 技术

Vite · React 19 · TypeScript · Tailwind 4 · 零图表库(手写 SVG)· 零运行时依赖(react/react-dom 之外)· vite-plugin-singlefile

## ⚠️ 边界

教育与自查用途;结果非投资建议;实盘一律以台子系统与市场惯例为准。夏令时、交易时段、市场惯例(delta 约定/pip 因子)因货币对而异,工具中已标注可调。
