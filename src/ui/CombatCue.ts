export interface ActionCue { icon: string; key: string; text: string; kind: 'build' | 'warning' | 'attack' | 'move'; }
export function combatCue(state: string | undefined, practice: string | undefined, incomingWave: boolean): ActionCue | null {
  if (incomingWave) return { icon: '↑', key: 'Espaço', text: 'Pule a onda!', kind: 'warning' };
  if (practice === 'wave') return { icon: '↑', key: 'Espaço', text: 'Pule quando a onda chegar', kind: 'move' };
  if (practice === 'circle') return { icon: '↔', key: 'W A S D', text: 'Saia do círculo', kind: 'warning' };
  if (practice === 'hit' || state === 'stagger') return { icon: '🔨', key: 'Esquerdo', text: 'BATA AGORA!', kind: 'attack' };
  if (!state) return null;
  if (state === 'dying') return { icon: '★', key: '', text: 'Você conseguiu!', kind: 'attack' };
  if (state === 'awaken' || state === 'phaseShift') return { icon: '👀', key: '', text: 'Prepare-se!', kind: 'move' };
  return { icon: '↔', key: 'W A S D', text: state === 'charge' ? 'Saia da frente!' : ['slam','pillars','boulder','shard'].includes(state) ? 'Afaste-se dos círculos!' : 'Desvie e espere a abertura', kind: 'warning' };
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
