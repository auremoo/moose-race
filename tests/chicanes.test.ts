import { describe, expect, it } from 'vitest';
import { courses, trackById } from '../src/data';
import { buildTrack, projectOnTrack } from '../src/sim/track';

describe('chicanes', () => {
  it("aucune chicane ne se passe tout droit (ni par la piste ni par l'herbe)", () => {
    let chicanes = 0;
    for (const c of courses.filter((x) => x.trackId)) {
      const t = buildTrack(trackById(c.trackId!)!);
      const n = t.samples.length;
      for (const z of t.def.vergeZones ?? []) {
        chicanes++;
        const a = Math.round(z.from * n);
        const b = Math.round(z.to * n);
        const span = (b - a + n) % n;
        // Toutes les cordes du premier quart de la chicane à son dernier quart.
        let straightPossible = false;
        for (let i = 0; i < span * 0.25 && !straightPossible; i += 2)
          for (let j = Math.ceil(span * 0.75); j <= span && !straightPossible; j += 2) {
            const p = t.samples[(a + i) % n];
            const q = t.samples[(a + j) % n];
            const len = Math.hypot(q.x - p.x, q.y - p.y);
            let ok = true;
            for (let u = 0; u <= len && ok; u += 1) {
              const x = p.x + ((q.x - p.x) * u) / len;
              const y = p.y + ((q.y - p.y) * u) / len;
              const pr = projectOnTrack(t, x, y, (a + i) % n, 60);
              const s = t.samples[pr.index];
              if (Math.abs(pr.d) > s.hw + s.verge) ok = false;
            }
            // Une corde de l'entrée à la sortie qui tient dans le couloir : passage tout droit.
            if (ok) straightPossible = true;
          }
        expect(straightPossible, `${t.def.id} : chicane ${z.from}–${z.to}`).toBe(false);
      }
    }
    expect(chicanes).toBeGreaterThan(10);
  });
});
