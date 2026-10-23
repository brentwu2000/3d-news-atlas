/**
 * Lighting presets. Purely atmospheric; never tied to news content.
 * Night is the default look; windows and street lamps glow when `glow` > 0.
 */
export const TIMES_OF_DAY = ["dawn", "day", "dusk", "night"] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export interface TimePreset {
  label: string;
  clock: string;
  /** Background + fog colour. */
  sky: string;
  ground: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  keyColor: string;
  keyIntensity: number;
  /** Direction the key light comes from (normalised in the scene). */
  keyDirection: [number, number, number];
  /** 0..1: window / lamp / beacon emissive strength. */
  glow: number;
  /** Tint multiplied into tile surfaces (night pushes towards blue-violet). */
  tileTint: string;
}

export const TIME_PRESETS: Record<TimeOfDay, TimePreset> = {
  dawn: {
    label: "清晨",
    clock: "06:00",
    sky: "#c9b6c4",
    ground: "#5d6a4c",
    hemiSky: "#f3d9d0",
    hemiGround: "#5a5266",
    hemiIntensity: 1.5,
    keyColor: "#ffc59a",
    keyIntensity: 2.0,
    keyDirection: [1, 0.45, 0.6],
    glow: 0.35,
    tileTint: "#f0e4ea",
  },
  day: {
    label: "白天",
    clock: "12:00",
    sky: "#b8c7a2",
    ground: "#6f7a4f",
    hemiSky: "#f4f6ff",
    hemiGround: "#7b7461",
    hemiIntensity: 1.9,
    keyColor: "#fff6e6",
    keyIntensity: 2.8,
    keyDirection: [0.5, 1.2, 0.7],
    glow: 0,
    tileTint: "#ffffff",
  },
  dusk: {
    label: "黃昏",
    clock: "18:00",
    sky: "#5b4a63",
    ground: "#4f5240",
    hemiSky: "#d9c3dc",
    hemiGround: "#40384f",
    hemiIntensity: 1.45,
    keyColor: "#ffb684",
    keyIntensity: 1.7,
    keyDirection: [-1, 0.4, 0.5],
    glow: 0.7,
    tileTint: "#efe4f0",
  },
  night: {
    label: "深夜",
    clock: "21:00",
    sky: "#28302c",
    ground: "#3a4a36",
    hemiSky: "#a7b2dc",
    hemiGround: "#3a3448",
    hemiIntensity: 1.55,
    keyColor: "#b4c0ff",
    keyIntensity: 1.25,
    keyDirection: [-0.4, 1, 0.8],
    glow: 1,
    tileTint: "#dcd8f4",
  },
};

export function isTimeOfDay(value: string | null): value is TimeOfDay {
  return value !== null && (TIMES_OF_DAY as readonly string[]).includes(value);
}
