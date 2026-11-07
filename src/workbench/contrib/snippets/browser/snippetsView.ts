import type { ServicesAccessor } from '../../../../platform/common/instantiation.ts';
import type { Keybinding } from '../../../../platform/browser/keybinding.ts';
import type { Snippet } from '../common/snippets.ts';

import { $, hasFocusedElement, isActiveElement, listen } from '../../../../base/browser/dom.ts';
import { Alt, Ctrl, Primary, Shift } from '../../../../base/browser/keyboard.ts';
import { ListAnimation } from '../../../../base/browser/listAnimation.ts';
import { Toast } from '../../../../base/browser/toast.ts';
import { mainWindow } from '../../../../base/browser/window.ts';
import { getErrorMessage } from '../../../../base/common/errors.ts';
import { IKeybindingService } from '../../../../platform/browser/keybinding.ts';
import { IClipboardService } from '../../../../platform/common/clipboard.ts';
import { AppView } from '../../../browser/apps.ts';
import { ISnippetsService } from '../common/snippets.ts';

export class SnippetsView extends AppView {
	static readonly id = 'snippets';
	static readonly title = 'Snippets';
	static readonly icon = 'document';
	static readonly order = 2;

	private readonly service: ISnippetsService;
	private readonly clipboard: IClipboardService;
	private readonly animation: ListAnimation;
	private readonly toast: Toast;
	private readonly input = $('textarea', { rows: '1', 'aria-label': '添加片段', placeholder: '写点什么…' });
	private readonly composer = $('.snippet.island', { tabindex: '0', 'aria-label': '添加片段' }, this.input);
	private readonly rows = new Map<string, HTMLElement>();
	private items: Snippet[] = [];
	private editing: string | undefined;
	private disposed = false;
	private confirming = false;
	private pointerEditor: HTMLTextAreaElement | undefined;
	private pointerId: number | undefined;

	constructor(accessor: ServicesAccessor, container: HTMLElement) {
		super(accessor, container);
		this.service = accessor.get(ISnippetsService);
		this.clipboard = accessor.get(IClipboardService);
		this.animation = this.register(new ListAnimation());
		this.toast = this.register(new Toast(container));
		container.classList.add('snippets');
		container.append(this.composer);
		this.input.disabled = true;
		this.register(listen(container, 'pointerdown', event => {
			const editor = event.target;
			if (event.button != 0 || !event.isPrimary) return;
			if (!(editor instanceof HTMLTextAreaElement) || editor.disabled || isActiveElement(editor)) return;
			this.resetPointer();
			this.pointerEditor = editor;
			this.pointerId = event.pointerId;
			editor.setPointerCapture(event.pointerId);
		}));
		this.register(listen(container, 'pointerup', event => {
			if (event.pointerId != this.pointerId) return;
			const editor = this.pointerEditor;
			if (editor && isActiveElement(editor) && editor.selectionStart == editor.selectionEnd) editor.select();
			this.resetPointer();
		}));
		for (const type of ['pointercancel', 'lostpointercapture'] as const) {
			this.register(listen(container, type, event => {
				if (event.pointerId == this.pointerId) this.resetPointer();
			}));
		}
		this.register(listen(container, 'focusin', event => {
			if (event.target instanceof HTMLTextAreaElement) {
				const row = this.rowFor(event.target);
				if (row) this.edit(row);
			}
		}));
		this.register(listen(container, 'focusout', event => {
			if (event.target instanceof HTMLTextAreaElement && event.target != this.input) this.finishEdit(true, false);
		}));
		this.registerKeybindings(accessor.get(IKeybindingService));
		void this.load();
	}

	private resetPointer(): void {
		const editor = this.pointerEditor;
		const id = this.pointerId;
		this.pointerEditor = undefined;
		this.pointerId = undefined;
		if (editor && id != null && editor.hasPointerCapture(id)) editor.releasePointerCapture(id);
	}

	private async load(): Promise<void> {
		try {
			const items = await this.service.read();
			if (this.disposed) return;
			this.items = items;
			for (const item of items) this.addRow(item);
			this.input.disabled = false;
		} catch (error) { this.report(error); }
	}

	private report(error: unknown): void {
		if (!this.disposed) this.toast.show(getErrorMessage(error), true);
	}

	private save(): void {
		void this.service.write(this.items).catch(error => this.report(error));
	}

	private rowFor(target: EventTarget | null): HTMLElement | undefined {
		return target instanceof Element ? target.closest<HTMLElement>('.snippet') ?? undefined : undefined;
	}

	private addRow(item: Snippet): HTMLElement {
		const editor = $('textarea', { rows: '1', tabindex: '-1', 'aria-label': '编辑片段', placeholder: '退出编辑后按 Ctrl+X 删除' });
		editor.value = item.text;
		const row = $('.snippet.island', { tabindex: '0', 'data-id': item.id }, editor);
		this.rows.set(item.id, row);
		this.composer.before(row);
		return row;
	}

	private edit(row: HTMLElement): void {
		if (row == this.composer) { this.input.focus(); return; }
		const item = this.items.find(item => item.id == row.dataset.id);
		if (!item) return;
		if (this.editing == item.id) { row.querySelector('textarea')!.focus(); return; }
		this.finishEdit(true, false);
		this.editing = item.id;
		row.querySelector('textarea')!.focus();
	}

	private finishEdit(save: boolean, focus: boolean): void {
		const id = this.editing;
		if (id == null) return;
		const item = this.items.find(item => item.id == id)!;
		const row = this.rows.get(id)!;
		const editor = row.querySelector('textarea')!;
		const value = editor.value;
		const text = save ? value : item.text;
		this.editing = undefined;
		if (text != item.text) {
			this.items = this.items.map(item => item.id == id ? { id, text } : item);
			this.save();
		}
		this.animate(() => editor.value = text);
		if (focus) row.focus();
	}

	private registerKeybindings(service: IKeybindingService): void {
		const unfocused = () => this.container.checkVisibility() && !this.input.disabled && !hasFocusedElement();
		const inputFocused = (event: KeyboardEvent) => event.target instanceof HTMLTextAreaElement;
		const rowFocused = (event: KeyboardEvent) => event.target == this.rowFor(event.target);
		const itemFocused = (event: KeyboardEvent) => rowFocused(event) && event.target != this.composer;
		const bind = (key: string, modifiers: number, when: Keybinding['when'], handler: Keybinding['handler'], scope = this.container) => {
			this.register(service.registerKeybinding({ key, modifiers, scope, when, handler }));
		};

		bind('Enter', 0, unfocused, () => this.input.focus(), mainWindow.document.body);
		bind('Escape', 0, inputFocused, event => {
			if (event.target == this.input) this.composer.focus();
			else this.finishEdit(false, true);
		});
		bind('Escape', 0, rowFocused, event => this.rowFor(event.target)!.blur());
		bind('Enter', 0, inputFocused, event => {
			if (event.target == this.input) this.submit();
			else this.finishEdit(true, true);
		});
		bind('Enter', 0, rowFocused, event => this.edit(this.rowFor(event.target)!));
		bind('c', Primary, itemFocused, event => {
			const text = this.rowFor(event.target)!.querySelector('textarea')!.value;
			void this.clipboard.writeText(text).catch(error => this.report(error));
		});
		bind('x', Ctrl, itemFocused, event => this.remove(this.rowFor(event.target)!));
		bind('x', Ctrl | Shift, rowFocused, () => { void this.clear(); });
		for (const direction of [-1, 1]) {
			const key = direction < 0 ? 'ArrowUp' : 'ArrowDown';
			bind(key, 0, unfocused, () => {
				const target = direction < 0 ? this.composer : this.rows.get(this.items[0]?.id) ?? this.composer;
				target.focus();
			}, mainWindow.document.body);
			bind(key, 0, rowFocused, event => this.focusNeighbor(this.rowFor(event.target)!, direction));
			for (const modifiers of [Primary, Alt]) {
				bind(key, modifiers, itemFocused, event => this.move(this.rowFor(event.target)!, direction));
			}
		}
	}

	private submit(): void {
		if (!this.input.value.trim()) return;
		const item = { id: crypto.randomUUID(), text: this.input.value };
		this.animate(() => {
			this.items.push(item);
			this.addRow(item);
			this.input.value = '';
		});
		this.save();
		this.composer.scrollIntoView({ block: 'nearest' });
	}

	private focusNeighbor(row: HTMLElement, direction: number): void {
		const index = row == this.composer ? this.items.length : this.items.findIndex(item => item.id == row.dataset.id);
		const next = index + direction;
		const target = next == this.items.length ? this.composer : this.rows.get(this.items[next]?.id);
		target?.focus();
	}

	private move(row: HTMLElement, direction: number): void {
		const index = this.items.findIndex(item => item.id == row.dataset.id);
		const next = index + direction;
		if (next < 0 || next >= this.items.length) return;
		this.animate(() => {
			[this.items[index], this.items[next]] = [this.items[next], this.items[index]];
			const neighbor = this.rows.get(this.items[index].id)!;
			// moveBefore preserves focus while changing DOM order.
			this.container.moveBefore(row, direction < 0 ? neighbor : neighbor.nextSibling);
		});
		this.save();
		row.scrollIntoView({ block: 'nearest' });
	}

	private remove(row: HTMLElement): void {
		const index = this.items.findIndex(item => item.id == row.dataset.id);
		this.animate(() => {
			this.items.splice(index, 1);
			this.rows.delete(row.dataset.id!);
			row.remove();
		}, true);
		const next = this.rows.get(this.items[index]?.id);
		const previous = this.rows.get(this.items[index - 1]?.id);
		(next ?? previous ?? this.composer).focus();
		this.save();
	}

	private async clear(): Promise<void> {
		if (this.confirming || !this.items.length) return;
		this.confirming = true;
		try {
			if (await this.service.confirmClear() && !this.disposed) {
				this.editing = undefined;
				this.animate(() => {
					for (const row of this.rows.values()) row.remove();
					this.rows.clear();
					this.items = [];
				}, true);
				this.composer.focus();
				this.save();
			}
		} catch (error) { this.report(error); }
		finally { this.confirming = false; }
	}

	private animate(change: () => void, animateComposer = false): void {
		this.animation.run(() => {
			const elements = [...this.rows.values()];
			if (animateComposer) elements.push(this.composer);
			return elements;
		}, change);
	}

	override dispose(): void {
		this.disposed = true;
		this.resetPointer();
		super.dispose();
	}
}
