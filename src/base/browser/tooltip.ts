import './tooltip.css';
import { Disposable } from '../common/lifecycle.ts';
import { $, listen } from './dom.ts';

let nextId = 0;

export class Tooltip extends Disposable {
	private readonly element = $('.tooltip.popover', { popover: 'hint', role: 'tooltip' });
	private readonly target: HTMLElement;
	private readonly description: string | null;
	private readonly text: string;
	private pinned = false;
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(target: HTMLElement, text: string) {
		super();
		this.target = target;
		this.text = text;
		this.description = target.getAttribute('aria-describedby');
		this.element.id = `tooltip-${++nextId}`;
		this.element.textContent = text;
		target.setAttribute('aria-describedby', [this.description, this.element.id].filter(Boolean).join(' '));
		target.after(this.element);
		this.register(listen(target, 'pointerenter', () => this.schedule()));
		this.register(listen(target, 'pointerleave', () => this.hide()));
		this.register(listen(target, 'focus', () => this.schedule()));
		this.register(listen(target, 'blur', () => this.hide()));
		this.register(listen(target, 'pointerdown', () => this.hide()));
		this.register(listen(target, 'keydown', event => {
			if (event.key == 'Escape') this.hide();
		}));
		const owner = target.closest<HTMLElement>('[popover]');
		if (owner) this.register(listen(owner, 'beforetoggle', event => {
			if (event.newState == 'closed') this.hide();
		}));
	}

	private schedule(): void {
		if (this.pinned) return;
		clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			if (this.target.checkVisibility()) this.element.showPopover({ source: this.target });
		}, 500);
	}

	private hide(): void {
		clearTimeout(this.timer);
		if (this.pinned) return;
		if (this.element.matches(':popover-open')) this.element.hidePopover();
	}

	/** Keep this tooltip visible alongside other pinned tooltips. */
	pin(content: Node | string): void {
		this.unpin();
		this.hide();
		this.pinned = true;
		this.element.popover = 'manual';
		this.element.replaceChildren(content);
		if (this.target.checkVisibility()) this.element.showPopover({ source: this.target });
	}

	unpin(): void {
		if (!this.pinned) return;
		this.pinned = false;
		this.hide();
		this.element.popover = 'hint';
		this.element.textContent = this.text;
	}

	override dispose(): void {
		this.unpin();
		this.hide();
		this.element.remove();
		if (this.description == null) this.target.removeAttribute('aria-describedby');
		else this.target.setAttribute('aria-describedby', this.description);
		super.dispose();
	}
}
