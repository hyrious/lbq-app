import type { ServicesAccessor } from '../../../../platform/common/instantiation.ts';
import type { ProcessedImage } from '../common/imagePortal.ts';

import { $, listen } from '../../../../base/browser/dom.ts';
import { i } from '../../../../base/browser/icon.ts';
import { Toast } from '../../../../base/browser/toast.ts';
import { Tooltip } from '../../../../base/browser/tooltip.ts';
import { mainWindow } from '../../../../base/browser/window.ts';
import { createWindowOverlay } from '../../../../base/browser/windowOverlay.ts';
import { AppView } from '../../../browser/apps.ts';
import { IImagePortalService } from './imagePortalService.ts';

export class ImagePortalView extends AppView {
	static readonly id = 'image-portal';
	static readonly title = 'Image Portal';
	static readonly icon = 'image';

	private readonly service: IImagePortalService;
	private readonly picker = $('input', { type: 'file', accept: 'image/*,.heic,.heif', hidden: '' });
	private readonly choose = $('button.button.image-portal-choose', { type: 'button' }, '选择图片');
	private readonly reopen = $('button.button', { type: 'button', hidden: '' }, '查看图片');
	private readonly preview = $('img', { alt: '图片预览', draggable: 'false' });
	private readonly size = $('input', { type: 'text', inputmode: 'decimal', placeholder: '倍数 / 宽度', 'aria-label': '缩放倍数或目标宽度' });
	private readonly copy = $('button.button', { type: 'submit' }, '缩放并复制');
	private readonly close = $('button.button.icon-button', { type: 'button', 'aria-label': '关闭预览' }, i('close'));
	private readonly dimensions = $('span.image-portal-dimensions');
	private readonly surface = $('.image-portal-surface.island');
	private readonly overlay = createWindowOverlay('图片预览');
	private readonly toast: Toast;
	private current: File | undefined;
	private url = '';
	private busy = false;
	private disposed = false;
	private dragDepth = 0;
	private presentation = 0;

	constructor(accessor: ServicesAccessor, container: HTMLElement) {
		super(accessor, container);
		this.service = accessor.get(IImagePortalService);
		container.classList.add('image-portal');
		container.tabIndex = -1;
		this.surface.append($('.image-portal-empty', undefined, i('image'), $('p', undefined, '拖入或粘贴图片'), this.choose, this.reopen));
		const form = $('form.image-portal-toolbar.island', undefined, this.dimensions, this.size, this.copy, this.close);
		this.overlay.classList.add('image-portal-preview');
		this.overlay.append($('.image-portal-image', undefined, this.preview), form);
		container.append(this.picker, this.surface, this.overlay);
		this.toast = this.register(new Toast(container));
		this.register(new Tooltip(this.size, '小于 20 为原图缩放倍数；20 及以上为像素宽度。缩放后的宽高须在 1 至 3000 像素之间。'));
		this.register(new Tooltip(this.close, '关闭预览 (Esc)'));
		this.reopen.popoverTargetElement = this.overlay;
		this.close.popoverTargetElement = this.overlay;
		this.close.popoverTargetAction = 'hide';

		this.register(listen(this.choose, 'click', () => this.picker.click()));
		this.register(listen(this.picker, 'change', () => {
			void this.load(this.picker.files?.[0]);
			this.picker.value = '';
		}));
		this.register(listen(form, 'submit', event => {
			event.preventDefault();
			const size = Number(this.size.value);
			if (!Number.isFinite(size) || size <= 0) {
				this.toast.show('请输入大于 0 的倍数或宽度。', true, this.overlay);
				this.size.focus();
			} else {
				void this.load(this.current, size);
			}
		}));
		this.register(listen(this.overlay, 'beforetoggle', event => {
			const opening = event.newState == 'open';
			this.surface.inert = opening;
			if (!opening) {
				this.presentation++;
				this.toast.hide();
				if (this.overlay.contains(mainWindow.document.activeElement)) this.reopen.focus({ preventScroll: true });
			}
		}));
		this.register(listen(container, 'dragenter', event => {
			if (event.dataTransfer?.types.includes('Files')) {
				event.preventDefault();
				this.setDragging(this.dragDepth + 1);
			}
		}));
		this.register(listen(container, 'dragleave', () => this.setDragging(this.dragDepth - 1)));
		this.register(listen(container, 'dragover', event => {
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = this.busy ? 'none' : 'copy';
		}));
		this.register(listen(container, 'drop', event => {
			event.preventDefault();
			this.setDragging(0);
			void this.load(event.dataTransfer?.files[0]);
		}));
		this.register(listen(mainWindow.document.body, 'paste', event => {
			const file = event.clipboardData?.files[0];
			if (file && container.checkVisibility()) {
				event.preventDefault();
				void this.load(file);
			}
		}));
	}

	private setDragging(depth: number): void {
		this.dragDepth = Math.max(0, depth);
		this.container.classList.toggle('dragging', this.dragDepth > 0);
	}

	private setBusy(busy: boolean): void {
		this.busy = busy;
		this.picker.disabled = this.choose.disabled = this.size.disabled = this.copy.disabled = busy;
		this.container.setAttribute('aria-busy', String(busy));
	}

	private updatePreview(result: ProcessedImage): void {
		const url = URL.createObjectURL(new Blob([new Uint8Array(result.preview)], { type: 'image/png' }));
		if (this.url) URL.revokeObjectURL(this.url);
		this.url = url;
		this.preview.src = url;
		this.dimensions.textContent = `${result.width} × ${result.height}`;
		this.reopen.hidden = false;
	}

	private async load(file: File | undefined, size?: number): Promise<void> {
		if (!file || this.busy) return;
		const presentation = this.presentation;
		this.setBusy(true);
		this.toast.hide();
		try {
			const result = await this.service.copy(file, size);
			if (this.disposed) return;
			this.current = file;
			this.updatePreview(result);
			if (size == null) this.size.value = '';
			// Keep the result, but never reopen a preview dismissed during processing.
			if (this.container.checkVisibility() && presentation == this.presentation) {
				if (!this.overlay.matches(':popover-open')) {
					this.overlay.showPopover({ source: this.reopen });
					this.overlay.focus({ preventScroll: true });
				}
				this.toast.show('已复制到剪贴板', false, this.overlay);
			}
		} catch (error) {
			if (!this.disposed && this.container.checkVisibility()) {
				this.toast.show(error instanceof Error ? error.message : String(error), true,
					this.overlay.matches(':popover-open') ? this.overlay : undefined);
			}
		} finally {
			if (!this.disposed) this.setBusy(false);
		}
	}

	override dispose(): void {
		this.disposed = true;
		if (this.overlay.matches(':popover-open')) this.overlay.hidePopover();
		if (this.url) URL.revokeObjectURL(this.url);
		super.dispose();
	}
}
