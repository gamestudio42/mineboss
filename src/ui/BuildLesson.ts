export function lessonCaption(step: number, coarse = false): string {
  if (coarse) return step === 1 ? 'Olhe o chão e toque em Colocar.' : 'Olhe o bloco e toque em Tirar.';
  return step === 1 ? 'Mire no chão. Aperte o botão direito para colocar.' : 'Mire no bloco. Clique com o esquerdo para remover.';
}

/** Visual mouse cue shared by the optional construction lesson. */
export function updateBuildLesson(step: number, coarse = false): void {
  const root = document.getElementById('build-lesson')!;
  root.classList.toggle('hidden', step === 0);
  root.classList.toggle('coarse', coarse && step !== 0);
  if (!step) return;
  root.dataset.step = String(step);
  const caption = root.querySelector('span')!;
  caption.textContent = lessonCaption(step, coarse);
}
