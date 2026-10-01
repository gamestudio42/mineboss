# Validação — 30/09/2026

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
