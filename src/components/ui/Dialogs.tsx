"use client";

import { useEffect, useRef, useState } from "react";
import type { QualityPreference } from "@/lib/quality";
import { useAtlasStore } from "@/store/atlas-store";

const ONBOARDED_KEY = "news-atlas:onboarded";

const STEPS = [
  {
    kicker: "Welcome / 01",
    title: "這是一座虛構的城市",
    body: "十九格六邊形拼成「海港市」：一格一個主題，每格裡有一串新聞事件。城市、出版者與所有事件都是測試用的虛構範例，並非真實新聞。",
  },
  {
    kicker: "How to / 02",
    title: "點一格，看看發生過什麼",
    body: "點選地面的六邊形聚焦主題；藍色光柱是事件，點它開啟事件與來源。拖曳旋轉、滾輪縮放，Esc 返回。右側清單提供完全相同的內容，可用鍵盤瀏覽。",
  },
  {
    kicker: "Principles / 03",
    title: "只摘要，附來源，標狀態",
    body: "每則事件都以文字標示查證狀態（已報導、已查證、有爭議、已更正），並附上來源連結。色彩、大小與光線只是插畫，不代表真偽或嚴重程度；因果關係只在來源明確提出時才標成「因果主張」。",
  },
] as const;

/** Small modal with focus trap-lite: focus moves in, Escape closes, focus returns. */
function Modal({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-[3px]">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="card w-full max-w-[460px] p-7">
        {children}
      </div>
    </div>
  );
}

export function Onboarding() {
  const [step, setStep] = useState(0);
  const setDialog = useAtlasStore((s) => s.setDialog);
  const close = () => {
    try {
      localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      // Storage unavailable (private mode): onboarding simply shows again next time.
    }
    setDialog("none");
  };
  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;
  return (
    <Modal labelledBy="onboarding-title" onClose={close}>
      <p className="kicker">{current.kicker}</p>
      <h2 id="onboarding-title" className="display mt-3 text-[28px] leading-tight">
        {current.title}
      </h2>
      <p className="mt-3 text-[14.5px] leading-[1.85] text-ink-2">{current.body}</p>
      <div className="mt-6 flex items-center justify-between">
        <button type="button" className="btn" onClick={close}>
          略過
        </button>
        <span className="font-mono text-[11px] text-muted" aria-label={`第 ${step + 1} 步，共 ${STEPS.length} 步`}>
          {step + 1} / {STEPS.length}
        </span>
        <button type="button" data-autofocus className="btn btn-dark ring-2 ring-accent ring-offset-2 ring-offset-paper" onClick={() => (last ? close() : setStep(step + 1))}>
          {last ? "開始探索" : "下一步 →"}
        </button>
      </div>
    </Modal>
  );
}

/** Show onboarding once per browser (after hydration, so server and client markup match). */
export function useOnboardingOnce() {
  const setDialog = useAtlasStore((s) => s.setDialog);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("intro") === "0") return;
      if (!localStorage.getItem(ONBOARDED_KEY)) setDialog("onboarding");
    } catch {
      // Storage blocked: skip onboarding rather than nag every visit.
    }
  }, [setDialog]);
}

export function HelpDialog() {
  const setDialog = useAtlasStore((s) => s.setDialog);
  const qualityPreference = useAtlasStore((s) => s.qualityPreference);
  const setQualityPreference = useAtlasStore((s) => s.setQualityPreference);
  const close = () => setDialog("none");
  return (
    <Modal labelledBy="help-title" onClose={close}>
      <p className="kicker">Help</p>
      <h2 id="help-title" className="display mt-2 text-[26px]">
        操作說明
      </h2>
      <ul className="mt-3 flex flex-col gap-1.5 text-[14px] leading-relaxed text-ink-2">
        <li>・點六邊形：聚焦該主題；點藍色光柱：開啟事件。</li>
        <li>・滑鼠拖曳旋轉、右鍵拖曳平移、滾輪縮放；手機單指旋轉、雙指縮放。</li>
        <li>・Esc：先關閉事件，再返回總覽。</li>
        <li>・鍵盤：右側清單的每一項都能用 Tab / Enter 操作。</li>
        <li>・「關聯」顯示所有人工整理的事件關係；「時間軸」可依分類與日期篩選。</li>
      </ul>
      <label className="mt-4 flex items-center gap-2 text-[14px]">
        <span className="font-semibold">畫質</span>
        <select value={qualityPreference} onChange={(e) => setQualityPreference(e.target.value as QualityPreference)} className="field !w-auto !py-1.5">
          <option value="auto">自動</option>
          <option value="high">高</option>
          <option value="low">低（省電）</option>
        </select>
      </label>
      <div className="mt-6 text-right">
        <button type="button" data-autofocus className="btn btn-dark" onClick={close}>
          知道了
        </button>
      </div>
    </Modal>
  );
}

export function AboutDialog() {
  const setDialog = useAtlasStore((s) => s.setDialog);
  const close = () => setDialog("none");
  return (
    <Modal labelledBy="about-title" onClose={close}>
      <p className="kicker">About</p>
      <h2 id="about-title" className="display mt-2 text-[26px]">
        關於這張地圖
      </h2>
      <div className="mt-3 flex flex-col gap-2 text-[14px] leading-relaxed text-ink-2">
        <p>NEWS ATLAS 是一個新聞事件地圖的原型：用六邊形城市把主題、事件與人工整理的關聯放在同一張圖上。</p>
        <p>目前所有資料皆為虛構範例，連結指向保留網域 example.org。3D 場景全部以程式生成，未使用第三方模型或素材；本站沒有分析或追蹤程式。</p>
      </div>
      <div className="mt-6 text-right">
        <button type="button" data-autofocus className="btn btn-dark" onClick={close}>
          關閉
        </button>
      </div>
    </Modal>
  );
}
