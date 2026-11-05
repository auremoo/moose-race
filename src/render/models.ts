/**
 * Modèles GLB optionnels : chaque forme générée par le code peut être remplacée par un fichier,
 * sans toucher à la simulation. Les chemins sont dans data/models.json (null = repli sur le code).
 *
 * Conventions attendues d'un GLB d'orignal (orienté vers +x, ~3 m de long, pieds à y = 0) :
 *  - nœuds de pattes nommés leg_FL, leg_FR, leg_RL, leg_RR (pivot à la hanche/l'épaule) ;
 *  - nœuds head et antlers (facultatifs) ;
 *  - matériau nommé « coat » teinté avec la robe de chaque orignal.
 */
import * as THREE from 'three';
import modelsJson from '../data/models.json';

type Kind = 'moose' | 'bear' | 'beaver';
const paths = modelsJson as unknown as Record<Kind, string | null>;
const cache = new Map<Kind, THREE.Group | null>();

export async function preloadModels(): Promise<void> {
  const wanted = (Object.keys(paths) as Kind[]).filter((k) => k !== ('_comment' as Kind) && paths[k]);
  if (!wanted.length) return;
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  await Promise.all(
    wanted.map(async (k) => {
      try {
        const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}${paths[k]}`);
        cache.set(k, gltf.scene);
      } catch {
        cache.set(k, null);
      }
    }),
  );
}

/** Copie du modèle chargé, ou null (repli sur la forme générée par le code). */
export function modelInstance(kind: Kind, coat?: string): THREE.Group | null {
  const src = cache.get(kind);
  if (!src) return null;
  const copy = src.clone(true);
  if (coat) {
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (mat && mat.name === 'coat') {
        mesh.material = mat.clone();
        (mesh.material as THREE.MeshStandardMaterial).color.set(coat);
      }
    });
  }
  return copy;
}

/** Nœuds de pattes d'un modèle d'orignal, dans l'ordre avant gauche, avant droite, arrière gauche, arrière droite. */
export function legNodes(model: THREE.Object3D): THREE.Object3D[] | null {
  const names = ['leg_FL', 'leg_FR', 'leg_RL', 'leg_RR'];
  const nodes = names.map((n) => model.getObjectByName(n));
  return nodes.every(Boolean) ? (nodes as THREE.Object3D[]) : null;
}
