import { app } from 'electron';
import { productName } from '../../product.ts';
import { ILoginItemService, type ILoginItemState } from '../common/loginItem.ts';
import { registerMainService } from './ipc.ts';

class LoginItemService implements ILoginItemService {
	async read(): Promise<ILoginItemState> {
		if (process.platform != 'darwin' && process.platform != 'win32') {
			return { available: false, enabled: false, message: '当前系统不支持开机启动。' };
		}
		if (!app.isPackaged) {
			return { available: false, enabled: false, message: '请在安装后的应用中设置开机启动。' };
		}

		const settings = app.getLoginItemSettings();
		let enabled = settings.openAtLogin;
		let message = '';
		if (process.platform == 'darwin') {
			enabled = enabled && settings.status == 'enabled';
			if (settings.status == 'requires-approval') message = `请在系统设置的“登录项”中允许 ${productName} 启动。`;
			if (settings.status == 'not-found') message = '系统未找到应用，请重新安装后再试。';
		} else {
			enabled = enabled && settings.executableWillLaunchAtLogin;
			if (settings.openAtLogin && !enabled) message = `请在系统设置的“启动应用”中启用 ${productName}。`;
		}
		return { available: true, enabled, message };
	}

	async write(enabled: boolean): Promise<ILoginItemState> {
		if (typeof enabled != 'boolean') throw new Error('无效的开机启动设置。');
		const current = await this.read();
		if (!current.available) throw new Error(current.message);
		app.setLoginItemSettings({ openAtLogin: enabled });
		const state = await this.read();
		if (state.enabled != enabled && !state.message) {
			return { ...state, message: '开机启动设置未生效，请检查系统的启动项设置。' };
		}
		return state;
	}
}

registerMainService(ILoginItemService, LoginItemService);
