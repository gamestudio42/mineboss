import type { SessionEvent, SessionExport } from './SessionLog.ts';

export const NO_OBJECTIVE = '(sem objetivo na tela)';
/** A stretch is worth a look when the child asked for help, froze this long or spent five minutes on it. */
export const STUCK_IDLE_SECONDS = 20;
export const STUCK_STRETCH_SECONDS = 300;

export interface ObjectiveStretch {
  objective: string;
  seconds: number;
  helpMarks: number;
  cheerMarks: number;
  idleSeconds: number;
}

export interface SessionReview {
  minutes: number;
  stretches: ObjectiveStretch[];
  stuck: string[];
  quitDuring: string | null;
  practiced: boolean;
  reachedBoss: boolean;
  bossesWon: string[];
  /** Houses, towers and pens the album recognised during the session. */
  builds: string[];
  deaths: number;
}

/** Time per on-screen objective, with the adult's marks and idle spells attributed to it. */
export function reviewSession(data: SessionExport): SessionReview {
  const events = [...data.events].sort((a, b) => a.t - b.t);
  const end = events.at(-1)?.t ?? 0;
  const byObjective = new Map<string, ObjectiveStretch>();
  const stretch = (objective: string): ObjectiveStretch => {
    let entry = byObjective.get(objective);
    if (!entry) {
      entry = { objective, seconds: 0, helpMarks: 0, cheerMarks: 0, idleSeconds: 0 };
      byObjective.set(objective, entry);
    }
    return entry;
  };

  let current = NO_OBJECTIVE;
  let since = events[0]?.t ?? 0;
  let idleSince: { t: number; objective: string } | null = null;
  let quitDuring: string | null = null;
  const bossesWon: string[] = [];
  const builds: string[] = [];

  for (const event of events) {
    if (event.type === 'objective' && event.text && event.text !== current) {
      stretch(current).seconds += event.t - since;
      current = event.text;
      since = event.t;
    } else if (event.type === 'idle') {
      if (event.active) idleSince = { t: event.t, objective: current };
      else if (idleSince) {
        stretch(idleSince.objective).idleSeconds += event.t - idleSince.t;
        idleSince = null;
      }
    } else if (event.type === 'mark') {
      const target = stretch(markObjective(event, current));
      if (event.kind === 'help') target.helpMarks += 1;
      if (event.kind === 'cheer') target.cheerMarks += 1;
      if (event.kind === 'quit') quitDuring ??= markObjective(event, current);
    } else if (event.type === 'victory' && event.boss && !bossesWon.includes(event.boss)) {
      bossesWon.push(event.boss);
    } else if (event.type === 'build' && event.id && !builds.includes(event.id)) {
      builds.push(event.id);
    }
  }
  stretch(current).seconds += end - since;
  if (idleSince) stretch(idleSince.objective).idleSeconds += end - idleSince.t;

  const stretches = [...byObjective.values()].filter((entry) => entry.seconds > 0 || entry.helpMarks > 0 || entry.cheerMarks > 0);
  return {
    minutes: Math.round(end / 6) / 10,
    stretches,
    stuck: stretches
      .filter((entry) => entry.helpMarks > 0 || entry.idleSeconds >= STUCK_IDLE_SECONDS || entry.seconds >= STUCK_STRETCH_SECONDS)
      .map((entry) => entry.objective),
    quitDuring,
    practiced: events.some((event) => event.type === 'practice'),
    reachedBoss: events.some((event) => event.type === 'encounter' && event.action === 'start'),
    bossesWon,
    builds,
    deaths: data.summary?.deaths ?? events.filter((event) => event.type === 'death').length,
  };
}

function markObjective(event: SessionEvent, current: string): string {
  return event.objective ?? current;
}

export function formatReview(review: SessionReview): string {
  const seconds = (value: number) => `${Math.round(value)} s`;
  const lines = [
    `Duração registrada: ${review.minutes.toFixed(1).replace('.', ',')} min`,
    `Treino: ${review.practiced ? 'sim' : 'não'} · Chegou a um chefão: ${review.reachedBoss ? 'sim' : 'não'} · Vitórias: ${review.bossesWon.join(', ') || 'nenhuma'} · Mortes: ${review.deaths}`,
    `Construções no álbum: ${review.builds.join(', ') || 'nenhuma'}`,
    '',
    'Tempo por objetivo:',
    ...review.stretches.map((entry) => {
      const notes = [
        entry.helpMarks ? `pediu ajuda ${entry.helpMarks}×` : '',
        entry.cheerMarks ? `animou ${entry.cheerMarks}×` : '',
        entry.idleSeconds >= 1 ? `parado ${seconds(entry.idleSeconds)}` : '',
      ].filter(Boolean).join(', ');
      return `- ${entry.objective}: ${seconds(entry.seconds)}${notes ? ` (${notes})` : ''}`;
    }),
    '',
    review.stuck.length ? `Onde travou: ${review.stuck.join(' | ')}` : 'Nenhum trecho com ajuda, parada longa ou mais de cinco minutos.',
    review.quitDuring ? `Largou durante: ${review.quitDuring}` : 'Não houve marca de "Largou".',
  ];
  return lines.join('\n');
}
