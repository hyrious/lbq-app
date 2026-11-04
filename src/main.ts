// This file can be seen in the 'electron-main' layer.
import { app, dialog, protocol } from 'electron';
import { registerHooks } from 'node:module';
import { getErrorMessage } from './base/common/errors.ts';
import { noop } from './base/common/types.ts';
import { productName } from './product.ts';

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1';
process.removeAllListeners('warning');

app.commandLine.appendSwitch('log-level', '3');
app.commandLine.appendSwitch('unsafely-disable-devtools-self-xss-warnings');

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === 'fs') return { format: 'builtin', shortCircuit: true, url: 'node:original-fs' };
		return nextResolve(specifier, context);
	}
});

protocol.registerSchemesAsPrivileged([{
	scheme: 'app-file',
	privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: app.isPackaged }
}]);

app.setName(productName);

function main(): void {
	if (!app.requestSingleInstanceLock()) {
		app.quit();
		return;
	}

	app.on('window-all-closed', noop);
	app.whenReady().then(async () => {
		const { Application } = await import('./app/electron-main/application.ts');
		const application = await Application.instantiate();
		app.on('before-quit', () => application.dispose());
		await application.open();
	}).catch(error => {
		console.error(error);
		dialog.showErrorBox(`${productName} failed to start`, getErrorMessage(error));
		app.quit();
	});
}

main();
