export function lessonCaption(step: number): string {
  return step === 1 ? 'Mire no chão. Aperte o botão direito para colocar.' : 'Mire no bloco. Clique com o esquerdo para remover.';
}

/** Visual mouse cue shared by the optional construction lesson. */
export function updateBuildLesson(step: number): void {
  const root = document.getElementById('build-lesson')!;
  root.classList.toggle('hidden', step === 0);
  if (!step) return;
  root.dataset.step = String(step);
  const caption = root.querySelector('span')!;
  caption.textContent = lessonCaption(step);
}
