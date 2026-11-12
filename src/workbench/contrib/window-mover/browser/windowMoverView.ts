import './windowMover.css';
import '../../../../base/browser/button.css';
import { $, listen } from '../../../../base/browser/dom.ts';
import { i } from '../../../../base/browser/icon.ts';
import { mainWindow } from '../../../../base/browser/window.ts';
import type { ServicesAccessor } from '../../../../platform/common/instantiation.ts';
import { AppView } from '../../../browser/apps.ts';
import { fuzzyMatch } from '../common/fuzzyMatch.ts';
import { IWindowMoverService, type WindowTarget } from '../common/windowMover.ts';

export class WindowMoverView extends AppView {
	static readonly id = 'window-mover';
	static readonly title = '移动窗口';
	static readonly icon = 'move';
	static readonly order = 3;
	static readonly hidden = true;

	private readonly service: IWindowMoverService;
	private readonly search = $('input', {
		type: 'search', placeholder: '搜索应用或窗口名称', 'aria-label': '搜索窗口',
		autocomplete: 'off', spellcheck: 'false', role: 'combobox',
		'aria-controls': 'window-mover-results', 'aria-expanded': 'true', 'aria-autocomplete': 'list'
	});
	private readonly searchIsland = $('.island.window-mover-search', undefined, this.search);
	private readonly list = $('.window-mover-list', { id: 'window-mover-results', role: 'listbox', 'aria-label': '窗口' });
	private readonly results = $('.island.window-mover-results', undefined, this.list);
	private readonly title = $('h2');
	private readonly directions = $('.window-mover-directions');
	private readonly directionButtons: HTMLButtonElement[] = [];
	private directionIndex = 4;
	private readonly placement = $('section.island.window-mover-placement', { hidden: '', 'aria-label': '选择窗口位置' }, this.title, this.directions);
	private readonly message = $('p', { role: 'status' });
	private readonly retry = $('button.button', { type: 'button', hidden: '' }, '重新读取窗口');
	private readonly status = $('.window-mover-status', { hidden: '' }, this.message, this.retry);
	private windows: readonly WindowTarget[] = [];
	private matches: number[] = [];
	private selected = 0;
	private target: WindowTarget | undefined;
	private active = false;
	private busy = false;
	private cancelPending = false;

	constructor(accessor: ServicesAccessor, container: HTMLElement) {
		super(accessor, container);
		this.service = accessor.get(IWindowMoverService);
		container.classList.add('window-mover');
		container.append(this.searchIsland, this.results, this.placement);
		for (const [number, label, icon] of [
			[7, '左上', 'arrow-up-left'], [8, '上中', 'arrow-up'], [9, '右上', 'arrow-up-right'],
			[4, '左中', 'arrow-left'], [5, '居中', 'center-to-fit'], [6, '右中', 'arrow-right'],
			[1, '左下', 'arrow-down-left'], [2, '下中', 'arrow-down'], [3, '右下', 'arrow-down-right']
		] as const) {
			const button = $('button.button', { type: 'button', 'aria-label': `${number} ${label}` }, $('kbd', undefined, String(number)), i(icon));
			const index = this.directionButtons.length;
			this.register(listen(button, 'focus', () => { this.directionIndex = index; }));
			this.register(listen(button, 'click', () => { void this.finish(number); }));
			this.directionButtons.push(button);
			this.directions.append(button);
		}
		this.register(listen(this.search, 'input', () => { if (!this.busy) this.filter(); }));
		this.register(listen(this.retry, 'click', () => { void this.load(); }));
		this.register(listen(mainWindow, 'keydown', event => this.onKeyDown(event)));
	}

	override activate(): void {
		this.active = true;
		if (this.busy) return;
		this.search.value = '';
		void this.load();
	}

	override deactivate(): void {
		this.active = false;
		this.cancelPending = false;
	}

	private async perform(action: () => Promise<void>): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		this.setDisabled(true);
		try {
			await action();
		} catch (error) {
			this.showStatus(String(error.message).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''), true);
		} finally {
			this.busy = false;
			this.setDisabled(false);
			if (this.active) {
				if (this.cancelPending) {
					this.cancelPending = false;
					void this.finish();
				} else {
					if (this.target) this.directionButtons[this.directionIndex].focus();
					else this.search.focus();
				}
			}
		}
	}

	private setDisabled(disabled: boolean): void {
		this.container.setAttribute('aria-busy', String(disabled));
		this.search.disabled = disabled;
		this.retry.disabled = disabled;
		for (const button of this.directionButtons) button.disabled = disabled;
	}

	private showStatus(message: string, retry = false): void {
		this.message.textContent = message;
		this.retry.hidden = !retry;
		this.status.hidden = false;
		(this.target ? this.placement : this.results).append(this.status);
	}

	private async load(): Promise<void> {
		await this.perform(async () => {
			this.target = undefined;
			this.searchIsland.hidden = false;
			this.results.hidden = false;
			this.list.hidden = true;
			this.list.replaceChildren();
			this.matches = [];
			this.placement.hidden = true;
			this.showStatus('正在读取窗口…');
			this.windows = await this.service.list();
			this.filter();
		});
	}

	private filter(): void {
		const pattern = this.search.value.trim();
		this.matches = this.windows.map((window, index) => ({ index, score: fuzzyMatch(pattern, `${window.app} ${window.title}`) }))
			.filter(item => item.score > -Infinity)
			.sort((a, b) => b.score - a.score)
			.map(item => item.index);
		this.selected = 0;
		this.list.replaceChildren(...this.matches.map((index, row) => {
			const window = this.windows[index];
			const item = $('.window-mover-result', { id: `window-mover-result-${row}`, role: 'option' },
				$('strong', undefined, window.title || '未命名窗口'), $('span', undefined, window.app));
			item.addEventListener('click', () => { this.selected = row; void this.choose(); });
			return item;
		}));
		this.list.hidden = this.matches.length == 0;
		this.status.hidden = this.matches.length > 0;
		if (!this.matches.length) this.showStatus('没有匹配的窗口', !this.windows.length);
		this.updateSelection();
	}

	private updateSelection(): void {
		for (let index = 0; index < this.list.children.length; index++) this.list.children[index].setAttribute('aria-selected', String(index == this.selected));
		if (this.matches.length) this.search.setAttribute('aria-activedescendant', `window-mover-result-${this.selected}`);
		else this.search.removeAttribute('aria-activedescendant');
		this.list.children[this.selected]?.scrollIntoView({ block: 'nearest' });
	}

	private async choose(): Promise<void> {
		const index = this.matches[this.selected];
		if (index == null) return;
		await this.perform(async () => {
			this.status.hidden = true;
			await this.service.select(index);
			this.target = this.windows[index];
			this.directionIndex = 4;
			this.title.textContent = `${this.target.app} — ${this.target.title || '未命名窗口'}`;
			this.searchIsland.hidden = true;
			this.results.hidden = true;
			this.placement.hidden = false;
		});
	}

	private async finish(direction?: number): Promise<void> {
		await this.perform(async () => {
			await this.service.finish(direction);
			this.requestClose();
		});
	}

	private onKeyDown(event: KeyboardEvent): void {
		if (!this.active || event.defaultPrevented || event.isComposing) return;
		if (event.key == 'Escape') {
			event.preventDefault();
			if (this.busy) this.cancelPending = true;
			else void this.finish();
			return;
		}
		if (this.busy || event.metaKey || event.ctrlKey || event.altKey) return;
		if (this.target) {
			const key = /^Numpad[1-9]$/.test(event.code) ? event.code.slice(-1) : event.key;
			if (/^[1-9]$/.test(key)) {
				event.preventDefault();
				if (!event.repeat) void this.finish(Number(key));
			} else if ((key == 'Enter' || key == ' ') && event.target == this.directionButtons[this.directionIndex]) {
				event.preventDefault();
				if (!event.repeat) this.directionButtons[this.directionIndex].click();
			} else if (key == 'ArrowLeft' || key == 'ArrowRight' || key == 'ArrowUp' || key == 'ArrowDown') {
				event.preventDefault();
				const row = Math.floor(this.directionIndex / 3);
				const column = this.directionIndex % 3;
				if (key == 'ArrowLeft' && column > 0) this.directionIndex--;
				if (key == 'ArrowRight' && column < 2) this.directionIndex++;
				if (key == 'ArrowUp' && row > 0) this.directionIndex -= 3;
				if (key == 'ArrowDown' && row < 2) this.directionIndex += 3;
				this.directionButtons[this.directionIndex].focus();
			}
		} else if (event.key == 'Enter') {
			event.preventDefault();
			if (!event.repeat) void this.choose();
		} else if (event.key == 'ArrowDown' || event.key == 'ArrowUp') {
			event.preventDefault();
			if (this.matches.length) this.selected = (this.selected + (event.key == 'ArrowDown' ? 1 : this.matches.length - 1)) % this.matches.length;
			this.updateSelection();
		}
	}

	override dispose(): void {
		this.deactivate();
		super.dispose();
	}
}
