const namespace = 'http://www.w3.org/2000/svg';
const overlay = document.createElementNS(namespace, 'svg');
overlay.classList.add('pr-connections');
overlay.setAttribute('aria-hidden', 'true');
const definitions = document.createElementNS(namespace, 'defs');
const arrow = document.createElementNS(namespace, 'marker');
arrow.id = 'pr-connection-arrow';
arrow.setAttribute('viewBox', '0 0 8 8');
arrow.setAttribute('refX', '7');
arrow.setAttribute('refY', '4');
arrow.setAttribute('markerWidth', '8');
arrow.setAttribute('markerHeight', '8');
arrow.setAttribute('markerUnits', 'userSpaceOnUse');
arrow.setAttribute('orient', 'auto');
const arrowhead = document.createElementNS(namespace, 'path');
arrowhead.setAttribute('d', 'M 0 0 L 8 4 L 0 8 L 2 4 Z');
arrowhead.setAttribute('fill', 'context-stroke');
arrowhead.setAttribute('stroke', 'none');
arrow.append(arrowhead);
definitions.append(arrow);
const lines = document.createElementNS(namespace, 'g');
lines.classList.add('pr-connection-lines');
overlay.append(definitions, lines);
document.body.append(overlay);

const selector = '.notification[data-pr-url], #repos-list button[data-pr-url]';
let frame = 0;
let pointerX = 0;
let pointerY = 0;

function clear(): void {
  cancelAnimationFrame(frame);
  frame = 0;
  lines.replaceChildren();
}

function anchor(element: Element): DOMRect | undefined {
  const bounds = element.getBoundingClientRect();
  const container = element.closest('.notifications, #repos .content');
  if (!container || !bounds.width || !bounds.height) return;
  const clip = container.getBoundingClientRect();
  if (bounds.top < Math.max(0, clip.top) || bounds.bottom > Math.min(innerHeight, clip.bottom)
    || bounds.left < Math.max(0, clip.left) || bounds.right > Math.min(innerWidth, clip.right)) return;
  return bounds;
}

function draw(): void {
  frame = 0;
  const source = document.elementFromPoint(pointerX, pointerY)?.closest<HTMLElement>(selector);
  if (!source || document.querySelector('.detail.open, .diff-panel.open, #repos.sorting, body.resizing-repos')) {
    clear();
    return;
  }
  const fromNotification = source.classList.contains('notification');
  const targets = document.querySelectorAll<HTMLElement>(fromNotification
    ? '#repos-list button[data-pr-url]' : '.notification[data-pr-url]');
  const paths: string[] = [];
  for (const target of targets) {
    if (target.dataset.prUrl != source.dataset.prUrl) continue;
    const notification = fromNotification ? source : target;
    const repo = fromNotification ? target : source;
    const start = anchor(repo);
    const end = anchor(notification.querySelector('.notification-icon')!);
    if (!start || !end) continue;
    const x1 = start.left + start.width / 2;
    const y1 = start.top - 2;
    const x2 = end.left + end.width / 2;
    const y2 = end.bottom + 3;
    const bend = Math.max(24, Math.abs(y1 - y2) * .45);
    paths.push(fromNotification
      ? `M ${x2} ${y2} C ${x2} ${y2 + bend}, ${x1} ${y1 - bend}, ${x1} ${y1}`
      : `M ${x1} ${y1} C ${x1} ${y1 - bend}, ${x2} ${y2 + bend}, ${x2} ${y2}`);
  }
  while (lines.children.length > paths.length) lines.lastElementChild!.remove();
  for (const [index, d] of paths.entries()) {
    let path = lines.children[index];
    if (!path) {
      path = document.createElementNS(namespace, 'path');
      path.setAttribute('marker-end', 'url(#pr-connection-arrow)');
      lines.append(path);
    }
    if (path.getAttribute('d') != d) path.setAttribute('d', d);
  }
  frame = requestAnimationFrame(draw);
}

document.addEventListener('pointermove', event => {
  pointerX = event.clientX;
  pointerY = event.clientY;
  if (event.buttons || event.pointerType == 'touch') clear();
  else if (!frame) draw();
});
document.addEventListener('pointerdown', clear);
document.documentElement.addEventListener('pointerleave', clear);
window.addEventListener('blur', clear);
document.addEventListener('visibilitychange', clear);
