import { Block } from '../blocks.ts';
import type { PhaseDef } from './phases.ts';

export interface MobPressureFacts {
  gentle: boolean;
  deathsSinceBreak: number;
  health: number;
}

/**
 * Scales OneBlock mob rolls. Never raises pressure; Tranquila stays at most 0.4.
 */
export function mobPressure(facts: MobPressureFacts): number {
  let factor = facts.gentle ? 0.4 : 1;
  if (facts.deathsSinceBreak > 0) factor *= 0.6;
  if (facts.health <= 8) factor *= 0.7;
  const cap = facts.gentle ? 0.4 : 1;
  return Math.max(0.25, Math.min(cap, factor));
}

export function phaseHasMushroomExtra(phase: PhaseDef): boolean {
  return phase.extras?.some((extra) => extra.id === Block.Mushroom) === true;
}
