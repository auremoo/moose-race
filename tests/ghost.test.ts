import { describe, expect, it } from 'vitest';
import { ghostPose, GhostRecorder, GHOST_HZ } from '../src/meta/ghost';

describe('fantôme', () => {
  it('enregistre 10 poses par seconde et les rejoue en interpolant', () => {
    const rec = new GhostRecorder();
    for (let i = 0; i <= 60 * 3; i++) {
      const t = i / 60;
      rec.sample(t, t * 20, 5, 0.5);
    }
    const g = rec.result('x', 1, 3, '#fff');
    expect(g.points.length / 3).toBeGreaterThanOrEqual(3 * GHOST_HZ);
    const p = ghostPose(g, 1.25)!;
    expect(Math.abs(p.x - 25)).toBeLessThan(0.2);
    expect(p.y).toBeCloseTo(5, 1);
    expect(p.heading).toBeCloseTo(0.5, 2);
    expect(ghostPose(g, 10)).toBeNull();
  });
});
