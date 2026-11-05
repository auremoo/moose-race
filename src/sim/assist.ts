/**
 * Assistance de direction (Facile) : la direction du joueur est légèrement ramenée vers
 * celle du pilote automatique sur la ligne de course, ce qui évite les sorties brutales.
 */
import { autopilot } from './autopilot';
import type { Commands } from './moose';
import type { Race } from './race';

export function assistCommand(r: Race, cmd: Commands, strength: number): Commands {
  if (strength <= 0) return cmd;
  const me = r.racers[0];
  const auto = autopilot(r.track, me, me.params, r.balance.surfaces.sentier, { line: { offset: r.line.offset, speed: me.profile } });
  // Plus le joueur braque franchement, moins l'aide se fait sentir.
  const a = strength * (1 - 0.6 * Math.abs(cmd.steer));
  return { ...cmd, steer: cmd.steer * (1 - a) + auto.steer * a };
}
