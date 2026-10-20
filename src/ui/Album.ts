import { Block } from '../world/blocks.ts';
import { BUILD_KINDS, type BuildKind } from '../world/builds.ts';
import { VICTORY_SIGN_TEXT, type VictoryBoss } from '../world/victory.ts';
import { BUILD_IDEAS } from './BuildIdeas.ts';

export interface AlbumGoal {
  label: string;
  current: number;
  target: number;
  done: boolean;
  reward: string;
}

export interface AlbumFacts {
  builds: ReadonlySet<BuildKind>;
  trophies: ReadonlySet<number>;
  pet: boolean;
  /** Only OneBlock has island goals. */
  islandGoals: AlbumGoal[] | null;
}

export interface AlbumItem {
  icon: string;
  label: string;
  done: boolean;
  detail: string;
}

export interface AlbumSection {
  title: string;
  items: AlbumItem[];
}

const BUILD_HOW: Record<BuildKind, string> = {
  house: 'Paredes em volta, uma porta e um telhado por cima',
  tower: '6 blocos, um em cima do outro',
  pen: 'Uma cerca baixa e fechada, com um portão de 1 bloco',
};

const BUILD_DONE: Record<BuildKind, string> = {
  house: 'Casa com paredes e telhado',
  tower: 'Torre bem alta',
  pen: 'Curral cercado',
};

const BUILD_FOUND: Record<BuildKind, string> = {
  house: 'Que casa linda!',
  tower: 'Que torre alta!',
  pen: 'Curral pronto!',
};

const BOSSES: Array<{ boss: VictoryBoss; trophy: Block; icon: string; name: string }> = [
  { boss: 'sentinel', trophy: Block.SentinelTrophy, icon: '🗿', name: 'Sentinela' },
  { boss: 'warden', trophy: Block.WardenTrophy, icon: '💎', name: 'Guardião' },
  { boss: 'beacon', trophy: Block.BeaconTrophy, icon: '🌿', name: 'Faroleiro' },
];

export const PET_ARRIVED_TEXT = 'Um bichinho chegou ao seu curral! Clique nele com o botão direito para ele seguir você.';

/** Spoken and shown once, the moment a build enters the album. */
export function buildFoundText(kind: BuildKind, petArrived: boolean): string {
  if (petArrived) return `${BUILD_FOUND[kind]} ${PET_ARRIVED_TEXT}`;
  return `${BUILD_FOUND[kind]} Ela entrou no seu álbum.`;
}

/** One collection of what the child already did; nothing here is a new task. */
export function albumSections(facts: AlbumFacts): AlbumSection[] {
  const builds: AlbumItem[] = BUILD_KINDS.map(kind => {
    const idea = BUILD_IDEAS.find(item => item.id === kind)!;
    const done = facts.builds.has(kind);
    const detail = !done ? BUILD_HOW[kind] : kind === 'pen' && facts.pet ? 'Curral com um bichinho' : BUILD_DONE[kind];
    return { icon: idea.icon, label: idea.name, done, detail };
  });
  const trophies: AlbumItem[] = BOSSES.map(({ boss, trophy, icon, name }) => {
    const done = facts.trophies.has(trophy);
    return { icon, label: name, done, detail: done ? VICTORY_SIGN_TEXT[boss] : 'Quando quiser, pelo menu Chefões' };
  });
  const sections: AlbumSection[] = [
    { title: 'Construções', items: builds },
    { title: 'Troféus', items: trophies },
  ];
  if (facts.islandGoals) {
    sections.push({
      title: 'Metas da ilha',
      items: facts.islandGoals.map(goal => ({
        icon: '🏝',
        label: goal.label,
        done: goal.done,
        detail: goal.done ? 'Concluído' : `${Math.min(goal.current, goal.target)}/${goal.target} · prêmio: ${goal.reward}`,
      })),
    });
  }
  return sections;
}

export function albumCount(sections: AlbumSection[]): { done: number; total: number } {
  const items = sections.flatMap(section => section.items);
  return { done: items.filter(item => item.done).length, total: items.length };
}

export function albumPanel(sections: AlbumSection[]): HTMLElement {
  const root = document.createElement('div');
  root.className = 'album';
  for (const section of sections) {
    const title = document.createElement('h3');
    title.textContent = section.title;
    const list = document.createElement('ul');
    for (const item of section.items) {
      const row = document.createElement('li');
      row.classList.toggle('done', item.done);
      const icon = document.createElement('span');
      icon.className = 'album-icon';
      icon.textContent = item.done ? item.icon : '○';
      const text = document.createElement('span');
      const label = document.createElement('strong');
      label.textContent = item.label;
      const detail = document.createElement('small');
      detail.textContent = item.detail;
      text.append(label, detail);
      row.append(icon, text);
      list.append(row);
    }
    root.append(title, list);
  }
  return root;
}
