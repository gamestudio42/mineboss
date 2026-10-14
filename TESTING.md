# Validação — 30/09/2026

## Rodada mais recente: controles, construção e conforto

- `pnpm test`: **96 testes passaram**; `pnpm build` e `git diff --check` passaram.
- Corrigida colisão em quedas longas com frames de 100 ms: 76 alturas iniciais
  sobre uma plataforma de um bloco, a 60, 30 e 10 FPS simulados. Testados também
  movimentos rápidos contra parede e teto, além de todos os casos de degraus/buracos.
- Q só consome após colocar: limite superior e região ainda não carregada.
- Histórico de 50 ações com desfazer/refazer, colisão, proveniência, edição nova,
  alteração externa e células protegidas. Histórico não faz parte do save.
- Prévia de colocação válida/inválida sem editar o mundo; aviso da proteção de
  borda e câmera sem balanço; configurações antigas/inválidas e persistência.
- Aviso de onda próxima tem prioridade sobre vulnerabilidade e termina após a
  passagem. Geometrias e materiais dos dois chefões são liberados ao removê-los.
- Novo combate automatizado sem imunidade, teletransporte durante a luta ou cura
  artificial: controlador, esquiva, melee e consumo reais, seed/RNG 42, Tranquila.
  Sentinela: martelo de madeira, sem armadura, 23 s, 15 acertos, sem dano recebido.
  Guardião: ferro/armadura de ferro, 54 s, 34 acertos, 16,2 de dano recebido,
  três cogumelos consumidos e 15,8 de vida restante. Tempos de simulação acelerada;
  isso não mede habilidade humana nem facilidade para a criança.

### Interface e renderização

No Chrome em `127.0.0.1:5175`, a entrada normal confirmou Tab e Esc nos menus.
A captura real ainda retornou a tela de recuperação; não foi declarada corrigida.
O cenário `/tests/browser/` usa as classes reais, WebGL e workers com storage
exclusivamente em memória e captura simulada. Ele não carrega nem salva mundos
reais e não faz parte do build de produção.

Nesse cenário foram conferidos: colocar com botão direito no canvas, Z desfazer,
Y refazer, prévia inválida com motivo, pausa/volta, categorias, três etapas da casa,
botões de desfazer/refazer disponíveis conforme histórico e opções de qualidade,
câmera e efeitos. A pausa coube em 1024×640; opções extensas têm rolagem.
Evidências: [menu](docs/validation/menu-infantil.jpg) e
[ideias de construção](docs/validation/ideias-construcao.jpg).

O ensaio de estresse foi interrompido: a aba automatizada entregou apenas 94 quadros
em 89 segundos, com intervalos próximos a 1 s. Registrou 88 edições, 110 chunks,
194 geometrias e troca de Leve para Equilibrada, sem erro JavaScript observado.
Esses dados **não são benchmark de FPS** nem comprovação de ausência de vazamentos;
a atualização irregular da aba inviabilizou uma medição representativa.
O botão “Estresse 5 min” fica disponível no cenário para repetir no navegador normal.

Permanecem as verificações humanas descritas adiante: captura real no navegador da
família, sessão contínua e observação da criança. O build atual emite somente o
aviso de tamanho do pacote principal (732,46 kB / 192,58 kB gzip).

## Histórico das rodadas anteriores


Implementação das cinco etapas entregue. A validação técnica abaixo passou;
a aceitação completa de jogabilidade ainda depende de resolver/verificar a
captura do mouse no navegador de uso e observar a criança jogando. O plano
original permaneceu inalterado.

## Comandos executados

- `pnpm test`: **48 testes passaram**, nenhum ignorado ou falhando.
- `pnpm build`: TypeScript e build de produção passaram.
- `git diff --check`: sem erros de whitespace.
- Vite avisou sobre o pacote principal de 714,22 kB (186,66 kB gzip).
  O aviso não interrompeu o build; não é uma medição de FPS ou de memória.

## Cobertura automatizada

- Saves v1–v5, modos separados, importação inválida, falha de armazenamento,
  recuperação de cópia anterior válida e preservação do checkpoint entre menus.
- Barra criativa personalizada, reserva de sobrevivência, guia, estado do voo,
  base e construções preservados após alternar estilo e carregar um save.
- Ambos os chefões nos estilos Aventura/Construção livre,
  Aventura/Sobrevivência e OneBlock: confirmação cancelada, saída, morte,
  retorno à base e recarga durante o encontro.
- Máquinas de estado dos dois chefões vencidas por golpes reais nas janelas
  de vulnerabilidade e reiniciadas. Nessa simulação o jogador tem imunidade:
  ela valida o ciclo técnico, não comprova facilidade da luta.
- Vitórias/repetições sem duplicar troféus e retorno ao estilo anterior.
- Treino completado com onda, salto, saída do círculo e golpe; saída do treino
  restaura estado e base. Ataques não atravessam parede sólida.
- Base obstruída redireciona para um espaço seguro sem apagar blocos.
- Desfazer verifica colisões e alterações posteriores e preserva áreas protegidas.
- Vidro sólido com transparência por recorte e faces internas removidas.
- Cliques rápidos para colocar/remover, mineração contínua, proteção de borda,
  voo lento/rápido, rejeição de captura e limpeza de teclas na perda de foco.
- OneBlock: ritmos Curto/Clássico, marcos de ambos os encontros, núcleo sólido,
  metas opcionais com recompensa única e monstros adiados sem apoio/espaço
  seguro ou sobre o jogador/outro monstro.
- Receitas consomem materiais de barra e reserva de forma atômica; barra cheia
  não perde o resultado, equipamento não é rebaixado nem fabricado novamente.

Uma simulação acelerada percorreu **30 minutos de tempo de jogo** (108 mil
passos), com movimento, construção e descarregamento/recriação de regiões.
As edições foram preservadas. Isso **não equivale a uma sessão de 30 minutos
no navegador** nem mede vazamentos de GPU, áudio, workers ou desempenho real.

Para a seed 42, com martelo inicial e mineração sem interrupção, a carga até
o santuário foi de aproximadamente 317 s no Clássico (560 blocos) e 87 s no
Curto (140 blocos). Deslocamento, pausas e combate estão excluídos. O Curto é
uma escolha experimental para novos mundos; saves antigos continuam Clássicos.

## Teste de interface no Chrome

Usado `http://127.0.0.1:5175/`, com mundos de teste separados da origem habitual
`http://localhost:5173/`.

- Na rodada inicial: câmera, ligar/desligar voo, escolher Azul, colocar bloco,
  desfazer e abrir pausa funcionaram por interação de mouse/teclado.
- Nesta rodada: menus dos dois modos, catálogo com oito cores e vidro,
  destaque do Azul preservado após reload, troca de estilo, receitas,
  confirmação/início do Guardião e recarga fora da batalha foram conferidos.
- Criar uma cama reduziu tábuas de 16 para 12. Reabrir manteve 12. Receitas sem
  materiais ficaram desabilitadas, com custo e motivo visíveis.
- Nova partida OneBlock abriu a seleção Curto/Clássico e criou a ilha Curta.
- Capturas: [catálogo](docs/validation/catalogo.jpg) e
  [receitas](docs/validation/receitas.jpg).

**Limitação reproduzida:** após recarga, e também numa nova aba/partida desta
rodada, o Chrome rejeitou `requestPointerLock` com `WrongDocumentError: The
root document of this element is not valid for pointer lock`. A tela de
recuperação e retorno à pausa funcionou. Teclado para ativar e nova aba não
resolveram. Nenhuma configuração de segurança do navegador foi alterada.

Não foi determinado se a rejeição depende da sessão de automação/foco ou do
ambiente do jogo. Por isso, esta entrega não declara validados o ciclo completo
de câmera e combate no navegador nem as duas vitórias por jogo manual.

## Aceitação ainda pendente

1. No navegador usado pela família, confirmar captura, Esc e retomada, olhar,
   andar, selecionar por números/roda, construir, minerar e atacar após reload.
2. Fazer uma sessão real de 30 minutos, observando FPS com F3, crescimento do
   save, geração/descarregamento de regiões e estabilidade do navegador.
3. Acompanhar a criança por 15–20 minutos: construção livre, treino, chefão,
   saída e retorno à base. Ajustar dificuldade e ritmo a partir dessa observação;
   não houve sessão com a criança nem validação de diversão nesta entrega.

## Melhoria visual do martelo — 30/09/2026

- Após a melhoria, `pnpm test` passou os 48 testes e `pnpm build` passou
  TypeScript e produção (pacote principal de 719,41 kB, mesmo aviso de tamanho).
- Novo modelo voxel com cabeça reforçada, ponteiras, rebites, gema, cabo de
  madeira, empunhadura e mão com manga. Paletas distintas para madeira, ferro e ouro.
- Corrigida a sobreposição incorreta de faces: os itens em primeira pessoa são
  desenhados após limpar a profundidade do mundo, mantendo profundidade entre
  suas próprias peças. A geometria do martelo usa uma única chamada de desenho.
- Conferidos no Chrome, numa prévia temporária usando a classe real `ViewModel`
  e a câmera do jogo: três materiais, repouso, golpe, pose de impacto, retorno
  ao repouso e ferramenta diante de parede, com bloco e armadura equipados.
- A partida também carregou e desenhou mundo e modelo novo. A rejeição de
  captura do mouse descrita acima permanece; não foi afirmada uma nova sessão
  de combate manual. A prévia não depende da captura de mouse.
- Evidência: [martelo de ferro na prévia](docs/validation/martelo-ferro.jpg).
  Os arquivos temporários da prévia e do modelo antigo foram removidos.

## Descida de degraus — 30/09/2026

Reproduzido com `PlayerController`, `VoxelBody` e `World` reais: a proteção de
borda verificava apoio apenas no nível atual. Na pista com um degrau de um
bloco, o personagem parou em x=2,241, y=91 sem pular; com salto, chegou a
x=5,948, y=90. Dos 19 novos testes, 14 falharam antes da correção.

Na primeira correção, a proteção passou a aceitar chão seguro até um bloco abaixo. Durante a descida
por gravidade, mantém a verificação de apoio para não atravessar uma plataforma
estreita correndo e cair no vazio. Saltos, voo e natação liberam esse controle;
um retorno/teleporte para outra altura descarta a descida anterior.

Após a correção, os 19 cenários passaram: quatro direções em Sobrevivência e
Construção livre, diagonal, escada sucessiva, corrida em plataforma estreita
com passos de simulação de 1/120, 1/60, 1/30 e 1/10 s, vazio, queda de dois
blocos, lava, salto e subida automática. A suíte completa passou **67 testes**,
e o build de produção passou. A verificação desta correção foi por simulação
da física real; não foi uma sessão manual no navegador.

## Entrada em buracos — 30/09/2026

O relato seguinte mostrou que a regra de um bloco ainda impedia entrar em
buracos mais fundos. Nove novos cenários de entrada falharam com essa regra.
Ela foi substituída: na Construção livre, qualquer piso sólido seguro dentro
da altura do mundo permite a descida; na Sobrevivência, o limite corresponde
aos quatro blocos sem dano de queda. A busca para na lava e não aceita vazio.

Foram usados buracos fechados com paredes e piso reais, incluindo profundidades
de 2, 3 e 4 blocos em ambos os estilos, 8 e 16 no criativo e abertura de um único
bloco de largura. A descida de 32 blocos também foi verificada com passos de
simulação de 1/30 e 1/10 s. O personagem chegou ao fundo sem usar Espaço.
Permanecem cobertos degraus, diagonais, plataforma estreita, salto e subida.

Os testes de proteção confirmam bloqueio de queda com dano na Sobrevivência,
vazio nos dois estilos e lava mesmo quando existe pedra abaixo dela. A suíte
completa passou **81 testes**, e o build passou. São testes com as classes reais
de física e terreno; não representam uma sessão manual no navegador.
