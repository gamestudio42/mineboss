export type SentinelAttack = 'slam' | 'charge' | 'shard';

export interface SentinelAttackFacts {
  distance: number;
  phase: number;
  lastAttack?: SentinelAttack | null;
  lastWaveJumped?: boolean | null;
  gentle: boolean;
}

/** Weights for the attacks the Sentinel already knows. Zero means locked. */
export function scoreSentinelAttack(facts: SentinelAttackFacts): Record<SentinelAttack, number> {
  const weights: Record<SentinelAttack, number> = { slam: 0, charge: 0, shard: 0 };

  if (facts.distance < 10) weights.slam = facts.distance < 6 ? 4 : 2;
  if (facts.distance > 6) weights.charge = facts.distance > 10 ? 4 : 2;
  if (facts.phase >= 1 && facts.distance > 5) weights.shard = 1.2;

  if (facts.lastAttack && weights[facts.lastAttack] > 0) weights[facts.lastAttack] *= 0.4;

  if (facts.lastWaveJumped === true) {
    weights.slam *= 0.45;
    if (weights.charge > 0) weights.charge *= 1.45;
  } else if (facts.lastWaveJumped === false && weights.slam > 0) {
    weights.slam *= 1.4;
  }

  if (facts.gentle) {
    const simple: SentinelAttack = facts.distance < 8 ? 'slam' : 'charge';
    if (weights[simple] > 0) weights[simple] *= 1.5;
  }

  if (weights.slam <= 0 && weights.charge <= 0 && weights.shard <= 0) weights.slam = 1;
  return weights;
}

export function pickSentinelAttack(facts: SentinelAttackFacts, random = Math.random): SentinelAttack {
  const weights = scoreSentinelAttack(facts);
  let roll = random() * (weights.slam + weights.charge + weights.shard);
  if ((roll -= weights.slam) < 0) return 'slam';
  if ((roll -= weights.charge) < 0) return 'charge';
  return 'shard';
}
