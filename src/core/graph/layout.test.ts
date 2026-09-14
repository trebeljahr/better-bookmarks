/**
 * Unit tests for the hand-rolled force-directed layout.
 *
 * We don't try to assert exact positions after N steps — the whole
 * point of a physical simulation is that it wanders and settles. What
 * we CAN assert cheaply and reliably:
 *
 *   1. `initialLayout` is deterministic and stays inside the canvas.
 *   2. One step of `simulateStep` pushes two overlapping nodes apart
 *      (repulsion works), and clamps them inside canvas bounds.
 *   3. An edge pulls two nodes closer when they sit far past
 *      `restLength` (spring works), and pushes them apart when they sit
 *      well below it.
 *   4. Damping actually reduces kinetic energy across successive steps
 *      of a system with no persistent driving force.
 *   5. Positions stay finite (no NaN, no Infinity) after a long run
 *      even for pathological input (identical positions, huge edges,
 *      etc.).
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT_OPTIONS,
  initialLayout,
  type SimEdge,
  type SimNode,
  simulate,
  simulateStep,
  totalKineticEnergy,
} from "./layout";

const CANVAS = { width: 800, height: 600 } as const;

function clone(nodes: readonly SimNode[]): SimNode[] {
  return nodes.map((n) => ({ ...n }));
}

describe("initialLayout", () => {
  it("returns one node per id in the input array, deterministically", () => {
    const a = initialLayout(["a", "b", "c"], 800, 600);
    const b = initialLayout(["a", "b", "c"], 800, 600);
    expect(a).toHaveLength(3);
    expect(a).toEqual(b);
  });

  it("places every node inside canvas bounds and starts them at rest", () => {
    const nodes = initialLayout(
      Array.from({ length: 50 }, (_, i) => `n${i}`),
      800,
      600,
    );
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(800);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(600);
      expect(n.vx).toBe(0);
      expect(n.vy).toBe(0);
    }
  });

  it("handles a single node without dividing by zero", () => {
    const [n] = initialLayout(["solo"], 800, 600);
    expect(Number.isFinite(n.x)).toBe(true);
    expect(Number.isFinite(n.y)).toBe(true);
  });
});

describe("simulateStep — repulsion", () => {
  it("pushes two nearly-coincident nodes apart", () => {
    const nodes: SimNode[] = [
      { id: "a", x: 400, y: 300, vx: 0, vy: 0 },
      { id: "b", x: 401, y: 300, vx: 0, vy: 0 },
    ];
    // No edges, no centering worth mentioning at this small distance.
    simulateStep(nodes, [], { ...CANVAS, centerStrength: 0 });
    const distAfter = Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y);
    expect(distAfter).toBeGreaterThan(1);
  });

  it("keeps positions finite for two exactly-coincident nodes", () => {
    // The MIN_PAIR_DIST guard is the whole reason this test exists.
    const nodes: SimNode[] = [
      { id: "a", x: 400, y: 300, vx: 0, vy: 0 },
      { id: "b", x: 400, y: 300, vx: 0, vy: 0 },
    ];
    simulateStep(nodes, [], { ...CANVAS, centerStrength: 0 });
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("clamps positions inside canvas bounds after each step", () => {
    const nodes: SimNode[] = [
      // Sitting on the right edge with a huge outward velocity.
      { id: "a", x: 799, y: 300, vx: 1000, vy: 0 },
    ];
    simulateStep(nodes, [], { ...CANVAS, centerStrength: 0 });
    expect(nodes[0].x).toBeLessThanOrEqual(CANVAS.width);
    expect(nodes[0].x).toBeGreaterThanOrEqual(0);
  });
});

describe("simulateStep — springs", () => {
  it("pulls two nodes closer together when they sit past restLength", () => {
    const nodes: SimNode[] = [
      { id: "a", x: 100, y: 300, vx: 0, vy: 0 },
      { id: "b", x: 700, y: 300, vx: 0, vy: 0 },
    ];
    const edges: SimEdge[] = [{ fromId: "a", toId: "b", strength: 1 }];
    const before = Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y);
    // Disable centering AND repulsion so we can isolate the spring effect.
    simulate(clone(nodes), edges, { ...CANVAS, centerStrength: 0, repulsion: 0 }, 1);
    simulateStep(nodes, edges, { ...CANVAS, centerStrength: 0, repulsion: 0 });
    const after = Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y);
    expect(after).toBeLessThan(before);
  });

  it("pushes two connected nodes apart when they sit well below restLength", () => {
    const nodes: SimNode[] = [
      { id: "a", x: 395, y: 300, vx: 0, vy: 0 },
      { id: "b", x: 405, y: 300, vx: 0, vy: 0 },
    ];
    const edges: SimEdge[] = [{ fromId: "a", toId: "b", strength: 1 }];
    const before = Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y);
    simulateStep(nodes, edges, { ...CANVAS, centerStrength: 0, repulsion: 0 });
    const after = Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y);
    expect(after).toBeGreaterThan(before);
  });

  it("scales spring force by edge.strength (stronger = pulls harder)", () => {
    const mkPair = () => [
      { id: "a", x: 100, y: 300, vx: 0, vy: 0 },
      { id: "b", x: 700, y: 300, vx: 0, vy: 0 },
    ];
    const weak = mkPair();
    const strong = mkPair();
    const opts = { ...CANVAS, centerStrength: 0, repulsion: 0 };
    simulateStep(weak, [{ fromId: "a", toId: "b", strength: 0.1 }], opts);
    simulateStep(strong, [{ fromId: "a", toId: "b", strength: 5 }], opts);
    const dWeak = Math.hypot(weak[0].x - weak[1].x, weak[0].y - weak[1].y);
    const dStrong = Math.hypot(strong[0].x - strong[1].x, strong[0].y - strong[1].y);
    // Both should have shortened, but strong shortens more.
    expect(dStrong).toBeLessThan(dWeak);
  });

  it("ignores edges whose endpoint ids do not appear in the node set", () => {
    const nodes: SimNode[] = [
      { id: "a", x: 400, y: 300, vx: 0, vy: 0 },
      { id: "b", x: 500, y: 300, vx: 0, vy: 0 },
    ];
    // "ghost" is not in nodes; must not throw or NaN out.
    const edges: SimEdge[] = [{ fromId: "a", toId: "ghost", strength: 1 }];
    simulateStep(nodes, edges, { ...CANVAS });
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });
});

describe("simulateStep — center pull", () => {
  it("moves a lone node toward the canvas centre", () => {
    const nodes: SimNode[] = [{ id: "a", x: 50, y: 50, vx: 0, vy: 0 }];
    simulateStep(nodes, [], { ...CANVAS });
    const distBefore = Math.hypot(50 - CANVAS.width / 2, 50 - CANVAS.height / 2);
    const distAfter = Math.hypot(nodes[0].x - CANVAS.width / 2, nodes[0].y - CANVAS.height / 2);
    expect(distAfter).toBeLessThan(distBefore);
  });
});

describe("simulate — full run", () => {
  it("cools down over time when there is no persistent driving force", () => {
    // Perturbed but structurally still — no incoming energy, so damping
    // should bleed off the initial kick over enough steps.
    const nodes: SimNode[] = [
      { id: "a", x: 300, y: 300, vx: 20, vy: -10 },
      { id: "b", x: 500, y: 300, vx: -15, vy: 5 },
      { id: "c", x: 400, y: 500, vx: 5, vy: 10 },
    ];
    const edges: SimEdge[] = [
      { fromId: "a", toId: "b", strength: 1 },
      { fromId: "b", toId: "c", strength: 1 },
    ];
    const opts = { ...CANVAS, ...DEFAULT_LAYOUT_OPTIONS };
    simulate(nodes, edges, opts, 5);
    const ke5 = totalKineticEnergy(nodes);
    simulate(nodes, edges, opts, 200);
    const ke205 = totalKineticEnergy(nodes);
    expect(ke205).toBeLessThan(ke5);
  });

  it("keeps every position finite after a long run on a dense graph", () => {
    const ids = Array.from({ length: 60 }, (_, i) => `n${i}`);
    const nodes = initialLayout(ids, CANVAS.width, CANVAS.height);
    const edges: SimEdge[] = [];
    // Fully connect the first 10 nodes — worst-case spring pressure.
    for (let i = 0; i < 10; i++) {
      for (let j = i + 1; j < 10; j++) {
        edges.push({ fromId: `n${i}`, toId: `n${j}`, strength: 1 });
      }
    }
    simulate(nodes, edges, CANVAS, 300);
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(Number.isFinite(n.vx)).toBe(true);
      expect(Number.isFinite(n.vy)).toBe(true);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(CANVAS.width);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(CANVAS.height);
    }
  });

  it("returns the same array reference it was given (mutation contract)", () => {
    const nodes = initialLayout(["a", "b"], 800, 600);
    const returned = simulate(nodes, [], CANVAS, 3);
    expect(returned).toBe(nodes);
  });
});

describe("totalKineticEnergy", () => {
  it("is zero for a stationary system", () => {
    const nodes: SimNode[] = [
      { id: "a", x: 0, y: 0, vx: 0, vy: 0 },
      { id: "b", x: 10, y: 10, vx: 0, vy: 0 },
    ];
    expect(totalKineticEnergy(nodes)).toBe(0);
  });

  it("matches the closed-form 1/2 sum(v^2)", () => {
    const nodes: SimNode[] = [{ id: "a", x: 0, y: 0, vx: 3, vy: 4 }];
    // |v|^2 = 25, KE = 12.5
    expect(totalKineticEnergy(nodes)).toBeCloseTo(12.5);
  });
});
