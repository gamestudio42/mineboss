export interface GuideFacts {
  enabled: boolean;
  fighting: boolean;
  health: number;
  hasHeal: boolean;
  mode: 'adventure' | 'oneblock';
  hasDirtOrGrass: boolean;
  hasPlanksOrLog: boolean;
  hasTorchFuel: boolean;
  hasTorch: boolean;
  platformDone: boolean;
  shelterDone: boolean;
  ruinUnlocked: boolean;
  ruinFound: boolean;
}

export interface GuideHint {
  id: string;
  text: string;
}

const HINTS: ReadonlyArray<{ id: string; text: string; ready: (facts: GuideFacts) => boolean }> = [
  {
    id: 'eat',
    text: 'Sua vida está baixa. Botão direito: comer e recuperar vida',
    ready: (facts) => facts.health <= 8 && facts.hasHeal,
  },
  {
    id: 'platform',
    text: 'Use o direito para colocar terra e ampliar a ilha.',
    ready: (facts) => facts.mode === 'oneblock' && !facts.platformDone && facts.hasDirtOrGrass,
  },
  {
    id: 'shelter',
    text: 'Comece um abrigo: coloque tábuas ou troncos acima do chão.',
    ready: (facts) => facts.mode === 'oneblock' && !facts.shelterDone && facts.hasPlanksOrLog,
  },
  {
    id: 'torch',
    text: 'C: use carvão para criar tochas',
    ready: (facts) => facts.hasTorchFuel && !facts.hasTorch,
  },
  {
    id: 'ruin',
    text: 'Encontre o Sentinela: siga a bússola ou use Visitar no menu',
    ready: (facts) => facts.ruinUnlocked && !facts.ruinFound,
  },
];

/** First unused hint that matches the current run. Fighting and a disabled guide stay silent. */
export function pickGuideHint(facts: GuideFacts, shown: ReadonlySet<string>): GuideHint | null {
  if (!facts.enabled || facts.fighting) return null;
  for (const hint of HINTS) {
    if (shown.has(hint.id) || !hint.ready(facts)) continue;
    return { id: hint.id, text: hint.text };
  }
  return null;
}

/** Maps the older one-shot booleans onto the shared hint ids so v5 saves keep working. */
export function shownFromSave(save: {
  hintedConsumable?: boolean;
  hintedTorch?: boolean;
  shownHints?: readonly string[];
}): string[] {
  const shown = new Set(save.shownHints ?? []);
  if (save.hintedConsumable) shown.add('eat');
  if (save.hintedTorch) shown.add('torch');
  return [...shown];
}
