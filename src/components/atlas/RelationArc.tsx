"use client";

import { Html, QuadraticBezierLine } from "@react-three/drei";
import { RELATION_LABELS } from "@/lib/labels";
import type { RelationType } from "@/lib/schema";
import type { Vec3 } from "@/lib/tile-generator";

interface RelationArcProps {
  from: Vec3;
  to: Vec3;
  type: RelationType;
  /** Show the relation-type label at the arc's apex. */
  labelled: boolean;
}

/** Same colour for every relation type: it never implies truth or strength. */
const ARC_COLOR = "#e0412f";

/**
 * Curved link between two event beacons. Only explicitly curated relations
 * are drawn; the type is shown as text (and causal claims are dashed more
 * finely), never by colour.
 */
export function RelationArc({ from, to, type, labelled }: RelationArcProps) {
  const distance = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const apex = 2.5 + distance * 0.22;
  const mid: Vec3 = [(from[0] + to[0]) / 2, apex * 2 - 2, (from[2] + to[2]) / 2];
  const labelPos: Vec3 = [mid[0], apex, mid[2]];
  const causal = type === "causal_claim";
  return (
    <group raycast={() => null}>
      <QuadraticBezierLine
        start={[from[0], 2.4, from[2]]}
        end={[to[0], 2.4, to[2]]}
        mid={mid}
        color={ARC_COLOR}
        lineWidth={2.5}
        dashed
        dashSize={causal ? 0.25 : 0.7}
        gapSize={causal ? 0.25 : 0.35}
        raycast={() => null}
      />
      {labelled && (
        <Html position={labelPos} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
          <span aria-hidden="true" className="arc-pill">
            {RELATION_LABELS[type]}
          </span>
        </Html>
      )}
    </group>
  );
}
