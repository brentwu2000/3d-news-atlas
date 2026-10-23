# 3D News Atlas

Interactive 3D news-event map. Nineteen hexagonal tiles form one fictional city ("海港市"): one tile per topic,
cyan beacons for events, red dashed arcs for curated relations. See `CLAUDE.md` for the base spec.

**Status:** P0-P5 done. Visual/interaction direction since v2: a hex-tile diorama city at night with time-of-day lighting
and an editorial paper UI (brand card, toolbar, event index, legend card, overview, timeline, onboarding). The look was
matched to a reference site by independent implementation only: no code, models, images, brand or characters were copied,
and the reference's "danger level" rating was deliberately not reproduced (colour/size must never imply severity).
All data is fictional, clearly labelled sample content; no backend, no news API, no tracking.

## Scripts (npm)

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` (strict + `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint 9 flat config (`eslint-config-next` core-web-vitals + typescript) |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright smoke + interaction tests, desktop (1440×900) + mobile (Pixel 7, 390×844), 1 worker (SwiftShader is CPU-bound). Builds and starts the app on port 3100. First run: `npx playwright install chromium` |
| `npm run build:static` | Static export to `out/` (`output: "export"`, enabled only for this script) |
| `npm run deploy` | `build:static` + `wrangler deploy` to Cloudflare (Workers static assets, `wrangler.jsonc`) |

QA URL switches: `?webgl=0` forces the 2D fallback; `?quality=low|high` overrides auto-detected quality; `?intro=0` skips onboarding;
`?debug=1` shows live FPS / draw calls / triangles and exposes `window.__ATLAS_STATS__`.

Performance + screenshot capture: `npm run build && npx next start -p 3100`, then
`node scripts/measure.mjs <label>` → `docs/screenshots/<label>/{desktop,mobile,fallback-mobile}.png` + `perf.json`.

## Deployment

Live: **https://3d-news-atlas.brentwu2000.workers.dev** (Cloudflare Workers static assets).

The site is fully static, so `npm run build:static` exports it to `out/` and `wrangler deploy` uploads that folder
(`wrangler.jsonc`, `not_found_handling: "404-page"`). Response headers come from `public/_headers`
(nosniff, referrer policy, frame denial, permissions policy, immutable caching for `/_next/static`).
Wrangler 4.152 routes new "Pages" projects through Workers, so Workers static assets is used directly.
Requires a logged-in wrangler (`npx wrangler login`).

## Installed versions (exact)

next 16.4.2 · react / react-dom 19.3.1 · three 0.186.1 · @react-three/fiber 9.8.2 · @react-three/drei 10.7.9 · gsap 3.15.0 · zustand 5.0.16 · zod 4.6.7 · tailwindcss / @tailwindcss/postcss 4.3.3 · typescript 6.0.3 · eslint 9.39.5 · eslint-config-next 16.4.2 · vitest 5.0.5 · jsdom 30.1.3 · @playwright/test 1.64.1 · wrangler 4.152.0 · Node 22.12 / npm 10.9

Version notes / deviations from "latest":
- **TypeScript 6.0.3, not 7.0.x** — `typescript-eslint` 8.x (used by `eslint-config-next`) supports `typescript <6.1`.
- **ESLint 9, not 10** — `eslint-plugin-react` / `eslint-plugin-import` / `jsx-a11y` peer ranges stop at 9.
- React pinned to 19.3.x because `@react-three/fiber` 9.8 peers `react <19.4`.
- Next 16: `next lint` no longer exists, linting runs `eslint .` directly; Turbopack is the default bundler. `turbopack.root` is set in `next.config.ts` because a stray `package-lock.json` in the home directory confused root detection.
- three r186 removed `PCFSoftShadowMap` (falls back with a warning). Soft shadows use `shadows="percentage"` (PCF) + `shadow-radius`.
- Tailwind 4: CSS-first config (`@import "tailwindcss"`), no `tailwind.config.js`.
- `npm audit` reports a high-severity `braces` advisory reached only via `eslint-config-next → @next/eslint-plugin-next → fast-glob` (dev-only lint tooling, not shipped). The suggested "fix" downgrades to eslint-config-next 14, so it is left as-is.

## Architecture

```
src/
  app/            layout.tsx (next/font: Noto Serif TC + IBM Plex Mono), page.tsx (static), globals.css (paper/ink tokens)
  components/
    AtlasApp.tsx  client root (server-rendered): map overlays, index sidebar / mobile sheet, detail card, dialogs,
                  URL sync, Escape handling, focus restore, guided tour
    atlas/        AtlasClient (WebGL detection, quality, fallback), WorldScene (single Canvas; world model, lights, fog),
                  CityMeshes (all tiles instanced: slab, ground, road, kerb, dashes, lamps, prop groups + picking),
                  EventMarker (instanced beacons + hit proxies), TileOverlays (number pills, dashed outlines),
                  RelationArc, Surroundings (forest, hills, rail + train, smoke), CameraDirector, DebugBridge, PerfProbe,
                  materials (shared; window texture; time-of-day glow), WebGLFallback (2D hex buttons)
    ui/           Chrome (brand card, hero, toolbar, side buttons, quick-jump, hint), EventIndex, EventPanel (legend/event
                  card), OverviewCard, Timeline (filters + histogram + scrubber), Dialogs (onboarding/help/about), Filters, icons
  lib/            schema, data, normalize, timeline, url-state, camera, hex, layout, tile-generator, city-geometry,
                  markers, environment, time-of-day, palette, labels, gestures, particles, quality, webgl, hooks, random, color
  store/          atlas-store (zustand; pure `transitions` are unit-tested)
  data/           topics.json (19), events.json (47), relations.json (16) — all fictional
tests/unit (Vitest), tests/e2e (Playwright: smoke + interaction; fixtures.ts skips onboarding except in its own test)
```

### Data model notes
Matches CLAUDE.md, with four additive fields: `Topic.shortTitle` (tile label), and for editorial safety:
`Source.id` (so `Relation.sourceIds` can cite a specific source), `Event.correctionNote` (required when status is `corrected`),
`Event.isFictional`. Dates must be ISO 8601 **with time and offset**; date-only, offset-less and impossible dates are rejected.
URLs must be absolute http(s). `causal_claim` relations must cite at least one source belonging to one of the two events.
Cross-references (topic ids, event ids, source ids, duplicates) are validated for the whole dataset. Invalid data renders a
data-error page with the issues instead of a broken atlas. Days are bucketed in `Asia/Taipei` (`ATLAS_TIME_ZONE`).

### Interaction model
- One `visible` set (`filterEvents`: search over title/summary/tags, AND of terms; categories; inclusive date cutoff) feeds
  the list, the 3D markers and the timeline, so they can never disagree. Filtering out the selected event deselects it.
- Camera states `overview → focusing → focused → returning`, owned by `CameraDirector` only. GSAP tweens start from the
  current pose, are killed on every new request, on user input and on unmount, and snap onto the deterministic pose on
  completion (0.9-1.3 s window, 1.1 s, power2.inOut; immediate with reduced motion). Focus frames the tile at 50 %
  (desktop) / 42 % (mobile) of canvas width, centred in the area not covered by the detail card. Returning restores the user's
  previous orbit if it is still within orbit limits, otherwise the canonical overview.
- Clicks with pointer travel >= 6 CSS px are ignored (orbit/pan/pinch). Marker hits stop propagation, so they win over islands.
  Hover/selection show a white/red dashed hex outline + cursor; nothing mutates shared materials or geometry.
  Number pills over the tiles use the same 6 px tap threshold, since they move with the camera while orbiting.
- Tiles are static (no bobbing); idle life comes from chibi pedestrians walking each tile's sidewalk loop, cars on the
  road rings (`src/lib/crowd.ts`, instanced in `Crowd.tsx`), the train, chimney smoke and fireflies, all paused by "暫停",
  under reduced motion, and while the tab is hidden. Selecting anything pauses the timeline and the guided tour.
- Keyboard: every island/marker pick has a list button; Enter opens, Escape closes the event, then the topic; focus moves to the
  panel heading on open and back to the list item on close. Range input + play/pause for the timeline.
- URL: `topic`, `event`, `until` (YYYY-MM-DD), `q`, `cat` (comma list). Parsed once after hydration (no hydration mismatch),
  unknown values dropped, written with `replaceState` only when the string changes (no router/store loop).

QA switches (not part of shareable state): `?webgl=0`, `?quality=low|high`, `?debug=1` (stats overlay,
`window.__ATLAS_STATS__`, `window.__ATLAS_DEBUG__` used by E2E to aim pointer events at 3D objects).

## Scalability limits (measured with 19 topics / 47 events / 16 relations)

- Layout: hexagonal spiral (1, 7, 19, 37… tiles); camera framing is unit-tested for the bundled 19 tiles.
- Rendering is instanced across the whole city: ~45-60 draw calls regardless of tile or event count (prop groups are
  keyed by primitive × material × shadow). Each tile adds one DOM number label (drei `Html`); beyond ~40 tiles labels
  should switch to an instanced/text-atlas approach.
- Beacons: spacing >= 1.5 units for the bundled data, relaxed to >= 0.9 and unit-tested up to 16 events per tile
  (`MARKER_CAPACITY`); beyond that beacons may overlap and clustering would be needed.
- Search is a linear scan over pre-lowercased text: fine for thousands of events, not for a large archive.
- Performance (headless Chromium + SwiftShader, i.e. CPU rendering): desktop 1440×900 ≈ 10 fps high / 17 fps low,
  59 draw calls, 55k triangles; mobile 390×844 low preset 60 fps (capped), 46 calls, 44k triangles. The full-screen
  lit city is fill-rate bound on a CPU renderer; real GPUs have not been measured yet — use `?debug=1` on a device.
  Screenshots: `docs/screenshots/v2-city/`.

## History: POLISH-V1 (floating-island version, superseded by the v2 hex city)

- **Palette tokens**: `--atlas-backdrop/stone/sand/foliage/highlight` in `globals.css` (also exposed as Tailwind `atlas-*` colours).
  The scene reads them at runtime (`readArtTokens`) and derives every colour via `deriveSwatches` in `src/lib/art-tokens.ts`.
  Tokens are aesthetic only and never encode editorial status.
- **Geometry**: irregular rim from seeded low-frequency lobes + jitter (clamped 0.8-1.1); seeded surface ripple shared by terrain
  and prop placement; underside = soil lip + 2-3 tapered strata with inset ledges; per-face seeded shade variation.
  Props are composed from 2-5 parts (tiered pines, two-blob trees, gabled/flat-roof buildings, setback towers, plinth + drum + dome,
  lighthouse + pier for coast). Small props (trees, bushes, rocks, columns) don't cast shadows.
- **Lighting/atmosphere**: hemisphere fill + warm key (only shadow caster, 1024 map, desktop only) + cool rim light; navy depth fog;
  90 / 24 dust particles (hard caps 100 / 30); bob amplitude 0.1, period 8 s. Clouds were removed (transparent overdraw, off-palette).
- **Layout**: spacing uses the full island extent (rim lobes + pier, 1.25 x radius); `tests/unit/silhouette.test.ts` projects every
  island through the real overview camera and asserts no on-screen overlap, everything in frame, and >= 64 px width at 390 px.

| Measured (headless Chromium + SwiftShader CPU renderer) | Before | After |
|---|---|---|
| Desktop 1440x900 (high): FPS median | 30 | 35 |
| Desktop: draw calls / triangles | 68 / 18.9k | 72 / 17.4k |
| Mobile 390x844 (low): FPS median | 60 (capped) | 60 (capped) |
| Mobile: draw calls / triangles | 37 / 5.7k | 48 / 8.8k |
| Geometries in memory | 19 | 20 |
| JS transfer (compressed) | 429 KB | 431 KB |

SwiftShader is a software renderer: these numbers are for before/after regression only, not real-device performance.
No physical mid-range desktop or phone has been measured yet.

### After POLISH-V1 steps 4-5 (markers, arcs, UI)

| Measured (same SwiftShader setup), overview | Desktop | Mobile |
|---|---|---|
| FPS median | 33 | 60 (capped) |
| Draw calls / triangles | 82 / 17.9k | 58 / 9.3k |
| Geometries in memory | 22 | 22 |
| JS transfer (compressed) | 483 KB | 483 KB |

Focused on an event (desktop): 52 fps, 47 calls (frustum culling drops off-screen islands).
