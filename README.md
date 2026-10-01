# MineBoss

Jogo de blocos para construir, explorar e enfrentar dois chefões opcionais.
Interface em português, com Aventura e OneBlock e um save separado por modo.

## Jogar

```sh
pnpm install
pnpm dev
```

Abra http://localhost:5173/ num navegador com WebGL2. Use Node compatível com Vite 8 (20.19+ ou 22.12+).
A porta é fixa: se estiver ocupada, o servidor avisa em vez de abrir outro endereço com saves diferentes.

- **Aventura / Construção livre:** catálogo visual com materiais ilimitados e voo. Abra com B. O inventário de Sobrevivência fica guardado ao trocar de estilo.
- **Aventura / Sobrevivência:** explore o terreno, colete recursos, faça ferramentas e construa sua base.
- **OneBlock:** escolha o ritmo ao criar uma partida. No Curto, a ruína aparece aos 90 blocos e o santuário aos 140; no Clássico, aos 360 e 560. Saves antigos mantêm o ritmo Clássico. Metas opcionais de ampliar a ilha e iniciar um abrigo dão materiais uma única vez.

O menu Esc destaca continuar, blocos/mochila, ajuda e, quando disponível, visitar
os chefões. **Marcar minha base** guarda um chão seguro; **Voltar à base** retorna à construção depois de explorar ou lutar. Em **Mais opções**, altere o estilo da Aventura, dificuldade,
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
- Z: desfazer a última edição na Construção livre, fora das lutas.
- C: criar tochas, cama, martelos e armaduras na Sobrevivência, fora das lutas.
- Q: soltar um bloco. Esc: pausar e salvar.

A proteção de borda impede caminhar para fora do apoio. Pular permite sair da
borda. Ela pode ser desligada pelo menu; não impede empurrões enquanto no ar.

## Chefões e recompensas

Use **Treinar com segurança** para praticar onda, círculo e golpe sem perder vida.
**Visitar o Sentinela** e **Visitar o Guardião** abrem uma confirmação antes de transportar.
Você também pode explorar até a estátua na ruína e o altar subterrâneo.
Cada luta exige confirmação. Na Construção livre, voo e invulnerabilidade
ficam suspensos durante a batalha e voltam ao vencer, sair ou morrer.

Pule as ondas, saia dos círculos e ataque quando aparecer **BATA AGORA!**.
Morrer mantém os itens, verifica um ponto seguro de retorno e concede cinco
segundos de proteção contra golpes. O menu permite sair da batalha.

Cada chefão concede um troféu único e materiais na primeira vitória, além de desbloquear uma decoração temática: emblema do Sentinela ou lanterna do Guardião.
Os troféus conquistados também aparecem em Decoração no catálogo. As batalhas
podem ser repetidas pela estátua/altar. Ataques e restaurações de estruturas
preservam os blocos colocados pelo jogador.

## Materiais e saves

O catálogo inclui oito cores e vidro com janelas transparentes. As categorias
destacam o material selecionado; a barra criativa é guardada separadamente da
mochila de Sobrevivência. Tutorial visual e ideias de casa, ponte e castelo são opcionais.

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
