import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { courses, trackById } from '../src/data';
import { decorate, LAKE_CLEARANCE, type Biome } from '../src/render/biomes';
import { biefWaterSpan, findBief } from '../src/sim/bief';
import { createRng } from '../src/sim/rng';
import { buildTrack, projectOnTrack } from '../src/sim/track';

const circuits = courses.filter((c) => c.trackId).map((c) => ({ c, track: buildTrack(trackById(c.trackId!)!) }));

describe('eau du décor', () => {
  it('aucun lac ne recouvre la piste ni son bas-côté', () => {
    let lakes = 0;
    // La plaine n'a pas de lac (et son champ de blé demande un canvas, absent hors navigateur).
    for (const { c, track } of circuits.filter((x) => x.c.biome !== 'plaine')) {
      for (const seed of [1, 1234 + track.def.id.length * 97]) {
        const g = new THREE.Group();
        decorate(g, track, c.biome as Biome, track.def.surface === 'neige', createRng(seed), 1);
        for (const m of g.children) {
          const w = m.userData.water as { x: number; y: number; r: number } | undefined;
          if (!w) continue;
          lakes++;
          for (let k = 0; k < 24; k++) {
            const a = (k / 24) * Math.PI * 2;
            const x = w.x + Math.cos(a) * w.r;
            const y = w.y + Math.sin(a) * w.r;
            const p = projectOnTrack(track, x, y);
            const edge = track.samples[p.index].hw + track.def.verge;
            expect(Math.abs(p.d), `${track.def.id} : lac de ${w.r.toFixed(0)} m`).toBeGreaterThan(edge + LAKE_CLEARANCE - 0.5);
          }
        }
      }
    }
    expect(lakes).toBeGreaterThan(10);
  });

  it("l'eau du bief ne commence et ne finit qu'au bord de la piste", () => {
    let biefs = 0;
    for (const { track } of circuits) {
      const b = findBief(track);
      if (!b) continue;
      biefs++;
      const [t0, t1] = biefWaterSpan(track, b);
      expect(t0).toBeGreaterThan(0);
      expect(t1).toBeLessThan(b.length);
      for (let t = t0; t <= t1; t += 1) {
        const x = b.ax + ((b.bx - b.ax) * t) / b.length;
        const y = b.ay + ((b.by - b.ay) * t) / b.length;
        const p = projectOnTrack(track, x, y);
        expect(Math.abs(p.d), `${track.def.id} à ${t.toFixed(0)} m`).toBeGreaterThan(track.samples[p.index].hw);
      }
    }
    expect(biefs).toBeGreaterThan(0);
  });
});
