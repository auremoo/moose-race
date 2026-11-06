import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { trackById } from '../src/data';
import { decorate, LOD_FAR, LOD_NEAR } from '../src/render/biomes';
import { createMooseView, MOOSE_LOD } from '../src/render/moose';
import { createRng } from '../src/sim/rng';
import { buildTrack } from '../src/sim/track';

describe('niveaux de détail', () => {
  it('les arbres se répartissent en trois niveaux selon la distance à la caméra', () => {
    const track = buildTrack(trackById('boucle-grise')!);
    const g = new THREE.Group();
    const decor = decorate(g, track, 'foret', false, createRng(1), 1);
    const s = track.samples[0];
    decor.update(s.x, -s.y);
    const [near, mid, far] = decor.tiers;
    expect(near + mid + far).toBeGreaterThan(300);
    expect(near).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(near);
    expect(far).toBeGreaterThan(0);
    // Le nombre d'instances dessinées suit la répartition.
    const meshes = g.children.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[];
    const drawn = meshes.filter((m) => (m.material as THREE.MeshLambertMaterial).flatShading).reduce((a, m) => a + m.count, 0);
    expect(drawn).toBe(near + mid + far);
    expect(LOD_NEAR).toBeLessThan(LOD_FAR);
  });

  it('pas de nouvelle répartition si la caméra bouge à peine', () => {
    const track = buildTrack(trackById('boucle-grise')!);
    const decor = decorate(new THREE.Group(), track, 'rocheuses', true, createRng(2), 1);
    decor.update(0, 0);
    const before = [...decor.tiers];
    decor.update(1, 1);
    expect([...decor.tiers]).toEqual(before);
  });

  it("l'orignal a trois niveaux, les deux simplifiés en un seul appel de dessin", () => {
    const v = createMooseView({ coat: '#5B3A29', accessory: 'tuque' });
    const lod = v.root.children.find((c) => (c as THREE.LOD).isLOD) as THREE.LOD;
    expect(lod).toBeDefined();
    expect(lod.levels.map((l) => l.distance)).toEqual([0, ...MOOSE_LOD]);
    for (const l of lod.levels.slice(1)) expect((l.object as THREE.Mesh).isMesh).toBe(true);
    let full = 0;
    lod.levels[0].object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) full++;
    });
    expect(full).toBeGreaterThan(8);
  });
});
