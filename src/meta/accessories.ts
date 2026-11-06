/**
 * Accessoires à collectionner : purement cosmétiques, achetés au Comptoir avec des pièces,
 * portés par un orignal choisi dans l'Enclos.
 */
import { accessoryById, accessoryCatalog, mooseCatalog, type AccessoryDef } from '../data';
import type { SaveData } from './settings';

export function ownsAccessory(save: SaveData, id: string): boolean {
  return save.accessories.includes(id) || accessoryCatalog.starters.includes(id);
}

/** Accessoire porté par un orignal : celui choisi, sinon celui d'origine de l'orignal. */
export function accessoryOf(save: SaveData, mooseId: string): AccessoryDef {
  const chosen = save.equipped[mooseId];
  if (chosen && ownsAccessory(save, chosen)) return accessoryById(chosen);
  return accessoryById(mooseCatalog.moose.find((m) => m.id === mooseId)?.accessory);
}

export function buyAccessory(save: SaveData, id: string): boolean {
  const a = accessoryCatalog.accessories.find((x) => x.id === id);
  if (!a || ownsAccessory(save, id) || save.coins < a.price) return false;
  save.coins -= a.price;
  save.accessories = [...save.accessories, id];
  return true;
}

export function equipAccessory(save: SaveData, mooseId: string, id: string): boolean {
  if (!ownsAccessory(save, id)) return false;
  save.equipped = { ...save.equipped, [mooseId]: id };
  return true;
}

/** Accessoires possédés dans l'ordre du catalogue (pour le sélecteur de l'Enclos). */
export function ownedAccessories(save: SaveData): AccessoryDef[] {
  return accessoryCatalog.accessories.filter((a) => ownsAccessory(save, a.id));
}
