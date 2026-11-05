/**
 * Passage du plan de simulation (x, y) à la scène Three.js (x, hauteur, z).
 * y de la simulation pointe « au nord », soit -z en 3D. Un cap θ devient rotation.y = θ
 * pour un modèle orienté vers +x.
 */
export const simToWorldX = (x: number) => x;
export const simToWorldZ = (y: number) => -y;
