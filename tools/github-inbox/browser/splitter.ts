const divider = document.getElementById('repos-divider')!;
const main = divider.parentElement!;
const storageKey = 'github-inbox.repos-ratio';
let ratio = Number(localStorage.getItem(storageKey));

function applyRatio(): void {
  main.style.setProperty('--repos-height', `${ratio * 100}%`);
}

if (Number.isFinite(ratio) && ratio > 0 && ratio < 1) applyRatio();

divider.addEventListener('dblclick', () => {
  ratio = 0;
  main.style.removeProperty('--repos-height');
  localStorage.removeItem(storageKey);
});

divider.addEventListener('pointerdown', event => {
  if (event.button != 0) return;
  event.preventDefault();
  divider.setPointerCapture(event.pointerId);
  document.body.classList.add('resizing-repos');
});

divider.addEventListener('pointermove', event => {
  if (!divider.hasPointerCapture(event.pointerId)) return;
  const bounds = main.getBoundingClientRect();
  const height = Math.max(110, Math.min(bounds.height - 105, bounds.bottom - event.clientY - 2.5));
  ratio = height / bounds.height;
  applyRatio();
});

divider.addEventListener('pointerup', event => {
  if (!divider.hasPointerCapture(event.pointerId)) return;
  divider.releasePointerCapture(event.pointerId);
  if (ratio > 0 && ratio < 1) localStorage.setItem(storageKey, String(ratio));
});

divider.addEventListener('lostpointercapture', () => {
  document.body.classList.remove('resizing-repos');
});
