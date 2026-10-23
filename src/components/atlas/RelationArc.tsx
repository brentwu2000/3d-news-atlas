"use client";

import { Html, QuadraticBezierLine } from "@react-three/drei";
import type { Vec3 } from "@/lib/island-generator";
import { RELATION_LABELS } from "@/lib/labels";
import type { RelationType } from "@/lib/schema";

interface RelationArcProps {
  from: Vec3;
  to: Vec3;
  type: RelationType;
  color: string;
}

/**
 * Curved link between two event markers. Only explicitly curated relations
 * are drawn. Type is distinguished by line style + text label; the line
 * colour is the same for every type so it never implies truth or strength.
 */
export function RelationArc({ from, to, type, color }: RelationArcProps) {
  const distance = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const mid: Vec3 = [(from[0] + to[0]) / 2, Math.max(from[1], to[1]) + 1.5 + distance * 0.18, (from[2] + to[2]) / 2];
  const labelPos: Vec3 = [mid[0], (mid[1] + Math.max(from[1], to[1])) / 2 + 0.6, mid[2]];
  return (
    <group raycast={() => null}>
      <QuadraticBezierLine
        start={from}
        end={to}
        mid={mid}
        color={color}
        lineWidth={2}
        dashed={type === "causal_claim"}
        dashSize={0.5}
        gapSize={0.35}
        raycast={() => null}
      />
      <Html position={labelPos} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
        <span aria-hidden="true" className="rounded bg-slate-950/80 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-slate-100 ring-1 ring-white/15">
          {RELATION_LABELS[type]}
        </span>
      </Html>
    </group>
  );
}
