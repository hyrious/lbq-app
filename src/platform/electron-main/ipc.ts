import { ipcMain } from 'electron';
import { toDisposable, type IDisposable } from '../../base/common/lifecycle.ts';
import { ChannelServer, type AsyncService } from '../common/channel.ts';
import { initializeServices, registerService } from '../common/extensions.ts';
import { InstantiationService, type ServiceConstructor, type ServiceIdentifier, type ServicesAccessor } from '../common/instantiation.ts';

const channels: ((server: ChannelServer, accessor: ServicesAccessor) => void)[] = [];

export function registerMainService<T extends AsyncService<T>>(id: ServiceIdentifier<T>, ctor: ServiceConstructor<NoInfer<T>>): void {
	registerService(id, ctor);
	channels.push((server, accessor) => server.register(id, accessor.get(id)));
}

export function initializeMainServices(services: InstantiationService): IDisposable {
	initializeServices(services);
	const server = new ChannelServer();
	services.run(accessor => {
		for (const register of channels) register(server, accessor);
	});
	return serveChannels(server);
}

function serveChannels(server: ChannelServer): IDisposable {
	ipcMain.handle('vscode:invoke', (event, channel, method, args) => {
		if (event.senderFrame !== event.sender.mainFrame || event.senderFrame?.url !== 'app-file://src/index.html') {
			throw new Error('Untrusted IPC sender');
		}
		return server.invoke(channel, method, args);
	});
	return toDisposable(() => ipcMain.removeHandler('vscode:invoke'));
}
