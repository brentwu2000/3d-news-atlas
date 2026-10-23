import type { EventStatus, IslandPreset, RelationType } from "./schema";

/** Status is always conveyed as text, never by colour, size or effects. */
export const STATUS_LABELS: Record<EventStatus, string> = {
  reported: "已報導（未經查證）",
  verified: "已查證",
  disputed: "有爭議",
  corrected: "已更正",
};

export const STATUS_DESCRIPTIONS: Record<EventStatus, string> = {
  reported: "媒體已報導，本站尚未取得獨立查證。",
  verified: "已比對多方來源或官方紀錄。",
  disputed: "相關說法存在爭議，請參閱各方來源。",
  corrected: "內容曾經更正，更正說明如下。",
};

export const RELATION_LABELS: Record<RelationType, string> = {
  related: "相關",
  chronological: "時間先後",
  causal_claim: "因果主張（引述）",
};

export const RELATION_DESCRIPTIONS: Record<RelationType, string> = {
  related: "兩則事件主題相關，不代表因果。",
  chronological: "僅表示發生順序，不代表因果。",
  causal_claim: "此為來源提出的因果說法，本站未證實。",
};

export const THEME_LABELS: Record<IslandPreset, string> = {
  city: "城市",
  forest: "森林",
  industry: "工業",
  coast: "海岸",
  civic: "公共",
};
