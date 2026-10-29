import './toast.css';
import { Disposable } from '../common/lifecycle.ts';
import { $, listen } from './dom.ts';
import { i } from './icon.ts';

export class Toast extends Disposable {
	private readonly element = $('.toast.island.popover', { popover: 'manual', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
	private readonly message = $('span');
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(container: HTMLElement) {
		super();
		const close = $('button.button.icon-button', { type: 'button', 'aria-label': '关闭提示', title: '关闭提示' }, i('close'));
		this.element.append(this.message, close);
		container.append(this.element);
		this.register(listen(close, 'click', () => this.hide()));
	}

	show(message: string, error = false, source?: HTMLElement): void {
		clearTimeout(this.timer);
		this.message.textContent = message;
		this.element.classList.toggle('error', error);
		this.element.showPopover({ source });
		this.timer = error ? undefined : setTimeout(() => this.hide(), 3000);
	}

	hide(): void {
		clearTimeout(this.timer);
		if (this.element.matches(':popover-open')) this.element.hidePopover();
	}

	override dispose(): void {
		this.hide();
		this.element.remove();
		super.dispose();
	}
}
