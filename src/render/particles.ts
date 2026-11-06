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

/**
 * Pluie : traînées fines dans une boîte qui suit la caméra. Chaque goutte tombe puis
 * réapparaît en haut de la boîte : nombre constant, aucune allocation par image.
 */
export class RainStreaks {
  readonly lines: THREE.LineSegments;
  private pos: Float32Array;
  /** Position de chaque goutte relative à la boîte (x, y, z). */
  private rel: Float32Array;
  private readonly half = 22;
  private readonly height = 16;
  private readonly speed = 22;
  private readonly length = 0.9;

  constructor(private count = 900) {
    this.pos = new Float32Array(count * 6);
    this.rel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.rel[i * 3] = (Math.random() * 2 - 1) * this.half;
      this.rel[i * 3 + 1] = Math.random() * this.height;
      this.rel[i * 3 + 2] = (Math.random() * 2 - 1) * this.half;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.lines = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: 0xdde9f5, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.lines.frustumCulled = false;
    this.lines.visible = false;
  }

  /** Avance la pluie ; `cx, cy, cz` est le centre de la boîte (la caméra), `wx, wz` la dérive due au vent (m/s). */
  update(dt: number, cx: number, cy: number, cz: number, wx = 0, wz = 0): void {
    const r = this.rel;
    const p = this.pos;
    const h = this.half;
    const L = this.length / this.speed;
    for (let i = 0; i < this.count; i++) {
      let x = r[i * 3] + wx * dt;
      let y = r[i * 3 + 1] - this.speed * dt;
      let z = r[i * 3 + 2] + wz * dt;
      if (y < 0) {
        y += this.height;
        x = (Math.random() * 2 - 1) * h;
        z = (Math.random() * 2 - 1) * h;
      }
      if (x > h) x -= 2 * h;
      else if (x < -h) x += 2 * h;
      if (z > h) z -= 2 * h;
      else if (z < -h) z += 2 * h;
      r[i * 3] = x;
      r[i * 3 + 1] = y;
      r[i * 3 + 2] = z;
      const bx = cx + x;
      const by = cy - 6 + y;
      const bz = cz + z;
      p[i * 6] = bx;
      p[i * 6 + 1] = by;
      p[i * 6 + 2] = bz;
      p[i * 6 + 3] = bx - wx * L;
      p[i * 6 + 4] = by + this.length;
      p[i * 6 + 5] = bz - wz * L;
    }
    (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
