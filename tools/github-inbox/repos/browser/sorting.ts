interface SortCallbacks {
  begin(path: string): boolean;
  end(paths: string[] | undefined): void;
}

interface SortRow {
  element: HTMLElement;
  top: number;
  height: number;
}

export class RepoSorting {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly callbacks: SortCallbacks;
  private rows: SortRow[] = [];
  private source = -1;
  private target = -1;
  private pointer = -1;
  private startY = 0;
  private pointerY = 0;
  private offsetY = 0;
  private scrollTop = 0;
  private overlay: HTMLElement | undefined;
  private handle: HTMLElement | undefined;
  private frame = 0;
  private settling = false;

  constructor(list: HTMLElement, callbacks: SortCallbacks) {
    this.list = list;
    this.root = list.closest<HTMLElement>('#repos')!;
    this.callbacks = callbacks;
    list.addEventListener('pointerdown', event => this.begin(event));
  }

  private begin(event: PointerEvent) {
    if (event.button != 0 || this.pointer != -1 || !(event.target instanceof Element)) return;
    const handle = event.target.closest<HTMLElement>('.drag-handle');
    const row = handle?.closest<HTMLElement>('.repo');
    if (!handle || !row || !this.callbacks.begin(row.dataset.path!)) return;
    event.preventDefault();
    this.rows = Array.from(this.list.children, element => {
      const bounds = element.getBoundingClientRect();
      return { element: element as HTMLElement, top: bounds.top, height: bounds.height };
    });
    this.source = this.rows.findIndex(item => item.element == row);
    this.target = this.source;
    this.pointer = event.pointerId;
    this.startY = this.pointerY = event.clientY;
    this.offsetY = event.clientY - this.rows[this.source].top;
    this.scrollTop = this.list.parentElement!.scrollTop;
    this.handle = handle;
    handle.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.cancel);
    window.addEventListener('blur', this.cancel);
    window.addEventListener('keydown', this.keydown);
  }

  private move = (event: PointerEvent) => {
    if (event.pointerId != this.pointer || this.settling) return;
    this.pointerY = event.clientY;
    if (!this.overlay && Math.abs(this.pointerY - this.startY) >= 4) {
      const row = this.rows[this.source].element;
      const bounds = row.getBoundingClientRect();
      this.overlay = row.cloneNode(true) as HTMLElement;
      this.overlay.classList.add('drag-overlay');
      this.overlay.inert = true;
      this.overlay.setAttribute('aria-hidden', 'true');
      this.overlay.style.left = `${bounds.left}px`;
      this.overlay.style.top = `${bounds.top}px`;
      this.overlay.style.width = `${bounds.width}px`;
      this.root.append(this.overlay);
      row.classList.add('drag-source');
      this.root.classList.add('sorting');
      this.list.classList.add('sorting-list');
      this.frame = requestAnimationFrame(this.tick);
    }
  };

  private tick = () => {
    if (!this.overlay || this.settling) return;
    const content = this.list.parentElement!;
    const bounds = content.getBoundingClientRect();
    const edge = 30;
    const speed = this.pointerY < bounds.top + edge
      ? -Math.min(8, (bounds.top + edge - this.pointerY) / 4)
      : this.pointerY > bounds.bottom - edge ? Math.min(8, (this.pointerY - bounds.bottom + edge) / 4) : 0;
    content.scrollTop += speed;
    const scroll = content.scrollTop - this.scrollTop;
    this.target = this.rows.filter((row, index) => index != this.source && this.pointerY > row.top - scroll + row.height / 2).length;
    const order = this.order();
    let top = this.rows[0].top;
    for (const index of order) {
      const row = this.rows[index];
      row.element.style.transform = `translateY(${top - row.top}px)`;
      top += row.height;
    }
    this.overlay.style.top = `${this.pointerY - this.offsetY}px`;
    this.frame = requestAnimationFrame(this.tick);
  };

  private order(): number[] {
    const order = this.rows.map((_, index) => index).filter(index => index != this.source);
    order.splice(this.target, 0, this.source);
    return order;
  }

  private up = (event: PointerEvent) => {
    if (event.pointerId != this.pointer) return;
    this.pointerY = event.clientY;
    if (this.overlay) {
      cancelAnimationFrame(this.frame);
      this.tick();
    }
    const bounds = this.list.parentElement!.getBoundingClientRect();
    void this.finish(event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
  };

  private cancel = () => {
    void this.finish(true);
  };

  private keydown = (event: KeyboardEvent) => {
    if (event.key == 'Escape') {
      event.preventDefault();
      this.cancel();
    }
  };

  private async finish(cancel: boolean) {
    if (this.settling || this.pointer == -1) return;
    this.settling = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.cancel);
    window.removeEventListener('blur', this.cancel);
    window.removeEventListener('keydown', this.keydown);
    if (this.handle?.hasPointerCapture(this.pointer)) this.handle.releasePointerCapture(this.pointer);
    if (cancel) {
      this.target = this.source;
      for (const row of this.rows) row.element.style.transform = '';
    }
    const paths = this.overlay && !cancel && this.target != this.source
      ? this.order().map(index => this.rows[index].element.dataset.path!) : undefined;
    if (this.overlay) {
      const top = this.rows[0].top - (this.list.parentElement!.scrollTop - this.scrollTop)
        + this.order().slice(0, this.target).reduce((height, index) => height + this.rows[index].height, 0);
      const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160;
      await this.overlay.animate([
        { top: this.overlay.style.top, transform: 'scale(1.015)' },
        { top: `${top}px`, transform: 'scale(1)' }
      ], { duration, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).finished.catch(() => {});
      this.overlay.remove();
    }
    this.list.classList.remove('sorting-list');
    for (const row of this.rows) {
      row.element.classList.remove('drag-source');
      row.element.style.transform = '';
    }
    this.root.classList.remove('sorting');
    this.overlay = undefined;
    this.pointer = -1;
    this.settling = false;
    this.callbacks.end(paths);
  }
}
