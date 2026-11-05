/**
 * Petit système de particules (poussière, gerbes de glissade, élan, souffle).
 * Purement visuel : utilise Math.random, jamais la simulation.
 */
import * as THREE from 'three';

let dot: THREE.Texture | null = null;

/** Tache ronde et floue partagée par toutes les particules. */
function dotTexture(): THREE.Texture {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  dot = new THREE.CanvasTexture(c);
  dot.colorSpace = THREE.SRGBColorSpace;
  return dot;
}

export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private next = 0;
  private acc = 0;

  constructor(
    private count: number,
    size: number,
    additive = false,
    private gravity = 0,
  ) {
    this.pos = new Float32Array(count * 3).fill(-1000);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size,
        map: dotTexture(),
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    this.points.frustumCulled = false;
  }

  /** Accumule `rate` particules par seconde ; renvoie combien émettre à cette image. */
  due(rate: number, dt: number): number {
    this.acc += rate * dt;
    const n = Math.floor(this.acc);
    this.acc -= n;
    return n;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: THREE.Color): void {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.life[i] = life;
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -1000;
        continue;
      }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.gravity * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.getAttribute('position').needsUpdate = true;
    this.points.geometry.getAttribute('color').needsUpdate = true;
  }
}
