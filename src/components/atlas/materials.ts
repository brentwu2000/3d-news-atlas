import * as THREE from "three";
import type { MaterialKind } from "@/lib/tile-generator";
import { createRng } from "@/lib/random";
import { PALETTE } from "@/lib/palette";

/**
 * Module-level shared materials. Every tile, prop and marker reuses these;
 * they live for the page lifetime and are never disposed by components.
 * `setGlow` drives all self-lit surfaces from the time-of-day preset.
 */

let cache: Map<string, THREE.Material> | null = null;
let glowLevel = 1;

function get<T extends THREE.Material>(key: string, create: () => T): T {
  cache ??= new Map();
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = create();
    cache.set(key, m);
  }
  return m;
}

/** Procedural window grid: albedo (dark panes on white) + emissive (some panes lit). */
function windowTextures(): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const cols = 4;
  const rows = 8;
  const cw = 16;
  const ch = 16;
  const make = (paint: (ctx: CanvasRenderingContext2D) => void) => {
    const canvas = document.createElement("canvas");
    canvas.width = cols * cw;
    canvas.height = rows * ch;
    const ctx = canvas.getContext("2d");
    if (ctx) paint(ctx);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    return texture;
  };
  const rng = createRng("windows");
  const lit = Array.from({ length: cols * rows }, () => rng.next() < 0.62);
  const map = make((ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cols * cw, rows * ch);
    ctx.fillStyle = "#56627a";
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) ctx.fillRect(c * cw + 4, r * ch + 4, cw - 8, ch - 6);
  });
  const emissive = make((ctx) => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, cols * cw, rows * ch);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!lit[r * cols + c]) continue;
        ctx.fillStyle = (r + c) % 5 === 0 ? "#bfe6ff" : "#ffffff";
        ctx.fillRect(c * cw + 4, r * ch + 4, cw - 8, ch - 6);
      }
    }
  });
  return { map, emissive };
}

export function getPropMaterial(kind: MaterialKind): THREE.Material {
  switch (kind) {
    case "standard":
      return get("prop", () => new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 0.85 }));
    case "facade":
      return get("facade", () => {
        const { map, emissive } = windowTextures();
        return new THREE.MeshStandardMaterial({
          color: "#ffffff",
          map,
          emissiveMap: emissive,
          emissive: new THREE.Color(PALETTE.window),
          emissiveIntensity: glowLevel * 1.3,
          roughness: 0.8,
        });
      });
    case "emissive":
      return get("emissive", () => new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }));
    case "water":
      return get("water", () => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.25, metalness: 0.1 }));
  }
}

export const getSlabMaterial = () =>
  get("slab", () => new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.9, flatShading: true }));
export const getRoadMaterial = () => get("road", () => new THREE.MeshStandardMaterial({ color: PALETTE.road, roughness: 0.95 }));
export const getKerbMaterial = () => get("kerb", () => new THREE.MeshStandardMaterial({ color: PALETTE.curb, roughness: 0.9 }));
export const getLineMaterial = () => get("line", () => new THREE.MeshBasicMaterial({ color: PALETTE.roadLine, toneMapped: false }));
export const getPoleMaterial = () => get("pole", () => new THREE.MeshStandardMaterial({ color: PALETTE.metalDark, roughness: 0.6 }));
export const getLampMaterial = () => get("lamp", () => new THREE.MeshBasicMaterial({ color: PALETTE.lamp, toneMapped: false }));
export const getGroundMaterial = () => get("ground", () => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1 }));
export const getFoliageMaterial = () => get("foliage", () => new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 0.9 }));
export const getSmokeMaterial = () =>
  get("smoke", () => new THREE.MeshStandardMaterial({ color: PALETTE.smoke, flatShading: true, transparent: true, opacity: 0.75, depthWrite: false }));

/* Event beacons: identical for every event; colour never encodes status. */
export const getBeaconRingMaterial = () => get("beacon-ring", () => new THREE.MeshBasicMaterial({ color: PALETTE.beacon, toneMapped: false }));
export const getBeaconBeamMaterial = () =>
  get(
    "beacon-beam",
    () =>
      new THREE.MeshBasicMaterial({
        color: PALETTE.beacon,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
  );
export const getBeaconHitMaterial = () => get("beacon-hit", () => new THREE.MeshBasicMaterial({ visible: false }));
export const getHaloMaterial = () => get("halo", () => new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }));

/** Particle dust (fireflies at night, specks by day). */
export const getParticleMaterial = () =>
  get(
    "particles",
    () =>
      new THREE.PointsMaterial({
        color: PALETTE.lamp,
        size: 0.16,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        toneMapped: false,
      }),
  );

/**
 * Apply a time-of-day glow level (0..1) to every self-lit shared material.
 * Lamps stay visible by day but dim; windows only glow towards night.
 */
export function setGlow(level: number) {
  glowLevel = level;
  const facade = cache?.get("facade") as THREE.MeshStandardMaterial | undefined;
  if (facade) facade.emissiveIntensity = level * 1.3;
  const lamp = cache?.get("lamp") as THREE.MeshBasicMaterial | undefined;
  lamp?.color.set(PALETTE.lamp).multiplyScalar(0.55 + level * 0.45);
  const emissive = cache?.get("emissive") as THREE.MeshBasicMaterial | undefined;
  emissive?.color.setScalar(0.65 + level * 0.35);
  const beam = cache?.get("beacon-beam") as THREE.MeshBasicMaterial | undefined;
  if (beam) beam.opacity = 0.18 + level * 0.22;
  const particles = cache?.get("particles") as THREE.PointsMaterial | undefined;
  if (particles) particles.opacity = 0.25 + level * 0.6;
}
