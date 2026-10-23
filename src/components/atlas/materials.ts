import * as THREE from "three";

/**
 * Module-level shared materials: every island and prop reuses one of these
 * instances. They live for the lifetime of the page and are never disposed
 * by individual components.
 */

let terrain: THREE.MeshStandardMaterial | null = null;
let prop: THREE.MeshStandardMaterial | null = null;
let particle: THREE.PointsMaterial | null = null;

export function getTerrainMaterial(): THREE.MeshStandardMaterial {
  terrain ??= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });
  return terrain;
}

/** White base colour; per-instance colour comes from InstancedMesh.instanceColor. */
export function getPropMaterial(): THREE.MeshStandardMaterial {
  prop ??= new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 0.82, metalness: 0 });
  return prop;
}

/** The only transparent surface in the scene: tiny, depth-write-free dust points. */
export function getParticleMaterial(color: string): THREE.PointsMaterial {
  particle ??= new THREE.PointsMaterial({
    size: 0.14,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    fog: true,
  });
  particle.color.set(color);
  return particle;
}

/*
 * Interaction accents. Opaque unlit materials (no extra transparent surfaces).
 * Hover vs. selected differ only in brightness; neither encodes editorial meaning.
 */
const basic = new Map<string, THREE.MeshBasicMaterial>();

function basicMaterial(key: string, color: string, side: THREE.Side = THREE.FrontSide): THREE.MeshBasicMaterial {
  let material = basic.get(key);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color, side, toneMapped: false, fog: true });
    basic.set(key, material);
  }
  material.color.set(color);
  return material;
}

export const getOutlineMaterial = (color: string) => basicMaterial("outline", color, THREE.DoubleSide);
export const getOutlineHoverMaterial = (color: string) => basicMaterial("outline-hover", color, THREE.DoubleSide);
export const getMarkerHeadMaterial = (color: string) => basicMaterial("marker-head", color);
export const getMarkerStemMaterial = (color: string) => basicMaterial("marker-stem", color);
export const getMarkerHaloMaterial = (color: string) => basicMaterial("marker-halo", color, THREE.DoubleSide);
