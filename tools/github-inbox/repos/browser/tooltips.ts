export class Tooltips {
  private readonly panel = document.createElement('div');
  private readonly root: HTMLElement;
  private target: HTMLElement | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(root: HTMLElement) {
    this.root = root;
    this.panel.id = 'repos-tooltip';
    this.panel.className = 'tooltip';
    this.panel.setAttribute('role', 'tooltip');
    this.panel.hidden = true;
    root.append(this.panel);

    document.addEventListener('pointerover', event => {
      if (event.buttons || event.pointerType == 'touch') return;
      const target = this.find(event.target);
      if (target && target != this.target) this.schedule(target, 250);
    });
    document.addEventListener('pointerout', event => {
      if (this.find(event.relatedTarget) != this.target) this.hide();
    });
    document.addEventListener('focusin', event => {
      const target = this.find(event.target);
      if (target?.matches(':focus-visible')) this.schedule(target, 0);
    });
    document.addEventListener('focusout', () => this.hide());
    document.addEventListener('pointerdown', () => this.hide(), true);
    document.addEventListener('keydown', event => {
      if (event.key == 'Escape') this.hide();
    });
    document.addEventListener('scroll', () => this.hide(), true);
    window.addEventListener('blur', () => this.hide());
    window.addEventListener('resize', () => this.hide());

    new MutationObserver(records => {
      if (!this.target) return;
      if (!this.target.isConnected) this.hide();
      else if (!this.panel.hidden && records.some(record => record.type == 'attributes' && record.target == this.target)) this.show();
    }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-tooltip'] });
  }

  hide() {
    clearTimeout(this.timer);
    if (this.target) {
      const ids = (this.target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id != this.panel.id);
      if (ids.length) this.target.setAttribute('aria-describedby', ids.join(' '));
      else this.target.removeAttribute('aria-describedby');
    }
    this.target = undefined;
    this.panel.hidden = true;
  }

  private find(target: EventTarget | null): HTMLElement | undefined {
    return target instanceof Element && this.root.contains(target) ? target.closest<HTMLElement>('[data-tooltip]') ?? undefined : undefined;
  }

  private schedule(target: HTMLElement, delay: number) {
    this.hide();
    this.target = target;
    this.timer = setTimeout(() => this.show(), delay);
  }

  private show() {
    const target = this.target;
    const text = target?.dataset.tooltip;
    if (!target?.isConnected || !text || this.root.classList.contains('sorting')) {
      this.hide();
      return;
    }
    const anchor = target.getBoundingClientRect();
    if (!anchor.width || !anchor.height) {
      this.hide();
      return;
    }
    this.panel.textContent = text;
    this.panel.hidden = false;
    const bounds = this.panel.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.left + (anchor.width - bounds.width) / 2, innerWidth - bounds.width - 8));
    const below = anchor.bottom + 6;
    const top = below + bounds.height <= innerHeight - 8 ? below : Math.max(8, anchor.top - bounds.height - 6);
    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${top}px`;
    const ids = new Set((target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
    ids.add(this.panel.id);
    target.setAttribute('aria-describedby', [...ids].join(' '));
  }
}
