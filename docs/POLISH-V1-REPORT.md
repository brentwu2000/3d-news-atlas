# POLISH-V1 — regression & acceptance report

Date: 2026-10-23 · Build: Next 16.4.2 production (`next build && next start`) · Data: 5 topics / 17 events / 8 relations (fictional).

## Screenshots

| Set | Contents |
|---|---|
| `docs/screenshots/before/` | Baseline before POLISH-V1 (light sky, clouds) — desktop 1440×900, mobile 390×844, fallback |
| `docs/screenshots/after/` | After steps 1-3 (geometry, lighting) |
| `docs/screenshots/v1-ui/` | After steps 4-5 (markers, camera, news UI) |
| `docs/screenshots/final/` | Final: `desktop`/`mobile` overview, `*-1-overview`, `*-2-focused`, `*-3-event`, `fallback-mobile` |

Each set has a `perf.json` produced by `scripts/measure.mjs`.

## Performance (headless Chromium + SwiftShader software renderer)

| | Before | After 1-3 | Final |
|---|---|---|---|
| Desktop FPS median (high preset) | 30 | 35 | 30-36 * |
| Desktop draw calls / triangles | 68 / 18.9k | 72 / 17.4k | 82 / 17.9k |
| Mobile FPS median (low preset) | 60 (cap) | 60 (cap) | 60 (cap) |
| Mobile draw calls / triangles | 37 / 5.7k | 48 / 8.8k | 58 / 9.3k |
| Geometries in memory | 19 | 20 | 22 |
| JS transfer, compressed | 429 KB | 431 KB | 483 KB |

\* Run-to-run variance on the CPU renderer is ±3 fps. Focused on an event: ~52 fps / 47 calls (off-screen islands culled).

**Not measured:** real mid-range desktop GPU and real phones. The POLISH-V1 targets (>= 45 fps desktop, >= 30 fps mobile)
therefore remain **unverified**. To measure on a device: open `/?debug=1` and read the overlay (FPS, ms, calls, tris, DPR).

## Acceptance checklist

| Item | Status | Evidence |
|---|---|---|
| Five islands visually distinct | Pass | screenshots; `island-generator.test.ts` "distinct prop vocabulary" |
| Deterministic reload screenshots (same viewport/seed) | Pass | e2e `reduced motion › reloads render identically` (pixel-identical, desktop + mobile) |
| No camera jumps on rapid selection / back-focus | Pass | e2e `rapid topic switching…` (10 switches + Escape ⇒ same pose as one clean selection); `user drag during a transition…` |
| Dragging does not select; marker click doesn't select parent island | Pass | e2e `dragging across an island…`, `sub-threshold wobble…`, `marker click has priority…` |
| 390 px: no horizontal overflow; touch + bottom sheet usable | Pass | e2e smoke overflow checks, `mobile panel › bottom sheet…` (touch tap on island) |
| Reduced motion removes camera tween and bobbing | Pass | e2e `camera changes are immediate`, `removes idle motion entirely` |
| Event content and sources accessible without WebGL | Pass | e2e `WebGL-disabled fallback…` (2D island buttons → panel → https source link); raw-HTML check in smoke test |
| Existing tests + camera interruption, gesture suppression, mobile panel tests | Pass | 139 unit, 37 e2e (9 platform-specific skips) |
| build, lint, typecheck, tests recorded | Pass | see below |

```
npm run typecheck   → pass
npm run lint        → pass
npm test            → 9 files, 139 tests passed
npm run test:e2e    → 37 passed, 9 skipped (desktop-only / mobile-only cases), 1 worker
npm run build       → pass, "/" prerendered static
```

## Known gaps

- Real-device FPS not measured (see above).
- URL sync uses `history.replaceState`; the browser Back button does not step through selections.
- Islands stop bobbing while *anything* is selected (spec allowed the selected island only; chosen for stable picking/arcs).
- Marker layout guarantees >= 0.95 unit spacing up to 24 events per island (`MARKER_CAPACITY`); beyond that markers may overlap.
- E2E runs with one worker: parallel workers starve each other's SwiftShader render loops.
