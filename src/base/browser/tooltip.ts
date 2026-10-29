import './tooltip.css';
import { Disposable } from '../common/lifecycle.ts';
import { $, listen } from './dom.ts';

let nextId = 0;

export class Tooltip extends Disposable {
	private readonly element = $('.tooltip.popover', { popover: 'hint', role: 'tooltip' });
	private readonly target: HTMLElement;
	private readonly description: string | null;
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(target: HTMLElement, text: string) {
		super();
		this.target = target;
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
		clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			if (this.target.checkVisibility()) this.element.showPopover({ source: this.target });
		}, 500);
	}

	private hide(): void {
		clearTimeout(this.timer);
		if (this.element.matches(':popover-open')) this.element.hidePopover();
	}

	override dispose(): void {
		this.hide();
		this.element.remove();
		if (this.description == null) this.target.removeAttribute('aria-describedby');
		else this.target.setAttribute('aria-describedby', this.description);
		super.dispose();
	}
}
