export interface HudChromeFacts {
  mode: 'adventure' | 'oneblock';
  creative: boolean;
  flying: boolean;
  fighting: boolean;
  tutorialDone: boolean;
  /** Seconds played in this world. */
  elapsed: number;
  /** OneBlock phase and the next unlock, e.g. "Floresta · Ruína: 12/80". */
  oneBlockMark: string;
}

export interface HudChrome {
  phase: string;
  playHelp: string;
  flight: string;
}

/** Survival and OneBlock keep the key reminder only for the first minute and a half. */
export const PLAY_HELP_SECONDS = 90;

/** Corner text besides the objective and the hint; empty strings stay invisible. */
export function hudChrome(facts: HudChromeFacts): HudChrome {
  const phase = facts.mode === 'oneblock' ? facts.oneBlockMark : '';
  const flight = !facts.creative || facts.fighting ? '' : facts.flying ? '✈ Shift desce · F pousa' : '✈ F: voar';
  const learning = facts.creative ? !facts.tutorialDone : facts.elapsed < PLAY_HELP_SECONDS;
  let playHelp = '';
  if (facts.fighting) playHelp = 'Espaço: pular · Esquerdo: bater · Esc: pausar';
  else if (learning) playHelp = facts.creative ? 'B: blocos · Z: desfazer · Esc: menu' : 'B: mochila · C: criar · H: ajuda · Esc: menu';
  return { phase, playHelp, flight };
}
