/** 障碍期权定价器 —— 连续/离散(BGK)监控,8 种组合,无 rebate;含 in–out 平价自检 */
import { useState } from "react";
import { barrierPrice, bgkAdjustedBarrier, type InOut, type UpDown } from "../lib/barrier";
import { gkPrice, type CP } from "../lib/gk";
import { Card, Field, Select, Row, Note, fmt, fmtPct } from "../components/ui";

type Mon = "continuous" | "discrete";

export default function BarrierPricer() {
  const [cp, setCp] = useState<CP>("call");
  const [ud, setUd] = useState<UpDown>("down");
  const [io, setIo] = useState<InOut>("out");
  const [S, setS] = useState(7.2);
  const [K, setK] = useState(7.2);
  const [B, setB] = useState(7.0);
  const [rdPct, setRdPct] = useState(1.9);
  const [rfPct, setRfPct] = useState(4.3);
  const [sigPct, setSigPct] = useState(5.5);
  const [T, setT] = useState(0.25);
  const [mon, setMon] = useState<Mon>("continuous");
  const [mObs, setMObs] = useState(63);

  const rd = rdPct / 100, rf = rfPct / 100, sigma = sigPct / 100;

  // ── 参数校验 ──
  const errs: string[] = [];
  if (!(Number.isFinite(S) && S > 0)) errs.push("现价 S 必须为正数");
  if (!(Number.isFinite(K) && K > 0)) errs.push("行权价 K 必须为正数");
  if (!(Number.isFinite(B) && B > 0)) errs.push("障碍 B 必须为正数");
  if (!(Number.isFinite(sigma) && sigma > 0)) errs.push("波动率 σ 必须为正数");
  if (!(Number.isFinite(T) && T > 0)) errs.push("期限 T 必须为正数");
  if (!Number.isFinite(rd)) errs.push("本币利率 rd 非法");
  if (!Number.isFinite(rf)) errs.push("外币利率 rf 非法");
  if (Number.isFinite(S) && Number.isFinite(B) && S > 0 && B > 0) {
    if (ud === "down" && B >= S) errs.push("向下(down)障碍要求 B < S:当前 B ≥ S,合约起始即已触碰障碍,无定价意义");
    if (ud === "up" && B <= S) errs.push("向上(up)障碍要求 B > S:当前 B ≤ S,合约起始即已触碰障碍,无定价意义");
  }
  if (mon === "discrete" && !(Number.isFinite(mObs) && mObs >= 1)) errs.push("离散观察次数必须 ≥ 1");
  const ok = errs.length === 0;

  // ── 定价(库内做 BGK 平移后按连续闭式解定价)──
  const m = Number.isFinite(mObs) ? Math.max(1, Math.round(mObs)) : 63;
  const obs = mon === "discrete" ? m : undefined;
  const ctx = { S, K, B, rd, rf, sigma, T };
  const ki = barrierPrice(cp, ud, "in", ctx, obs);
  const ko = barrierPrice(cp, ud, "out", ctx, obs);
  const vanilla = gkPrice(cp, ctx);
  const px = io === "in" ? ki : ko;
  const ratio = vanilla > 0 ? px / vanilla : NaN;
  const Badj = mon === "discrete" ? bgkAdjustedBarrier(B, S, sigma, T, m) : B;
  const name = `${ud === "down" ? "Down" : "Up"}-and-${io === "out" ? "Out" : "In"} ${cp === "call" ? "Call" : "Put"}`;

  // ── 价格轴示意(手写 SVG)──
  const pts = [S, K, B, ...(mon === "discrete" ? [Badj] : [])];
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const pad = Math.max((hi - lo) * 0.22, S * 0.008);
  const X = (v: number) => 24 + ((v - lo + pad) / (hi - lo + 2 * pad)) * 592;
  const mark = (v: number, label: string, color: string, top: boolean, dash?: boolean) => (
    <g>
      <line x1={X(v)} x2={X(v)} y1={26} y2={74} stroke={color} strokeWidth={1.6} strokeDasharray={dash ? "4 3" : undefined} />
      <text x={Math.min(Math.max(X(v), 48), 592)} y={top ? 18 : 90} textAnchor="middle" fontSize={10} fill={color} fontFamily="ui-monospace, Menlo, monospace">
        {label} {fmt(v, 4)}
      </text>
    </g>
  );
  const zoneX0 = ud === "down" ? 16 : X(B);
  const zoneW = ud === "down" ? Math.max(X(B) - 16, 0) : Math.max(624 - X(B), 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="合约与市场参数">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Select<CP> label="期权类型 CP" value={cp} onChange={setCp}
            options={[{ value: "call", label: "看涨 Call" }, { value: "put", label: "看跌 Put" }]} />
          <Select<UpDown> label="障碍方向" value={ud} onChange={setUd}
            options={[{ value: "down", label: "向下 Down" }, { value: "up", label: "向上 Up" }]} />
          <Select<InOut> label="障碍类型" value={io} onChange={setIo}
            options={[{ value: "out", label: "敲出 Out" }, { value: "in", label: "敲入 In" }]} />
          <Field label="现价 S" value={S} onChange={setS} step="0.01" />
          <Field label="行权价 K" value={K} onChange={setK} step="0.01" />
          <Field label="障碍 B" value={B} onChange={setB} step="0.01" />
          <Field label="本币利率 rd" value={rdPct} onChange={setRdPct} step="0.1" suffix="%" />
          <Field label="外币利率 rf" value={rfPct} onChange={setRfPct} step="0.1" suffix="%" />
          <Field label="波动率 σ" value={sigPct} onChange={setSigPct} step="0.1" suffix="%" />
          <Field label="期限 T" value={T} onChange={setT} step="0.05" suffix="年" min={0} />
          <Select<Mon> label="障碍监控" value={mon} onChange={setMon}
            options={[{ value: "continuous", label: "连续 Continuous" }, { value: "discrete", label: "离散 Discrete" }]} />
          {mon === "discrete" && (
            <Field label="观察次数 m(63≈日度·3M)" value={mObs} onChange={(v) => setMObs(v)} step="1" min={1} suffix="次" />
          )}
        </div>
        {errs.length > 0 && (
          <div className="mt-3 rounded-md border border-crimson/60 bg-crimson/10 p-2.5 text-xs leading-relaxed text-crimson">
            {errs.map((e, i) => <div key={i}>· {e}</div>)}
          </div>
        )}
      </Card>

      <Card title={`定价结果 · ${name}`}>
        {ok ? (
          <>
            <Row k="障碍期权价" hint={mon === "discrete" ? "(BGK 修正后)" : "(连续监控)"} v={fmt(px, 6)} />
            <Row k="同参数香草价" hint="Garman–Kohlhagen" v={fmt(vanilla, 6)} />
            <Row k="障碍价 / 香草价" v={fmtPct(ratio, 2)} tone={ratio < 0.5 ? "neg" : "pos"} />
            <Row k="自检:KI + KO = 香草" hint="in–out 平价" tone="gold"
              v={`${fmt(ki, 6)} + ${fmt(ko, 6)} = ${fmt(ki + ko, 6)} ≈ ${fmt(vanilla, 6)}`} />
            {mon === "discrete" && (
              <>
                <Row k="BGK 修正后障碍 B′" hint={B < S ? "下移·远离现价" : "上移·远离现价"} v={fmt(Badj, 6)} />
                <Row k="平移量 B′ − B" hint={`m=${m} 次观察`}
                  v={`${fmt((Badj - B) * 10000, 1)} pips`} tone={Badj - B < 0 ? "neg" : "pos"} />
              </>
            )}
          </>
        ) : (
          <p className="text-xs text-crimson">参数非法,请先修正左侧输入。</p>
        )}
      </Card>

      {ok && (
        <Card title="价格轴示意" className="lg:col-span-2">
          <svg viewBox="0 0 640 100" className="w-full">
            <rect x={zoneX0} y={26} width={zoneW} height={48} fill="var(--color-crimson)" opacity={0.1} />
            <text x={zoneX0 + zoneW / 2} y={50} textAnchor="middle" fontSize={10} fill="var(--color-crimson)" opacity={0.75}>
              触碰即{io === "out" ? "敲出" : "敲入"}区
            </text>
            <line x1={16} x2={624} y1={50} y2={50} stroke="var(--color-line)" strokeWidth={1} />
            {mark(S, "S 现价", "var(--color-gold)", true)}
            {mark(K, "K 行权", "var(--color-steel)", false)}
            {mark(B, "B 障碍", "var(--color-crimson)", true)}
            {mon === "discrete" && mark(Badj, "B′ BGK", "var(--color-plum)", false, true)}
          </svg>
        </Card>
      )}

      <div className="lg:col-span-2">
        <Note>
          反射原理:连续监控下敲出期权有闭式解 —— <span className="text-cloud">障碍 = 香草 − (B/S)<sup>2λ−2</sup> × 镜像香草</span>(把触碰障碍的路径沿 B 反射到镜像现价 S′ = B²/S,λ = (rd−rf+σ²/2)/σ²);由 in–out 平价,<span className="text-gold">敲入 + 敲出 = 同参数香草</span>(上方自检行两侧数值应吻合)。离散监控时用 BGK(Broadie–Glasserman–Kou)修正:<span className="text-cloud">B′ = B·exp(±0.5826·σ√(T/m))</span>,沿远离现价方向平移障碍 —— 离散观察会"漏看"两次观察之间的路径极值,等效于障碍更难触碰。本工具为无 rebate(敲出无返还金)版本。
        </Note>
      </div>
    </div>
  );
}
