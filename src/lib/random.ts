/**
 * Small deterministic PRNG utilities. Never use Math.random() for world
 * generation: the same seed must always produce the same island.
 */

/** FNV-1a 32-bit hash of a string, used to derive sub-seeds. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: fast 32-bit seeded generator returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number | string): Rng {
  const next = mulberry32(typeof seed === "string" ? hashString(seed) : seed);
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, maxInclusive) => min + Math.floor(next() * (maxInclusive - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error("pick() called with empty array");
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
  };
}
