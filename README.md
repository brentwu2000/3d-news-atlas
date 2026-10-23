# 3D News Atlas

Interactive 3D atlas of news topics rendered as floating islands. See `CLAUDE.md` for the full spec.
**Status: P0-P5 done except real-device performance measurement; POLISH-V1 steps 1-6 done (see `docs/POLISH-V1-REPORT.md`).** Data is local, fictional, clearly labelled sample content; no backend, no news API.

## Scripts (npm)

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` (strict + `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint 9 flat config (`eslint-config-next` core-web-vitals + typescript) |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright smoke + interaction tests, desktop (1440×900) + mobile (Pixel 7, 390×844), 1 worker (SwiftShader is CPU-bound). Builds and starts the app on port 3100. First run: `npx playwright install chromium` |

QA URL switches: `?webgl=0` forces the 2D fallback; `?quality=low|high` overrides auto-detected quality;
`?debug=1` shows live FPS / draw calls / triangles and exposes `window.__ATLAS_STATS__`.

Performance + screenshot capture: `npm run build && npx next start -p 3100`, then
`node scripts/measure.mjs <label>` → `docs/screenshots/<label>/{desktop,mobile,fallback-mobile}.png` + `perf.json`.

## Installed versions (exact)

next 16.4.2 · react / react-dom 19.3.1 · three 0.186.1 · @react-three/fiber 9.8.2 · @react-three/drei 10.7.9 · gsap 3.15.0 · zustand 5.0.16 · zod 4.6.7 · tailwindcss / @tailwindcss/postcss 4.3.3 · typescript 6.0.3 · eslint 9.39.5 · eslint-config-next 16.4.2 · vitest 5.0.5 · jsdom 30.1.3 · @playwright/test 1.64.1 · Node 22.12 / npm 10.9

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
  app/            layout.tsx, page.tsx (static; renders AtlasApp or DataErrorState), globals.css (art + UI tokens)
  components/
    AtlasApp.tsx  client root (server-rendered): header, nav, canvas, drawer/sheet, timeline,
                  URL sync (history.replaceState), Escape handling, focus restore
    atlas/        AtlasClient (WebGL detection, quality, fallback), WorldScene (dynamic ssr:false, single Canvas),
                  Island, EventMarker (instanced markers + invisible hit proxies), RelationArc, CameraDirector,
                  DebugBridge + PerfProbe (?debug=1 only), materials, SceneErrorBoundary, WebGLFallback (2D buttons)
    ui/           Filters (search + category chips), EventNavigator (keyboard list), EventPanel, Timeline, DataErrorState
  lib/            schema (Zod), data (safe load), normalize (indices + filtering), timeline, url-state, camera,
                  markers, gestures, labels, island-generator, island-geometry, layout, art-tokens, color,
                  particles, quality, webgl, hooks, random
  store/          atlas-store (zustand; pure `transitions` are unit-tested)
  data/           topics.json (5), events.json (17), relations.json (8) — all fictional
tests/unit (Vitest), tests/e2e (Playwright: smoke + interaction)
```

### Data model notes
Matches CLAUDE.md, with three additive fields needed for editorial safety:
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
  completion (0.9-1.3 s window, 1.1 s, power2.inOut; immediate with reduced motion). Focus frames the island at 45 %
  (desktop) / 40 % (mobile) of canvas width, centred in the area not covered by the drawer. Returning restores the user's
  previous orbit if it is still within orbit limits, otherwise the canonical overview.
- Clicks with pointer travel >= 6 CSS px are ignored (orbit/pan/pinch). Marker hits stop propagation, so they win over islands.
  Hover shows an outline ribbon (own material) + cursor; nothing mutates shared materials or geometry.
- Islands stop bobbing while anything is selected (stable picking and arcs). Selecting anything pauses the timeline.
- Keyboard: every island/marker pick has a list button; Enter opens, Escape closes the event, then the topic; focus moves to the
  panel heading on open and back to the list item on close. Range input + play/pause for the timeline.
- URL: `topic`, `event`, `until` (YYYY-MM-DD), `q`, `cat` (comma list). Parsed once after hydration (no hydration mismatch),
  unknown values dropped, written with `replaceState` only when the string changes (no router/store loop).

QA switches (not part of shareable state): `?webgl=0`, `?quality=low|high`, `?debug=1` (stats overlay,
`window.__ATLAS_STATS__`, `window.__ATLAS_DEBUG__` used by E2E to aim pointer events at 3D objects).

## Scalability limits (measured with 5 topics / 17 events / 8 relations)

- Layout: ring for <= 7 topics, phyllotaxis spiral beyond; unit-tested non-overlapping up to 50 topics. On-screen silhouette
  overlap is only verified for the bundled 5-topic fixture.
- Per island: ~12-16 draw calls (terrain, base, <= 14 instanced prop groups, 2 marker meshes) + 1 DOM label. Markers are
  instanced per island, so events add no draw calls. Marker layout prefers >= 1.6 units spacing, relaxing to >= 0.95
  for crowded islands; clean spacing is unit-tested up to 24 events per island (`MARKER_CAPACITY`). Beyond that markers
  may overlap — clustering would be needed.
- Search is a linear scan over pre-lowercased text: fine for thousands of events, not for a large archive.
- Beyond ~30 islands, labels and per-island meshes should move to LOD / merged instancing.

## POLISH-V1 (steps 1-3)

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
