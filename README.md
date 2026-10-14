# MineBoss

[![CI](https://github.com/marcelsavegnago/mineboss/actions/workflows/ci.yml/badge.svg)](https://github.com/marcelsavegnago/mineboss/actions/workflows/ci.yml)

Jogo de blocos para construir, explorar e enfrentar dois chefões opcionais.
Interface em português, com Aventura e OneBlock e um save separado por modo.

## Jogar online

https://marcelsavegnago.github.io/mineboss/

O save do site é outro do `localhost`: cada origem do navegador guarda a partida separada.

## Jogar

```sh
pnpm install
pnpm dev
```

Abra http://localhost:5173/ num navegador com WebGL2. Use Node compatível com Vite 8 (20.19+ ou 22.12+).
A porta é fixa: se estiver ocupada, o servidor avisa em vez de abrir outro endereço com saves diferentes.

- **Aventura / Construção livre:** catálogo visual com materiais ilimitados e voo. Abra com B. O inventário de Sobrevivência fica guardado ao trocar de estilo.
- **Aventura / Sobrevivência:** explore o terreno, colete recursos, faça ferramentas e construa sua base.
- **OneBlock:** escolha o ritmo ao criar uma partida. No Curto, a ruína aparece aos 80 blocos, o santuário aos 130 e o farol aos 160; no Clássico, aos 320, 520 e 640. Planície e Floresta são curtas, os monstros começam em Minérios, e a fase Jardim traz musgo, flores e baús. O Faroleiro é o terceiro chefão, na ilha ao sul. Saves antigos mantêm o ritmo Clássico. Metas opcionais de ampliar a ilha e iniciar um abrigo dão materiais uma única vez.

O menu Esc destaca **Construir**, **Chefões**, **Minha base** e **Como brincar**,
com figuras grandes. Tab/Shift+Tab navegam pelos botões, Enter ativa e Esc volta. **Marcar minha base** guarda um chão seguro; **Voltar à base** retorna à construção depois de explorar ou lutar. Em **Mais opções**, altere o estilo da Aventura, dificuldade,
proteção de borda e guia, além de importar ou exportar o mundo.
A dificuldade Tranquila é o padrão: menos dano dos monstros e mais tempo nos
avisos dos chefões. No OneBlock, também há menos inimigos e não há lava surpresa.
O núcleo sempre é sólido e avisa antes de gerar um monstrinho.

## Controles

- WASD: andar. Espaço: pular/nadar para cima. Shift: correr/mergulhar.
- Botão esquerdo: clique para remover na Construção livre; segure para minerar na Sobrevivência; clique ou segure para atacar. Botão direito: colocar/usar.
- 1–9 ou roda do mouse: selecionar material.
- B: catálogo na Construção livre; mochila com excedentes na Sobrevivência.
- H: primeiros passos; a ajuda completa reúne controles e receitas.
- F: ligar/desligar voo na Construção livre. Espaço sobe e Ctrl desce. Shift acelera.
- Z: desfazer; Y ou Shift+Z: refazer, na Construção livre e fora das lutas.
  Até 50 edições por sessão; uma nova edição descarta o refazer.
- C: criar tochas, cama, martelos e armaduras na Sobrevivência, fora das lutas.
- Q: soltar um bloco. Esc: pausar e salvar.

A proteção de borda permite entrar em buracos andando: na Construção livre,
procura um chão sólido seguro em qualquer profundidade do mundo; na
Sobrevivência, aceita descidas de até quatro blocos, sem dano de queda.
Vazio e colunas com lava continuam bloqueados. Pular permite sair da borda.
A proteção pode ser desligada pelo menu; não impede empurrões durante um salto.

## Chefões e recompensas

Abra **Esc > Chefões > Treinar com segurança** para praticar onda, círculo e golpe sem perder vida.
**Visitar o Sentinela** e **Visitar o Guardião** abrem uma confirmação antes de transportar.
Você também pode explorar até a estátua na ruína e o altar subterrâneo.
Cada luta exige confirmação. Na Construção livre, voo e invulnerabilidade
ficam suspensos durante a batalha e voltam ao vencer, sair ou morrer.

Pule as ondas, saia dos círculos e ataque quando aparecer **BATA AGORA!**.
As orientações usam figura, tecla e uma ação por vez; a onda próxima tem
prioridade sobre o aviso para atacar. Comida recupera vida com o botão direito.
Morrer mantém os itens, verifica um ponto seguro de retorno e concede cinco
segundos de proteção contra golpes. O menu permite sair da batalha.

Cada chefão concede um troféu único e materiais na primeira vitória, além de desbloquear uma decoração temática: emblema do Sentinela ou lanterna do Guardião.
Os troféus conquistados também aparecem em Decoração no catálogo. As batalhas
podem ser repetidas pela estátua/altar. Ataques e restaurações de estruturas
preservam os blocos colocados pelo jogador.

## Materiais e saves

O catálogo inclui oito cores e vidro com janelas transparentes. As categorias
destacam o material selecionado; a barra criativa é guardada separadamente da
mochila de Sobrevivência. Tutorial visual e ideias ilustradas de casa, ponte e castelo são opcionais.
Cada ideia tem três etapas e um botão para colocar seus materiais na barra,
sem construir automaticamente no mundo. A prévia translúcida mostra onde
o próximo bloco vai ficar; uma posição inválida mostra o motivo.

Os materiais excedentes vão para uma mochila, em vez de desaparecer quando os
nove espaços ficam cheios. B permite trocar o material do espaço selecionado
por um da mochila. Todos são salvos, inclusive o inventário separado da
Sobrevivência durante a Construção livre.

O aviso no canto indica sucesso ou falha ao salvar no navegador. No menu,
**Exportar mundo** baixa uma cópia JSON e **Importar mundo** valida o arquivo
antes de pedir confirmação para substituir apenas o modo correspondente.
Arquivos acima de 20 MB ou 300 mil edições são recusados. Saves locais antigos
v1/v2/v3/v4 são lidos sem apagar a chave original. O formato atual é v5.
Uma cópia anterior válida por modo pode ser recuperada pelo menu. O checkpoint
é atualizado aproximadamente a cada minuto ou ao trocar de mundo; não é um
histórico completo. Save principal corrompido usa a cópia válida automaticamente.
Recarregar durante combate/treino volta à posição anterior ao encontro, sem
boss ativo, preservando base, inventários, estilo, voo, guia e prêmios confirmados.
Os saves pertencem à origem do site: trocar host/porta usa outro armazenamento.

## Conforto e qualidade

**Som e conforto**, na abertura, e **Mais opções**, na pausa, oferecem:

- Câmera tranquila: remove balanço ao andar, tremor de impactos e ampliação ao correr.
- Efeitos suaves: reduz partículas, flashes de dano/cura/armadura e pulsação da barra.
- Qualidade Leve, Equilibrada (padrão) ou Caprichada: ajusta distância do terreno,
  resolução, partículas e luzes de tochas. As preferências ficam neste navegador.

## Verificação técnica

```sh
pnpm test
pnpm build
```

Testes cobrem inventário, receitas, desfazer, vidro, saves v1–v5, recuperação,
base obstruída, controles, treino, ambos os chefões, morte, saída, recarga e OneBlock.
Consulte [TESTING.md](TESTING.md) para a evidência e os limites da validação atual.
A validação de diversão e dificuldade com a criança deve ser feita em uma
sessão acompanhada; testes automatizados não substituem essa avaliação.

TypeScript, three.js e Vite; texturas em canvas, áudio sintetizado e malhas
voxel processadas em workers. Não há multiplayer nesta versão.
