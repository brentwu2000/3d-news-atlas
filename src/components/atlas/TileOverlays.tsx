"use client";

import { Html, Line } from "@react-three/drei";
import { memo, useMemo, useRef } from "react";
import { isTap } from "@/lib/gestures";
import { hexCorner, TILE_APOTHEM, TILE_SIZE } from "@/lib/hex";
import type { IslandPlacement } from "@/lib/layout";
import type { Topic } from "@/lib/schema";
import { useAtlasStore } from "@/store/atlas-store";

const OUTLINE_Y = 0.09;
const SELECT_COLOR = "#e0412f";
const HOVER_COLOR = "#ffffff";

function hexLoop(p: IslandPlacement, scale: number): [number, number, number][] {
  return Array.from({ length: 7 }, (_, i) => {
    const [x, z] = hexCorner(i % 6, TILE_SIZE * scale);
    return [p.x + x, OUTLINE_Y, p.z + z];
  });
}

/** Dashed hex outline for the selected (red) and hovered (white) tile. */
export function TileOutlines({
  placements,
  selectedTopicId,
  hoveredTopicId,
}: {
  placements: readonly IslandPlacement[];
  selectedTopicId: string | null;
  hoveredTopicId: string | null;
}) {
  const selected = placements.find((p) => p.topicId === selectedTopicId);
  const hovered = hoveredTopicId !== selectedTopicId ? placements.find((p) => p.topicId === hoveredTopicId) : undefined;
  const selectedPoints = useMemo(() => (selected ? hexLoop(selected, 0.97) : null), [selected]);
  const hoveredPoints = useMemo(() => (hovered ? hexLoop(hovered, 0.97) : null), [hovered]);
  return (
    <group raycast={() => null}>
      {selectedPoints && (
        <Line points={selectedPoints} color={SELECT_COLOR} lineWidth={3.5} dashed dashSize={0.6} gapSize={0.3} raycast={() => null} />
      )}
      {hoveredPoints && (
        <Line points={hoveredPoints} color={HOVER_COLOR} lineWidth={2} dashed dashSize={0.45} gapSize={0.3} raycast={() => null} />
      )}
    </group>
  );
}

/**
 * Number + short-name pill at the front edge of each tile. Mouse shortcut
 * only: the accessible equivalent is the index list, so these are aria-hidden.
 */
function TileLabelsImpl({
  topics,
  placements,
  selectedTopicId,
}: {
  topics: readonly Topic[];
  placements: readonly IslandPlacement[];
  selectedTopicId: string | null;
}) {
  // Labels move with the camera while orbiting, so a drag can start and end on
  // the same label: apply the same tap threshold as 3D picks.
  const down = useRef<{ x: number; y: number } | null>(null);
  return (
    <>
      {placements.map((p, i) => {
        const topic = topics[i];
        if (!topic) return null;
        const selected = topic.id === selectedTopicId;
        return (
          <Html key={p.topicId} position={[p.x, 0.15, p.z + TILE_APOTHEM * 0.93]} center zIndexRange={[6, 0]}>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              data-selected={selected || undefined}
              onPointerDown={(e) => {
                down.current = { x: e.clientX, y: e.clientY };
              }}
              onClick={(e) => {
                const start = down.current;
                down.current = null;
                if (start && !isTap(Math.hypot(e.clientX - start.x, e.clientY - start.y))) return;
                useAtlasStore.getState().selectTopic(topic.id);
              }}
              className="tile-pill"
            >
              <span className="tile-pill-num">{String(p.index).padStart(2, "0")}</span>
              <span className="tile-pill-name">{topic.shortTitle}</span>
            </button>
          </Html>
        );
      })}
    </>
  );
}

export const TileLabels = memo(TileLabelsImpl);
