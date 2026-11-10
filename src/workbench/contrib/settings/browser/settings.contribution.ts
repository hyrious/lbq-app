import type { ServicesAccessor } from '../../../../platform/common/instantiation.ts';

import './settings.css';
import '../../../../base/browser/switch.css';
import { $, listen } from '../../../../base/browser/dom.ts';
import { mainWindow } from '../../../../base/browser/window.ts';
import { getErrorMessage } from '../../../../base/common/errors.ts';
import { toDisposable } from '../../../../base/common/lifecycle.ts';
import { IAppDataService } from '../../../../platform/common/appData.ts';
import { ILoginItemService, type ILoginItemState } from '../../../../platform/common/loginItem.ts';
import { AppView, registerApp } from '../../../browser/apps.ts';

registerApp(class SettingsView extends AppView {
	static readonly id = 'settings';
	static readonly title = 'Settings';
	static readonly icon = 'settings';
	static readonly group = 'global';
	static readonly primaryKey = ',';

	private readonly service: ILoginItemService;
	private readonly input = $('input.switch', {
		type: 'checkbox', role: 'switch',
		'aria-labelledby': 'settings-login-item-title',
		'aria-describedby': 'settings-login-item-message'
	});
	private readonly message = $('p.settings-message', { id: 'settings-login-item-message', role: 'status' });
	private state: ILoginItemState | undefined;
	private busy = false;
	private disposed = false;

	constructor(accessor: ServicesAccessor, container: HTMLElement) {
		super(accessor, container);
		this.service = accessor.get(ILoginItemService);
		container.classList.add('settings');
		const row = $('label.settings-row', undefined,
			$('span', { id: 'settings-login-item-title' }, '开机启动'), this.input);
		const appData = accessor.get(IAppDataService);
		const openFolder = $('button.button.settings-open-folder', { type: 'button' }, '打开文件夹');
		const folderMessage = $('p.settings-message', { role: 'status' });
		container.append($('.island', undefined,
			$('section.settings-item', { 'aria-labelledby': 'settings-login-item-title' }, row, this.message),
			$('section.settings-item', { 'aria-labelledby': 'settings-app-data-title' },
				$('.settings-row', undefined,
					$('span', { id: 'settings-app-data-title' }, '应用数据'), openFolder),
				folderMessage)));
		this.register(listen(openFolder, 'click', async () => {
			openFolder.disabled = true;
			folderMessage.textContent = '';
			try {
				await appData.openFolder();
			} catch (error) {
				if (!this.disposed) folderMessage.textContent = getErrorMessage(error);
			} finally {
				if (!this.disposed) openFolder.disabled = false;
			}
		}));
		this.input.disabled = true;
		this.register(listen(this.input, 'click', event => {
			if (this.busy) event.preventDefault();
		}));
		this.register(listen(this.input, 'change', () => { void this.update(this.input.checked); }));
		this.register(listen(mainWindow, 'focus', () => { void this.update(); }));
		const observer = new IntersectionObserver(entries => {
			if (entries.some(entry => entry.isIntersecting)) void this.update();
		});
		observer.observe(container);
		this.register(toDisposable(() => observer.disconnect()));
		void this.update();
	}

	private async update(enabled?: boolean): Promise<void> {
		if (this.busy || this.disposed) return;
		this.busy = true;
		this.input.setAttribute('aria-disabled', 'true');
		try {
			const state = enabled == null ? await this.service.read() : await this.service.write(enabled);
			if (this.disposed) return;
			this.state = state;
			this.message.textContent = state.message;
		} catch (error) {
			if (!this.disposed) this.message.textContent = getErrorMessage(error);
		} finally {
			this.busy = false;
			if (!this.disposed) {
				this.input.removeAttribute('aria-disabled');
				this.input.checked = this.state?.enabled ?? false;
				this.input.disabled = !this.state?.available;
			}
		}
	}

	override dispose(): void {
		this.disposed = true;
		super.dispose();
	}
});
