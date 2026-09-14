/**
 * Hand-rolled force-directed layout.
 *
 * The overview graph view runs a small velocity-Verlet simulation on at
 * most `GRAPH_NODE_CAP` (200) nodes, so the naive O(N^2) repulsive-force
 * loop is fine — 200^2 = 40k pair evaluations per step, well under a ms
 * on any modern laptop. Barnes-Hut would only pay off past a few
 * thousand nodes; we deliberately draw fewer than that.
 *
 * The simulator is a pure function of `(nodes, edges, options)`. It
 * mutates the passed `nodes` array in place (Node.x / .y / .vx / .vy)
 * so the caller can drive it either as one big `simulate(steps)` call
 * or as a per-frame `simulateStep()` inside a `requestAnimationFrame`
 * loop — the SVG view uses the latter so the graph "settles" visibly.
 *
 * Forces:
 *   - Coulomb-like repulsion between every pair of nodes:
 *         F_rep = -k_rep / max(r, MIN_DIST)^2   (repulsive along axis)
 *   - Hookean attraction along every edge, scaled by `edge.strength`:
 *         F_spring = k_spring * strength * (r - restLength)
 *   - Centering pull toward the canvas centre so the graph doesn't
 *     drift off-screen:
 *         F_center = k_center * (centre - pos)
 *   - Velocity damping each step to guarantee the simulation cools
 *     down instead of oscillating forever:
 *         v *= (1 - damping)
 *
 * None of this touches the DOM. The React view calls `simulateStep`
 * from its animation loop and reads back `nodes[i].x/y` when it
 * re-renders — pure data in, pure data out, unit-testable.
 */

export type SimNode = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /**
   * Simple radius used only to keep the repulsion loop honest — nodes
   * never quite land on the same pixel. Not a rendering hint.
   */
  radius?: number;
};

export type SimEdge = {
  fromId: string;
  toId: string;
  strength: number;
};

export type LayoutOptions = {
  width: number;
  height: number;
  /** Repulsive constant. Larger = more spread out. */
  repulsion?: number;
  /** Spring constant on connected pairs. Larger = tighter clusters. */
  springStrength?: number;
  /** Ideal edge rest length in pixels. */
  restLength?: number;
  /** Center-pulling constant. Keep low; too high flattens the graph. */
  centerStrength?: number;
  /** Per-step velocity damping in [0,1). 0 = frictionless. */
  damping?: number;
  /** Integration time-step. Kept at 1.0 for stability with our units. */
  dt?: number;
  /** Absolute cap on per-step velocity magnitude; guards against blow-up. */
  maxVelocity?: number;
};

export type ResolvedLayoutOptions = Required<LayoutOptions>;

/**
 * Sensible defaults tuned for ~30-100 nodes in a ~900x600 canvas. The
 * SVG view is free to pass overrides, but these produce a stable
 * settling layout in under ~200 iterations.
 */
export const DEFAULT_LAYOUT_OPTIONS: Omit<ResolvedLayoutOptions, "width" | "height"> = {
  repulsion: 6000,
  springStrength: 0.02,
  restLength: 90,
  centerStrength: 0.01,
  damping: 0.15,
  dt: 1,
  maxVelocity: 30,
};

/** Minimum pair distance used in the 1/r^2 term to avoid singularities. */
const MIN_PAIR_DIST = 1;

export function resolveLayoutOptions(opts: LayoutOptions): ResolvedLayoutOptions {
  return {
    ...DEFAULT_LAYOUT_OPTIONS,
    ...opts,
  };
}

/**
 * Deterministic circular initial layout. Uses the golden-angle spiral
 * so nodes are spread evenly regardless of count. The RNG-free layout
 * keeps unit tests reproducible.
 */
export function initialLayout(ids: readonly string[], width: number, height: number): SimNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.35;
  const golden = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.399963...
  return ids.map((id, i) => {
    const t = i / Math.max(1, ids.length - 1);
    const r = radius * Math.sqrt(t);
    const theta = i * golden;
    return {
      id,
      x: cx + r * Math.cos(theta),
      y: cy + r * Math.sin(theta),
      vx: 0,
      vy: 0,
      radius: 8,
    };
  });
}

/**
 * Advance the simulation by one step. Mutates `nodes` in place and
 * returns them for chaining. Node positions and velocities are updated
 * according to the force model documented at the top of this file.
 *
 * The order of operations matters for velocity-Verlet stability:
 *   1. accumulate all forces into a per-node (ax, ay)
 *   2. update velocity: v += a * dt
 *   3. damp velocity: v *= (1 - damping)
 *   4. clamp velocity magnitude to `maxVelocity`
 *   5. update position: x += v * dt
 *   6. clamp position to canvas bounds so nodes don't fly off-screen
 */
export function simulateStep(
  nodes: SimNode[],
  edges: readonly SimEdge[],
  opts: LayoutOptions,
): SimNode[] {
  const o = resolveLayoutOptions(opts);
  const n = nodes.length;
  if (n === 0) return nodes;

  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const idx = new Map<string, number>();
  for (let i = 0; i < n; i++) idx.set(nodes[i].id, i);

  // 1a. Pairwise repulsion. O(N^2) — fine at N <= 200.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      let r2 = dx * dx + dy * dy;
      if (r2 < MIN_PAIR_DIST * MIN_PAIR_DIST) r2 = MIN_PAIR_DIST * MIN_PAIR_DIST;
      const r = Math.sqrt(r2);
      // Force magnitude = repulsion / r^2, direction = (dx,dy)/r
      const f = o.repulsion / r2;
      const fx = (f * dx) / r;
      const fy = (f * dy) / r;
      ax[i] += fx;
      ay[i] += fy;
      ax[j] -= fx;
      ay[j] -= fy;
    }
  }

  // 1b. Edge springs.
  for (const e of edges) {
    const i = idx.get(e.fromId);
    const j = idx.get(e.toId);
    if (i === undefined || j === undefined || i === j) continue;
    const dx = nodes[j].x - nodes[i].x;
    const dy = nodes[j].y - nodes[i].y;
    const r = Math.hypot(dx, dy) || MIN_PAIR_DIST;
    const stretch = r - o.restLength;
    const f = o.springStrength * (e.strength || 1) * stretch;
    const fx = (f * dx) / r;
    const fy = (f * dy) / r;
    ax[i] += fx;
    ay[i] += fy;
    ax[j] -= fx;
    ay[j] -= fy;
  }

  // 1c. Center pull.
  const cx = o.width / 2;
  const cy = o.height / 2;
  for (let i = 0; i < n; i++) {
    ax[i] += (cx - nodes[i].x) * o.centerStrength;
    ay[i] += (cy - nodes[i].y) * o.centerStrength;
  }

  // 2-6. Integrate.
  const decay = 1 - o.damping;
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    let vx = (node.vx + ax[i] * o.dt) * decay;
    let vy = (node.vy + ay[i] * o.dt) * decay;
    const speed = Math.hypot(vx, vy);
    if (speed > o.maxVelocity) {
      vx = (vx / speed) * o.maxVelocity;
      vy = (vy / speed) * o.maxVelocity;
    }
    node.vx = vx;
    node.vy = vy;
    node.x = clamp(node.x + vx * o.dt, 0, o.width);
    node.y = clamp(node.y + vy * o.dt, 0, o.height);
  }

  return nodes;
}

/**
 * Run the simulation for `steps` iterations. Convenience wrapper for
 * headless callers (tests, screenshots) that don't want a rAF loop.
 */
export function simulate(
  nodes: SimNode[],
  edges: readonly SimEdge[],
  opts: LayoutOptions,
  steps: number,
): SimNode[] {
  for (let s = 0; s < steps; s++) simulateStep(nodes, edges, opts);
  return nodes;
}

/**
 * Kinetic energy summed across the node set — 1/2 sum(m*v^2), with m=1.
 * The animation loop uses this to decide when the graph has "settled"
 * enough to stop stepping; tests use it to assert damping actually
 * cools the system.
 */
export function totalKineticEnergy(nodes: readonly SimNode[]): number {
  let ke = 0;
  for (const n of nodes) ke += n.vx * n.vx + n.vy * n.vy;
  return 0.5 * ke;
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
