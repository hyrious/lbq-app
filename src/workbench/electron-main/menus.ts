// Submenu is required for common keyboard shortcuts to work on macOS.
export const appMenu: Electron.MenuItemConstructorOptions[] = [
	{
		label: '文件',
		submenu: [
			{ label: '关闭窗口', role: 'close', accelerator: 'CommandOrControl+W' }
		]
	},
	{
		label: '编辑',
		submenu: [
			{ label: '撤销', role: 'undo' },
			{ label: '重做', role: 'redo' },
			{ type: 'separator' },
			{ label: '剪切', role: 'cut' },
			{ label: '复制', role: 'copy' },
			{ label: '粘贴', role: 'paste' },
			{ label: '粘贴并匹配样式', role: 'pasteAndMatchStyle' },
			{ label: '删除', role: 'delete' },
			{ type: 'separator' },
			{ label: '全选', role: 'selectAll' }
		]
	},
	{
		label: '视图',
		submenu: [
			{ label: '刷新', role: 'reload' },
			{ label: '忽略缓存刷新', role: 'forceReload' },
			{ label: '开发者工具', role: 'toggleDevTools' },
			{ type: 'separator' },
			{ label: '实际大小', role: 'resetZoom' },
			{ label: '放大', role: 'zoomIn' },
			{ label: '缩小', role: 'zoomOut' },
			{ type: 'separator' },
			{ label: '切换全屏', role: 'togglefullscreen' }
		]
	},
	{ label: '窗口', role: 'windowMenu' }
];
if (process.platform === 'darwin') appMenu.unshift({ role: 'appMenu' });

export interface ITrayMenuOptions {
	readonly reveal: Electron.MenuItemConstructorOptions['click'];
	readonly quit: Electron.MenuItemConstructorOptions['click'];
}

export const trayMenu = (options: ITrayMenuOptions): Electron.MenuItemConstructorOptions[] => [
	{ label: '打开窗口', click: options.reveal },
	{ label: '退出', click: options.quit }
];
