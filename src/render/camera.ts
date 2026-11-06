/**
 * Caméra poursuite, derrière l'orignal et un peu au-dessus (vue type jeu de course arcade).
 * Le cap de la caméra suit celui de l'orignal avec un léger retard, pour sentir le virage.
 */
import * as THREE from 'three';
import type { Balance } from '../data';
import { simToWorldX, simToWorldZ } from './coords';

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private initialized = false;

  constructor(private cfg: Balance['camera']) {
    this.camera = new THREE.PerspectiveCamera(cfg.fov, 9 / 16, 0.3, 900);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(x: number, y: number, heading: number, speedRatio: number, dt: number, boosting = false, shake = 0, z = 0): void {
    const c = this.cfg;
    if (!this.initialized) {
      this.yaw = heading;
    } else {
      let dh = heading - this.yaw;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      this.yaw += dh * Math.min(1, c.yawRate * dt);
    }
    const fx = Math.cos(this.yaw);
    const fy = Math.sin(this.yaw);
    const wx = simToWorldX(x);
    const wz = simToWorldZ(y);
    const targetPos = new THREE.Vector3(wx - simToWorldX(fx) * c.distance, c.height + z, wz - simToWorldZ(fy) * c.distance);
    const targetLook = new THREE.Vector3(wx + simToWorldX(fx) * c.lookAhead, c.lookHeight + z, wz + simToWorldZ(fy) * c.lookAhead);
    if (!this.initialized) {
      this.pos.copy(targetPos);
      this.look.copy(targetLook);
      this.initialized = true;
    } else {
      const k = Math.min(1, c.followRate * dt);
      this.pos.lerp(targetPos, k);
      this.look.lerp(targetLook, Math.min(1, k * 1.5));
    }
    this.camera.position.copy(this.pos);
    if (shake > 0)
      this.camera.position.add(
        new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake),
      );
    this.camera.lookAt(this.look);

    // Le champ s'élargit au galop et pendant l'élan, un peu avec la vitesse.
    const fov = c.fov + c.galopFovBoost * ((boosting ? 1 : 0) + Math.max(0, Math.min(1, (speedRatio - 0.9) * 5)) * 0.3);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, 4 * dt);
      this.camera.updateProjectionMatrix();
    }
  }

  /** Vue vitrine pour les menus : la caméra tourne lentement devant l'orignal. */
  showcase(x: number, y: number, heading: number, time: number, z = 0): void {
    const a = heading + Math.PI * 0.22 + Math.sin(time * 0.25) * 0.45;
    const dist = 8.5;
    const wx = simToWorldX(x);
    const wz = simToWorldZ(y);
    this.camera.position.set(wx + simToWorldX(Math.cos(a)) * dist, 3.2 + z, wz + simToWorldZ(Math.sin(a)) * dist);
    this.camera.lookAt(wx, 2.6 + z, wz);
    if (this.camera.fov !== this.cfg.fov) {
      this.camera.fov = this.cfg.fov;
      this.camera.updateProjectionMatrix();
    }
    this.initialized = false;
  }

  reset(): void {
    this.initialized = false;
  }
}
