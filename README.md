# MineBoss

Jogo de blocos no navegador, em português, para construir, explorar e enfrentar o Sentinela, o Guardião e o Faroleiro quando quiser.

<p align="center">
  <a href="https://marcelsavegnago.github.io/mineboss/"><img alt="Jogar agora" src="https://img.shields.io/badge/MineBoss-Jogar%20agora-f5a623.png?style=for-the-badge&amp;labelColor=1b2430"></a>
  &nbsp;
  <a href="https://github.com/marcelsavegnago/mineboss/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/marcelsavegnago/mineboss/actions/workflows/ci.yml/badge.svg"></a>
</p>

<table>
  <tr>
    <td width="33%" align="center"><img src="docs/readme/aventura.png" alt="Primeira pessoa na aventura, com o martelo de ouro"></td>
    <td width="33%" align="center"><img src="docs/readme/oneblock.png" alt="Primeira pessoa na ilha do OneBlock, com o martelo e o vazio ao lado"></td>
    <td width="33%" align="center"><img src="docs/readme/chefao.png" alt="Luta em primeira pessoa contra o Sentinela das Ruínas"></td>
  </tr>
  <tr>
    <td align="center">Aventura</td>
    <td align="center">OneBlock</td>
    <td align="center">O Sentinela</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/readme/personagem.png" alt="Personagem por trás, com capacete e armadura"></td>
    <td align="center"><img src="docs/readme/menu.png" alt="Menu de pausa Vamos brincar?"></td>
    <td align="center"><img src="docs/readme/criacao.png" alt="Menu Criar itens, com tochas, cama, martelos e armaduras"></td>
  </tr>
  <tr>
    <td align="center">O personagem por trás</td>
    <td align="center">Menu <strong>Vamos brincar?</strong></td>
    <td align="center">Criar itens</td>
  </tr>
</table>

Dá para jogar no site sem instalar nada. Quem quiser ajudar pode abrir uma [issue](https://github.com/marcelsavegnago/mineboss/issues) ou um pull request. O código e os comentários ficam em inglês; os textos da tela, em português.

## Jogar no site e no computador

O jogo publicado está em https://marcelsavegnago.github.io/mineboss/.

Para abrir uma cópia local:

```sh
pnpm install
pnpm dev
```

Abra http://localhost:5173/ num navegador com WebGL2. Use Node compatível com Vite 8 (20.19+ ou 22.12+). A porta é fixa: se estiver ocupada, o servidor avisa em vez de abrir outro endereço.

O save do site e o de `localhost` são separados. Cada origem do navegador guarda a própria partida.

## Modos

- **Aventura / Sobrevivência:** explore o terreno, colete recursos, faça ferramentas e construa uma base.
- **Aventura / Construção livre:** catálogo visual com materiais ilimitados e voo. Abra com B. O inventário de Sobrevivência fica guardado ao trocar de estilo.
- **OneBlock:** escolha o ritmo ao criar a partida. No Curto, a ruína aparece aos 80 blocos, o santuário aos 130 e o farol aos 160. No Clássico, aos 320, 520 e 640. Planície e Floresta são curtas, os monstros começam em Minérios, e a fase Jardim traz musgo, flores e baús. O Faroleiro fica na ilha ao sul. Saves antigos mantêm o ritmo Clássico. Metas opcionais de ampliar a ilha e iniciar um abrigo dão materiais uma única vez.

O menu Esc destaca **Construir**, **Chefões**, **Minha base** e **Como brincar**, com figuras grandes. Tab e Shift+Tab navegam, Enter ativa e Esc volta. **Marcar minha base** guarda um chão seguro; **Voltar à base** retorna à construção. Em **Mais opções** ficam o estilo da Aventura, a dificuldade, a proteção de borda, o guia e a importação ou exportação do mundo.

A dificuldade Tranquila é o padrão: menos dano dos monstros e mais tempo nos avisos dos chefões. No OneBlock, também há menos inimigos e a lava surpresa fica desligada. O núcleo avisa antes de gerar um monstrinho.

## Controles

- WASD: andar. Espaço: pular ou nadar para cima. Shift: correr ou mergulhar.
- Botão esquerdo: clique para remover na Construção livre; segure para minerar na Sobrevivência; clique ou segure para atacar. Botão direito: colocar, usar ou enfrentar um chefão.
- 1–9 ou roda do mouse: escolher material. Q: soltar um bloco.
- B: catálogo na Construção livre; mochila na Sobrevivência. C: criar tochas, cama, martelos e armaduras, fora das lutas. H: ajuda.
- V: ver o personagem por trás e voltar à primeira pessoa. A armadura aparece no corpo, com capacete.
- F: ligar ou desligar o voo na Construção livre. Espaço sobe, Ctrl desce e Shift acelera.
- Z: desfazer. Y ou Shift+Z: refazer, na Construção livre e fora das lutas. Até 50 edições por sessão; uma nova edição descarta o refazer.
- Esc: pausar e salvar.

A proteção de borda deixa o personagem entrar em buracos andando. Na Construção livre, procura um chão sólido em qualquer profundidade. Na Sobrevivência, aceita descidas de até quatro blocos, sem dano de queda. O vazio e as colunas com lava continuam bloqueados. Pular permite sair da borda. A proteção pode ser desligada no menu e não impede um empurrão durante o salto.

## Chefões

São três, e todos opcionais: o **Sentinela** na ruína, o **Guardião** no santuário e o **Faroleiro** no farol ao sul.

**Esc > Chefões > Treinar com segurança** pratica onda, círculo e golpe sem perder vida. **Visitar o Sentinela**, **Visitar o Guardião** e **Visitar o Faroleiro** pedem confirmação antes de transportar. Também dá para caminhar até a estátua, o altar ou a luz do farol. Na Construção livre, voo e invulnerabilidade ficam suspensos durante a batalha e voltam ao vencer, sair ou morrer.

Pule as ondas, saia dos círculos e ataque quando aparecer **BATA AGORA!**. Comida recupera vida com o botão direito. Morrer mantém os itens, escolhe um ponto seguro e concede cinco segundos de proteção. O menu permite sair da batalha.

Cada chefão concede um troféu único e materiais na primeira vitória, além de uma decoração: emblema do Sentinela, lanterna do Guardião ou lanterna do farol. Os troféus também aparecem em Decoração no catálogo. As batalhas podem ser repetidas. Ataques e restaurações de estruturas preservam os blocos colocados pelo jogador.

## Materiais e saves

O catálogo inclui oito cores e vidro com janelas transparentes. A barra criativa fica separada da mochila de Sobrevivência. O tutorial visual e as ideias de casa, ponte e castelo são opcionais: cada ideia tem três etapas e um botão para colocar os materiais na barra, sem construir sozinha no mundo. A prévia translúcida mostra onde o próximo bloco vai ficar.

Os materiais que não cabem nos nove espaços vão para a mochila. B troca o material do espaço selecionado por um da mochila. Tudo isso é salvo, inclusive o inventário de Sobrevivência durante a Construção livre.

O aviso no canto indica se o navegador gravou a partida. No menu, **Exportar mundo** baixa um JSON e **Importar mundo** valida o arquivo antes de substituir só o modo correspondente. Arquivos acima de 20 MB ou 300 mil edições são recusados. Saves locais v1 a v4 continuam legíveis. O formato atual é v5.

Uma cópia anterior válida por modo pode ser recuperada pelo menu. O checkpoint atualiza cerca de uma vez por minuto, ou ao trocar de mundo. Um save principal corrompido usa essa cópia. Recarregar durante um combate ou treino volta à posição anterior ao encontro, sem chefão ativo, e preserva base, inventários, estilo, voo, guia e prêmios já confirmados.

## Conforto

**Som e conforto**, na abertura, e **Mais opções**, na pausa, oferecem:

- Câmera tranquila: tira o balanço ao andar, o tremor dos impactos e a ampliação ao correr.
- Efeitos suaves: reduz partículas, flashes e a pulsação da barra.
- Qualidade Leve, Equilibrada (padrão) ou Caprichada: ajusta a distância do terreno, a resolução, as partículas e as luzes de tocha. A preferência fica neste navegador.

## Verificação

```sh
pnpm test
pnpm build
```

Os testes cobrem inventário, receitas, desfazer, vidro, saves v1–v5, recuperação, base obstruída, controles, treino, os três chefões, morte, saída, recarga e OneBlock. A evidência e os limites estão em [TESTING.md](TESTING.md). A avaliação de diversão com a criança continua sendo uma sessão acompanhada.

TypeScript, three.js e Vite. Texturas em canvas, áudio sintetizado e malhas voxel em workers. Esta versão é para um jogador.
