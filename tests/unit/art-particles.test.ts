import { describe, expect, it } from "vitest";
import { DEFAULT_ART_TOKENS, deriveSwatches } from "@/lib/art-tokens";
import { hexToRgb, isHexColor, mix, rgbToHex, shade } from "@/lib/color";
import { topics } from "@/lib/data";
import { computeWorldBounds, layoutIslands } from "@/lib/layout";
import { generateParticlePositions, MAX_PARTICLES_DESKTOP, MAX_PARTICLES_MOBILE } from "@/lib/particles";
import { qualitySettings } from "@/lib/quality";

describe("color helpers", () => {
  it("round-trips and mixes", () => {
    expect(rgbToHex(hexToRgb("#101b2b"))).toBe("#101b2b");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(shade("#808080", -1)).toBe("#000000");
    expect(() => hexToRgb("red")).toThrow();
  });
});

describe("art tokens", () => {
  it("default tokens match the POLISH-V1 palette", () => {
    expect(DEFAULT_ART_TOKENS).toEqual({
      backdrop: "#101b2b",
      stone: "#667080",
      sand: "#c4ad83",
      foliage: "#587d6b",
      highlight: "#e9d9ad",
    });
  });

  it("derives valid swatches deterministically", () => {
    const a = deriveSwatches(DEFAULT_ART_TOKENS);
    expect(a).toEqual(deriveSwatches(DEFAULT_ART_TOKENS));
    Object.values(a).forEach((c) => expect(isHexColor(c)).toBe(true));
  });
});

describe("particles and lighting budget", () => {
  const bounds = computeWorldBounds(layoutIslands(topics));

  it("is deterministic and respects the particle budget", () => {
    expect(generateParticlePositions(bounds, 50)).toEqual(generateParticlePositions(bounds, 50));
    expect(generateParticlePositions(bounds, 10_000).length / 3).toBe(MAX_PARTICLES_DESKTOP);
    expect(generateParticlePositions(bounds, 50).every(Number.isFinite)).toBe(true);
    expect(qualitySettings("high").particles).toBeLessThanOrEqual(MAX_PARTICLES_DESKTOP);
    expect(qualitySettings("low").particles).toBeLessThanOrEqual(MAX_PARTICLES_MOBILE);
  });

  it("uses a modest shadow map and keeps shadows desktop-only", () => {
    expect(qualitySettings("high").shadowMapSize).toBeLessThanOrEqual(1024);
    expect(qualitySettings("low").shadows).toBe(false);
    expect(qualitySettings("low").rimLight).toBe(true);
  });
});
