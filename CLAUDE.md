# 3D News Atlas — Claude Code implementation specification

## Goal
Build a browser-based interactive 3D news atlas inspired by floating-island exploration interfaces. Use original assets and original implementation. An island represents a topic cluster; buildings/markers represent individual events; curved links represent explicitly curated relationships. The MVP uses local JSON, with no backend or external news scraping.

## Stack
Next.js App Router, TypeScript strict, React Three Fiber, Three.js, @react-three/drei, GSAP, Zustand, Tailwind CSS, Zod, Vitest, Playwright. Use compatible current stable versions and document exact versions installed. Client-only dynamic import for WebGL scene (`ssr:false`) from a Client Component; server-render indexable event text separately.

## UX and accessibility
Desktop: orbit/pan/zoom world, hover highlights, click to focus, click marker to open event detail, back to overview, search, filters, timeline with play/pause/scrub, reduced-motion mode. Mobile: touch orbit and pinch zoom, adaptive layout, low quality rendering preset. Keyboard-accessible event list provides equivalent navigation to 3D picks. All event detail must remain readable without WebGL. WebGL failure must show accessible 2D fallback. Respect prefers-reduced-motion; pause rendering when tab hidden if practical.

## Architecture
src/app/page.tsx; src/components/atlas/AtlasClient.tsx; src/components/atlas/WorldScene.tsx; src/components/atlas/Island.tsx; src/components/atlas/EventMarker.tsx; src/components/atlas/RelationArc.tsx; src/components/atlas/CameraDirector.tsx; src/components/ui/EventPanel.tsx; src/components/ui/Timeline.tsx; src/components/ui/Filters.tsx; src/lib/schema.ts; src/lib/normalize.ts; src/lib/layout.ts; src/lib/island-generator.ts; src/lib/timeline.ts; src/store/atlas-store.ts; src/data/topics.json; src/data/events.json; src/data/relations.json; tests/.

## Data model
Topic: id, title, description, category, seed, theme, optional locationLabel. Event: id, topicId, title, summary, occurredAt (ISO 8601), publishedAt (ISO 8601), sources [{title,url,publisher,publishedAt}], tags[], status (reported|verified|disputed|corrected), optional latitude/longitude (not required for island placement). Relation: id, fromEventId, toEventId, type (related|chronological|causal_claim), explanation, sourceIds[]. Never infer causal links from mere temporal correlation. Topic/island x,z positions are visual layout coordinates, not geographic coordinates.

## Rendering
Deterministic seeded procedural islands. Meshes and materials reused; geometry count bounded. Five island presets (city, forest, industry, coast, civic). Low-poly silhouette with floating tapered rock base, upper terrain surface, simple props. Prefer instanced meshes for repeated trees and rocks; cap DPR at 1.5 on desktop and 1 on low-quality mobile; adaptive shadow settings. Do not create a separate canvas per island. Avoid uncontrolled per-frame React state updates. No licensed third-party models without recording author/license/attribution in ASSETS.md.

## Interactions
Raycast island/marker clicks; pointer events should not trigger click after dragging. CameraDirector owns transitions, uses GSAP tween cancellation on selection changes and unmount. Overview and focused states must have deterministic camera poses. Timeline filters events by occurredAt, with explicit handling of missing/invalid dates (reject in schema). Search indexes title/summary/tags and filters both list and 3D markers. URL query params synchronize selected topic/event and date filter for shareable links; avoid infinite router/store loops.

## Editorial safety
Use fictional clearly labeled sample stories in fixtures, not invented real news. Always show source publisher, link, date, and status. Do not use color/size to imply truth or severity. Label claims and disputed material, allow corrections. Never copy source article full text. Escape user-controlled content and validate links (http/https only). No analytics or user tracking in MVP.

## Implementation phases and acceptance
P0 Bootstrap: project runs locally; strict TS, lint, tests; WebGL fallback.
P1 World: 5 deterministic floating islands, orbit/zoom, performant on desktop and mobile.
P2 Interaction: island focus and overview transitions; marker selection; event panel; keyboard equivalent.
P3 Data: Zod schema, JSON fixtures with >=5 topics, >=15 fictional events, >=6 curated relations; invalid data tests.
P4 Timeline: scrub, play/pause, search, category filters; all state consistent with visible markers.
P5 Polish: loading/error states, responsive controls, reduced motion, URL deep links, performance instrumentation, asset license documentation.

Acceptance: `npm run build`, typecheck, lint, unit tests pass; Playwright desktop/mobile smoke tests pass; no hydration error; switching focus rapidly never leaves camera in inconsistent state; WebGL-disabled fallback still exposes event data; no horizontal overflow at 390px viewport; tested with 5 topics/15 events and documented scalability limits.

## Instructions to Claude Code
1. Inspect the existing repository and package manager; preserve existing conventions.
2. Write a short implementation plan and directory tree; implement P0 then P1 first, not the entire project in one pass.
3. Install compatible versions; document any API changes.
4. Implement each phase with tests, run commands, and report pass/fail honestly.
5. After P1, provide screenshots or manual QA instructions and wait for feedback before P2.
6. Do not fetch or reproduce source website's proprietary JS/models/assets; implement equivalent interactions independently.
