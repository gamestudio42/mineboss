import { Block } from '../world/blocks.ts';

export interface BuildIdea {
  id: string; name: string; icon: string; steps: string[]; materials: Block[];
}
export const BUILD_IDEAS: BuildIdea[] = [
  { id: 'house', name: 'Casa colorida', icon: '🏠', steps: ['Faça um chão de 5 por 5 blocos.', 'Levante as paredes. Deixe a entrada e duas janelas.', 'Cubra com um telhado e coloque vidro nas janelas.'], materials: [Block.Planks, Block.Blue, Block.White, Block.Glass, Block.Bed, Block.Torch] },
  { id: 'bridge', name: 'Ponte', icon: '🌉', steps: ['Faça um caminho de tábuas com 3 blocos de largura.', 'Coloque bordas dos dois lados.', 'Enfeite a entrada com postes e luzes.'], materials: [Block.Planks, Block.Log, Block.Glowstone] },
  { id: 'castle', name: 'Castelo', icon: '🏰', steps: ['Faça uma base quadrada de pedra.', 'Levante as paredes e deixe o portão aberto.', 'Faça torres mais altas nos cantos e decore o topo.'], materials: [Block.Cobblestone, Block.DarkBrick, Block.Glowstone, Block.Red] },
];
interface Cube { x: number; y: number; z: number; color: string; stage: number; }
export function ideaCubes(id: string, stage: number): Cube[] {
  const cells = new Map<string, Cube>();
  const put = (x: number, y: number, z: number, color: string, step: number) => {
    if (step <= stage) cells.set(`${x},${y},${z}`, { x,y,z,color,stage:step });
  };
  if (id === 'house') {
    for (let x=0;x<5;x++) for(let z=0;z<5;z++) {
      put(x,0,z,'#bd8d51',0);
      if (x===0||x===4||z===0||z===4) for(let y=1;y<=3;y++) {
        const door=z===4&&x===2&&y<3;
        const window=y===2&&((x===0&&z===2)||(x===4&&z===2));
        if(!door&&!window)put(x,y,z,'#559dc5',1);
        if(window)put(x,y,z,'#a5e6ed',2);
      }
      put(x,4,z,'#e9dcca',2);
    }
  } else if (id === 'bridge') {
    for(let x=0;x<3;x++)for(let z=0;z<7;z++) {
      put(x,0,z,'#bd8d51',0);
      if(x!==1)put(x,1,z,'#94734a',1);
      if(x!==1&&(z===0||z===6)){put(x,2,z,'#755037',2);put(x,3,z,'#ffd97c',2);}
    }
  } else {
    for(let x=0;x<7;x++)for(let z=0;z<7;z++) {
      put(x,0,z,'#8b97a0',0);
      if(x===0||x===6||z===0||z===6)for(let y=1;y<=3;y++) {
        if(!(z===6&&x===3&&y<3))put(x,y,z,'#a4a6a9',1);
      }
      if((x<2||x>4)&&(z<2||z>4))for(let y=1;y<=5;y++)put(x,y,z,y===5?'#e5c578':'#7d8594',2);
      else if((x===0||x===6||z===0||z===6)&&(x+z)%2===0)put(x,4,z,'#7d8594',2);
    }
  }
  return [...cells.values()].sort((a,b)=>(a.x+a.z)-(b.x+b.z)||a.y-b.y);
}
/** Code-native voxel drawing: it is a guide, never an automatic world edit. */
export function buildIdeaPanel(idea: BuildIdea, stage: number): HTMLElement {
  const figure = document.createElement('figure'); figure.className='build-idea';
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 360 290');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${idea.name}: ${idea.steps[stage]}`);
  const polygon=(points:string,color:string,opacity=1)=>{
    const p=document.createElementNS(ns,'polygon');p.setAttribute('points',points);p.setAttribute('fill',color);p.setAttribute('stroke','#162c3d');p.setAttribute('stroke-width','1');p.setAttribute('opacity',String(opacity));svg.append(p);
  };
  for(const c of ideaCubes(idea.id,stage)) {
    const x=180+(c.x-c.z)*18,y=120+(c.x+c.z)*9-c.y*19;
    polygon(`${x},${y} ${x+18},${y+9} ${x},${y+18} ${x-18},${y+9}`,c.color);
    polygon(`${x-18},${y+9} ${x},${y+18} ${x},${y+37} ${x-18},${y+28}`,c.color,.75);
    polygon(`${x},${y+18} ${x+18},${y+9} ${x+18},${y+28} ${x},${y+37}`,c.color,.9);
  }
  const caption=document.createElement('figcaption');caption.textContent='Você pode mudar as cores e o tamanho. A ideia é sua!';
  figure.append(svg,caption);return figure;
}
