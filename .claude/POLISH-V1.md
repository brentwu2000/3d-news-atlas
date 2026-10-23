# 3D News Atlas — Visual & Interaction Polish V1

## Scope and constraints
This is an incremental upgrade to the existing MVP, not a rewrite. Inspect repository and existing screenshots first. Keep the current data model, source links, accessible list, 2D fallback and URL synchronization. Use original procedural art. Do not add news scraping, backend or external model dependencies.

## Art direction
Stylized low-poly diorama geometry with restrained cinematic lighting. News-focused, readable, calm; avoid horror, political bias through colors, or flashy game-like effects. Palette: deep navy backdrop (#101B2B), muted stone (#667080), warm sand (#C4AD83), foliage (#587D6B), neutral highlight (#E9D9AD). These are art tokens, not editorial status signals. UI cards use high-contrast text and subdued translucent surfaces. Use CSS design tokens so palette is replaceable.

## Geometry improvements
- Five identifiable presets: city, forest, industry, coast, civic. Same coherent geometry language; different silhouettes and props.
- Each island: irregular upper polygon outline, layered tapered underside (2-3 rings), vertex color variation, optional flat-shaded rock facets; no obvious cylinders/cones stacked without composition.
- Use deterministic seeded random generation; no Math.random in render. Generate geometry in useMemo; dispose only owned resources.
- Props: grouped reusable low-poly building, tree, rock and landmark components. Instancing for repeated items. Keep event markers above terrain and avoid z-fighting.
- Space islands to avoid silhouette overlaps in standard overview camera; preserve minimum target size on mobile.

## Lighting and atmosphere
- Ambient/hemisphere fill plus one warm directional key, subtle rim where affordable. Soft shadows only on desktop high-quality preset; avoid excessive shadow map sizes.
- Lightweight depth fog and sparse slow-moving particles (<=100 desktop, <=30 mobile) with deterministic positions; no postprocessing bloom in initial pass.
- Subtle idle bob amplitude <=0.12 world units and slow period >=6s; selected island may stop bobbing to stabilize camera and pointer targeting.
- Prefer a single shared Canvas, and disable continuous updates when scene is idle if feasible; measure before optimizing.

## Camera and input
States: overview, focusing, focused, returning. Single CameraDirector owns camera pose and OrbitControls target. GSAP tweens start from current pose, kill previous tween on new selection, and clean up on unmount. Do not create competing controls animations. Default transition 0.9-1.3s, ease power2.inOut; reduced motion immediate. Overview restores previous user orbit when returning if safe; otherwise canonical overview.
- Hover: cursor and soft outline/emissive accent only, no geometry mutation that leaks across islands.
- Drag threshold >=6 CSS pixels suppresses click; touch tap and pinch work; no accidental selection while orbiting.
- Focus: selected island occupies approximately 35-55% of viewport width on desktop, less on mobile with panel; clamp camera distance, prevent clipping and motion sickness.
- Marker click has priority over island click, and opens panel; escape closes panel/returns overview. Visible focus and keyboard-accessible parallel list.

## News UI
- Header: title, short description, search, category filter.
- Desktop: left compact topic navigation; right event detail drawer. Mobile: collapsible bottom sheet not blocking 3D canvas entirely.
- Each event shows title, occurred date, publisher, source URL, and status label in text. Never infer truth from hue, island size, or effects. Relation arcs show relationship type and explanation on selection; causal claims must have explicit citations.
- Timeline stays accessible via keyboard, labels event counts and dates; paused on selection unless user explicitly resumes.
- Show loading, empty results, no-WebGL and data-error states with useful text.

## Performance budgets (targets, not guarantees)
- Five islands, fifteen events, six relations: target >=45 FPS on representative midrange desktop and >=30 FPS on representative mobile in production build; measure and report device/browser.
- Initial loaded JS and assets: report measured transfer size; avoid adding large art packs. Limit device pixel ratio: desktop <=1.5, mobile <=1.0 low preset.
- Use instanced props, memoized geometry, minimal transparent surfaces, no shadow-casting for small props. Inspect draw calls and triangles with renderer.info.
- Respect prefers-reduced-motion; pause idle animations when document hidden.

## Implementation order
1. Baseline screenshots, FPS/draw-call snapshot, existing tests and known defects.
2. Refactor geometry into reusable island base and five themed presets without breaking click handlers.
3. Introduce lighting, fog, gentle bob and quality preset; verify WebGL fallback.
4. Centralize camera transitions and pointer gesture arbitration.
5. Polish responsive news panels, timeline, hover and keyboard navigation.
6. Regression, screenshot comparisons and measured performance report.

## Acceptance checklist
- All five islands visually distinct; deterministic reload screenshots under same viewport and seed.
- No camera jumps on repeated fast island selection or rapid back/focus actions.
- Dragging does not select islands; event marker click does not select parent island.
- 390px wide mobile has no horizontal overflow; touch controls and bottom sheet usable.
- Reduced motion removes camera tween and island bobbing.
- Event content and sources accessible when WebGL unavailable.
- Existing unit and E2E tests pass, plus camera interruption, gesture suppression, and mobile panel tests.
- Run build, lint, typecheck, tests and record exact results; if any unavailable, explain.

## Claude Code execution prompt
Read CLAUDE.md and POLISH-V1.md. Inspect the existing repository first. Implement only steps 1-3 (baseline, procedural geometry, lighting) in this iteration. Preserve existing behavior and editorial/accessibility constraints. Take before/after screenshots at desktop 1440x900 and mobile 390x844 if browser tooling exists. Report screenshots, changed files, measured FPS/draw calls if available, and results of build/typecheck/lint/tests. Do not claim tests or screenshots were run unless executed. Stop for visual approval before implementing camera and UI changes.
