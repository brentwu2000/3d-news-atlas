# Assets & licenses

No third-party 3D models, textures or images are used. Nothing is fetched, copied, or derived from any
reference website's code, models, or assets; the visual style was matched by independent implementation.

| Asset | Source | License |
|---|---|---|
| Hex city tiles, roads, kerbs, lane dashes, street lamps | Procedural geometry (`src/lib/city-geometry.ts`) | Project code |
| 19 tile dioramas (buildings, trees, cranes, lighthouse, ferris wheel, stadium, turbines…) | Procedural, composed from three.js primitive geometries (`src/lib/tile-generator.ts`) | Project code; three.js MIT |
| Window texture (lit / unlit panes) | Generated at runtime on a `<canvas>` (`src/components/atlas/materials.ts`) | Project code |
| Surroundings: forest, hills, rail loop, train, smoke, fireflies | Procedural (`src/lib/environment.ts`, `src/components/atlas/Surroundings.tsx`) | Project code |
| UI icons | Hand-written SVG paths (`src/components/ui/icons.tsx`) | Project code |
| Brand ("NEWS ATLAS. 海港市事件地圖") | Original | Project code |
| Noto Serif TC (display headings) | Google Fonts via `next/font` (self-hosted at build time) | SIL Open Font License 1.1 |
| IBM Plex Mono (kicker labels, numbers) | Google Fonts via `next/font` (self-hosted at build time) | SIL Open Font License 1.1 |

If a licensed asset is ever added, record author / source URL / license / attribution here first.
