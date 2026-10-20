export interface ActionCue { icon: string; key: string; text: string; kind: 'build' | 'warning' | 'attack' | 'move'; }
export const SHELTER_CUE = 'O muro protege você';
export function combatCue(state: string | undefined, practice: string | undefined, incomingWave: boolean, sheltered = false, incomingBeam = false): ActionCue | null {
  if (incomingWave) return { icon: '↑', key: 'Espaço', text: 'Pule a onda!', kind: 'warning' };
  if (incomingBeam) return { icon: '↑', key: 'Espaço', text: 'Pule o feixe!', kind: 'warning' };
  if (sheltered) return { icon: '🧱', key: '', text: SHELTER_CUE, kind: 'build' };
  if (practice === 'wall') return { icon: '🧱', key: 'Direito', text: 'Coloque um bloco entre você e o boneco', kind: 'build' };
  if (practice === 'wave') return { icon: '↑', key: 'Espaço', text: 'Pule quando a onda chegar', kind: 'move' };
  if (practice === 'circle') return { icon: '↔', key: 'W A S D', text: 'Saia do círculo', kind: 'warning' };
  if (practice === 'hit' || state === 'stagger') return { icon: '🔨', key: 'Esquerdo', text: 'BATA AGORA!', kind: 'attack' };
  if (!state) return null;
  if (state === 'dying') return { icon: '★', key: '', text: 'Você conseguiu!', kind: 'attack' };
  if (state === 'awaken' || state === 'phaseShift') return { icon: '👀', key: '', text: 'Prepare-se!', kind: 'move' };
  if (state === 'beam') return { icon: '✦', key: 'Espaço', text: 'Feixe de luz! Pule ou fique atrás de um bloco', kind: 'warning' };
  return { icon: '↔', key: 'W A S D', text: state === 'charge' ? 'Saia da frente!' : ['slam','pillars','boulder','shard'].includes(state) ? 'Afaste-se dos círculos!' : IDLE_CUE, kind: 'warning' };
}
const IDLE_CUE = 'Desvie e espere a abertura';
/** Fight cues worth reading aloud; the waiting and shelter lines would repeat all fight long. */
export function spokenCue(cue: ActionCue | null): string | null {
  return cue && cue.text !== IDLE_CUE && cue.text !== SHELTER_CUE ? cue.text : null;
}
export function showActionCue(cue: ActionCue | null): void {
  const root=document.getElementById('action-label')!;
  const signature=JSON.stringify(cue);
  if(root.dataset.cue===signature)return;
  root.dataset.cue=signature;root.replaceChildren();root.classList.toggle('hidden',cue===null);
  if(!cue)return;
  root.dataset.kind=cue.kind;
  const icon=document.createElement('span');icon.className='cue-icon';icon.textContent=cue.icon;icon.setAttribute('aria-hidden','true');
  const label=document.createElement('span');label.textContent=cue.text;root.append(icon,label);
  if(cue.key){const key=document.createElement('kbd');key.textContent=cue.key;root.append(key);}
}
